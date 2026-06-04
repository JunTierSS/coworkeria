"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, MessageSquare, Brain, FolderOpen, Plus } from "lucide-react";
import { useProject } from "./ProjectProvider";
import { useState } from "react";
import clsx from "clsx";

export function Sidebar() {
  const pathname = usePathname();
  const { proyecto, setProyecto, proyectos } = useProject();
  const [nuevoProyecto, setNuevoProyecto] = useState("");
  const [agregando, setAgregando] = useState(false);

  const items = [
    { href: "/", label: "Documentos", icon: FileText },
    { href: "/chat", label: "Chat", icon: MessageSquare },
  ];

  return (
    <aside className="w-72 shrink-0 border-r border-zinc-200 bg-white flex flex-col">
      {/* Header */}
      <div className="px-5 py-5 border-b border-zinc-200">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" strokeWidth={2.4} />
          </div>
          <div>
            <h1 className="font-semibold text-zinc-900 leading-tight">CoWorkerIA</h1>
            <p className="text-xs text-zinc-500 leading-tight">Tu segundo cerebro</p>
          </div>
        </div>
      </div>

      {/* Project selector */}
      <div className="px-3 py-4 border-b border-zinc-200">
        <div className="flex items-center justify-between px-2 mb-2">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Proyecto</p>
          <button
            onClick={() => setAgregando(!agregando)}
            className="text-zinc-400 hover:text-zinc-700 transition"
            title="Nuevo proyecto"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {agregando && (
          <div className="px-2 mb-2">
            <input
              autoFocus
              type="text"
              value={nuevoProyecto}
              onChange={(e) => setNuevoProyecto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && nuevoProyecto.trim()) {
                  setProyecto(nuevoProyecto.trim());
                  setNuevoProyecto("");
                  setAgregando(false);
                } else if (e.key === "Escape") {
                  setAgregando(false);
                  setNuevoProyecto("");
                }
              }}
              placeholder="Nombre del proyecto"
              className="w-full px-2 py-1.5 text-sm rounded border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        )}

        <div className="space-y-0.5">
          {proyectos.map((p) => (
            <button
              key={p}
              onClick={() => setProyecto(p)}
              className={clsx(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition",
                proyecto === p
                  ? "bg-indigo-50 text-indigo-700 font-medium"
                  : "text-zinc-700 hover:bg-zinc-100"
              )}
            >
              <FolderOpen
                className={clsx("w-4 h-4", proyecto === p ? "text-indigo-600" : "text-zinc-400")}
              />
              <span className="truncate">{p}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Nav */}
      <nav className="px-3 py-3 flex-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition",
                active
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-700 hover:bg-zinc-100"
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-zinc-200">
        <p className="text-[10px] text-zinc-400">
          MVP · n8n + Chroma + Claude
        </p>
      </div>
    </aside>
  );
}
