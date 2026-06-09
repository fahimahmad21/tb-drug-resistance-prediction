import { NextResponse } from "next/server";

export const runtime = "nodejs";            // hindari Edge Runtime
export const dynamic = "force-dynamic";   
const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function POST(req: Request) {
  try {
    const body = await req.json(); // { Gene, Mutation, drug }
    const r = await fetch(`${BACKEND}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) return NextResponse.json({ error: await r.text() }, { status: r.status });
    const data = await r.json();
    // langsung pass-through sesuai UI
    return NextResponse.json({
      label: data.label as 0 | 1,
      probability: data.probability as number,
      evaluation: data.evaluation,
      explanation: data.explanation, 
      rag_context: data.rag_context ?? "",
      semantic_embedding: data.semantic_embedding as number[],
      gnn_embedding: data.gnn_embedding as number[],
      embedding_dim: data.embedding_dim as number,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

