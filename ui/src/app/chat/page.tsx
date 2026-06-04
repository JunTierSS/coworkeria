"use client";
import { useState, useRef, useEffect } from "react";
import { useProject } from "@/components/ProjectProvider";
import { Send, Loader2, Quote, Sparkles, ShieldCheck, ShieldAlert, ShieldX, Users } from "lucide-react";
import clsx from "clsx";

type Cita = {
  archivo: string;
  pagina: number;
  pagina_exacta?: boolean;
  total_paginas: number;
  chunk_index: number;
  proyecto: string;
  distancia: number;
  extracto: string;
};

type Voto = {
  juez: string;
  fundamentada?: boolean;
  score?: number;
  problemas?: string[];
  razonamiento?: string;
  error?: string;
  ms?: number;
};

type Verdict = {
  veredicto:
    | "consenso_fundamentada"
    | "consenso_no_fundamentada"
    | "mayoria_a_favor"
    | "mayoria_en_contra"
    | "sin_consenso_jueces_fallaron";
  score_promedio: number;
  fundamentada_votos: string;
  problemas_detectados: string[];
  votos: Voto[];
};

type Msg =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      citas: Cita[];
      modo?: string;
      verdict?: Verdict | "loading" | "error";
    };

function CouncilBadge({ verdict }: { verdict: Verdict | "loading" | "error" }) {
  if (verdict === "loading") {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 px-1">
        <Loader2 className="w-3 h-3 animate-spin" />
        <Users className="w-3 h-3" />
        <span>Consejo de 3 LLMs evaluando fundamentación...</span>
      </div>
    );
  }
  if (verdict === "error") {
    return (
      <div className="text-[11px] text-zinc-500 dark:text-zinc-500 px-1">
        Consejo no disponible
      </div>
    );
  }

  const v = verdict.veredicto;
  const styles = {
    consenso_fundamentada: {
      bg: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800",
      text: "text-emerald-700 dark:text-emerald-300",
      icon: <ShieldCheck className="w-3.5 h-3.5" />,
      label: "Consejo: respuesta fundamentada",
    },
    mayoria_a_favor: {
      bg: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800",
      text: "text-amber-700 dark:text-amber-300",
      icon: <ShieldAlert className="w-3.5 h-3.5" />,
      label: "Consejo: mayoría a favor (con observaciones)",
    },
    mayoria_en_contra: {
      bg: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
      text: "text-red-700 dark:text-red-300",
      icon: <ShieldX className="w-3.5 h-3.5" />,
      label: "Consejo: problemas detectados",
    },
    consenso_no_fundamentada: {
      bg: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
      text: "text-red-700 dark:text-red-300",
      icon: <ShieldX className="w-3.5 h-3.5" />,
      label: "Consejo: posible alucinación",
    },
    sin_consenso_jueces_fallaron: {
      bg: "bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700",
      text: "text-zinc-600 dark:text-zinc-400",
      icon: <ShieldAlert className="w-3.5 h-3.5" />,
      label: "Consejo: jueces fallaron",
    },
  }[v];

  return (
    <details
      className={clsx(
        "border rounded-lg group transition",
        styles?.bg ?? "bg-zinc-50 border-zinc-200"
      )}
    >
      <summary
        className={clsx(
          "cursor-pointer px-3 py-1.5 text-[11px] font-medium flex items-center gap-2 list-none",
          styles?.text ?? "text-zinc-600"
        )}
      >
        {styles?.icon}
        <span>{styles?.label ?? v}</span>
        <span className="ml-auto text-[10px] opacity-70">
          {verdict.fundamentada_votos} · score {verdict.score_promedio}/5
        </span>
      </summary>
      <div className="px-3 pb-2.5 space-y-1.5">
        {verdict.problemas_detectados.length > 0 && (
          <div className="text-[11px] mt-1.5">
            <p className={clsx("font-medium mb-0.5", styles?.text)}>Problemas:</p>
            <ul className="list-disc pl-4 space-y-0.5 text-zinc-700 dark:text-zinc-300">
              {verdict.problemas_detectados.slice(0, 5).map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-2 space-y-0.5">
          {verdict.votos.map((vt, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="font-mono">{vt.juez.split("/").pop()}:</span>
              {vt.error ? (
                <span className="text-red-500">error</span>
              ) : (
                <>
                  <span>{vt.fundamentada ? "✓ fundamentada" : "✗ no fundamentada"}</span>
                  <span>score {vt.score}</span>
                  <span className="opacity-50">{vt.ms}ms</span>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}


export default function ChatPage() {
  const { proyecto } = useProject();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, loading]);

  const enviar = async () => {
    const pregunta = input.trim();
    if (!pregunta || loading) return;
    setMsgs((prev) => [...prev, { role: "user", content: pregunta }]);
    setInput("");
    setLoading(true);
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta, proyecto, n_results: 5 }),
      });
      const data = await r.json();
      if (!r.ok) {
        setMsgs((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${data.error || "?"}`, citas: [] },
        ]);
      } else {
        const newMsg: Msg = {
          role: "assistant",
          content: data.respuesta || "(sin respuesta)",
          citas: data.citas || [],
          modo: data.modo,
          verdict: "loading",
        };
        const idx = msgs.length + 1;
        setMsgs((prev) => [...prev, newMsg]);
        // Council validation async (no bloquea el render)
        if ((data.citas || []).length > 0) {
          const contexto = (data.citas || [])
            .map(
              (c: Cita, i: number) =>
                `[${i + 1}] (archivo: ${c.archivo}, pag ${c.pagina_exacta ? "" : "~"}${c.pagina}/${c.total_paginas})\n${c.extracto}`
            )
            .join("\n\n---\n\n");
          fetch("/api/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pregunta,
              respuesta: data.respuesta,
              contexto,
            }),
          })
            .then((r) => r.json())
            .then((v: Verdict | { error: string }) => {
              setMsgs((prev) =>
                prev.map((m, i) =>
                  i === idx && m.role === "assistant"
                    ? { ...m, verdict: "error" in v ? "error" : v }
                    : m
                )
              );
            })
            .catch(() => {
              setMsgs((prev) =>
                prev.map((m, i) =>
                  i === idx && m.role === "assistant" ? { ...m, verdict: "error" } : m
                )
              );
            });
        } else {
          setMsgs((prev) =>
            prev.map((m, i) =>
              i === idx && m.role === "assistant" ? { ...m, verdict: undefined } : m
            )
          );
        }
      }
    } catch (e: unknown) {
      setMsgs((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${e instanceof Error ? e.message : String(e)}`,
          citas: [],
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 sm:px-6 py-3 sm:py-4">
        <h1 className="text-lg font-semibold tracking-tight">Chat</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Preguntando sobre el proyecto{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{proyecto}</span>
        </p>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {msgs.length === 0 && !loading && (
            <div className="text-center py-16">
              <div className="inline-flex w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
                Pregúntale a tus documentos
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Recibirás respuestas fundamentadas con citas a la fuente exacta.
              </p>
            </div>
          )}

          {msgs.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] sm:max-w-2xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 rounded-2xl rounded-br-md px-4 py-2.5">
                  <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                </div>
              </div>
            ) : (
              <div key={i} className="flex flex-col gap-3">
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl rounded-bl-md px-4 sm:px-5 py-4">
                  <div
                    className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: m.content
                        .replace(/&/g, "&amp;")
                        .replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;")
                        .replace(
                          /\[([^\],]+),\s*pag\.?\s*(\d+)\]/gi,
                          '<span class="inline-flex items-center gap-0.5 align-baseline ml-1 px-1.5 py-0.5 text-[10px] font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 rounded">$1 · p.$2</span>'
                        )
                        .replace(
                          /\*\*([^*]+)\*\*/g,
                          '<strong class="font-semibold text-zinc-900 dark:text-zinc-100">$1</strong>'
                        ),
                    }}
                  />
                  {m.modo === "mock" && (
                    <div className="mt-3 text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded inline-block">
                      respuesta mock (LLM real cuando configures las keys)
                    </div>
                  )}
                </div>

                {/* Council verdict badge */}
                {m.verdict && <CouncilBadge verdict={m.verdict} />}

                {m.citas.length > 0 && (
                  <details className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
                    <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 flex items-center gap-2">
                      <Quote className="w-3.5 h-3.5" />
                      Ver {m.citas.length} pasaje{m.citas.length === 1 ? "" : "s"} recuperado
                      {m.citas.length === 1 ? "" : "s"}
                    </summary>
                    <div className="px-4 pb-3 space-y-2.5">
                      {m.citas.map((c, idx) => (
                        <div
                          key={idx}
                          className="text-xs border-l-2 border-indigo-200 dark:border-indigo-700 pl-3 py-1"
                        >
                          <div className="flex items-center gap-2 mb-1 text-zinc-500 dark:text-zinc-400 flex-wrap">
                            <span className="font-mono font-medium">[{idx + 1}]</span>
                            <span className="font-medium text-zinc-700 dark:text-zinc-200">
                              {c.archivo}
                            </span>
                            <span>·</span>
                            <span>
                              pág {c.pagina_exacta ? "" : "~"}{c.pagina}/{c.total_paginas}
                            </span>
                            <span>·</span>
                            <span className="font-mono">{c.distancia.toFixed(3)}</span>
                          </div>
                          <p className="text-zinc-600 dark:text-zinc-300 italic">{c.extracto}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )
          )}

          {loading && (
            <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Buscando en tus fuentes y redactando respuesta...</span>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 sm:px-6 py-3 sm:py-4">
        <div className="max-w-3xl mx-auto">
          <div
            className={clsx(
              "flex items-end gap-2 rounded-2xl pl-4 pr-2 py-2 transition",
              "bg-white dark:bg-zinc-800 border",
              "border-zinc-300 dark:border-zinc-700 focus-within:border-zinc-900 dark:focus-within:border-zinc-300",
              "focus-within:ring-2 focus-within:ring-zinc-900/10 dark:focus-within:ring-zinc-100/10"
            )}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
              rows={1}
              placeholder="Pregunta sobre tus documentos..."
              className="flex-1 resize-none border-0 bg-transparent focus:outline-none text-sm placeholder-zinc-400 dark:placeholder-zinc-500 text-zinc-900 dark:text-zinc-100 max-h-32 py-1.5"
            />
            <button
              onClick={enviar}
              disabled={!input.trim() || loading}
              className="w-9 h-9 rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-zinc-700 dark:hover:bg-zinc-300 transition shrink-0"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-2 text-center">
            Enter para enviar · Shift+Enter para nueva línea
          </p>
        </div>
      </div>
    </div>
  );
}
