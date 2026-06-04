import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { logUsageExtracted } from "@/lib/uso";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { topic, proyecto } = body || {};
  if (!topic) {
    return NextResponse.json({ error: "Falta 'topic'" }, { status: 400 });
  }
  try {
    const res = await fetch(`${config.n8nUrl}/webhook/timeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, proyecto, n_results: 20 }),
    });
    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json({ error: `n8n ${res.status}`, body: text }, { status: 502 });
    }
    const data = JSON.parse(text);
    for (const u of data.usages || []) {
      logUsageExtracted(u, { tipo: u.tipo, modelo: u.modelo, proyecto });
    }
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
