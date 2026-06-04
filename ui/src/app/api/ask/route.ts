import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { pregunta, proyecto, n_results = 5 } = body || {};
  if (!pregunta) {
    return NextResponse.json({ error: "Falta 'pregunta'" }, { status: 400 });
  }

  try {
    const res = await fetch(`${config.n8nUrl}/webhook/consulta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pregunta, proyecto, n_results }),
    });
    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json({ error: `n8n ${res.status}`, body: text }, { status: 502 });
    }
    return NextResponse.json(JSON.parse(text));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
