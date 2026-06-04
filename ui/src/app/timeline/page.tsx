"use client";
import { useState } from "react";
import { useProject } from "@/components/ProjectProvider";
import { Clock, Loader2, Sparkles, Calendar, FileText, ArrowRight, History } from "lucide-react";
import clsx from "clsx";

type Evento = {
  fecha: string;
  fecha_iso: string;
  valor: string;
  descripcion: string;
  fuente_pasaje: number;
  fuente_archivo: string;
  fuente_pagina: number | null;
};

type TimelineResp = {
  topic: string;
  proyecto: string | null;
  eventos: Evento[];
  resumen_evolucion?: string;
  total_chunks_analizados?: number;
  mensaje?: string;
};

// Detecta cambios agrupando por "aspecto" (primera palabra significativa del valor)
function detectarCambios(eventos: Evento[]): Map<string, Evento[]> {
  const grupos = new Map<string, Evento[]>();
  for (const e of eventos) {
    const raw = String(e.valor || "");
    // Toma la primera palabra (antes de ':' o espacio), normaliza
    let aspecto = raw.split(/[\s:]/)[0].trim().toLowerCase();
    // Si la "aspecto" es genérica (Stack, Tipo, etc), agarra hasta 2 palabras
    if (aspecto.length < 4) {
      aspecto = raw.split(/[:]/)[0].trim().toLowerCase().slice(0, 30);
    }
    if (!aspecto) aspecto = "otro";
    if (!grupos.has(aspecto)) grupos.set(aspecto, []);
    grupos.get(aspecto)!.push(e);
  }
  return grupos;
}

export default function TimelinePage() {
  const { proyecto } = useProject();
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TimelineResp | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generar = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const r = await fetch("/api/timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, proyecto }),
      });
      const d = await r.json();
      if (!r.ok) setError(d.error || "Error");
      else setData(d);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const eventos = data?.eventos || [];
  const grupos = detectarCambios(eventos);
  // Aspectos que tienen cambios (>1 evento con valores distintos)
  const aspectosConCambio = new Set<string>();
  grupos.forEach((evs, asp) => {
    if (evs.length > 1) {
      const valores = new Set(evs.map((e) => e.valor));
      if (valores.size > 1) aspectosConCambio.add(asp);
    }
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-4 sm:p-8">
        <header className="mb-6 sm:mb-8 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <History className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              Timeline temporal
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Cómo evolucionó un tema en{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{proyecto}</span>
            </p>
          </div>
        </header>

        {/* Input topic */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2">
            Tema o concepto a rastrear
          </label>
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && generar()}
              placeholder="ej: presupuesto del proyecto X, fechas de deadline, líder del equipo..."
              className="flex-1 min-w-[200px] px-3 py-2 text-sm rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={generar}
              disabled={!topic.trim() || loading}
              className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Generar timeline
            </button>
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-2">
            Buscamos eventos con fecha asociados al tema. Funciona mejor con correos, documentos con fecha de creación, o pasajes con fechas explícitas.
          </p>
        </div>

        {error && (
          <div className="mt-4 px-4 py-2 rounded text-sm bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
            {error}
          </div>
        )}

        {loading && (
          <div className="mt-8 flex flex-col items-center gap-2 text-zinc-500 dark:text-zinc-400 py-12">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-sm">Extrayendo eventos datables de tus fuentes...</p>
          </div>
        )}

        {data && !loading && (
          <div className="mt-6 space-y-4">
            {/* Resumen de evolucion */}
            {data.resumen_evolucion && (
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/40 border border-indigo-200 dark:border-indigo-900 rounded-lg p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300 mb-1">
                  Resumen de evolución
                </p>
                <p className="text-sm text-zinc-800 dark:text-zinc-200">{data.resumen_evolucion}</p>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-2">
                  Analizados {data.total_chunks_analizados ?? "?"} chunks · {eventos.length} eventos extraídos
                </p>
              </div>
            )}

            {data.mensaje && (
              <div className="px-4 py-3 rounded text-sm bg-zinc-50 dark:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                {data.mensaje}
              </div>
            )}

            {/* Cambios destacados */}
            {aspectosConCambio.size > 0 && (
              <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900 rounded-lg p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300 mb-3">
                  Cambios detectados
                </p>
                <div className="space-y-2">
                  {Array.from(aspectosConCambio).map((asp) => {
                    const evs = (grupos.get(asp) || []).slice();
                    evs.sort((a, b) => a.fecha_iso.localeCompare(b.fecha_iso));
                    return (
                      <div
                        key={asp}
                        className="bg-white dark:bg-zinc-900 border border-orange-200 dark:border-orange-900 rounded p-2.5"
                      >
                        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200 capitalize mb-1.5">
                          {asp}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          {evs.map((e, i) => (
                            <span key={i} className="flex items-center gap-1.5">
                              {i > 0 && <ArrowRight className="w-3 h-3 text-orange-500" />}
                              <span className="bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded font-mono text-[10px] text-zinc-600 dark:text-zinc-400">
                                {e.fecha}
                              </span>
                              <span className="text-zinc-800 dark:text-zinc-200">
                                {e.valor.replace(/^[^:]+:\s*/, "")}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Timeline vertical */}
            {eventos.length > 0 && (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 sm:p-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 mb-4 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" />
                  Línea cronológica · {eventos.length} eventos
                </p>
                <div className="relative pl-6 sm:pl-8">
                  {/* Línea vertical */}
                  <div className="absolute left-[7px] sm:left-[11px] top-2 bottom-2 w-px bg-zinc-200 dark:bg-zinc-700" />
                  {eventos.map((e, i) => {
                    const aspecto = String(e.valor || "").split(":")[0].trim().toLowerCase();
                    const enCambio = aspectosConCambio.has(aspecto);
                    return (
                      <div key={i} className="relative pb-5 last:pb-0">
                        {/* Dot */}
                        <div
                          className={clsx(
                            "absolute -left-6 sm:-left-8 top-1 w-3 sm:w-[15px] h-3 sm:h-[15px] rounded-full ring-2",
                            enCambio
                              ? "bg-orange-500 ring-orange-200 dark:ring-orange-900"
                              : "bg-indigo-500 ring-indigo-200 dark:ring-indigo-900"
                          )}
                        />
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                            <Calendar className="w-3 h-3" />
                            {e.fecha}
                          </span>
                          {enCambio && (
                            <span className="text-[9px] font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/40 px-1.5 py-0.5 rounded">
                              cambio
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{e.valor}</p>
                        {e.descripcion && (
                          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">{e.descripcion}</p>
                        )}
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-500 mt-1 flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {e.fuente_archivo}
                          {e.fuente_pagina && <span>· pag {e.fuente_pagina}</span>}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
