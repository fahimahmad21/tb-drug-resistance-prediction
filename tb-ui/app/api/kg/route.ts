// app/api/kg/route.ts
import { NextResponse } from "next/server";
const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = url.searchParams.get("limit") ?? "";
  try {
    const r = await fetch(`${BACKEND}/kg${limit ? `?limit=${limit}` : ""}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      // penting untuk dev agar tidak ke-cache
      cache: "no-store",
    });
    if (!r.ok) return NextResponse.json({ error: await r.text() }, { status: r.status });
    const data = await r.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to fetch /kg" }, { status: 500 });
  }
}
