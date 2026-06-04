"use client";
import { Brain, Menu } from "lucide-react";
import { useMobileMenu } from "./MobileMenu";

export function MobileHeader() {
  const { setOpen } = useMobileMenu();
  return (
    <header className="md:hidden flex items-center justify-between px-4 h-14 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
          <Brain className="w-4 h-4 text-white" strokeWidth={2.4} />
        </div>
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">CoWorkerIA</span>
      </div>
      <button
        onClick={() => setOpen(true)}
        className="p-1.5 rounded text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        aria-label="Abrir menú"
      >
        <Menu className="w-5 h-5" />
      </button>
    </header>
  );
}
