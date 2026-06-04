"use client";
import { createContext, useContext, useState } from "react";

type Ctx = { open: boolean; setOpen: (v: boolean) => void };
const MobileMenuCtx = createContext<Ctx | null>(null);

export function MobileMenuProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <MobileMenuCtx.Provider value={{ open, setOpen }}>{children}</MobileMenuCtx.Provider>;
}

export function useMobileMenu() {
  const ctx = useContext(MobileMenuCtx);
  if (!ctx) throw new Error("useMobileMenu debe usarse dentro de MobileMenuProvider");
  return ctx;
}
