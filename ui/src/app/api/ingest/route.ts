import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 120;

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const CHUNK_SIZE = 1000;
const OVERLAP = 200;

type Chunk = {
  id: string;
  text: string;
  metadata: Record<string, unknown>;
};

function chunkPerPage(
  pages: string[],
  archivo: string,
  proyecto: string,
  path_original: string
): { chunks: Chunk[]; total_paginas: number } {
  const total_paginas = pages.length;
  const chunks: Chunk[] = [];
  let chunkIdx = 0;
  pages.forEach((text, pageIdx) => {
    if (!text.trim()) return;
    const pagina = pageIdx + 1;
    let i = 0;
    while (i < text.length) {
      const end = Math.min(i + CHUNK_SIZE, text.length);
      chunks.push({
        id: `${proyecto}__${archivo}__chunk_${chunkIdx}`,
        text: text.slice(i, end),
        metadata: {
          archivo,
          proyecto,
          tipo: "pdf",
          chunk_index: chunkIdx,
          pagina,
          total_paginas,
          char_start_in_page: i,
          char_end_in_page: end,
          path_original,
        },
      });
      chunkIdx++;
      if (end >= text.length) break;
      i += CHUNK_SIZE - OVERLAP;
    }
  });
  return { chunks, total_paginas };
}

async function extractPdfPages(buf: Buffer): Promise<string[]> {
  // pdf-parse permite hooking per-page via pagerender callback
  type PdfParse = (
    data: Buffer,
    options?: { pagerender?: (pageData: unknown) => Promise<string> }
  ) => Promise<{ text: string; numpages: number }>;
  const mod = (await import("pdf-parse")) as unknown as { default: PdfParse };
  const pdfParse = mod.default;
  const pages: string[] = [];
  type PageData = {
    getTextContent: (opts: object) => Promise<{ items: Array<{ str: string }> }>;
  };
  await pdfParse(buf, {
    pagerender: async (pageData: unknown) => {
      const tc = await (pageData as PageData).getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: false,
      });
      // Reconstruye texto de la pagina con saltos donde haya gaps verticales
      const text = tc.items.map((it) => it.str).join(" ");
      pages.push(text);
      return text;
    },
  });
  return pages;
}

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
    const buf = Buffer.from(await file.arrayBuffer());

    if (isPdf) {
      const pages = await extractPdfPages(buf);
      if (!pages.some((p) => p.trim())) {
        return NextResponse.json(
          {
            error:
              "El PDF no contiene texto extraible (puede ser escaneado - OCR sera Fase 2).",
          },
          { status: 422 }
        );
      }
      const { chunks, total_paginas } = chunkPerPage(pages, file.name, proyecto, "");
      const res = await fetch(`${config.n8nUrl}/webhook/ingesta-texto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chunks,
          archivo: file.name,
          proyecto,
          tipo: "pdf",
          total_paginas,
        }),
      });
      const txt = await res.text();
      if (!res.ok)
        return NextResponse.json({ error: `n8n ${res.status}`, body: txt }, { status: 502 });
      return NextResponse.json({
        ...JSON.parse(txt),
        archivo: file.name,
        proyecto,
        total_paginas,
      });
    }

    // DOCX
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
    if (!res.ok)
      return NextResponse.json({ error: `n8n ${res.status}`, body: txt }, { status: 502 });
    return NextResponse.json({ ...JSON.parse(txt), archivo: file.name, proyecto });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
