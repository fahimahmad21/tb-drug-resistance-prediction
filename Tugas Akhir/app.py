from dotenv import load_dotenv
load_dotenv()

# app.py
import os, json, pickle, joblib, numpy as np, networkx as nx
from typing import Dict, Any, Optional
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import torch
from torch_geometric.utils import from_networkx
from torch_geometric.nn import GCNConv
from sentence_transformers import SentenceTransformer
import xgboost as xgb
from typing import List, Dict, Any
from fastapi import Query

# ========= 0) UTIL =========
def _norm(s: str) -> str:
    return (s or "").strip()

def get_graph_context(G: nx.DiGraph, mutation: str, gene: str, drug: str, top_k: int = 3) -> str:
    ctx = []
    for node in [mutation, gene, drug]:
        if node in G:
            desc = G.nodes[node].get("description")
            if desc: ctx.append(desc)
            # tetangga ke depan
            for n in list(G.successors(node))[:top_k]:
                d = G.nodes[n].get("description")
                if d: ctx.append(d)
            # tetangga ke belakang
            for n in list(G.predecessors(node))[:top_k]:
                d = G.nodes[n].get("description")
                if d: ctx.append(d)
    return "\n".join(dict.fromkeys(ctx))  # de-duplicate urutan

# ========= 1) LOAD ARTEFAK =========
# XGBoost
xgb_clf: xgb.XGBClassifier = joblib.load("xgb_gnn_supervised.joblib")

# Graph (pakai pickle karena read_gpickle dihapus di NX baru)
with open("graph.pkl", "rb") as f:
    G: nx.DiGraph = pickle.load(f)

node_index = joblib.load("graph_index.joblib")["node_index"]

# PyG data
data = from_networkx(G)
num_nodes = G.number_of_nodes()
data.x = torch.eye(num_nodes)

# Definisi GNN harus identik dgn training
class TB_GNN(torch.nn.Module):
    def __init__(self, in_channels, hidden_channels, out_channels):
        super().__init__()
        self.conv1 = GCNConv(in_channels, hidden_channels)
        self.conv2 = GCNConv(hidden_channels, out_channels)
        self.classifier = torch.nn.Linear(out_channels, 2)
    def forward(self, x, edge_index):
        x = self.conv1(x, edge_index).relu()
        x = self.conv2(x, edge_index)
        out = self.classifier(x)
        return x, out

gnn = TB_GNN(in_channels=num_nodes, hidden_channels=128, out_channels=64)

# ---- Load GNN weights disimpan via joblib.dump(state_dict, ...) ----
gnn = TB_GNN(in_channels=num_nodes, hidden_channels=128, out_channels=64)

try:
    state = joblib.load("gnn_weights.pt")  # ⬅️ pakai joblib.load, bukan torch.load
    # Kalau kunci punya prefix "module." (mis. saat training pakai DataParallel), bersihkan:
    if any(k.startswith("module.") for k in state.keys()):
        state = {k.replace("module.", "", 1): v for k, v in state.items()}
    gnn.load_state_dict(state)
except Exception as e:
    raise RuntimeError(
        "Gagal memuat bobot GNN dari 'gnn_weights.pt'. "
        "File ini dibuat pakai joblib.dump(state_dict, ...), jadi harus diload pakai joblib.load. "
        f"Detail: {e}"
    )

gnn.eval()


# Precompute node embeddings
with torch.no_grad():
    node_emb_t, _ = gnn(data.x, data.edge_index)      # [num_nodes, 64]
node_emb = node_emb_t.cpu().numpy().astype(np.float32)

# SentenceTransformer
sem_model = SentenceTransformer("all-MiniLM-L6-v2")

# Evaluasi tersimpan
EVAL_PATH = "evaluation_results.joblib"
_eval_payload = joblib.load(EVAL_PATH)
_eval_report = _eval_payload["classification_report"]
_eval_weighted = _eval_report.get("weighted avg", {})
EVAL_SUMMARY = {
    "auc": float(_eval_payload.get("auc", 0.0)),
    "accuracy": float(_eval_payload.get("accuracy", 0.0)),
    "precision": float(_eval_weighted.get("precision", 0.0)),
    "recall": float(_eval_weighted.get("recall", 0.0)),
    "f1": float(_eval_weighted.get("f1-score", 0.0)),
}

# ========= 2) FASTAPI =========
app = FastAPI(title="TB Resistance API", version="1.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # batasi di production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PredictIn(BaseModel):
    Mutation: str
    Gene: str
    drug: str

class Explanation(BaseModel):
    Kuadran_interpretasi: str
    Interpretasi_prediksi: str
    Bukti_dari_knowledge_graph: str
    Analisis_keterbatasan_bukti: str
    Implikasi_klinis: str
    Kesimpulan: str



class PredictOut(BaseModel):
    label: int
    probability: float
    semantic_embedding: list[float]
    gnn_embedding: list[float]
    embedding_dim: int
    evaluation: Dict[str, float]
    explanation: Explanation
    rag_context: Optional[str] = None

def build_graph_embedding(mutation: str, gene: str, drug: str) -> np.ndarray:
    hits = []
    for node in (mutation, gene, drug):
        if node in node_index:
            hits.append(node_emb[node_index[node]])
    if not hits:
        return np.zeros((node_emb.shape[1],), dtype=np.float32)
    return np.mean(hits, axis=0).astype(np.float32)

# QUADRANT VALIDATOR (RULE-BASED)
# =========================================================
import re

def has_explicit_graph_evidence(
    mutation: str,
    gene: str,
    drug: str,
    rag_context: str
) -> bool:
    """
    Evidence dianggap tersedia jika terdapat jalur eksplisit:
    Mutation → Gene → Drug
    sesuai struktur knowledge graph.
    """

    if not rag_context:
        return False

    text = rag_context.lower()

    # pola mutasi → gen
    mut_gene_patterns = [
        rf"mutasi\s+{re.escape(mutation.lower())}\s+memengaruhi\s+gen\s+{re.escape(gene.lower())}",
        rf"mutasi\s+{re.escape(mutation.lower())}.*gen\s+{re.escape(gene.lower())}",
    ]

    # pola gen → drug
    gene_drug_patterns = [
        rf"gen\s+{re.escape(gene.lower())}\s+berhubungan\s+dengan\s+resistensi\s+terhadap\s+{re.escape(drug.lower())}",
        rf"gen\s+{re.escape(gene.lower())}.*resistensi.*{re.escape(drug.lower())}",
    ]

    mut_gene = any(re.search(p, text) for p in mut_gene_patterns)
    gene_drug = any(re.search(p, text) for p in gene_drug_patterns)

    return mut_gene and gene_drug




def determine_quadrant(prob: float, evidence: bool) -> str:
    if prob >= 0.5 and evidence:
        return "Q1"
    if prob >= 0.5 and not evidence:
        return "Q2"
    if prob < 0.5 and evidence:
        return "Q3"
    return "Q4"


def validate_and_correct_explanation(
    expl: Explanation,
    prob: float,
    mutation: str,
    gene: str,
    drug: str,
    rag_context: str
) -> Explanation:

    evidence = has_explicit_graph_evidence(mutation, gene, drug, rag_context)
    correct_q = determine_quadrant(prob, evidence)

    # 1️⃣ Koreksi kuadran jika salah
    if expl.Kuadran_interpretasi != correct_q:
        expl.Kuadran_interpretasi = correct_q
        expl.Analisis_keterbatasan_bukti += (
            " (Kuadran dikoreksi oleh validator berbasis aturan.)"
        )

    # 2️⃣ 🔒 KUNCI BAHASA INTERPRETASI
    if expl.Kuadran_interpretasi != "Q1":
        expl.Interpretasi_prediksi = (
            f"Prediksi model menunjukkan probabilitas {prob:.4f} "
            "berdasarkan pola statistik yang dipelajari dari data."
        )

    # 3️⃣ Pastikan Analisis_keterbatasan_bukti tidak kosong
    if expl.Kuadran_interpretasi in {"Q2", "Q3", "Q4"} and not expl.Analisis_keterbatasan_bukti.strip():
        expl.Analisis_keterbatasan_bukti = (
            "Bukti biologis dalam knowledge graph tidak tersedia secara eksplisit "
            "untuk mendukung interpretasi ini."
        )

    return expl

# POST - PROCESSOR

import re
from copy import deepcopy

FORBIDDEN_PATTERNS = [
    r"hubungan yang kuat",
    r"menentukan strategi terapi",
    r"terapi yang efektif",
    r"dasar keputusan klinis",
    r"bukti lengkap",
    r"hubungan kausal",
]


def _sanitize_text(text: str) -> str:
    if not text:
        return text

    replacements = {
        "hubungan yang kuat": "pola statistik yang konsisten",
        "menentukan strategi terapi": "memberikan informasi pendukung",
        "terapi yang efektif": "pemahaman tambahan",
        "dasar keputusan klinis": "dasar tunggal keputusan klinis",
        "bukti lengkap": "bukti graf yang tersedia",
        "hubungan kausal": "asosiasi berbasis data",
    }

    out = text
    for k, v in replacements.items():
        out = re.sub(k, v, out, flags=re.IGNORECASE)

    return out.strip()

def normalize_explanation_language(
    expl,
    quadrant: str,
    probability: float,
    has_graph_evidence: bool
):
    expl = deepcopy(expl)

    # 1. Interpretasi_prediksi → HARUS statistik
    expl.Interpretasi_prediksi = (
        f"Prediksi model menunjukkan probabilitas {probability:.4f} "
        "berdasarkan pola statistik yang dipelajari dari data."
    )

    # 2. Bukti graf → tidak boleh klaim kausal
    expl.Bukti_dari_knowledge_graph = _sanitize_text(
        expl.Bukti_dari_knowledge_graph
    )

    # 3. Analisis keterbatasan → WAJIB ada kecuali Q1
    if quadrant != "Q1":
        expl.Analisis_keterbatasan_bukti = (
            expl.Analisis_keterbatasan_bukti
            or "Bukti graf terbatas sehingga interpretasi dibatasi."
        )
    else:
        expl.Analisis_keterbatasan_bukti = (
            "Relasi biologis direpresentasikan melalui jalur mutasi–gen–obat "
            "sesuai struktur knowledge graph."
        )

    # 4. Implikasi klinis → NON-PRESKRIPTIF
    expl.Implikasi_klinis = (
        "Hasil ini bersifat pendukung dan tidak dapat digunakan sebagai "
        "dasar tunggal dalam pengambilan keputusan klinis."
    )

    # 5. Kesimpulan → konservatif
    expl.Kesimpulan = (
        f"Interpretasi ini ditempatkan pada kuadran {quadrant} "
        "dengan mempertimbangkan probabilitas prediksi dan ketersediaan bukti graf."
    )

    return expl

    

# =========================================================
# LLM EXPLAIN (GROQ JSON MODE)
# =========================================================
def llm_explain(features, yhat, proba, rag_ctx) -> Explanation:
    import requests
    api_key = os.getenv("GROQ_API_KEY")

    def fallback(reason: str):
        return Explanation(
            Kuadran_interpretasi="Q4",
            Interpretasi_prediksi=f"Model memprediksi probabilitas {proba:.4f}.",
            Bukti_dari_knowledge_graph="Tidak tersedia secara eksplisit dalam knowledge graph.",
            Analisis_keterbatasan_bukti=reason,
            Implikasi_klinis="Hasil ini tidak cukup sebagai dasar keputusan klinis.",
            Kesimpulan="Interpretasi dibatasi oleh keterbatasan sistem atau bukti."
        )

    if not api_key:
        return fallback("GROQ_API_KEY tidak tersedia.")

   

    prompt = f"""
Anda adalah asisten bioinformatika yang berperan sebagai *reasoning layer*
dalam sistem Explainable AI untuk prediksi resistensi obat Tuberkulosis (TB).

Sistem yang digunakan adalah Hybrid GNN + XGBoost dengan
Graph Retrieval-Augmented Generation (GraphRAG).

IMPORTANT:
Even if biological relationships may exist implicitly in reality,
you must treat the knowledge graph as a closed-world representation.
If a relationship is not explicitly written in the graph context,
it MUST be considered absent.

Jika mutasi TIDAK punya relasi eksplisit di knowledge graph,
maka evidence = False,
dan Q1 atau Q3 TIDAK BOLEH muncul.

=== LANDASAN AKADEMIK (WAJIB DIPATUHI) ===
Penjelasan harus mengikuti prinsip:
1. Evidence-based reasoning (tidak menyimpulkan tanpa bukti eksplisit),
2. Post-hoc model interpretability (menjelaskan hasil, bukan menemukan biologi baru),
3. Confidence-aware decision support (mempertimbangkan probabilitas prediksi).

Anda BUKAN:
- alat penemuan mekanisme biologis baru,
- pengganti validasi eksperimental atau diagnosis klinis.

=== KONTEKS PENTING ===
Anda telah melihat beberapa contoh sebelumnya dan harus menjaga konsistensi
interpretasi antar kasus. Gunakan pola interpretasi sebelumnya sebagai referensi
tanpa mengulang isi jawaban lama.

=== ATURAN KETAT (ANTI-HALLUCINATION) ===
1. Gunakan HANYA informasi yang secara eksplisit muncul dalam konteks knowledge graph.
2. Jangan menambahkan mekanisme biologis, jalur molekuler, atau asumsi klinis
   yang tidak tertulis dalam graf.
3. Jika bukti biologis tidak tersedia, nyatakan secara eksplisit sebagai keterbatasan.
4. Pisahkan dengan jelas:
   - hasil prediksi statistik model
   - bukti biologis berbasis knowledge graph

=== ATURAN PENENTUAN KUADRAN (WAJIB) ===
- Bukti graf dianggap TERSEDIA hanya jika terdapat relasi eksplisit
  Mutation–Gene–Drug dalam konteks graf.
- Keberadaan node gene atau drug saja TIDAK cukup sebagai bukti biologis.
- Jika probabilitas tinggi tetapi bukti graf tidak tersedia → Kuadran HARUS Q2.
- Q1 hanya boleh dipilih jika probabilitas tinggi DAN bukti graf eksplisit tersedia.

=== DEFINISI KUADRAN INTERPRETASI ===
- Q1: Probabilitas tinggi & bukti graf tersedia
- Q2: Probabilitas tinggi & bukti graf terbatas/tidak tersedia
- Q3: Probabilitas rendah & bukti graf tersedia
- Q4: Probabilitas rendah & bukti graf terbatas/tidak tersedia

=== DATA INPUT ===
INPUT:
{json.dumps(features, ensure_ascii=False, indent=2)}

Probabilitas model: {proba:.4f}

Konteks knowledge graph:
{rag_ctx}

IMPORTANT:
Kuadran interpretasi TELAH ditentukan oleh sistem berbasis aturan.
Anda TIDAK BOLEH mengubah atau menyimpulkan kuadran sendiri.

Tugas Anda HANYA:
- Menjelaskan makna statistik prediksi
- Menyebutkan bukti graf JIKA eksplisit
- Menyatakan keterbatasan bila bukti tidak lengkap


=== TUGAS ANDA ===
1. Jelaskan makna prediksi sesuai karakteristik kuadran.
2. Nyatakan secara eksplisit jika interpretasi dibatasi oleh kurangnya bukti graf.
3. Hindari klaim kausal atau biologis yang tidak didukung graf.

=== FORMAT OUTPUT (JSON WAJIB) ===
{{
  "Kuadran_interpretasi": "Q?",
  "Interpretasi_prediksi": "...",
  "Bukti_dari_knowledge_graph": "...",
  "Analisis_keterbatasan_bukti": "...",
  "Implikasi_klinis": "...",
  "Kesimpulan": "..."
}}
"""

    body = {
        "model": "llama-3.1-8b-instant",
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": "Jawab HANYA dalam JSON valid."},
            {"role": "user", "content": prompt}
        ],
        "response_format": {"type": "json_object"}
    }

    try:
        r = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json=body,
            timeout=60
        )
        data = json.loads(r.json()["choices"][0]["message"]["content"])
        return Explanation(**data)
    except Exception as e:
        return fallback(str(e))


# =========================================================
# ENDPOINT /predict
# =========================================================
@app.post("/predict", response_model=PredictOut)
def predict(p: PredictIn):
    gene, mut, drug = _norm(p.Gene), _norm(p.Mutation), _norm(p.drug)

    semantic = sem_model.encode([f"{gene} {mut} {drug}"])[0].astype(np.float32)
    gnn_vec = build_graph_embedding(mut, gene, drug)

    X = np.concatenate([semantic, gnn_vec]).reshape(1, -1)
    proba = float(xgb_clf.predict_proba(X)[0, 1])
    yhat = int(proba >= 0.5)

    rag_ctx = get_graph_context(G, mut, gene, drug)

    expl = llm_explain(
        {"Gene": gene, "Mutation": mut, "Drug": drug},
        yhat,
        proba,
        rag_ctx
    )

    expl = validate_and_correct_explanation(
        expl, proba, mut, gene, drug, rag_ctx
    )

    has_evidence = has_explicit_graph_evidence(
    mutation=mut,
    gene=gene,
    drug=drug,
    rag_context=rag_ctx
    )

    expl = normalize_explanation_language(
    expl,
    quadrant=expl.Kuadran_interpretasi,
    probability=proba,
    has_graph_evidence=has_evidence
    )

    return {
        "label": yhat,
        "probability": proba,
        "semantic_embedding": semantic.tolist(),
        "gnn_embedding": gnn_vec.tolist(),
        "embedding_dim": X.shape[1],
        "evaluation": EVAL_SUMMARY,
        "explanation": expl,
        "rag_context": rag_ctx
    }

    

# --- Tambahan di app.py ---



def _nx_to_kg_json(G: nx.DiGraph, limit: int | None = None) -> Dict[str, Any]:
    nodes = []
    edges = []

    # nodes
    for n, attrs in G.nodes(data=True):
        nodes.append({
            "id": str(n),
            "label": str(n),
            "type": str(attrs.get("type", "entity")),
            "desc": str(attrs.get("description", "")),
        })

    # edges
    for u, v, attrs in G.edges(data=True):
        edges.append({
            "source": str(u),
            "target": str(v),
            "rel": str(attrs.get("relation", "")),
        })

    # optional limit (untuk graf besar)
    if limit is not None and limit > 0:
        nodes = nodes[:limit]
        # keep only edges whose endpoints exist
        node_ids = {n["id"] for n in nodes}
        edges = [e for e in edges if e["source"] in node_ids and e["target"] in node_ids]

    return {"nodes": nodes, "edges": edges}

@app.get("/kg")
def kg(limit: int = Query(default=0, ge=0, description="Limit jumlah node (0 = tanpa limit)")):
    """
    Keluarkan knowledge graph sebagai JSON: { nodes: [...], edges: [...] }
    Node pakai attrs: type (gene|mutation|drug) dan description, sesuai pembentukan G dari mutations.csv.
    """
    payload = _nx_to_kg_json(G, limit if limit > 0 else None)
    return payload


@app.get("/evaluate")
def evaluate():
    return EVAL_SUMMARY

@app.get("/healthz")
def healthz():
    return {"status": "ok"}

