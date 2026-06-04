import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { logUsageExtracted } from "@/lib/uso";

export const runtime = "nodejs";
export const maxDuration = 120;

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const EML_MIMES = ["message/rfc822", "application/x-eml"];
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
const TEXT_EXTS = [".txt", ".md", ".markdown", ".rst"];
const IPYNB_EXTS = [".ipynb"];
// Codigo y configs - reciben chunking code-aware
const CODE_EXTS = [
  ".py", ".pyi", ".rb", ".php", ".pl",
  ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx",
  ".go", ".rs", ".java", ".kt", ".swift", ".c", ".cpp", ".cc", ".h", ".hpp",
  ".cs", ".scala", ".clj", ".ex", ".exs",
  ".sql", ".graphql", ".gql",
  ".json", ".jsonc", ".yaml", ".yml", ".toml", ".ini", ".env",
  ".xml", ".html", ".htm", ".css", ".scss", ".sass", ".less",
  ".sh", ".bash", ".zsh", ".fish", ".ps1", ".bat", ".cmd",
  ".dockerfile",
];

const CHUNK_SIZE = 1500; // mas grande para codigo (funciones suelen ser mas largas)
const OVERLAP = 200;
const ROWS_PER_CHUNK = 40;

type Chunk = {
  id: string;
  text: string;
  metadata: Record<string, unknown>;
};

function extLower(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i).toLowerCase();
}

// === CHUNKING CODE-AWARE ===
// Divide texto respetando bloques logicos (lineas en blanco dobles) y, si un
// bloque es muy grande, hace fallback a chunking por caracteres con overlap.
function chunkCodeAware(text: string): string[] {
  // Normalizar line endings
  const norm = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Split por uno o mas lineas en blanco (preserva indentacion)
  const blocks = norm.split(/\n\s*\n/);
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const block of blocks) {
    if (!block.trim()) continue;
    const candidate = current ? current + "\n\n" + block : block;
    if (candidate.length <= CHUNK_SIZE) {
      current = candidate;
      continue;
    }
    flush();
    // Si el bloque solo ya excede el max, partirlo por chars
    if (block.length > CHUNK_SIZE) {
      let i = 0;
      while (i < block.length) {
        const end = Math.min(i + CHUNK_SIZE, block.length);
        chunks.push(block.slice(i, end));
        if (end >= block.length) break;
        i += CHUNK_SIZE - OVERLAP;
      }
      current = "";
    } else {
      current = block;
    }
  }
  flush();
  return chunks;
}

function chunkPlainText(
  text: string,
  archivo: string,
  proyecto: string,
  tipo: string,
  path_original: string,
  codeAware = false
): Chunk[] {
  const segs = codeAware ? chunkCodeAware(text) : (() => {
    const out: string[] = [];
    let i = 0;
    while (i < text.length) {
      const end = Math.min(i + CHUNK_SIZE, text.length);
      out.push(text.slice(i, end));
      if (end >= text.length) break;
      i += CHUNK_SIZE - OVERLAP;
    }
    return out;
  })();

  return segs.map((seg, idx) => ({
    id: `${proyecto}__${archivo}__chunk_${idx}`,
    text: seg,
    metadata: {
      archivo, proyecto, tipo,
      chunk_index: idx,
      pagina: 1, total_paginas: 1,
      path_original,
      lenguaje: tipo === "codigo" ? extLower(archivo).replace(".", "") : undefined,
    },
  }));
}

// === IPYNB ===
type IpynbCell = { cell_type: string; source: string[] | string };
type IpynbDoc = { cells?: IpynbCell[]; metadata?: Record<string, unknown> };

function extractIpynb(buf: Buffer): string {
  let parsed: IpynbDoc;
  try {
    parsed = JSON.parse(buf.toString("utf-8"));
  } catch {
    return "";
  }
  const parts: string[] = [];
  let codeCellNum = 0;
  let mdCellNum = 0;
  for (const cell of parsed.cells || []) {
    const src = Array.isArray(cell.source) ? cell.source.join("") : cell.source || "";
    if (!src.trim()) continue;
    if (cell.cell_type === "markdown") {
      mdCellNum++;
      parts.push(`[Celda markdown #${mdCellNum}]\n${src}`);
    } else if (cell.cell_type === "code") {
      codeCellNum++;
      parts.push("[Celda código #" + codeCellNum + "]\n```\n" + src + "\n```");
    }
    // ignoramos outputs
  }
  return parts.join("\n\n---\n\n");
}

// === Funciones existentes (PDF, DOCX, XLSX, EML, IMAGE) ===

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
      const end = Math.min(i + 1000, text.length);
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
      i += 1000 - 200;
    }
  });
  return { chunks, total_paginas };
}

async function extractPdfPages(buf: Buffer): Promise<string[]> {
  // pdf-parse v2 API: clase PDFParse, no funcion directa
  type ParserClass = new (opts: { data: Buffer }) => {
    getInfo: () => Promise<{ pages?: number; total?: number }>;
    getText: (opts?: { partial?: number[] }) => Promise<{ text: string }>;
    destroy: () => Promise<void>;
  };
  const mod = await import("pdf-parse");
  const PDFParse = (mod as unknown as { PDFParse: ParserClass }).PDFParse;
  const parser = new PDFParse({ data: buf });
  try {
    const info = await parser.getInfo();
    // En v2: 'total' es el numero de paginas (number). 'pages' es un array de metadata.
    const numPages = (info as unknown as { total?: number }).total ?? 1;
    const pages: string[] = [];
    for (let i = 1; i <= numPages; i++) {
      try {
        const r = await parser.getText({ partial: [i] });
        pages.push(r.text || "");
      } catch {
        pages.push("");
      }
    }
    return pages;
  } finally {
    await parser.destroy();
  }
}

async function extractImageChunks(
  buf: Buffer,
  fileType: string,
  archivo: string,
  proyecto: string,
  path_original: string
): Promise<Chunk[]> {
  const key = await getOpenRouterKey();
  if (!key) throw new Error("OPENROUTER_API_KEY no esta configurada");
  const mime = fileType.startsWith("image/") ? fileType : "image/png";
  const b64 = buf.toString("base64");
  const payload = {
    model: "anthropic/claude-sonnet-4",
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
        { type: "text", text: "Analiza esta imagen y produce DOS cosas separadas por '---':\n\n1. Texto visible (tipo OCR) o '[sin texto]'.\n2. Descripcion: que muestra, objetos, graficos, diagramas.\n\nFormato:\nTEXTO: ...\n---\nDESCRIPCION: ..." },
      ],
    }],
    max_tokens: 2000,
    temperature: 0,
  };
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": "http://localhost", "X-Title": "CoWorkerIA Image" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const data = await res.json();
  const analysis: string = data.choices?.[0]?.message?.content ?? "(sin analisis)";
  return [{
    id: `${proyecto}__${archivo}__chunk_0`,
    text: `[Imagen: ${archivo}]\n${analysis}`,
    metadata: { archivo, proyecto, tipo: "imagen", tamanho_bytes: buf.length, chunk_index: 0, pagina: 1, total_paginas: 1, path_original, extraido_por: "claude_vision" },
  }];
}

async function extractEmlChunks(
  buf: Buffer,
  archivo: string,
  proyecto: string,
  path_original: string
): Promise<Chunk[]> {
  const { simpleParser } = await import("mailparser");
  const parsed = await simpleParser(buf);
  const remitente = parsed.from?.text ?? "";
  const toField = parsed.to;
  const destinatario = Array.isArray(toField)
    ? toField.map((a) => (a as { text?: string }).text).join(", ")
    : (toField as { text?: string } | undefined)?.text ?? "";
  const ccField = parsed.cc;
  const cc = Array.isArray(ccField)
    ? ccField.map((a) => (a as { text?: string }).text).join(", ")
    : (ccField as { text?: string } | undefined)?.text ?? "";
  const asunto = parsed.subject ?? "";
  const fecha = parsed.date?.toISOString() ?? "";
  const hilo_id = (parsed.messageId ?? asunto).slice(0, 120);
  const cuerpo = parsed.text || (parsed.html ? parsed.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "") || "(sin cuerpo)";
  const header = `De: ${remitente}\nPara: ${destinatario}\n${cc ? `Cc: ${cc}\n` : ""}Fecha: ${fecha}\nAsunto: ${asunto}\n---\n`;
  const chunks: Chunk[] = [];
  const fullText = header + cuerpo;
  if (fullText.length <= CHUNK_SIZE * 1.5) {
    chunks.push({
      id: `${proyecto}__${archivo}__chunk_0`,
      text: fullText,
      metadata: { archivo, proyecto, tipo: "email", chunk_index: 0, pagina: 1, total_paginas: 1, remitente, destinatario, asunto, fecha, hilo_id, path_original },
    });
  } else {
    let i = 0, chunkIdx = 0;
    while (i < cuerpo.length) {
      const end = Math.min(i + 1000, cuerpo.length);
      chunks.push({
        id: `${proyecto}__${archivo}__chunk_${chunkIdx}`,
        text: header + cuerpo.slice(i, end),
        metadata: { archivo, proyecto, tipo: "email", chunk_index: chunkIdx, char_start: i, char_end: end, pagina: 1, total_paginas: 1, remitente, destinatario, asunto, fecha, hilo_id, path_original },
      });
      chunkIdx++;
      if (end >= cuerpo.length) break;
      i += 1000 - 200;
    }
  }
  return chunks;
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
      const lines: string[] = [`Hoja: ${name}  (filas ${blockStart + 1}-${blockEnd + 1} de ${maxRow + 1})`];
      for (let r = blockStart; r <= blockEnd; r++) {
        const cells: string[] = [];
        for (let c = 0; c <= maxCol; c++) {
          const addr = xlsxMod.utils.encode_cell({ r, c });
          const cell = sheet[addr];
          if (!cell) continue;
          const val = cell.w ?? cell.v;
          if (cell.f) { tieneFormulas = true; cells.push(`${addr}=${val} [=${cell.f}]`); }
          else if (val !== undefined && val !== null && val !== "") { cells.push(`${addr}=${val}`); }
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
          hoja: name, hoja_index: hojaIdx0 + 1, total_hojas,
          rango_celdas: `A${blockStart + 1}:${xlsxMod.utils.encode_col(maxCol)}${blockEnd + 1}`,
          fila_inicio: blockStart + 1, fila_fin: blockEnd + 1,
          chunk_index: chunkIdx, pagina: hojaIdx0 + 1, total_paginas: total_hojas,
          path_original,
        },
      });
      chunkIdx++;
    }
  });
  return { chunks, total_hojas };
}

async function postChunks(chunks: Chunk[], archivo: string, proyecto: string, tipo: string, total_paginas = 1) {
  const res = await fetch(`${config.n8nUrl}/webhook/ingesta-texto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chunks, archivo, proyecto, tipo, total_paginas }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`n8n ${res.status}: ${txt.slice(0, 200)}`);
  const data = JSON.parse(txt);
  // Loguear usage del paso de indice si esta disponible
  const indiceUsage = data?.indice?.usage_indice;
  if (indiceUsage) {
    logUsageExtracted(indiceUsage, { tipo: "ingesta_resumen", modelo: "openai/gpt-4o-mini", proyecto, archivo });
  }
  return data;
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const proyecto = (formData.get("proyecto") as string) || "default";

  if (!file) return NextResponse.json({ error: "Falta el archivo (campo 'file')" }, { status: 400 });

  const name = file.name.toLowerCase();
  const ext = extLower(name);

  const isPdf = file.type === "application/pdf" || ext === ".pdf";
  const isDocx = file.type === DOCX_MIME || ext === ".docx";
  const isXlsx = file.type === XLSX_MIME || ext === ".xlsx" || ext === ".xls";
  const isEml = EML_MIMES.includes(file.type) || ext === ".eml";
  const isImage = file.type.startsWith("image/") || IMAGE_EXTS.includes(ext);
  const isText = TEXT_EXTS.includes(ext) || file.type === "text/plain" || file.type === "text/markdown";
  const isIpynb = IPYNB_EXTS.includes(ext);
  const isCode = CODE_EXTS.includes(ext);

  if (!isPdf && !isDocx && !isXlsx && !isEml && !isImage && !isText && !isIpynb && !isCode) {
    return NextResponse.json(
      { error: `Formato no soportado: ${ext || file.type}` },
      { status: 415 }
    );
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());

    if (isImage) {
      if (buf.length > 5_000_000) return NextResponse.json({ error: "Imagen muy grande (max 5MB)." }, { status: 413 });
      const chunks = await extractImageChunks(buf, file.type || "image/png", file.name, proyecto, "");
      const r = await postChunks(chunks, file.name, proyecto, "imagen");
      return NextResponse.json({ ...r, archivo: file.name, proyecto });
    }

    if (isIpynb) {
      const raw = extractIpynb(buf);
      if (!raw.trim()) return NextResponse.json({ error: ".ipynb sin celdas con contenido" }, { status: 422 });
      const chunks = chunkPlainText(raw, file.name, proyecto, "ipynb", "", true);
      const r = await postChunks(chunks, file.name, proyecto, "ipynb");
      return NextResponse.json({ ...r, archivo: file.name, proyecto });
    }

    if (isCode) {
      const text = buf.toString("utf-8");
      if (!text.trim()) return NextResponse.json({ error: "Archivo de codigo vacio" }, { status: 422 });
      const lenguaje = ext.replace(".", "");
      const chunks = chunkPlainText(text, file.name, proyecto, "codigo", "", true);
      // anotar lenguaje en cada chunk
      chunks.forEach((c) => { c.metadata.lenguaje = lenguaje; });
      const r = await postChunks(chunks, file.name, proyecto, "codigo");
      return NextResponse.json({ ...r, archivo: file.name, proyecto });
    }

    if (isText) {
      const text = buf.toString("utf-8");
      if (!text.trim()) return NextResponse.json({ error: "Archivo de texto vacio." }, { status: 422 });
      const tipo = ext === ".md" || ext === ".markdown" ? "markdown" : "texto";
      const chunks = chunkPlainText(text, file.name, proyecto, tipo, "", false);
      const r = await postChunks(chunks, file.name, proyecto, tipo);
      return NextResponse.json({ ...r, archivo: file.name, proyecto });
    }

    if (isEml) {
      const chunks = await extractEmlChunks(buf, file.name, proyecto, "");
      if (!chunks.length) return NextResponse.json({ error: "Email vacio o no parseable." }, { status: 422 });
      const r = await postChunks(chunks, file.name, proyecto, "email");
      return NextResponse.json({ ...r, archivo: file.name, proyecto });
    }

    if (isPdf) {
      const pages = await extractPdfPages(buf);
      if (!pages.some((p) => p.trim())) {
        return NextResponse.json({ error: "El PDF no contiene texto extraible (puede ser escaneado - usar CLI para OCR)." }, { status: 422 });
      }
      const { chunks, total_paginas } = chunkPerPage(pages, file.name, proyecto, "");
      const r = await postChunks(chunks, file.name, proyecto, "pdf", total_paginas);
      return NextResponse.json({ ...r, archivo: file.name, proyecto, total_paginas });
    }

    if (isXlsx) {
      const { chunks, total_hojas } = await extractXlsxChunks(buf, file.name, proyecto, "");
      if (!chunks.length) return NextResponse.json({ error: "El Excel no contiene celdas con datos." }, { status: 422 });
      const r = await postChunks(chunks, file.name, proyecto, "xlsx", total_hojas);
      return NextResponse.json({ ...r, archivo: file.name, proyecto, total_hojas });
    }

    // DOCX
    const mammoth = await import("mammoth");
    const { value: rawText } = await mammoth.extractRawText({ buffer: buf });
    if (!rawText.trim()) return NextResponse.json({ error: "El .docx no contiene texto extraible." }, { status: 422 });
    const res = await fetch(`${config.n8nUrl}/webhook/ingesta-texto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: rawText, archivo: file.name, proyecto, tipo: "docx" }),
    });
    const txt = await res.text();
    if (!res.ok) return NextResponse.json({ error: `n8n ${res.status}`, body: txt }, { status: 502 });
    return NextResponse.json({ ...JSON.parse(txt), archivo: file.name, proyecto });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
