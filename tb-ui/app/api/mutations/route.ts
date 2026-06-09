// app/api/mutations/route.ts
import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import csv from "csv-parser";

// ... imports tetap
export async function GET(req: Request) {
    try {
      const url = new URL(req.url);
      const qRaw = (url.searchParams.get("q") ?? "").trim();
      const q = qRaw.toLowerCase();
      const strict = (url.searchParams.get("strict") ?? "false") === "true";
      const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
      const pageSize = Math.min(1000, Number(url.searchParams.get("pageSize") ?? 200));
      const sortParam = url.searchParams.get("sort") ?? "";
  
      const filePath = path.join(process.cwd(), "public", "mutations.csv");
      if (!fs.existsSync(filePath)) return NextResponse.json({ items: [], total: 0 });
  
      const startIndex = (page - 1) * pageSize;
      const items: any[] = [];
      let totalMatches = 0;
  
      const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const phraseRe = q ? new RegExp(`\\b${esc(q)}\\b`, "i") : null;
      // daftar negasi umum
      const negPrefixes = ["not ", "no ", "non "];
      const negRes: RegExp[] = q
        ? negPrefixes.map((p) => new RegExp(`\\b${esc(p + q)}\\b`, "i"))
        : [];
  
      return await new Promise<NextResponse>((resolve) => {
        const stream = fs.createReadStream(filePath)
          .pipe(csv({ mapHeaders: ({ header }) => (header ?? "").trim().toLowerCase() }));
  
        stream.on("data", (row: any) => {
          try {
            const concat = Object.values(row).join(" ").toLowerCase();
  
            let matched = false;
            if (!q) {
              matched = true;
            } else if (strict && phraseRe) {
              // cocok frasa tepat & tidak diawali negasi
              if (phraseRe.test(concat)) {
                matched = !negRes.some((re) => re.test(concat));
              }
            } else {
              // fallback substring match lama
              matched = concat.includes(q);
            }
  
            if (matched) {
              if (totalMatches >= startIndex && items.length < pageSize) items.push(row);
              totalMatches++;
            }
          } catch {}
        });
  
        stream.on("end", () => {
          if (sortParam && items.length > 1) {
            const [k, dir] = sortParam.split(":");
            const key = (k ?? "").trim().toLowerCase();
            const dirVal = dir === "desc" ? -1 : 1;
            items.sort((a: any, b: any) => {
              const av = String(a[key] ?? "").toLowerCase();
              const bv = String(b[key] ?? "").toLowerCase();
              return av.localeCompare(bv) * dirVal;
            });
          }
          resolve(NextResponse.json({ items, total: totalMatches, page, pageSize }));
        });
  
        stream.on("error", (err: any) => {
          resolve(NextResponse.json({ items: [], total: 0, error: String(err) }));
        });
      });
    } catch (e) {
      return NextResponse.json({ items: [], total: 0, error: String(e) });
    }
  }
  
