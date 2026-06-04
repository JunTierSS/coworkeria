/**
 * Logger de consumo de API contra el archivo data/uso.jsonl
 * Cada llamada LLM/embedding queda registrada con tokens + costo en USD.
 */
import fs from "node:fs";
import path from "node:path";

// data/uso.jsonl en la raíz del repo (un nivel arriba de ui/)
const LOG_DIR = path.resolve(process.cwd(), "..", "data");
const LOG_PATH = path.join(LOG_DIR, "uso.jsonl");

export type UsoTipo =
  | "chat"
  | "ingesta_resumen"
  | "ingesta_embedding"
  | "council_completitud"
  | "council_contradicciones"
  | "consulta_contradicciones"
  | "consulta_embedding"
  | "timeline"
  | "clusters_label"
  | "vision_ocr"
  | "vision_imagen";

export type UsoRecord = {
  ts: string;
  tipo: UsoTipo;
  modelo: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  proyecto?: string;
  archivo?: string;
  latency_ms?: number;
};

export function logUso(rec: Omit<UsoRecord, "ts">) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const entry: UsoRecord = { ts: new Date().toISOString(), ...rec };
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");
  } catch (e) {
    // No romper la app si fallaba el log
    console.error("[uso] log failed:", e);
  }
}

/**
 * Extrae usage de una respuesta OpenRouter compatible (chat/embeddings).
 * Si el endpoint no devuelve `cost`, lo estima por token-count usando rates conocidas.
 */
export function extractUsage(
  response: unknown
): { prompt_tokens: number; completion_tokens: number; total_tokens: number; cost_usd: number } | null {
  const r = response as { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number } };
  if (!r?.usage) return null;
  return {
    prompt_tokens: r.usage.prompt_tokens || 0,
    completion_tokens: r.usage.completion_tokens || 0,
    total_tokens: r.usage.total_tokens || (r.usage.prompt_tokens || 0) + (r.usage.completion_tokens || 0),
    cost_usd: r.usage.cost || 0,
  };
}

/** Loguea con safety - si no hay usage, no escribe nada. */
export function logIfUsage(
  resp: unknown,
  base: Omit<UsoRecord, "ts" | "prompt_tokens" | "completion_tokens" | "total_tokens" | "cost_usd">
) {
  const u = extractUsage(resp);
  if (!u) return;
  logUso({ ...base, ...u });
}

/** Loguea una usage que ya extrajiste manualmente. */
export function logUsageExtracted(
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number },
  base: Omit<UsoRecord, "ts" | "prompt_tokens" | "completion_tokens" | "total_tokens" | "cost_usd">
) {
  if (!usage) return;
  logUso({
    ...base,
    prompt_tokens: usage.prompt_tokens || 0,
    completion_tokens: usage.completion_tokens || 0,
    total_tokens: usage.total_tokens || (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
    cost_usd: usage.cost || 0,
  });
}
