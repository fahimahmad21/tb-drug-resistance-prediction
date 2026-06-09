import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function GET() {
  try {
    const r = await fetch(`${BACKEND}/evaluate`, { cache: "no-store" });
    if (!r.ok) return NextResponse.json({ error: await r.text() }, { status: r.status });
    return NextResponse.json(await r.json());
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
