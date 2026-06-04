import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { logUsageExtracted } from "@/lib/uso";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { pregunta, proyecto, n_results = 5, web_search = false } = body || {};
  if (!pregunta) {
    return NextResponse.json({ error: "Falta 'pregunta'" }, { status: 400 });
  }

  try {
    const res = await fetch(`${config.n8nUrl}/webhook/consulta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pregunta, proyecto, n_results, web_search }),
    });
    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json({ error: `n8n ${res.status}`, body: text }, { status: 502 });
    }
    const data = JSON.parse(text);
    // Log de uso: cada call interna del workflow (chat, contradicciones detector)
    for (const u of data.usages || []) {
      logUsageExtracted(u, { tipo: u.tipo, modelo: u.modelo, proyecto });
    }
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
