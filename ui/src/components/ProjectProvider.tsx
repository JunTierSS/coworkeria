"use client";
import { createContext, useContext, useEffect, useState } from "react";

type Ctx = {
  proyecto: string;
  setProyecto: (p: string) => void;
  proyectos: string[];
  refresh: () => Promise<void>;
};

const ProjectCtx = createContext<Ctx | null>(null);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [proyecto, setProyecto] = useState<string>("default");
  const [proyectos, setProyectos] = useState<string[]>([]);

  const refresh = async () => {
    try {
      const r = await fetch("/api/documents");
      const data = await r.json();
      const lista: string[] = Array.isArray(data.proyectos) ? data.proyectos : [];
      setProyectos(lista.length ? lista : ["default"]);
      // Si el seleccionado ya no existe, fallback al primero
      if (lista.length && !lista.includes(proyecto)) {
        setProyecto(lista[0]);
      }
    } catch {
      setProyectos(["default"]);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ProjectCtx.Provider value={{ proyecto, setProyecto, proyectos, refresh }}>
      {children}
    </ProjectCtx.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectCtx);
  if (!ctx) throw new Error("useProject debe usarse dentro de ProjectProvider");
  return ctx;
}
