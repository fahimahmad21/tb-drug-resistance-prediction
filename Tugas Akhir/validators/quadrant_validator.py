from typing import Dict


def detect_graph_evidence(
    mutation: str,
    gene: str,
    drug: str,
    rag_context: str,
) -> bool:
    """
    Evidence dianggap ADA hanya jika:
    - mutation muncul
    - gene muncul
    - drug muncul
    - DAN hubungan mutation→gene dan gene→drug muncul eksplisit
    """
    ctx = rag_context.lower()

    m = mutation.lower() in ctx
    g = gene.lower() in ctx
    d = drug.lower() in ctx

    # minimal pattern relasi eksplisit (boleh kamu perketat)
    mut_gene = m and g and ("memengaruhi gen" in ctx or "mutation" in ctx)
    gene_drug = g and d and ("berhubungan dengan resistensi" in ctx)

    return bool(mut_gene and gene_drug)


def determine_quadrant(
    probability: float,
    graph_evidence_present: bool,
) -> str:
    """
    Hard rule kuadran (TIDAK BOLEH diubah oleh LLM)
    """
    if probability >= 0.5 and graph_evidence_present:
        return "Q1"
    if probability >= 0.5 and not graph_evidence_present:
        return "Q2"
    if probability < 0.5 and graph_evidence_present:
        return "Q3"
    return "Q4"


def validate_and_correct_explanation(
    explanation: Dict,
    probability: float,
    mutation: str,
    gene: str,
    drug: str,
    rag_context: str,
) -> Dict:
    """
    Validator utama:
    - cek bukti graf
    - hitung kuadran seharusnya
    - override jika LLM salah
    """

    graph_evidence = detect_graph_evidence(
        mutation=mutation,
        gene=gene,
        drug=drug,
        rag_context=rag_context,
    )

    correct_quadrant = determine_quadrant(
        probability=probability,
        graph_evidence_present=graph_evidence,
    )

    # override kuadran jika salah
    explanation["Kuadran_interpretasi"] = correct_quadrant

    # pastikan Analisis_keterbatasan_bukti tidak kosong
    if correct_quadrant in ("Q2", "Q3", "Q4"):
        if not explanation.get("Analisis_keterbatasan_bukti"):
            explanation["Analisis_keterbatasan_bukti"] = (
                "Interpretasi dibatasi oleh kombinasi probabilitas prediksi "
                "dan ketersediaan bukti eksplisit dalam knowledge graph."
            )

    return explanation
