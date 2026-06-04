import { NextRequest, NextResponse } from "next/server";
import { chromaBase } from "@/lib/config";
import { logUsageExtracted } from "@/lib/uso";

export const runtime = "nodejs";
export const maxDuration = 120;

type ChromaGetResponse = {
  ids: string[];
  embeddings: number[][];
  documents: string[];
  metadatas: Record<string, unknown>[];
};

type Punto = {
  id: string;
  archivo: string;
  pagina: number | null;
  cluster: number;
  x: number;
  y: number;
  extracto: string;
};

type Cluster = {
  id: number;
  label: string;
  count: number;
  archivos: string[];
};

// Lee OPENROUTER_API_KEY del .env del proyecto (un nivel arriba de ui/)
async function getOpenRouterKey(): Promise<string | null> {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const fs = await import("fs");
  const path = await import("path");
  const envPath = path.resolve(process.cwd(), "..", ".env");
  if (!fs.existsSync(envPath)) return null;
  const content = fs.readFileSync(envPath, "utf-8");
  const m = content.match(/^OPENROUTER_API_KEY=(.+)$/m);
  if (!m) return null;
  const v = m[1].trim();
  return v.includes("...") ? null : v;
}

async function labelCluster(samples: string[], key: string, proyecto: string | undefined): Promise<string> {
  const payload = {
    model: "openai/gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Sos un nombrador de clusters tematicos. Te paso 3-5 fragmentos de texto que pertenecen al mismo cluster. Devolve SOLO un titulo corto (2-5 palabras) que capture el tema comun. No agregues comillas ni explicaciones, solo el titulo.",
      },
      {
        role: "user",
        content: `Fragmentos:\n\n${samples.map((s, i) => `[${i + 1}] ${s.slice(0, 300)}`).join("\n\n")}`,
      },
    ],
    max_tokens: 40,
    temperature: 0.3,
  };
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost",
        "X-Title": "CoWorkerIA Clusters",
      },
      body: JSON.stringify(payload),
    });
    if (!r.ok) return "(sin label)";
    const d = await r.json();
    if (d.usage) {
      logUsageExtracted(d.usage, { tipo: "clusters_label", modelo: "openai/gpt-4o-mini", proyecto });
    }
    const text: string = d.choices?.[0]?.message?.content || "(sin label)";
    return text.replace(/^["'\s]+|["'\s]+$/g, "").slice(0, 60);
  } catch {
    return "(sin label)";
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { proyecto, k: kRequested } = body || {};

  // Fetch all chunks with embeddings
  const payload: Record<string, unknown> = { include: ["embeddings", "documents", "metadatas"], limit: 5000 };
  if (proyecto) payload.where = { proyecto };

  try {
    const res = await fetch(`${chromaBase()}/get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `chroma ${res.status}` }, { status: 502 });
    }
    const data = (await res.json()) as ChromaGetResponse;
    const total = data.ids?.length || 0;
    if (total < 2) {
      return NextResponse.json({
        puntos: [],
        clusters: [],
        mensaje:
          total === 0
            ? "No hay chunks indexados en este proyecto. Subí algunos documentos primero."
            : "Solo hay 1 chunk indexado. Hacen falta al menos 2 para generar un mapa.",
      });
    }

    const embeddings = data.embeddings;

    // PCA a 2D
    const { PCA } = await import("ml-pca");
    const pca = new PCA(embeddings as unknown as number[][]);
    const proj = pca.predict(embeddings as unknown as number[][], { nComponents: 2 });
    const points2d: [number, number][] = [];
    for (let i = 0; i < total; i++) {
      const row = proj.getRow(i);
      points2d.push([row[0], row[1]]);
    }

    // K-means: k auto-detectado (heuristica empirica), 2 <= k <= 10
    // Para datasets chicos (<15) preferimos mas clusters que menos
    const kDefault = Math.max(2, Math.min(10, Math.ceil(total / 3.5)));
    const k = Math.max(2, Math.min(10, kRequested || kDefault));
    const kmeansMod = (await import("ml-kmeans")) as { kmeans: (data: number[][], k: number, opts?: object) => { clusters: number[]; centroids: { centroid: number[] }[] } };
    const kmeansFn = kmeansMod.kmeans;
    // Cluster en el espacio 2D (mas rapido y suficiente para visualizacion)
    const kmRes = kmeansFn(points2d.map((p) => [p[0], p[1]]), k, { initialization: "kmeans++", maxIterations: 100 });

    // Construir puntos
    const puntos: Punto[] = data.ids.map((id, i) => {
      const m = (data.metadatas[i] || {}) as Record<string, unknown>;
      const text = data.documents[i] || "";
      return {
        id,
        archivo: String(m.archivo ?? "?"),
        pagina: m.pagina === undefined ? null : Number(m.pagina),
        cluster: kmRes.clusters[i],
        x: points2d[i][0],
        y: points2d[i][1],
        extracto: text.slice(0, 200),
      };
    });

    // Para cada cluster: tomar 4 chunks mas cercanos al centroide -> samples para LLM
    const key = await getOpenRouterKey();
    const clustersByIdx: Map<number, { samples: string[]; archivos: Set<string> }> = new Map();
    for (let i = 0; i < total; i++) {
      const c = kmRes.clusters[i];
      if (!clustersByIdx.has(c)) clustersByIdx.set(c, { samples: [], archivos: new Set() });
      const entry = clustersByIdx.get(c)!;
      entry.archivos.add(String((data.metadatas[i] as Record<string, unknown>).archivo ?? "?"));
      if (entry.samples.length < 4) entry.samples.push(data.documents[i] || "");
    }

    let clusters: Cluster[] = [];
    if (key) {
      // Labels en paralelo
      const labelPromises = Array.from(clustersByIdx.entries()).map(async ([id, entry]) => ({
        id,
        label: await labelCluster(entry.samples, key, proyecto),
        count: entry.samples.length,
        archivos: Array.from(entry.archivos),
      }));
      const labeled = await Promise.all(labelPromises);
      // Contar real (samples solo guarda 4)
      const realCount = new Map<number, number>();
      kmRes.clusters.forEach((c) => realCount.set(c, (realCount.get(c) || 0) + 1));
      clusters = labeled.map((c) => ({ ...c, count: realCount.get(c.id) || 0 }));
    } else {
      const realCount = new Map<number, number>();
      kmRes.clusters.forEach((c) => realCount.set(c, (realCount.get(c) || 0) + 1));
      clusters = Array.from(clustersByIdx.entries()).map(([id, entry]) => ({
        id,
        label: `Cluster ${id + 1}`,
        count: realCount.get(id) || 0,
        archivos: Array.from(entry.archivos),
      }));
    }

    clusters.sort((a, b) => a.id - b.id);

    return NextResponse.json({ puntos, clusters, total });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
