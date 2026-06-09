"use client";

import React, { useMemo, useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { BrainCircuit, Activity, FlaskConical, ChartBar, Settings2, Loader2, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import MutationHelpPanel from "./MutationHelpPanel";
import KnowledgeGraph from "@/components/KnowledgeGraph";
import { useInView } from "framer-motion";



/* ===================== THEME ===================== */
const theme = {
  grad: "bg-gradient-to-br from-red-600 via-orange-500 to-yellow-400",
  gradSoft: "bg-gradient-to-br from-red-50 via-orange-50 to-yellow-50",
  glass: "backdrop-blur-md bg-white/70",
  border: "border border-white/40",
};

/* ============== DEFAULT METRICS FOR SKELETON ============== */
const defaultEval = {
  auc: 0.912,
  accuracy: 0.872,
  precision: 0.881,
  recall: 0.858,
  f1: 0.869,
};

const evalToBars = (e: typeof defaultEval) => [
  { metric: "AUC", value: Number((e.auc * 100).toFixed(2)) },
  { metric: "Accuracy", value: Number((e.accuracy * 100).toFixed(2)) },
  { metric: "Precision", value: Number((e.precision * 100).toFixed(2)) },
  { metric: "Recall", value: Number((e.recall * 100).toFixed(2)) },
  { metric: "F1", value: Number((e.f1 * 100).toFixed(2)) },
];

/* ====================== TYPES ====================== */
interface PredictInput {
  Gene: string;
  Mutation: string;
  drug: string;
}

interface Explanation {
  Kuadran_interpretasi: string;
  Interpretasi_prediksi: string;
  Bukti_dari_knowledge_graph: string;
  Analisis_keterbatasan_bukti: string;
  Implikasi_klinis: string;
  Kesimpulan: string;
}



interface PredictResponse {
  label: 0 | 1;
  probability: number;
  evaluation?: typeof defaultEval;

  // integrasi penuh
  explanation: Explanation; // ringkasan LLM bersih
  rag_context?: string; // baris-baris context dari GraphRAG
  semantic_embedding?: number[];
  gnn_embedding?: number[];
  embedding_dim?: number;

  top_factors?: Array<{ feature: string; weight: number }>;
}

/* ===================== API HELPERS ===================== */
async function apiPredict(payload: PredictInput): Promise<PredictResponse> {
  const res = await fetch("/api/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiEvaluate(): Promise<typeof defaultEval> {
  const res = await fetch("/api/evaluate", { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/* ===================== SMALL UI ===================== */
function StatCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <Card className={`${theme.glass} ${theme.border} shadow-sm`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-gray-700">{title}</CardTitle>
        <div className="text-gray-500">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
      </CardContent>
    </Card>
  );
}



/* ============== MODERN EVAL CHART DARK ============== */
export function ModernEvalChartDark({
  data,
  height = 180
}: { data: Array<{ metric: string; value: number }>; height?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);

  // detect saat komponen benar2 terlihat → baru render chart (biar animasi jalan)
  const seen = useInView(ref, { once: false, margin: "-80px 0px -20% 0px" });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (seen && !ready) setReady(true);
  }, [seen, ready]);

  const gridStroke = "rgba(17, 24, 39, 0.06)";   // halus
  const axisStroke = "rgba(17, 24, 39, 0.15)";
  const tickStyle = { fill: "rgba(17,24,39,0.85)", fontSize: 12, fontWeight: 500 };

  // placeholder halus sebelum terlihat
  const placeholder = (
    <div className="mt-3 h-full rounded-xl bg-gradient-to-b from-slate-100 to-slate-50 border border-slate-200/60" />
  );

  return (
    <div ref={ref} style={{ height }} className="mt-2">
      {!ready ? (
        placeholder
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            key="eval-luxe-inview" // remount sekali saat in-view agar animasi start
            data={data}
            margin={{ top: 8, right: 8, left: 6, bottom: 12 }}
            barCategoryGap={18}
          >
            {/* grid tipis, vertikal off agar bersih */}
            <CartesianGrid strokeDasharray="4 4" stroke={gridStroke} vertical={false} />

            <XAxis
              dataKey="metric"
              tick={tickStyle as any}
              axisLine={{ stroke: axisStroke }}
              tickLine={{ stroke: axisStroke }}
              height={28}
            />
            <YAxis
              unit="%"
              domain={[0, 100]}
              tick={tickStyle as any}
              axisLine={{ stroke: axisStroke }}
              tickLine={{ stroke: axisStroke }}
              width={42}
            />

            {/* tooltip elegan */}
            <Tooltip
              cursor={{ fill: "rgba(17,24,39,0.04)" }}
              contentStyle={{
                borderRadius: 14,
                border: "1px solid rgba(17,24,39,0.08)",
                boxShadow: "0 10px 28px rgba(17,24,39,0.10)",
                backdropFilter: "blur(6px)",
              }}
              formatter={(v: any) => [`${Number(v).toFixed(2)}%`, "Nilai"]}
              labelFormatter={(l) => `Metric: ${l}`}
            />

            {/* track dasar: 100% tipis untuk depth */}
            <Bar dataKey={() => 100} fill="rgba(17,24,39,0.06)" radius={[12, 12, 12, 12]} barSize={32} />

            {/* bar utama: #111827, animasi dari baseline */}
            <Bar
              dataKey="value"
              fill="#111827"
              radius={[12, 12, 12, 12]}
              barSize={26}
              isAnimationActive={true}
              animationBegin={120}
              animationDuration={900}
              animationEasing="ease-out"
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/* ============== EVAL CARD LUXE ============== */
export function EvalCardLuxe({
  data,
  title = "Visual Evaluasi (ringkas)"
}: {
  data: Array<{ metric: string; value: number }>;
  title?: string;
}) {
  return (
    <div className="relative rounded-2xl p-4 overflow-hidden">
      {/* border gradient halus */}
      <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{
        padding: 1,
        background: "linear-gradient(135deg, rgba(255,122,0,0.45), rgba(255,77,77,0.35), rgba(255,215,0,0.45))",
        WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
        WebkitMaskComposite: "xor",
        maskComposite: "exclude"
      }} />
      {/* panel kaca + glow */}
      <div className="relative rounded-2xl border border-white/30 bg-white/60 backdrop-blur-md shadow-[0_10px_28px_rgba(17,24,39,0.10)]">
        {/* highlight lembut atas */}
        <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-white/60 to-transparent pointer-events-none" />
        {/* glow radial di tengah */}
        <div
          className="absolute inset-0 pointer-events-none opacity-70"
          style={{
            background:
              "radial-gradient(50% 40% at 50% 30%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.20) 45%, rgba(255,255,255,0) 70%)",
          }}
        />
        {/* konten */}
        <div className="relative p-4">
          <div className="text-sm font-semibold text-slate-800">{title}</div>
          <ModernEvalChartDark data={data} />
        </div>
      </div>
    </div>
  );
}





function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-3xl p-5 ${theme.glass} ${theme.border} shadow-sm ${className}`}>{children}</div>;
}

/* ============== GRAPH CONTEXT TICKER (ANIMATED) ============== */
function GraphContextTicker({ text }: { text: string }) {
  const lines = (text || "").split("\n").filter(Boolean);
  if (lines.length === 0) return <div className="text-xs text-gray-500">Tidak ada konteks graf.</div>;

  // Duplicate for infinite scroll feel
  const stream = [...lines, ...lines];

  return (
    <div className="relative overflow-hidden rounded-2xl border bg-white/70">
      <div className="px-4 py-2 text-xs font-medium text-gray-500 flex items-center gap-1">
        <Sparkles className="w-3.5 h-3.5 text-orange-500" /> Graph Context
      </div>
      <div className="h-28">
        <motion.div
          className="flex flex-col gap-2 px-4"
          initial={{ y: 0 }}
          animate={{ y: ["0%", "-50%"] }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
        >
          {stream.map((l, i) => (
            <div key={i} className="text-xs text-gray-700">
              • {l}
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}




/* ============== EMBEDDINGS → INSIGHT CHARTS ============== */
function bucketize(values: number[] | undefined, buckets = 8) {
  const v = values ?? [];
  if (v.length === 0) return Array.from({ length: buckets }, (_, i) => ({ name: `B${i + 1}`, value: 0 }));
  const size = Math.ceil(v.length / buckets);
  const out = [];
  for (let i = 0; i < buckets; i++) {
    const slice = v.slice(i * size, (i + 1) * size);
    const mean = slice.length ? slice.reduce((a, b) => a + Math.abs(b), 0) / slice.length : 0;
    out.push({ name: `B${i + 1}`, value: Number(mean.toFixed(4)) });
  }
  return out;
}
const PIE_COLORS = ["#ef4444", "#f59e0b"]; // merah=ST, oranye=GNN

// ==== Tooltip helpers untuk Radar ====
function bucketRanges(dim: number, buckets = 8) {
  if (!dim || dim <= 0) return Array.from({ length: buckets }, () => [0, 0] as [number, number]);
  const size = Math.ceil(dim / buckets);
  return Array.from({ length: buckets }, (_, i) => {
    const start = i * size + 1;
    const end = Math.min((i + 1) * size, dim);
    return [start, end] as [number, number];
  });
}

type BucketTooltipProps = {
  label?: string; // bucket name, e.g., "B3"
  payload?: any[];
  stRanges: Array<[number, number]>;
  gnnRanges: Array<[number, number]>;
};

const BucketTooltip: React.FC<BucketTooltipProps> = ({ label, payload, stRanges, gnnRanges }) => {
  // cari index bucket dari label "B3" -> 2
  const idx = label && /^B(\d+)$/i.test(label) ? Math.max(0, parseInt(label.slice(1)) - 1) : 0;

  const st = payload?.find((p) => p.dataKey === "ST")?.value ?? 0;
  const gnn = payload?.find((p) => p.dataKey === "GNN")?.value ?? 0;
  const [s1, s2] = stRanges[idx] ?? [0, 0];
  const [g1, g2] = gnnRanges[idx] ?? [0, 0];

  return (
    <div
      className="text-[11px] leading-snug rounded-md bg-white/90 shadow px-2.5 py-1.5 border border-gray-200"
      style={{ pointerEvents: "none", maxWidth: 220 }}
    >
      <div className="font-semibold text-gray-800">{label}</div>
      <div className="text-gray-700">ST mean: <b>{Number(st).toFixed(4)}</b></div>
      <div className="text-gray-700">GNN mean: <b>{Number(gnn).toFixed(4)}</b></div>
      <div className="mt-1 text-gray-500">
        <div>ST dims: {s1}-{s2}</div>
        <div>GNN dims: {g1}-{g2}</div>
      </div>
    </div>
  );
};



/* ===================== MAIN COMPONENT ===================== */
export default function GraphRAGTBResistUI() {
  const [evalMetrics, setEvalMetrics] = useState(defaultEval);
  const [loadingEval, setLoadingEval] = useState(false);

  const [form, setForm] = useState<PredictInput>({ Gene: "katG", Mutation: "S315T", drug: "INH" });
  const [predicting, setPredicting] = useState(false);
  const [result, setResult] = useState<PredictResponse | null>(null);
  const bars = useMemo(() => evalToBars(evalMetrics), [evalMetrics]);

    // fokus ke node graf berdasarkan input (mutation > gene > drug)
    const [focusNode, setFocusNode] = useState<string | null>(null);
    // import atau di bagian function sebelum return
const highlights = {
  // hanya kirim bila field punya isi; key: node id (as-is), value: warna hex
  ...(form.Mutation?.trim() ? { [form.Mutation.trim()]: "#ef4444" } : {}),
  ...(form.Gene?.trim()     ? { [form.Gene.trim()]: "#3b82f6" } : {}),
  ...(form.drug?.trim()     ? { [form.drug.trim()]: "#10b981" } : {}),
};

    // debounce update fokus agar tidak terlalu sering saat mengetik
    useEffect(() => {
      const g = (form.Gene ?? "").trim();
      const m = (form.Mutation ?? "").trim();
      const d = (form.drug ?? "").trim();
  
      // prioritas: mutation > gene > drug
      const resolved = m || g || d || null;
  
      // jika sama, skip
      if (resolved === focusNode) return;
  
      const t = setTimeout(() => {
        setFocusNode(resolved);
      }, 280);
  
      return () => clearTimeout(t);
    }, [form.Gene, form.Mutation, form.drug]); // intentionally not including focusNode here
  


  // NEW: state tab aktif untuk mengatur perpindahan kartu
  const [activeTab, setActiveTab] = useState<"form" | "explain" | "embed">("form");

  const runEvaluate = async () => {
    try {
      setLoadingEval(true);
      const m = await apiEvaluate();
      setEvalMetrics(m);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingEval(false);
    }
  };

  const runPredict = async () => {
    setPredicting(true);
    setResult(null);
    try {
      const res = await apiPredict(form);
      setResult(res);
      if (res.evaluation) setEvalMetrics(res.evaluation);

      setFocusNode(form.Mutation.trim() || form.Gene.trim() || form.drug.trim() || null);
    } catch (e) {
      console.error(e);
    } finally {
      setPredicting(false);
    }
  };

  // Embedding insights
  const radarData = useMemo(() => {
    return {
      st: bucketize(result?.semantic_embedding, 8),
      gnn: bucketize(result?.gnn_embedding, 8),
    };
  }, [result]);

  const stNorm = result?.semantic_embedding?.reduce((a, b) => a + b * b, 0) ?? 0;
  const gnnNorm = result?.gnn_embedding?.reduce((a, b) => a + b * b, 0) ?? 0;
  const pieData = [
    { name: "SentenceTransformer", value: Number(Math.sqrt(stNorm).toFixed(4)) },
    { name: "GNN", value: Number(Math.sqrt(gnnNorm).toFixed(4)) },
  ];
  // --- Persentase kontribusi untuk label tengah donut ---
  const stVal = Number(Math.sqrt(stNorm).toFixed(4));
  const gnnVal = Number(Math.sqrt(gnnNorm).toFixed(4));
  const sumVal = (stVal + gnnVal) || 1;
  const stPct = Math.round((stVal / sumVal) * 100);
  const gnnPct = Math.round((gnnVal / sumVal) * 100);


  

  return (
    <div className={`min-h-screen ${theme.gradSoft} relative`}>
      
      
      {/* HEADER */}
<div className="sticky top-0 z-30 backdrop-blur-md bg-gradient-to-r from-[#E53935]/80 via-[#FB8C00]/75 to-[#FFD600]/70 text-white border-b border-white/20 shadow-sm">
  <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
    <div className="flex items-center gap-3">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="p-2 rounded-2xl bg-white/25"
      >
        <BrainCircuit className="w-6 h-6 text-white" />
      </motion.div>
      <div className="font-semibold leading-tight">
        <div className="text-sm opacity-90">GraphRAG • Hybrid GNN + XGBoost</div>
        <div className="text-lg">Explainable TB Drug Resistance Prediction</div>
      </div>
    </div>
    <div className="flex items-center gap-2">
      <Button variant="secondary" className="rounded-2xl bg-white/20 hover:bg-white/30 text-white">
        Dokumentasi
      </Button>
      <Button className="rounded-2xl bg-white text-gray-900 hover:bg-white/90">Pengaturan</Button>
    </div>
  </div>
</div>


      {/* CONTENT WRAPPER */}
      
      <div className="w-full bg-gradient-to-b from-[#E53935] via-[#FB8C00] to-[#FFD600]">
      <div className="max-w-7xl mx-auto px-4 py-8">      
        {/* ===== GRID UTAMA: 8 | 4 ===== */}
        <div className="grid grid-cols-12 gap-5">
          {/* LEFT (≈5+3): dashboard evaluasi + kotak fibonacci */}
          <div className="col-span-12 lg:col-span-8 space-y-5">
            {/* ===== RINGKASAN EVALUASI (7) + KOTAK GRADASI (5) ===== */}
            <Section className="p-0 overflow-hidden">
              <div className="grid grid-cols-12">
                {/* 7 → Ringkasan Evaluasi */}
                <div className="col-span-12 md:col-span-7 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <ChartBar className="w-5 h-5 text-red-600" />
                    <h2 className="text-xl font-semibold text-gray-900">Knowledge Graph</h2>
                  </div>
                  
                  <div className="h-[420px] rounded-3xl overflow-hidden border bg-gradient-to-b from-rose-50 to-amber-50">
  <KnowledgeGraph focusNodeId={focusNode} highlights={highlights} />
</div>

                  
                </div>

                {/* 5 → Panel gradasi + gambar nempel di bawah */}
                <div className="col-span-12 md:col-span-5">
                  <div
                    className={`relative w-full h-[420px] md:h-full ${theme.grad} rounded-3xl md:rounded-l-3xl overflow-hidden`}
                  >
                    {/* gambar di-anchorkan ke bawah */}
                    <img
                      src="/image.png"
                      alt="Tuberculosis Drug Resistance 3D Visualization"
                      className="absolute bottom-[-10px] left-1/2 -translate-x-1/2 translate-y-[1%] w-[110%] h-auto object-contain object-bottom"
                      />
                    {/* overlay halus supaya menyatu dengan tema */}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-orange-500/0 via-orange-400/10 to-yellow-300/15" />
                  </div>
                </div>


              </div>
            </Section>

            {/* ===== TIGA KARTU KECIL (≈ 2 | 1 | 1) ===== */}
            <div className="grid grid-cols-12 gap-5">
              <Section className="col-span-12 md:col-span-6 lg:col-span-4">
                <div className="flex items-center gap-3 mb-2">
                  <Settings2 className="w-4 h-4 text-orange-600" />
                  <h4 className="font-semibold">Snapshot Konfigurasi</h4>
                </div>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li>Encoder: SentenceTransformer (MiniLM)</li>
                  <li>GNN: 2×GraphConv, emb=128</li>
                  <li>Classifier: XGBoost</li>
                  <li>Split: Stratified 80/20</li>
                </ul>
              </Section>

              <Section className="col-span-12 md:col-span-6 lg:col-span-4">
                <div className="flex items-center gap-3 mb-2">
                  <Activity className="w-4 h-4 text-orange-600" />
                  <h4 className="font-semibold">Keseimbangan Kelas</h4>
                </div>
                <p className="text-sm text-gray-700">
                  Gunakan <i>scale_pos_weight</i> untuk menghadapi class imbalance.
                </p>
              </Section>

              <Section className="col-span-12 lg:col-span-4">
                <div className="flex items-center gap-3 mb-2">
                  <BrainCircuit className="w-4 h-4 text-orange-600" />
                  <h4 className="font-semibold">Sumber Pengetahuan</h4>
                </div>
                <p className="text-sm text-gray-700">
                  WHO catalogue + watchlist mutasi membentuk graf (Gene → Mutation → Drug).
                </p>
              </Section>
            </div>

            {/* === DIPINDAH KE KIRI saat Explain aktif: ditaruh PALING BAWAH kolom kiri === */}
            {activeTab === "explain" && (
              <div className="grid grid-cols-12 gap-5">
                <Section className="col-span-12 md:col-span-6">
                  <div className="text-sm text-gray-700">
                    <div className="font-semibold mb-1">Skema Graph</div>
                    Gene → Mutation → Drug (directed edges)
                  </div>
                </Section>
                <Section className="col-span-12 md:col-span-6">
                  <div className="text-sm text-gray-700">
                    <div className="font-semibold mb-1">Warna Tema</div>
                    Gradasi merah–oranye–kuning + blok putih
                  </div>
                </Section>
              </div>
            )}
          </div>

          {/* RIGHT (4): Prediksi */}
          <div className="col-span-12 lg:col-span-4 space-y-5">
            <Section>
              <div className="flex items-center gap-3 mb-4">
                <BrainCircuit className="w-5 h-5 text-red-600" />
                <h3 className="text-lg font-semibold text-gray-900">Prediksi Resistensi</h3>
              </div>

              {/* Tabs DIKENDALIKAN */}
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
                <TabsList className="grid grid-cols-3 w-full">
                  <TabsTrigger value="form">Input</TabsTrigger>
                  <TabsTrigger value="explain">Explain</TabsTrigger>
                  <TabsTrigger value="embed">Embeds</TabsTrigger>
                </TabsList>

                {/* FORM */}
                <TabsContent value="form" className="pt-4">
                  <div className="grid gap-3">
                    <div>
                      <Label htmlFor="gene">Gene</Label>
                      <Input id="gene" placeholder="contoh: katG" value={form.Gene} onChange={(e) => setForm({ ...form, Gene: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="mut">Mutation</Label>
                      <Input id="mut" placeholder="contoh: S315T" value={form.Mutation} onChange={(e) => setForm({ ...form, Mutation: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="drug">Drug</Label>
                      <Input id="drug" placeholder="contoh: INH (isoniazid)" value={form.drug} onChange={(e) => setForm({ ...form, drug: e.target.value })} />
                    </div>
                    <Button onClick={runPredict} disabled={predicting} className="mt-2 rounded-2xl">
                      {predicting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Activity className="w-4 h-4 mr-2" />} Jalankan Prediksi
                    </Button>
                  </div>

                  {/* RESULT HEADLINE */}
                  {result && (
                    <div className="mt-5 space-y-3">
                      <div className="rounded-2xl p-4 bg-white border">
                        <div className="text-sm text-gray-500">Hasil Prediksi</div>
                        <div className="mt-2 flex items-baseline gap-3">
                          <div className={`text-2xl font-semibold ${result.label === 1 ? "text-red-600" : "text-green-600"}`}>
                            {result.label === 1 ? "Resistant" : "Sensitive"}
                          </div>
                          <div className="text-sm text-gray-600">Prob: {(result.probability * 100).toFixed(2)}%</div>
                        </div>
                      </div>

                      <EvalCardLuxe data={evalToBars(result?.evaluation ?? evalMetrics)} />


                    </div>
                  )}
                </TabsContent>

                {/* EXPLAIN */}
<TabsContent value="explain" className="pt-4">
  {result ? (
    <div className="space-y-4">
      <div className="rounded-2xl p-5 bg-white border shadow-sm space-y-4">

        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">
            Explainable AI – GraphRAG
          </h3>
          
          {result.explanation?.Kuadran_interpretasi && (
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border">
              {result.explanation.Kuadran_interpretasi}
            </span>
          )}
        </div>

        <div className="text-sm text-gray-800 leading-relaxed space-y-3 text-justify">
          {result.explanation?.Interpretasi_prediksi && (
            <p>
              <b>Interpretasi Prediksi:</b>{" "}
              {result.explanation.Interpretasi_prediksi}
            </p>
          )}

          {result.explanation?.Bukti_dari_knowledge_graph && (
            <p>
              <b>Bukti dari Knowledge Graph:</b>{" "}
              {result.explanation.Bukti_dari_knowledge_graph}
            </p>
          )}

          {result.explanation?.Analisis_keterbatasan_bukti && (
            <p>
              <b>Analisis Keterbatasan Bukti:</b>{" "}
              {result.explanation.Analisis_keterbatasan_bukti}
            </p>
          )}

          {result.explanation?.Implikasi_klinis && (
            <p>
              <b>Implikasi Klinis:</b>{" "}
              {result.explanation.Implikasi_klinis}
            </p>
          )}

          {result.explanation?.Kesimpulan && (
            <p>
              <b>Kesimpulan:</b>{" "}
              {result.explanation.Kesimpulan}
            </p>
          )}
        </div>
      </div>
    </div>
  ) : (
    <p className="text-sm text-gray-500">
      Jalankan prediksi terlebih dahulu.
    </p>
  )}
</TabsContent>


                {/* EMBEDDINGS → Radar + Pie */}
                <TabsContent value="embed" className="pt-4">
                  {result ? (
                    <div className="grid grid-cols-12 gap-4">
                      <div className="col-span-12">
                        <div className="text-sm text-gray-500 mb-2">Embeddings Insight</div>
                      </div>

                      {/* Radar buckets */}
                      <div className="col-span-12">
                        <div className="rounded-2xl p-4 bg-white border">
                          <div className="text-xs text-gray-500 mb-2">Pola kekuatan (dirata-rata per bucket dimensi)</div>
                          <div className="w-full h-72">
                            <ResponsiveContainer width="100%" height="100%">
                            {(() => {
                              // hitung rentang dimensi per bucket untuk ST & GNN
                              const stLen = result?.semantic_embedding?.length ?? 0;
                              const gnnLen = result?.gnn_embedding?.length ?? 0;
                              const buckets = radarData.st.length || 8;
                              const stRanges = bucketRanges(stLen, buckets);
                              const gnnRanges = bucketRanges(gnnLen, buckets);
                              const data = radarData.st.map((d, i) => ({
                                bucket: d.name, ST: d.value, GNN: radarData.gnn[i]?.value ?? 0,
                              }));

                              return (
                                <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
                                  <PolarGrid />
                                  <PolarAngleAxis dataKey="bucket" />
                                  <PolarRadiusAxis angle={30} />
                                  <Radar name="SentenceTransformer" dataKey="ST" stroke="#ef4444" fill="#ef4444" fillOpacity={0.28} />
                                  <Radar name="GNN" dataKey="GNN" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.22} />
                                  {/* Tooltip kecil, ditempatkan di pojok agar tidak menutupi diagram */}
                                  <Tooltip
                                    cursor={false}
                                    position={{ x: 10, y: 10 }}                // pojok kiri dalam area chart
                                    wrapperStyle={{ outline: "none" }}          // tanpa outline biru
                                    content={({ label, payload }) => (
                                      <BucketTooltip label={label as string} payload={payload as any[]} stRanges={stRanges} gnnRanges={gnnRanges} />
                                    )}
                                  />
                                </RadarChart>
                              );
                            })()}
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>

                      {/* Pie kontribusi */}
                      <div className="col-span-12">
                        <div className="rounded-2xl p-4 bg-white border">
                          <div className="text-xs text-gray-500 mb-2">Kontribusi relatif (norm vektor)</div>
                          <div className="w-full h-64 relative">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={pieData}
                                  dataKey="value"
                                  nameKey="name"
                                  innerRadius={60}
                                  outerRadius={90}
                                  label
                                >
                                  {pieData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                  ))}
                                </Pie>
                                <Tooltip />
                              </PieChart>
                            </ResponsiveContainer>

                            {/* Label tengah donut — tidak mengganggu interaksi (pointer-events:none) */}
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                              <div className="text-[11px] text-gray-500 mb-0.5">Kontribusi</div>
                              <div className="text-sm font-semibold">
                                <span className="text-orange-500">{gnnPct}% GNN</span>
                                <span className="mx-1 text-gray-400">•</span>
                                <span className="text-red-500">{stPct}% ST</span>
                              </div>
                            </div>
                          </div>

                          <div className="text-xs text-gray-600 mt-1">
                            Dim ST: {result.semantic_embedding?.length ?? 0} • Dim GNN: {result.gnn_embedding?.length ?? 0} • Total:{" "}
                            {result.embedding_dim ?? ((result.semantic_embedding?.length ?? 0) + (result.gnn_embedding?.length ?? 0))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Jalankan prediksi terlebih dahulu.</p>
                  )}
                </TabsContent>
              </Tabs>
            </Section>

            {/* DUA KARTU KECIL DI BAWAH PREDIKSI (hanya tampil di kanan saat BUKAN explain) */}
            {activeTab !== "explain" && (
              <div className="grid grid-cols-12 gap-5">
                <Section className="col-span-12 md:col-span-6">
                  <div className="text-sm text-gray-700">
                    <div className="font-semibold mb-1">Skema Graph</div>
                    Gene → Mutation → Drug (directed edges)
                  </div>
                </Section>
                <Section className="col-span-12 md:col-span-6">
                  <div className="text-sm text-gray-700">
                    <div className="font-semibold mb-1">Warna Tema</div>
                    Gradasi merah–oranye–kuning + blok putih
                  </div>
                </Section>
              </div>
            )}
          </div>
        </div>
      </div>
      

      {/* FOOTER */}
      <div className="max-w-7xl mx-auto px-4 pb-10">
        <p className="text-center text-xs text-white-500">
          © {new Date().getFullYear()} • Hybrid Graph Neural Network + XGBoost • GraphRAG Explainability
        </p>
      </div>
      </div>

      

      {/* MutationHelpPanel (FAB buku tetap di kanan, modal kiri) */}
      <MutationHelpPanel
        icon="book"
        position="bottom-right"
        placement="left-overlay"
        rightPanelWidth={420}
        headerOffset={80}
      />
    </div>
  );
}
