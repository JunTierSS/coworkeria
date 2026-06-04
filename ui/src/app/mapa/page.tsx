"use client";
import { useState, useEffect, useMemo } from "react";
import { useProject } from "@/components/ProjectProvider";
import { Loader2, Map as MapIcon, FileText } from "lucide-react";
import clsx from "clsx";

type Punto = {
  id: string;
  archivo: string;
  pagina: number | null;
  cluster: number;
  x: number;
  y: number;
  extracto: string;
};

type Cluster = {
  id: number;
  label: string;
  count: number;
  archivos: string[];
};

type Resp = {
  puntos?: Punto[];
  clusters?: Cluster[];
  total?: number;
  mensaje?: string;
  error?: string;
};

const COLORS = [
  "#6366f1", // indigo
  "#ec4899", // pink
  "#10b981", // emerald
  "#f59e0b", // amber
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ef4444", // red
  "#14b8a6", // teal
];

export default function MapaPage() {
  const { proyecto } = useProject();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Resp | null>(null);
  const [hoverPoint, setHoverPoint] = useState<Punto | null>(null);
  const [activeCluster, setActiveCluster] = useState<number | null>(null);
  const [k, setK] = useState<number | "auto">("auto");

  const generar = async () => {
    setLoading(true);
    setData(null);
    setHoverPoint(null);
    try {
      const r = await fetch("/api/clusters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proyecto, k: k === "auto" ? undefined : k }),
      });
      const d = await r.json();
      setData(d);
    } catch (e: unknown) {
      setData({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyecto]);

  // Normalizar coordenadas a viewport
  const viewport = useMemo(() => {
    const W = 800;
    const H = 500;
    const padding = 40;
    if (!data?.puntos || data.puntos.length === 0) {
      return { W, H, padding, fnX: (x: number) => x, fnY: (y: number) => y };
    }
    const xs = data.puntos.map((p) => p.x);
    const ys = data.puntos.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    return {
      W,
      H,
      padding,
      fnX: (x: number) => padding + ((x - minX) / rangeX) * (W - 2 * padding),
      fnY: (y: number) => padding + ((y - minY) / rangeY) * (H - 2 * padding),
    };
  }, [data?.puntos]);

  const puntosFiltrados = useMemo(() => {
    if (!data?.puntos) return [];
    if (activeCluster === null) return data.puntos;
    return data.puntos;
  }, [data?.puntos, activeCluster]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-4 sm:p-8">
        <header className="mb-6 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <MapIcon className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              Mapa de clusters
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Cómo se agrupan tus documentos por tema en{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{proyecto}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs text-zinc-600 dark:text-zinc-400">k =</label>
            <select
              value={k}
              onChange={(e) => setK(e.target.value === "auto" ? "auto" : Number(e.target.value))}
              className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-2 py-1.5"
            >
              <option value="auto">auto</option>
              {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button
              onClick={generar}
              disabled={loading}
              className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapIcon className="w-4 h-4" />}
              Regenerar
            </button>
          </div>
        </header>

        {loading && (
          <div className="flex flex-col items-center gap-2 text-zinc-500 dark:text-zinc-400 py-16">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-sm">Calculando PCA, K-means y etiquetando clusters...</p>
          </div>
        )}

        {!loading && data?.mensaje && (
          <div className="px-4 py-3 rounded text-sm bg-zinc-50 dark:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
            {data.mensaje}
          </div>
        )}

        {!loading && data?.error && (
          <div className="px-4 py-3 rounded text-sm bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
            {data.error}
          </div>
        )}

        {!loading && data?.puntos && data.puntos.length > 0 && (
          <div className="space-y-4">
            {/* Stats */}
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {data.total} chunks · {data.clusters?.length || 0} clusters detectados
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-4">
              {/* Scatter SVG */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 relative overflow-hidden">
                <svg
                  viewBox={`0 0 ${viewport.W} ${viewport.H}`}
                  className="w-full h-auto"
                  style={{ touchAction: "none" }}
                >
                  {/* Grid sutil */}
                  {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                    <line
                      key={`gx-${t}`}
                      x1={viewport.padding + t * (viewport.W - 2 * viewport.padding)}
                      y1={viewport.padding}
                      x2={viewport.padding + t * (viewport.W - 2 * viewport.padding)}
                      y2={viewport.H - viewport.padding}
                      stroke="currentColor"
                      strokeWidth="0.5"
                      className="text-zinc-200 dark:text-zinc-800"
                    />
                  ))}
                  {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                    <line
                      key={`gy-${t}`}
                      x1={viewport.padding}
                      y1={viewport.padding + t * (viewport.H - 2 * viewport.padding)}
                      x2={viewport.W - viewport.padding}
                      y2={viewport.padding + t * (viewport.H - 2 * viewport.padding)}
                      stroke="currentColor"
                      strokeWidth="0.5"
                      className="text-zinc-200 dark:text-zinc-800"
                    />
                  ))}
                  {/* Puntos */}
                  {puntosFiltrados.map((p) => {
                    const color = COLORS[p.cluster % COLORS.length];
                    const active = activeCluster === null || activeCluster === p.cluster;
                    return (
                      <circle
                        key={p.id}
                        cx={viewport.fnX(p.x)}
                        cy={viewport.fnY(p.y)}
                        r={active ? 6 : 3}
                        fill={color}
                        opacity={active ? 0.85 : 0.15}
                        className="cursor-pointer transition-all"
                        onMouseEnter={() => setHoverPoint(p)}
                        onMouseLeave={() => setHoverPoint(null)}
                      />
                    );
                  })}
                </svg>
                {/* Tooltip */}
                {hoverPoint && (
                  <div className="absolute bottom-3 left-3 right-3 max-w-md bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded p-2.5 shadow-lg pointer-events-none">
                    <div className="flex items-center gap-2 text-[10px] text-zinc-500 dark:text-zinc-400 mb-1">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: COLORS[hoverPoint.cluster % COLORS.length] }}
                      />
                      <span className="font-medium text-zinc-700 dark:text-zinc-200">
                        {hoverPoint.archivo}
                      </span>
                      {hoverPoint.pagina !== null && <span>· pag {hoverPoint.pagina}</span>}
                    </div>
                    <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                      {hoverPoint.extracto}...
                    </p>
                  </div>
                )}
              </div>

              {/* Leyenda de clusters */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 self-start">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 mb-2">
                  Clusters
                </p>
                <div className="space-y-1">
                  {(data.clusters || []).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setActiveCluster(activeCluster === c.id ? null : c.id)}
                      className={clsx(
                        "w-full text-left p-2 rounded text-xs transition",
                        activeCluster === c.id
                          ? "bg-zinc-100 dark:bg-zinc-800 ring-1 ring-zinc-300 dark:ring-zinc-700"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: COLORS[c.id % COLORS.length] }}
                        />
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                          {c.label}
                        </span>
                        <span className="ml-auto text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
                          {c.count}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 pl-4 flex items-center gap-1 flex-wrap">
                        <FileText className="w-3 h-3" />
                        {c.archivos.slice(0, 3).join(", ")}
                        {c.archivos.length > 3 && ` +${c.archivos.length - 3}`}
                      </p>
                    </button>
                  ))}
                </div>
                {activeCluster !== null && (
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-2 text-center">
                    Click el mismo cluster para des-seleccionar
                  </p>
                )}
              </div>
            </div>

            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Los puntos cercanos son chunks con contenido similar (PCA 2D sobre embeddings 1536d).
              K-means agrupa los chunks; GPT-4o-mini etiqueta cada cluster con el tema común.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
