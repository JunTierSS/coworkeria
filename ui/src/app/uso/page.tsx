"use client";
import { useEffect, useState } from "react";
import { Loader2, DollarSign, Zap, FileText, TrendingUp, RefreshCw } from "lucide-react";

type Stats = {
  mes_actual: string;
  total_mes_usd: number;
  total_mes_tokens: number;
  total_historico_usd: number;
  proyeccion_mes_usd: number;
  total_records: number;
  por_tipo: { tipo: string; count: number; cost: number; tokens: number }[];
  por_modelo: { modelo: string; count: number; cost: number; tokens: number }[];
  por_proyecto: { proyecto: string; count: number; cost: number; tokens: number }[];
  por_dia: { fecha: string; count: number; cost: number }[];
  top_archivos: { archivo: string; count: number; cost: number }[];
  recientes: {
    ts: string;
    tipo: string;
    modelo: string;
    prompt_tokens: number;
    completion_tokens: number;
    cost_usd: number;
    proyecto?: string;
    archivo?: string;
  }[];
};

const COLORS_TIPO: Record<string, string> = {
  chat: "#6366f1",
  ingesta_resumen: "#10b981",
  council_completitud: "#ec4899",
  council_contradicciones: "#f59e0b",
  consulta_contradicciones: "#8b5cf6",
  consulta_embedding: "#06b6d4",
  timeline: "#ef4444",
  clusters_label: "#14b8a6",
  vision_ocr: "#f43f5e",
  vision_imagen: "#a855f7",
};
const colorTipo = (t: string) => COLORS_TIPO[t] || "#71717a";

function formatUsd(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

function formatNum(n: number): string {
  return n.toLocaleString("en-US");
}

export default function UsoPage() {
  const [data, setData] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const cargar = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/uso", { cache: "no-store" });
      setData(await r.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 15_000);
    return () => clearInterval(t);
  }, []);

  if (loading && !data)
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  if (!data) return null;

  const maxDia = Math.max(...data.por_dia.map((d) => d.cost), 0.0001);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-4 sm:p-8">
        <header className="mb-6 flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              Consumo de API
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Tokens y costos en USD por feature, modelo y proyecto · mes {data.mes_actual}
            </p>
          </div>
          <button
            onClick={cargar}
            className="text-xs px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1.5"
          >
            <RefreshCw className="w-3 h-3" />
            Actualizar
          </button>
        </header>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <KPI
            icon={<DollarSign className="w-4 h-4" />}
            label="Mes actual"
            value={formatUsd(data.total_mes_usd)}
            sub={`${formatNum(data.total_mes_tokens)} tokens`}
            color="emerald"
          />
          <KPI
            icon={<TrendingUp className="w-4 h-4" />}
            label="Proyección mes"
            value={formatUsd(data.proyeccion_mes_usd)}
            sub="extrapolando ritmo actual"
            color="indigo"
          />
          <KPI
            icon={<Zap className="w-4 h-4" />}
            label="Calls este mes"
            value={formatNum(data.por_tipo.reduce((a, t) => a + t.count, 0))}
            sub={`${data.por_modelo.length} modelos`}
            color="amber"
          />
          <KPI
            icon={<DollarSign className="w-4 h-4" />}
            label="Histórico total"
            value={formatUsd(data.total_historico_usd)}
            sub={`${formatNum(data.total_records)} eventos`}
            color="zinc"
          />
        </div>

        {/* Gráfico por día */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 mb-3">
            Costo por día (últimos 30 días)
          </p>
          <div className="flex items-end gap-0.5 h-32">
            {data.por_dia.map((d) => (
              <div
                key={d.fecha}
                className="flex-1 group relative"
                title={`${d.fecha}: ${formatUsd(d.cost)} · ${d.count} calls`}
              >
                <div
                  className="bg-gradient-to-t from-indigo-500 to-purple-500 rounded-sm hover:opacity-80 transition"
                  style={{ height: `${Math.max(2, (d.cost / maxDia) * 100)}%`, marginTop: `${100 - Math.max(2, (d.cost / maxDia) * 100)}%` }}
                />
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition pointer-events-none bg-zinc-900 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                  {d.fecha.slice(5)}: {formatUsd(d.cost)}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Por tipo (feature) */}
          <Card titulo="Por feature">
            {data.por_tipo.length === 0 ? (
              <p className="text-xs text-zinc-500 italic">Sin datos este mes</p>
            ) : (
              <div className="space-y-2">
                {data.por_tipo.map((t) => {
                  const max = data.por_tipo[0].cost || 1;
                  const pct = (t.cost / max) * 100;
                  return (
                    <div key={t.tipo}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ background: colorTipo(t.tipo) }}
                          />
                          <span className="font-mono">{t.tipo}</span>
                        </span>
                        <span className="text-zinc-500 dark:text-zinc-400">
                          {formatUsd(t.cost)} · {t.count}x
                        </span>
                      </div>
                      <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded overflow-hidden">
                        <div
                          className="h-full rounded"
                          style={{ width: `${pct}%`, background: colorTipo(t.tipo) }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Por modelo */}
          <Card titulo="Por modelo">
            {data.por_modelo.length === 0 ? (
              <p className="text-xs text-zinc-500 italic">Sin datos</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="text-left font-medium py-1">Modelo</th>
                    <th className="text-right font-medium">Calls</th>
                    <th className="text-right font-medium">Tokens</th>
                    <th className="text-right font-medium">USD</th>
                  </tr>
                </thead>
                <tbody>
                  {data.por_modelo.map((m) => (
                    <tr key={m.modelo} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="py-1 font-mono text-[10px]">{m.modelo.split("/").pop()}</td>
                      <td className="text-right">{m.count}</td>
                      <td className="text-right">{formatNum(m.tokens)}</td>
                      <td className="text-right font-medium">{formatUsd(m.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {/* Por proyecto */}
          <Card titulo="Por proyecto">
            {data.por_proyecto.length === 0 ? (
              <p className="text-xs text-zinc-500 italic">Sin datos</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="text-left font-medium py-1">Proyecto</th>
                    <th className="text-right font-medium">Calls</th>
                    <th className="text-right font-medium">USD</th>
                  </tr>
                </thead>
                <tbody>
                  {data.por_proyecto.map((p) => (
                    <tr key={p.proyecto} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="py-1">{p.proyecto}</td>
                      <td className="text-right">{p.count}</td>
                      <td className="text-right font-medium">{formatUsd(p.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {/* Top archivos */}
          <Card titulo="Top archivos (costo histórico de ingesta)">
            {data.top_archivos.length === 0 ? (
              <p className="text-xs text-zinc-500 italic">Sin datos</p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {data.top_archivos.map((a) => (
                  <li key={a.archivo} className="flex items-center gap-2">
                    <FileText className="w-3 h-3 text-zinc-400 shrink-0" />
                    <span className="flex-1 truncate text-zinc-700 dark:text-zinc-300">
                      {a.archivo}
                    </span>
                    <span className="text-zinc-500 dark:text-zinc-400 font-mono">
                      {formatUsd(a.cost)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Eventos recientes */}
        <Card titulo="Últimos eventos" className="mt-4">
          {data.recientes.length === 0 ? (
            <p className="text-xs text-zinc-500 italic">Sin eventos aún. Hacé un chat, ingest o timeline.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="text-left font-medium py-1 pr-3">Hora</th>
                    <th className="text-left font-medium pr-3">Tipo</th>
                    <th className="text-left font-medium pr-3">Modelo</th>
                    <th className="text-left font-medium pr-3">Proyecto</th>
                    <th className="text-right font-medium pr-3">In</th>
                    <th className="text-right font-medium pr-3">Out</th>
                    <th className="text-right font-medium">USD</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recientes.map((r, i) => (
                    <tr key={i} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="py-1 pr-3 font-mono text-[10px] text-zinc-500">
                        {r.ts.slice(11, 19)}
                      </td>
                      <td className="pr-3">
                        <span
                          className="inline-block w-2 h-2 rounded-full mr-1.5"
                          style={{ background: colorTipo(r.tipo) }}
                        />
                        <span className="font-mono text-[10px]">{r.tipo}</span>
                      </td>
                      <td className="pr-3 font-mono text-[10px]">{r.modelo.split("/").pop()}</td>
                      <td className="pr-3">{r.proyecto || "-"}</td>
                      <td className="text-right pr-3 font-mono">{formatNum(r.prompt_tokens)}</td>
                      <td className="text-right pr-3 font-mono">{formatNum(r.completion_tokens)}</td>
                      <td className="text-right font-mono font-medium">{formatUsd(r.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function KPI({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: "emerald" | "indigo" | "amber" | "zinc";
}) {
  const colors = {
    emerald: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    indigo: "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800",
    amber: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    zinc: "bg-zinc-50 dark:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800",
  }[color];
  return (
    <div className={`border rounded-lg p-3 ${colors}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide opacity-70">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-[10px] opacity-60 mt-0.5">{sub}</div>}
    </div>
  );
}

function Card({ titulo, children, className = "" }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 ${className}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 mb-3">
        {titulo}
      </p>
      {children}
    </section>
  );
}
