"use client";
import React, { useEffect, useMemo, useState } from "react";
import { BookOpen, Lightbulb, X, Search, Loader2, Download } from "lucide-react";

type MutationRow = { [k: string]: any };

interface Props {
  csvUrl?: string;
  /** FAB position (controls icon) */
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  icon?: "book" | "bulb";
  initialPageSize?: number;
  /** modal placement */
  placement?: "center" | "left-overlay";
  rightPanelWidth?: number;
  headerOffset?: number; // optional offset for top (header height)
}

export default function MutationHelpPanel({
  csvUrl = "/mutations.csv",
  position = "bottom-right", // controls FAB
  icon = "book",
  initialPageSize = 200,
  placement = "left-overlay", // where modal appears
  rightPanelWidth = 420,
  headerOffset = 80,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(initialPageSize);
  const [items, setItems] = useState<MutationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<string>("gene:asc");

  useEffect(() => { const t = setTimeout(() => setDebouncedQuery(query.trim()), 300); return () => clearTimeout(t); }, [query]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
params.set("page", String(page));
params.set("pageSize", String(pageSize));
if (debouncedQuery) params.set("q", debouncedQuery);
if (sort) params.set("sort", sort);

// STRICT PHRASE untuk 'assoc w r' → hanya cocok frasa itu, exclude 'not assoc w r' dkk
if (/\bassoc\s*w\s*r\b/i.test(debouncedQuery)) {
  params.set("strict", "true");
}

    fetch(`/api/mutations?${params.toString()}`)
      .then(r => r.json())
      .then(j => { if (!cancelled) { setItems(Array.isArray(j.items) ? j.items : []); setTotal(Number.isFinite(j.total) ? j.total : 0); } })
      .catch(e => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, page, pageSize, debouncedQuery, sort]);

  const cols = useMemo(() => ["gene","mutation","drug","confidence"], []);
  const headerCell = (key: string) => {
    const [k, dir] = sort.split(":");
    const active = k === key;
    return (
        <button
        type="button"
        aria-label={open ? "Tutup data mutations" : "Buka data mutations"}
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            setPage(1);
            setOpen(true);
          }
        }}
        className={`fixed ${posClass} z-[60] inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-white shadow-lg transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-amber-300`}
      >
        {icon === "book" ? <BookOpen className="h-6 w-6" /> : <Lightbulb className="h-6 w-6" />}
      </button>
      
    );
  };

  const handleDownload = () => {
    try {
      const header = cols.join(",") + "\n";
      const body = items.map(r => cols.map(c => {
        const v = r[c] ?? r[c?.toUpperCase?.()] ?? "";
        const s = String(v ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
      }).join(",")).join("\n");
      const csv = header + body + "\n";
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `mutations_page_${page}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { console.error(e); alert("Download failed"); }
  };

  // FAB position class (controls icon)
  const posClass =
    position === "bottom-right" ? "right-6 bottom-6" :
    position === "bottom-left" ? "left-6 bottom-6" :
    position === "top-right" ? "right-6 top-6" : "left-6 top-6";

  // left-overlay style: leaves rightPanelWidth px free on the right
  const leftOverlayStyle: React.CSSProperties = {
    left: 24,
    top: headerOffset,
    width: `calc(100% - ${rightPanelWidth + 48}px)`,
    maxWidth: "1100px",
    height: `calc(100% - ${headerOffset + 48}px)`,
    transform: "none",
  };
  const centerStyle: React.CSSProperties = { left: "50%", top: "50%", width: "92vw", maxWidth: "900px", transform: "translate(-50%, -50%)", maxHeight: "90vh" };

  return (
    <>
      {/* FAB (icon) - controlled by position prop (you keep it on right) */}
      <button type="button" aria-label="Buka data mutations" onClick={() => { setOpen(true); setPage(1); }} className={`fixed ${posClass} z-40 inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-white shadow-lg transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-amber-300`}>
        {icon === "book" ? <BookOpen className="h-6 w-6" /> : <Lightbulb className="h-6 w-6" />}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          {/* overlay: only clickable if center placement */}
          <div className="absolute inset-0 bg-black/20" style={{ pointerEvents: placement === "center" ? "auto" : "none" }} onClick={() => placement === "center" && setOpen(false)} />

          <div className="absolute z-50 rounded-2xl bg-white shadow-2xl pointer-events-auto overflow-auto" style={placement === "left-overlay" ? leftOverlayStyle : centerStyle}>
            <div className="flex items-center justify-between border-b px-6 py-4 sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg font-semibold leading-none">Data Mutations</h2>
                <p className="text-sm text-gray-500">Data per-halaman (CSV besar).</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={handleDownload} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><Download className="h-4 w-4" /> Download page</button>
                <button onClick={() => setOpen(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
              </div>
            </div>

            <div className="p-4">
              <div className="flex gap-3 items-center mb-3">
                <div className="relative w-full md:max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Cari gene / mutation / drug ..." className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none" />
                </div>
                <div className="text-sm text-gray-600">{loading ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Memuat…</span> : <span>{total.toLocaleString()} baris</span>}</div>
              </div>

              <div className="rounded border">
                <div className="grid grid-cols-12 bg-gray-50 px-3 py-2 text-xs text-gray-600 sticky top-0">
                  <div className="col-span-3">{headerCell("gene")}</div>
                  <div className="col-span-4">{headerCell("mutation")}</div>
                  <div className="col-span-3">{headerCell("drug")}</div>
                  <div className="col-span-2">{headerCell("confidence")}</div>
                </div>

                <div className="max-h-[60vh] overflow-auto">
                  <table className="min-w-full text-left text-sm">
                    <tbody>
                      {items.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                          <td className="px-3 py-2 col-span-3 font-medium text-gray-800">{r.gene ?? "-"}</td>
                          <td className="px-3 py-2 col-span-4">{r.mutation ?? "-"}</td>
                          <td className="px-3 py-2 col-span-3">{r.drug ?? "-"}</td>
                          <td className="px-3 py-2 col-span-2">{String(r.confidence ?? "-")}</td>
                        </tr>
                      ))}
                      {items.length === 0 && !loading && (<tr><td colSpan={4} className="px-3 py-6 text-center text-sm text-gray-500">Tidak ada data yang cocok.</td></tr>)}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="text-sm text-gray-600">Page {page} / {Math.max(1, Math.ceil(total / pageSize))} • Menampilkan {items.length} baris</div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="rounded px-3 py-1 border text-sm disabled:opacity-50">Prev</button>
                    <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(Math.max(1, total) / pageSize)} className="rounded px-3 py-1 border text-sm disabled:opacity-50">Next</button>
                  </div>
                </div>
              </div>

              {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
