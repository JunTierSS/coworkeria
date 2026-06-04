import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 120;

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const proyecto = (formData.get("proyecto") as string) || "default";

  if (!file) {
    return NextResponse.json({ error: "Falta el archivo (campo 'file')" }, { status: 400 });
  }

  const name = file.name.toLowerCase();
  const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
  const isDocx = file.type === DOCX_MIME || name.endsWith(".docx");

  if (!isPdf && !isDocx) {
    return NextResponse.json(
      { error: `Formato no soportado: ${file.type || name}. Soportados: PDF, DOCX.` },
      { status: 415 }
    );
  }

  try {
    if (isPdf) {
      const n8nForm = new FormData();
      n8nForm.append("data", file, file.name);
      n8nForm.append("proyecto", proyecto);
      const res = await fetch(`${config.n8nUrl}/webhook/ingesta-pdf`, {
        method: "POST",
        body: n8nForm,
      });
      const text = await res.text();
      if (!res.ok) return NextResponse.json({ error: `n8n ${res.status}`, body: text }, { status: 502 });
      return NextResponse.json({ ...JSON.parse(text), archivo: file.name, proyecto });
    }

    // DOCX path: extraer texto server-side con mammoth
    const buf = Buffer.from(await file.arrayBuffer());
    const mammoth = await import("mammoth");
    const { value: rawText } = await mammoth.extractRawText({ buffer: buf });
    if (!rawText.trim()) {
      return NextResponse.json({ error: "El .docx no contiene texto extraible." }, { status: 422 });
    }
    const res = await fetch(`${config.n8nUrl}/webhook/ingesta-texto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: rawText,
        archivo: file.name,
        proyecto,
        tipo: "docx",
      }),
    });
    const txt = await res.text();
    if (!res.ok) return NextResponse.json({ error: `n8n ${res.status}`, body: txt }, { status: 502 });
    return NextResponse.json({ ...JSON.parse(txt), archivo: file.name, proyecto });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
