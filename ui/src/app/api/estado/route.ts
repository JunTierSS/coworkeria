/**
 * Estado vivo de un proyecto: resumen auto-generado del contenido del cerebro.
 * Se basa en el indice (resumenes de archivos) - una "vista de pajaro" del proyecto.
 * Cache en archivo para no regenerar en cada visita.
 */
import { NextRequest, NextResponse } from "next/server";
import { chromaBase, config } from "@/lib/config";
import { logUsageExtracted } from "@/lib/uso";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const maxDuration = 120;

const CACHE_DIR = path.resolve(process.cwd(), "..", "data", "estados");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function ensureDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function cachePath(proyecto: string) {
  ensureDir();
  return path.join(CACHE_DIR, `${proyecto.replace(/[^a-z0-9_-]/gi, "_")}.json`);
}

type EstadoCache = {
  ts: number;
  proyecto: string;
  total_archivos: number;
  total_chunks: number;
  resumen: string;
  temas_principales: string[];
  ultimas_ingestas: { archivo: string; tema: string; ingested_at?: string }[];
};

async function getOpenRouterKey(): Promise<string | null> {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const fs2 = await import("fs");
  const path2 = await import("path");
  const envPath = path2.resolve(process.cwd(), "..", ".env");
  if (!fs2.existsSync(envPath)) return null;
  const content = fs2.readFileSync(envPath, "utf-8");
  const m = content.match(/^OPENROUTER_API_KEY=(.+)$/m);
  if (!m) return null;
  const v = m[1].trim();
  return v.includes("...") ? null : v;
}

type ChromaGet = {
  ids: string[];
  metadatas: Record<string, unknown>[];
  documents: string[];
};

async function generarEstado(proyecto: string): Promise<EstadoCache> {
  // 1. Obtener el indice del proyecto (resumenes de cada archivo)
  const indiceId = process.env.CHROMA_INDICE_ID || (() => {
    try {
      const env = fs.readFileSync(path.resolve(process.cwd(), "..", ".env"), "utf-8");
      const m = env.match(/^CHROMA_INDICE_ID=(.+)$/m);
      return m ? m[1].trim() : "";
    } catch { return ""; }
  })();
  const indiceRes = await fetch(
    `${config.chromaUrl}/api/v2/tenants/default_tenant/databases/default_database/collections/${indiceId}/get`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ where: { proyecto }, include: ["metadatas", "documents"], limit: 1000 }),
    }
  );
  const idxData = (await indiceRes.json()) as ChromaGet;

  // 2. Contar chunks
  const chunksRes = await fetch(`${chromaBase()}/get`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ where: { proyecto }, include: ["metadatas"], limit: 10000 }),
  });
  const chunksData = (await chunksRes.json()) as ChromaGet;

  const totalArchivos = (idxData.ids || []).length;
  const totalChunks = (chunksData.ids || []).length;

  // Si no hay archivos -> estado vacio
  if (totalArchivos === 0) {
    return {
      ts: Date.now(),
      proyecto,
      total_archivos: 0,
      total_chunks: totalChunks,
      resumen: "El proyecto no tiene archivos indexados aún.",
      temas_principales: [],
      ultimas_ingestas: [],
    };
  }

  // 3. Compilar la "vista de pajaro" enviando los resumenes al LLM
  const lista = (idxData.metadatas || [])
    .map((m, i) => {
      const mm = m as Record<string, string>;
      return `- ${mm.archivo} (${mm.tipo || "?"}): ${mm.tema || ""} -- ${mm.resumen || ""}`;
    })
    .slice(0, 100) // si hay >100, truncamos para no inflar
    .join("\n");

  const key = await getOpenRouterKey();
  let resumen = "(no se pudo generar resumen LLM)";
  let temasPrincipales: string[] = [];
  if (key) {
    const sysPrompt = `Sos un sintetizador de proyectos. Te paso la lista de archivos indexados del cerebro del usuario sobre un proyecto, cada uno con su resumen. Tu tarea: producir UNA SINTESIS DEL ESTADO ACTUAL DEL PROYECTO en 4-8 oraciones claras y especificas. Mencionar:
- De que va el proyecto en general
- Estado actual / fase en la que esta
- Temas/sub-temas principales que cubre el material
- Cualquier patron, contradiccion o evolucion temporal visible (si hay)

Tambien identificar 3-7 'temas_principales' que el proyecto cubre (tags cortos).

Devolve JSON exacto:
{
  "resumen": "...",
  "temas_principales": ["tag1", "tag2", ...]
}
Se factual: NO inventes contenido que no esta en los resumenes.`;
    try {
      const llm = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost",
          "X-Title": "CoWorkerIA Estado",
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [
            { role: "system", content: sysPrompt },
            { role: "user", content: `Proyecto: ${proyecto}\nArchivos: ${totalArchivos}\nChunks totales: ${totalChunks}\n\nLista:\n${lista}` },
          ],
          max_tokens: 800,
          temperature: 0,
        }),
      });
      const data = await llm.json();
      if (data.usage) {
        logUsageExtracted(data.usage, { tipo: "ingesta_resumen", modelo: "openai/gpt-4o-mini", proyecto });
      }
      const raw = data.choices?.[0]?.message?.content || "{}";
      let parsed: { resumen?: string; temas_principales?: string[] };
      try { parsed = JSON.parse(raw); }
      catch {
        const cleaned = raw.replace(/^```(?:json)?\s*/gm, "").replace(/```\s*$/gm, "").trim();
        try { parsed = JSON.parse(cleaned); } catch { parsed = {}; }
      }
      resumen = parsed.resumen || resumen;
      temasPrincipales = Array.isArray(parsed.temas_principales) ? parsed.temas_principales.slice(0, 10) : [];
    } catch (e) {
      resumen = `(error generando resumen: ${(e as Error).message?.slice(0, 100)})`;
    }
  }

  // 4. Ultimas ingestas (segun indexed_at de metadata)
  const ultimasIngestas = (idxData.metadatas || [])
    .map((m) => {
      const mm = m as Record<string, string>;
      return { archivo: mm.archivo, tema: mm.tema || "", ingested_at: mm.indexed_at };
    })
    .sort((a, b) => String(b.ingested_at || "").localeCompare(String(a.ingested_at || "")))
    .slice(0, 5);

  return {
    ts: Date.now(),
    proyecto,
    total_archivos: totalArchivos,
    total_chunks: totalChunks,
    resumen,
    temas_principales: temasPrincipales,
    ultimas_ingestas: ultimasIngestas,
  };
}

export async function GET(req: NextRequest) {
  const proyecto = req.nextUrl.searchParams.get("proyecto");
  const force = req.nextUrl.searchParams.get("force") === "1";
  if (!proyecto) return NextResponse.json({ error: "Falta proyecto" }, { status: 400 });

  const cp = cachePath(proyecto);

  // Intentar cache
  if (!force && fs.existsSync(cp)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cp, "utf-8")) as EstadoCache;
      if (Date.now() - cached.ts < CACHE_TTL_MS) {
        return NextResponse.json({ ...cached, from_cache: true });
      }
    } catch {}
  }

  // Regenerar
  try {
    const estado = await generarEstado(proyecto);
    ensureDir();
    fs.writeFileSync(cp, JSON.stringify(estado, null, 2), "utf-8");
    return NextResponse.json({ ...estado, from_cache: false });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
