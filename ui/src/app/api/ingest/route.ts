import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const proyecto = (formData.get("proyecto") as string) || "default";

  if (!file) {
    return NextResponse.json({ error: "Falta el archivo (campo 'file')" }, { status: 400 });
  }

  // Reempaqueta para n8n (espera campo 'data')
  const n8nForm = new FormData();
  n8nForm.append("data", file, file.name);
  n8nForm.append("proyecto", proyecto);

  try {
    const res = await fetch(`${config.n8nUrl}/webhook/ingesta-pdf`, {
      method: "POST",
      body: n8nForm,
    });
    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json({ error: `n8n ${res.status}`, body: text }, { status: 502 });
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    return NextResponse.json({ ...(data as object), archivo: file.name, proyecto });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
