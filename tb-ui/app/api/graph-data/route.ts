import { NextResponse } from "next/server";

export async function GET() {
  // ganti ke backend kamu (FastAPI) kalau perlu
  const r = await fetch("http://localhost:8000/graph-data", { cache: "no-store" });
  if (!r.ok) return NextResponse.json({ nodes: [], links: [] }, { status: r.status });
  const data = await r.json();
  return NextResponse.json(data);
}
