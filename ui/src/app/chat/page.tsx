"use client";
import { useState, useRef, useEffect } from "react";
import { useProject } from "@/components/ProjectProvider";
import { Send, Loader2, Quote, Sparkles } from "lucide-react";
import clsx from "clsx";

type Cita = {
  archivo: string;
  pagina: number;
  total_paginas: number;
  chunk_index: number;
  proyecto: string;
  distancia: number;
  extracto: string;
};

type Msg =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; citas: Cita[]; modo?: string };

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
        setMsgs((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.respuesta || "(sin respuesta)",
            citas: data.citas || [],
            modo: data.modo,
          },
        ]);
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
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Chat</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Preguntando sobre el proyecto <span className="font-medium">{proyecto}</span>
        </p>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {msgs.length === 0 && !loading && (
            <div className="text-center py-16">
              <div className="inline-flex w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-lg font-medium text-zinc-900">
                Pregúntale a tus documentos
              </h2>
              <p className="text-sm text-zinc-500 mt-1">
                Recibirás respuestas fundamentadas con citas a la fuente exacta.
              </p>
            </div>
          )}

          {msgs.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-2xl bg-zinc-900 text-white rounded-2xl rounded-br-md px-4 py-2.5">
                  <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                </div>
              </div>
            ) : (
              <div key={i} className="flex flex-col gap-3">
                <div className="bg-white border border-zinc-200 rounded-2xl rounded-bl-md px-5 py-4">
                  <div
                    className="text-sm text-zinc-800 whitespace-pre-wrap leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: m.content
                        .replace(/&/g, "&amp;")
                        .replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;")
                        .replace(
                          /\[([^\],]+),\s*pag\.?\s*(\d+)\]/gi,
                          '<span class="inline-flex items-center gap-0.5 align-baseline ml-1 px-1.5 py-0.5 text-[10px] font-medium bg-indigo-50 text-indigo-700 rounded">$1 · p.$2</span>'
                        )
                        .replace(
                          /\*\*([^*]+)\*\*/g,
                          '<strong class="font-semibold text-zinc-900">$1</strong>'
                        ),
                    }}
                  />
                  {m.modo === "mock" && (
                    <div className="mt-3 text-[10px] text-amber-700 bg-amber-50 px-2 py-1 rounded inline-block">
                      respuesta mock (LLM real cuando configures las keys)
                    </div>
                  )}
                </div>

                {m.citas.length > 0 && (
                  <details className="bg-white border border-zinc-200 rounded-lg group">
                    <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 flex items-center gap-2">
                      <Quote className="w-3.5 h-3.5" />
                      Ver {m.citas.length} pasaje{m.citas.length === 1 ? "" : "s"} recuperado
                      {m.citas.length === 1 ? "" : "s"}
                    </summary>
                    <div className="px-4 pb-3 space-y-2.5">
                      {m.citas.map((c, idx) => (
                        <div
                          key={idx}
                          className="text-xs border-l-2 border-indigo-200 pl-3 py-1"
                        >
                          <div className="flex items-center gap-2 mb-1 text-zinc-500">
                            <span className="font-mono font-medium">[{idx + 1}]</span>
                            <span className="font-medium text-zinc-700">{c.archivo}</span>
                            <span>·</span>
                            <span>pág ~{c.pagina}/{c.total_paginas}</span>
                            <span>·</span>
                            <span className="font-mono">{c.distancia.toFixed(3)}</span>
                          </div>
                          <p className="text-zinc-600 italic">{c.extracto}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )
          )}

          {loading && (
            <div className="flex items-center gap-2 text-zinc-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Buscando en tus fuentes y redactando respuesta...</span>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-zinc-200 bg-white px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <div
            className={clsx(
              "flex items-end gap-2 bg-white border rounded-2xl pl-4 pr-2 py-2 transition",
              "border-zinc-300 focus-within:border-zinc-900 focus-within:ring-2 focus-within:ring-zinc-900/10"
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
              className="flex-1 resize-none border-0 focus:outline-none text-sm placeholder-zinc-400 max-h-32 py-1.5"
            />
            <button
              onClick={enviar}
              disabled={!input.trim() || loading}
              className="w-9 h-9 rounded-full bg-zinc-900 text-white flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-zinc-700 transition"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
          <p className="text-[10px] text-zinc-400 mt-2 text-center">
            Enter para enviar · Shift+Enter para nueva línea
          </p>
        </div>
      </div>
    </div>
  );
}
