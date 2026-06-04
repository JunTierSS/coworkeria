"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, MessageSquare, Brain, FolderOpen, Plus, Moon, Sun, X, History } from "lucide-react";
import { useProject } from "./ProjectProvider";
import { useTheme } from "./ThemeProvider";
import { useMobileMenu } from "./MobileMenu";
import { useState } from "react";
import clsx from "clsx";

export function Sidebar() {
  const pathname = usePathname();
  const { proyecto, setProyecto, proyectos } = useProject();
  const { theme, toggle } = useTheme();
  const { open, setOpen } = useMobileMenu();
  const [nuevoProyecto, setNuevoProyecto] = useState("");
  const [agregando, setAgregando] = useState(false);

  const items = [
    { href: "/", label: "Documentos", icon: FileText },
    { href: "/chat", label: "Chat", icon: MessageSquare },
    { href: "/timeline", label: "Timeline", icon: History },
  ];

  const closeOnNav = () => setOpen(false);

  return (
    <>
      {/* Overlay (mobile) */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="md:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-sm"
        />
      )}

      <aside
        className={clsx(
          "z-40 w-72 shrink-0 border-r flex flex-col bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800",
          "fixed md:static top-0 left-0 h-full transition-transform",
          "md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="px-5 py-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" strokeWidth={2.4} />
            </div>
            <div>
              <h1 className="font-semibold leading-tight text-zinc-900 dark:text-zinc-100">CoWorkerIA</h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-tight">Tu segundo cerebro</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="md:hidden p-1 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            aria-label="Cerrar menú"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Project selector */}
        <div className="px-3 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between px-2 mb-2">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Proyecto</p>
            <button
              onClick={() => setAgregando(!agregando)}
              className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
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
                className="w-full px-2 py-1.5 text-sm rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          <div className="space-y-0.5">
            {proyectos.map((p) => (
              <button
                key={p}
                onClick={() => {
                  setProyecto(p);
                  closeOnNav();
                }}
                className={clsx(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition",
                  proyecto === p
                    ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium"
                    : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                )}
              >
                <FolderOpen
                  className={clsx(
                    "w-4 h-4",
                    proyecto === p
                      ? "text-indigo-600 dark:text-indigo-400"
                      : "text-zinc-400 dark:text-zinc-500"
                  )}
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
                onClick={closeOnNav}
                className={clsx(
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition",
                  active
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 pl-2">
            MVP · n8n + Chroma + Claude
          </p>
          <button
            onClick={toggle}
            className="p-1.5 rounded text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
            aria-label="Cambiar tema"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </aside>
    </>
  );
}
