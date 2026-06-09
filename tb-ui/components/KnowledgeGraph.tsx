"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
} from "react";
import dynamic from "next/dynamic";

const ForceGraph2D: any = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

/* ================== Types & Colors ================== */
type RawNode = {
  id: string | number;
  type?: string;
  description?: string;
  x?: number;
  y?: number;
  fx?: number | undefined;
  fy?: number | undefined;
};
type RawLink = {
  source: string | number | RawNode;
  target: string | number | RawNode;
  label?: string;
  weight?: number;
};
type GraphData = { nodes: RawNode[]; links: RawLink[] };
type ViewMode = "neighborhood" | "sample" | "top" | "all";

const TYPE_COLOR: Record<string, string> = {
  mutation: "#ef4444",
  gene: "#3b82f6",
  drug: "#10b981",
  default: "#475569",
};
const HOVER_COLOR = "#ffd700";

/* ================== Utils ================== */
function pickSample<T>(arr: T[], k: number, seedNum = 0) {
  const out: T[] = [];
  const n = arr.length;
  if (k >= n) return [...arr];
  let s = (seedNum + 1) * 1103515245 + 12345;
  const next = () => (s = (s * 1103515245 + 12345) % 2 ** 31);
  const used = new Set<number>();
  while (out.length < k && used.size < n) {
    const idx = next() % n;
    if (!used.has(idx)) {
      used.add(idx);
      out.push(arr[idx]);
    }
  }
  return out;
}
function degrees(g: GraphData) {
  const m = new Map<string | number, number>();
  g.links.forEach((l: any) => {
    const s = (l.source as any)?.id ?? l.source;
    const t = (l.target as any)?.id ?? l.target;
    m.set(s, (m.get(s) ?? 0) + 1);
    m.set(t, (m.get(t) ?? 0) + 1);
  });
  return m;
}
function kHopSubgraph(
  g: GraphData,
  centerId: string | number,
  k = 1,
  cap = 9999
): GraphData {
  const adj = new Map<string | number, Set<string | number>>();
  g.links.forEach((l: any) => {
    const s = (l.source as any)?.id ?? l.source;
    const t = (l.target as any)?.id ?? l.target;
    if (!adj.has(s)) adj.set(s, new Set());
    if (!adj.has(t)) adj.set(t, new Set());
    adj.get(s)!.add(t);
    adj.get(t)!.add(s);
  });
  const visited = new Set<string | number>([centerId]);
  let frontier = new Set<string | number>([centerId]);
  for (let d = 0; d < k; d++) {
    const nxt = new Set<string | number>();
    frontier.forEach((u) => {
      (adj.get(u) ?? new Set()).forEach((v) => {
        if (!visited.has(v)) {
          visited.add(v);
          nxt.add(v);
        }
      });
    });
    frontier = nxt;
    if (visited.size >= cap) break;
  }
  const limited = Array.from(visited).slice(0, cap);
  const keep = new Set(limited);
  const nodes = g.nodes.filter((n) => keep.has(n.id));
  const links = g.links.filter(
    (l: any) =>
      keep.has((l.source as any)?.id ?? l.source) &&
      keep.has((l.target as any)?.id ?? l.target)
  );
  return { nodes, links };
}

/* ========== Slider dengan track gradasi ========== */
function GradientSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  className = "",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  className?: string;
}) {
  const pct = Math.round(((value - min) / (max - min)) * 100);
  const grad = `linear-gradient(90deg, #E53935 0%, #FB8C00 55%, #FFD600 100%)`;
  const bg = `linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) ${pct}%, rgba(148,163,184,0.25) ${pct}%, rgba(148,163,184,0.25) 100%)`;
  const style = {
    backgroundImage: `${grad}, ${bg}`,
    backgroundClip: "content-box, border-box",
    backgroundOrigin: "border-box",
  } as React.CSSProperties;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="text-xs text-slate-700">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="kg-slider w-56"
        style={style}
      />
      <span className="w-16 text-right text-xs text-slate-700 tabular-nums">
        {value} {suffix}
      </span>

      <style jsx global>{`
        .kg-slider {
          appearance: none;
          height: 8px;
          border-radius: 9999px;
          padding: 0;
          outline: none;
          border: 1px solid rgba(0, 0, 0, 0.06);
          background-color: rgba(148, 163, 184, 0.25);
        }
        .kg-slider:focus {
          box-shadow: 0 0 0 3px rgba(251, 140, 0, 0.15);
        }
        .kg-slider::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 9999px;
          background: white;
          border: 3px solid #6b7280;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
          cursor: pointer;
          margin-top: -6px;
        }
        .kg-slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 9999px;
          background: white;
          border: 3px solid #6b7280;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
          cursor: pointer;
        }
        .kg-slider::-webkit-slider-runnable-track,
        .kg-slider::-moz-range-track {
          height: 8px;
          border-radius: 9999px;
        }
      `}</style>
    </div>
  );
}

/* ========== Komponen utama ========== */
export default function KnowledgeGraph({
    focusNodeId = null,
    height = 420,
    highlights = {},
  }: {
    focusNodeId?: string | null;
    height?: number;
    highlights?: Record<string, string>;
  }) {
    
  const fgRef = useRef<any>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // ukur area kanvas saja
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.floor(r.width), h: Math.floor(r.height) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  // load graph.json
  const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/data/graph.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        const links: RawLink[] = (raw.links ?? raw.edges ?? []).map((e: any) => ({
          ...e,
          source: e.source?.id ?? e.source,
          target: e.target?.id ?? e.target,
        }));
        const nodes: RawNode[] = (raw.nodes ?? []).map((n: any) => {
          let x = n.x,
            y = n.y;
          if (typeof x === "number" && Math.abs(x) > 5_000) x = undefined;
          if (typeof y === "number" && Math.abs(y) > 5_000) y = undefined;
          return {
            id: n.id ?? n.name,
            type: n.type ?? "default",
            description: n.description ?? "",
            x: undefined,
            y: undefined,
            fx: undefined,
            fy: undefined,
          };
        });
        setData({ nodes, links });
      } catch (e: any) {
        setError(e?.message ?? "Gagal memuat /data/graph.json");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  

  /* ===== interaksi & subset ===== */
  const [activeNode, setActiveNode] = useState<RawNode | null>(null);
  const [hoverNodeId, setHoverNodeId] = useState<string | number | null>(null);
  const [highlightNodes, setHighlightNodes] = useState<Set<string | number>>(
    new Set()
  );
  const [highlightLinks, setHighlightLinks] = useState<Set<any>>(new Set());

  const [mode, setMode] = useState<ViewMode>("neighborhood");
  const [count, setCount] = useState(120);
  const [kHop, setKHop] = useState(2);
  const [seed, setSeed] = useState(0);
  const [frozen, setFrozen] = useState(false);
  const centerId = activeNode?.id ?? null;

  const visibleData = useMemo<GraphData>(() => {
    if (!data.nodes.length) return data;

    if (mode === "sample") {
      const sampleNodes = pickSample(
        data.nodes,
        Math.min(count, data.nodes.length),
        seed
      );
      const keep = new Set(sampleNodes.map((n) => n.id));
      const links = data.links.filter(
        (l: any) =>
          keep.has((l.source as any)?.id ?? l.source) &&
          keep.has((l.target as any)?.id ?? l.target)
      );
      return { nodes: sampleNodes, links };
    }

    if (mode === "top") {
      const deg = degrees(data);
      const nodes = [...data.nodes]
        .sort((a, b) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0))
        .slice(0, Math.min(count, data.nodes.length));
      const keep = new Set(nodes.map((n) => n.id));
      const links = data.links.filter(
        (l: any) =>
          keep.has((l.source as any)?.id ?? l.source) &&
          keep.has((l.target as any)?.id ?? l.target)
      );
      return { nodes, links };
    }

    if (mode === "neighborhood") {
      const deg = degrees(data);
      const defaultCenter =
        [...deg.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
        data.nodes[0].id;
      const cid = centerId ?? defaultCenter;
      return kHopSubgraph(data, cid, kHop, count);
    }

    return data;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, mode, count, kHop, centerId, seed]);

  // highlight helper
  const updateHighlight = (node: any | null) => {
    const hn = new Set<string | number>();
    const hl = new Set<any>();
    if (node) {
      hn.add(node.id);
      visibleData.links.forEach((l: any) => {
        const s = (l.source as any)?.id ?? l.source;
        const t = (l.target as any)?.id ?? l.target;
        if (s === node.id || t === node.id) {
          hl.add(l);
          hn.add(s);
          hn.add(t);
        }
      });
    }
    setHighlightNodes(hn);
    setHighlightLinks(hl);
  };

  /* ======= FIT: berbasis bounding-box panel ======= */
  const fitToBBox = (padPx?: number, ms = 350) => {
    const fg = fgRef.current;
    const el = wrapRef.current;
    if (!fg || !el || !visibleData.nodes.length) return;

    const r = el.getBoundingClientRect();
    const W = Math.max(1, Math.floor(r.width));
    const H = Math.max(1, Math.floor(r.height));
    const PAD = padPx ?? Math.max(10, Math.min(W, H) * 0.06);

    const xs = visibleData.nodes.map((n: any) => n.x ?? 0);
    const ys = visibleData.nodes.map((n: any) => n.y ?? 0);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs);
    const minY = Math.min(...ys),
      maxY = Math.max(...ys);

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);

    const scaleX = (W - PAD * 2) / bw;
    const scaleY = (H - PAD * 2) / bh;
    const scale = Math.max(0.05, Math.min(scaleX, scaleY));

    fg.centerAt(cx, cy, ms);
    fg.zoom(scale, ms);
  };

  // Fokus otomatis ke node ketika focusNodeId berubah
    useEffect(() => {
    if (!focusNodeId || !data.nodes.length) return;
  
    // cari node dengan id yang sama (case-insensitive)
    const targetNode = data.nodes.find(
      (n) => n.id.toString().toLowerCase() === focusNodeId.toLowerCase()
    );
    if (!targetNode) return;
  
    // aktifkan highlight dan neighborhood view
    setActiveNode(targetNode);
    updateHighlight(targetNode);
    setMode("neighborhood");
    setKHop(2);
  
    // animasikan kamera ke node tsb
    const fg = fgRef.current;
    if (fg) {
      fg.centerAt(targetNode.x, targetNode.y, 1000);
      fg.zoom(3, 1000);
    }
  }, [focusNodeId, data.nodes]);

  // normalisasi highlights -> map lowercased id => color
const highlightsNorm = useMemo(() => {
    const map = new Map<string, string>();
    Object.entries(highlights ?? {}).forEach(([k, v]) => {
      if (!k) return;
      map.set(k.toString().toLowerCase(), v);
    });
    return map;
  }, [highlights]);
  
  

  

  // events
  const handleHover = (n: any) => {
    setHoverNodeId(n?.id ?? null);
    updateHighlight(n ?? null);
  };
  const handleClick = (n: any) => {
    setActiveNode(n);
    updateHighlight(n ?? null);
    setMode("neighborhood");
    setKHop((k) => Math.max(1, k));
    setTimeout(() => fitToBBox(undefined, 260), 120);
  };

  if (loading)
    return (
      <div className="h-full w-full flex items-center justify-center text-sm text-slate-600">
        Menyiapkan graf…
      </div>
    );
  if (error)
    return (
      <div className="h-full w-full flex items-center justify-center text-red-600">
        Error: {error}
      </div>
    );

  return (
    <div className="h-full w-full rounded-2xl border border-white/40  bg-gradient-to-b from-[#ff7a00]/30 via-[#ff4d4d]/20 to-[#ffd700]/30 backdrop-md overflow-hidden shadow-sm flex flex-col">
      {/* ========== Global styles untuk warna tombol (Lab) ========== */}
      <style jsx global>{`
        :root { --kg-btn: lab(8.30603% 0.618212 -2.16573); }

        .kg-btn{
          background: var(--kg-btn);
          color: white;
          border: 1px solid color-mix(in lab, var(--kg-btn) 65%, black);
          border-radius: 9999px;
          padding: .5rem .9rem;
          font-size: .875rem;
          line-height: 1;
          box-shadow: 0 6px 18px color-mix(in lab, var(--kg-btn) 35%, transparent);
          transition: transform .05s ease, box-shadow .2s ease, filter .15s ease;
        }
        .kg-btn:hover{
          filter: brightness(1.08);
          box-shadow: 0 8px 22px color-mix(in lab, var(--kg-btn) 45%, transparent);
        }
        .kg-btn:active{ transform: translateY(1px) scale(.99); }
        .kg-btn.round{ width: 40px; height: 40px; padding: 0; display: inline-flex; align-items:center; justify-content:center; font-weight:600; }

        /* ghost variant */
        .kg-btn-ghost{
          background: color-mix(in lab, var(--kg-btn) 10%, white);
          color: color-mix(in lab, var(--kg-btn) 80%, white);
          border: 1px solid color-mix(in lab, var(--kg-btn) 35%, white);
          border-radius: 9999px;
          padding: .5rem .9rem;
          font-size: .875rem;
          line-height: 1;
          box-shadow: 0 2px 10px color-mix(in lab, var(--kg-btn) 15%, transparent);
          transition: transform .05s ease, box-shadow .2s ease, filter .15s ease;
        }
        .kg-btn-ghost:hover{ filter: brightness(1.05); box-shadow: 0 4px 14px color-mix(in lab, var(--kg-btn) 25%, transparent); }
        .kg-btn-ghost:active{ transform: translateY(1px) scale(.99); }

        .kg-select{
          appearance: none;
          background: #111827;
          color: white;
          border: 1px solid rgba(0,0,0,.35);
          border-radius: 10px;
          padding: .35rem 1.4rem .35rem .6rem;
          font-size: .78rem;
          box-shadow: 0 8px 24px rgba(0,0,0,.12);
          background-image:
            linear-gradient(45deg, transparent 50%, white 50%),
            linear-gradient(135deg, white 50%, transparent 50%);
          background-position:
            calc(100% - 12px) calc(50% - 3px),
            calc(100% - 8px) calc(50% - 3px);
          background-size: 4px 4px, 4px 4px;
          background-repeat: no-repeat;
        }
        .kg-select:hover{ filter: brightness(1.06); }
      `}</style>

      {/* ===== Toolbar ===== */}
      <div className="flex flex-wrap items-center gap-3 p-3 border-b border-white/50 bg-white/70">
        {/* Mode */}
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as ViewMode)}
          className="kg-select"
        >
          <option value="neighborhood">Neighborhood</option>
          <option value="sample">Sample</option>
          <option value="top">Top Degree</option>
          <option value="all">All</option>
        </select>

        {/* Sliders */}
        <GradientSlider
          label="Tampilkan"
          value={count}
          onChange={setCount}
          min={20}
          max={500}
          step={10}
          suffix="node"
          className="ml-1"
        />
        {mode === "neighborhood" && (
          <GradientSlider
            label="k-hop"
            value={kHop}
            onChange={setKHop}
            min={1}
            max={4}
            step={1}
            className="ml-1"
          />
        )}

        <div className="flex-1" />

        {/* Controls – varian solid */}
        

        {/* Info badge nyatu warna */}
        <div className="w-full text-right">
          <span
            className="inline-block text-[11px] px-2 py-1 rounded-full"
            style={{
              background: "color-mix(in lab, var(--kg-btn) 16%, white)",
              color: "color-mix(in lab, var(--kg-btn) 80%, black)",
              border: "1px solid color-mix(in lab, var(--kg-btn) 28%, white)",
            }}
          >
            Nodes: {visibleData.nodes.length} / {data.nodes.length} • Links:{" "}
            {visibleData.links.length}
          </span>
        </div>
      </div>

      {/* ===== Canvas ===== */}
      <div ref={wrapRef} className="flex-1 min-h-0 w-full">
        {visibleData.nodes.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-sm text-slate-500">
            Data kosong.
          </div>
        ) : (
          <ForceGraph2D
            ref={fgRef}
            width={size.w || undefined}
            height={size.h || undefined}
            graphData={visibleData}
            cooldownTicks={0}
            enableZoomPanInteraction
            minZoom={0.5}
            maxZoom={8}
            nodeRelSize={6}
            linkWidth={1}
            linkDirectionalParticles={0}
            linkColor={(l: any) =>
              highlightLinks.size
                ? highlightLinks.has(l)
                  ? "rgba(0,0,0,0.35)"
                  : "rgba(0,0,0,0.08)"
                : "rgba(0,0,0,0.22)"
            }
            nodeLabel={(n: any) =>
              `<div style="padding:4px 6px"><b>${n.id}</b><br/>${n.type ?? ""}<br/>${n.description ?? ""}</div>`
            }
            nodeCanvasObject={(node: any, ctx: any, globalScale: any) => {
                const isActive = activeNode?.id === node.id;
                const isHover = hoverNodeId === node.id;
                const isHighlighted = highlightNodes.size ? highlightNodes.has(node.id) : true;
              
                // warna khusus dari highlights (case-insensitive)
                const special = highlightsNorm.get(String(node.id).toLowerCase());
              
                const base =
                  TYPE_COLOR[node.type ?? "default"] ?? TYPE_COLOR.default;
              
                // precedence: special > hover > default
                const fill = special ? special : (isHover ? HOVER_COLOR : base);
                const color = isHighlighted ? fill : "rgba(148,163,184,0.45)";
              
                ctx.beginPath();
                ctx.arc(node.x, node.y, isActive ? 8 : 6, 0, 2 * Math.PI);
                ctx.fillStyle = color;
                ctx.fill();
              
                const fontSize = 9 / Math.sqrt(globalScale);
                if (fontSize > 2.5 && isHighlighted) {
                  ctx.font = `${fontSize}px "Poppins", sans-serif`;
                  ctx.textAlign = "left";
                  ctx.textBaseline = "middle";
                  ctx.fillStyle = "rgba(17,24,39,0.92)";
                  ctx.fillText(`${node.id}`, node.x + 8, node.y);
                }
              }}
              
            onNodeHover={(n: any) => {
              setHoverNodeId(n?.id ?? null);
              updateHighlight(n ?? null);
            }}
            onNodeClick={handleClick}
            nodePointerAreaPaint={(node: any, color: any, ctx: any) => {
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(node.x, node.y, 12, 0, 2 * Math.PI);
              ctx.fill();
            }}
            onNodeDragEnd={(node: any) => {
              node.fx = undefined;
              node.fy = undefined;
            }}
          />
        )}
      </div>
    </div>
  );
}
