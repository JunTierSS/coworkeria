import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 120;

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const CHUNK_SIZE = 1000;
const OVERLAP = 200;
const ROWS_PER_CHUNK = 40;

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
          archivo, proyecto, tipo: "pdf",
          chunk_index: chunkIdx,
          pagina, total_paginas,
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
      const text = tc.items.map((it) => it.str).join(" ");
      pages.push(text);
      return text;
    },
  });
  return pages;
}

async function extractXlsxChunks(
  buf: Buffer,
  archivo: string,
  proyecto: string,
  path_original: string
): Promise<{ chunks: Chunk[]; total_hojas: number }> {
  type Cell = { v?: unknown; w?: string; f?: string };
  type Sheet = Record<string, Cell> & { "!ref"?: string };
  type Workbook = { SheetNames: string[]; Sheets: Record<string, Sheet> };
  type XLSXModule = {
    read: (buf: Buffer, opts: { type: string; cellFormula: boolean; cellNF?: boolean }) => Workbook;
    utils: {
      decode_range: (ref: string) => { s: { r: number; c: number }; e: { r: number; c: number } };
      encode_col: (n: number) => string;
      encode_cell: (a: { r: number; c: number }) => string;
    };
  };
  const xlsxMod = (await import("xlsx")) as unknown as XLSXModule;
  const wb = xlsxMod.read(buf, { type: "buffer", cellFormula: true });

  const total_hojas = wb.SheetNames.length;
  const chunks: Chunk[] = [];
  let chunkIdx = 0;

  wb.SheetNames.forEach((name, hojaIdx0) => {
    const sheet = wb.Sheets[name];
    if (!sheet["!ref"]) return;
    const range = xlsxMod.utils.decode_range(sheet["!ref"]);
    const minRow = range.s.r;
    const maxRow = range.e.r;
    const maxCol = range.e.c;
    let tieneFormulas = false;

    for (let blockStart = minRow; blockStart <= maxRow; blockStart += ROWS_PER_CHUNK) {
      const blockEnd = Math.min(blockStart + ROWS_PER_CHUNK - 1, maxRow);
      const lines: string[] = [
        `Hoja: ${name}  (filas ${blockStart + 1}-${blockEnd + 1} de ${maxRow + 1})`,
      ];
      for (let r = blockStart; r <= blockEnd; r++) {
        const cells: string[] = [];
        for (let c = 0; c <= maxCol; c++) {
          const addr = xlsxMod.utils.encode_cell({ r, c });
          const cell = sheet[addr];
          if (!cell) continue;
          const val = cell.w ?? cell.v;
          if (cell.f) {
            tieneFormulas = true;
            cells.push(`${addr}=${val} [=${cell.f}]`);
          } else if (val !== undefined && val !== null && val !== "") {
            cells.push(`${addr}=${val}`);
          }
        }
        if (cells.length) lines.push(cells.join(" | "));
      }
      const text = lines.join("\n");
      if (text.trim().length < 30) continue;
      chunks.push({
        id: `${proyecto}__${archivo}__chunk_${chunkIdx}`,
        text,
        metadata: {
          archivo, proyecto,
          tipo: tieneFormulas ? "xlsx_formulas" : "xlsx",
          hoja: name,
          hoja_index: hojaIdx0 + 1,
          total_hojas,
          rango_celdas: `A${blockStart + 1}:${xlsxMod.utils.encode_col(maxCol)}${blockEnd + 1}`,
          fila_inicio: blockStart + 1,
          fila_fin: blockEnd + 1,
          chunk_index: chunkIdx,
          pagina: hojaIdx0 + 1,
          total_paginas: total_hojas,
          path_original,
        },
      });
      chunkIdx++;
    }
  });

  return { chunks, total_hojas };
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
  const isXlsx = file.type === XLSX_MIME || name.endsWith(".xlsx") || name.endsWith(".xls");

  if (!isPdf && !isDocx && !isXlsx) {
    return NextResponse.json(
      { error: `Formato no soportado: ${file.type || name}. Soportados: PDF, DOCX, XLSX.` },
      { status: 415 }
    );
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());

    if (isPdf) {
      const pages = await extractPdfPages(buf);
      if (!pages.some((p) => p.trim())) {
        return NextResponse.json(
          { error: "El PDF no contiene texto extraible (puede ser escaneado - usar el CLI para OCR)." },
          { status: 422 }
        );
      }
      const { chunks, total_paginas } = chunkPerPage(pages, file.name, proyecto, "");
      const res = await fetch(`${config.n8nUrl}/webhook/ingesta-texto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chunks, archivo: file.name, proyecto, tipo: "pdf", total_paginas }),
      });
      const txt = await res.text();
      if (!res.ok) return NextResponse.json({ error: `n8n ${res.status}`, body: txt }, { status: 502 });
      return NextResponse.json({ ...JSON.parse(txt), archivo: file.name, proyecto, total_paginas });
    }

    if (isXlsx) {
      const { chunks, total_hojas } = await extractXlsxChunks(buf, file.name, proyecto, "");
      if (!chunks.length) {
        return NextResponse.json({ error: "El Excel no contiene celdas con datos." }, { status: 422 });
      }
      const res = await fetch(`${config.n8nUrl}/webhook/ingesta-texto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chunks,
          archivo: file.name,
          proyecto,
          tipo: "xlsx",
          total_paginas: total_hojas,
        }),
      });
      const txt = await res.text();
      if (!res.ok) return NextResponse.json({ error: `n8n ${res.status}`, body: txt }, { status: 502 });
      return NextResponse.json({ ...JSON.parse(txt), archivo: file.name, proyecto, total_hojas });
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
    if (!res.ok) return NextResponse.json({ error: `n8n ${res.status}`, body: txt }, { status: 502 });
    return NextResponse.json({ ...JSON.parse(txt), archivo: file.name, proyecto });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
