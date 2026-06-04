"""
CoWorkerIA - CLI del MVP

Uso:
  python scripts/coworkeria.py ingest <archivo.pdf> --proyecto <nombre>
  python scripts/coworkeria.py ask "<pregunta>" --proyecto <nombre> [--top-k 5]
  python scripts/coworkeria.py ls [--proyecto <nombre>]
  python scripts/coworkeria.py rm <archivo> --proyecto <nombre>

Acciones:
  ingest  -> guarda copia del archivo en data/documentos/, lo postea al workflow n8n,
             que extrae texto -> chunks -> embeddings (mock) -> Chroma.
  ask     -> postea la pregunta al workflow de consulta n8n, imprime respuesta + citas.
  ls      -> lista archivos indexados en Chroma (con conteo de chunks).
  rm      -> borra todos los chunks de un archivo y elimina la copia local.

Pre-requisitos:
  - n8n corriendo en localhost:5678 (npx n8n)
  - Chroma corriendo en localhost:8000 (chroma run --path ./data/vectordb --host localhost --port 8000)
  - Workflows 'Ingesta PDF (mock)' y 'Consulta RAG (mock)' activos en n8n
"""
import argparse
import json
import os
import shutil
import sys
from pathlib import Path
import urllib.request
import urllib.error
import mimetypes
import uuid

# Forzar UTF-8 en consola Windows (acentos / ñ)
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import chromadb

ROOT = Path(__file__).resolve().parent.parent
DOCS_DIR = ROOT / "data" / "documentos"
N8N = "http://localhost:5678"
CHROMA_HOST = "localhost"
CHROMA_PORT = 8000
COLLECTION = "coworkeria_test"

# Colores ANSI sencillos (degradan a vacío si no soportados)
def _c(code: str, s: str) -> str:
    return f"\033[{code}m{s}\033[0m" if sys.stdout.isatty() else s

BOLD = lambda s: _c("1", s)
DIM = lambda s: _c("2", s)
GREEN = lambda s: _c("32", s)
YELLOW = lambda s: _c("33", s)
CYAN = lambda s: _c("36", s)
RED = lambda s: _c("31", s)


def _chroma():
    return chromadb.HttpClient(host=CHROMA_HOST, port=CHROMA_PORT).get_collection(COLLECTION)


def _post_multipart(url: str, file_path: Path, fields: dict) -> dict:
    """POST multipart/form-data sin dependencias externas."""
    boundary = uuid.uuid4().hex
    body = bytearray()
    for k, v in fields.items():
        body += f"--{boundary}\r\n".encode()
        body += f'Content-Disposition: form-data; name="{k}"\r\n\r\n'.encode()
        body += str(v).encode("utf-8")
        body += b"\r\n"
    fname = file_path.name
    mtype = mimetypes.guess_type(fname)[0] or "application/octet-stream"
    body += f"--{boundary}\r\n".encode()
    body += f'Content-Disposition: form-data; name="data"; filename="{fname}"\r\n'.encode()
    body += f"Content-Type: {mtype}\r\n\r\n".encode()
    body += file_path.read_bytes()
    body += f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        url, method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        data=bytes(body),
    )
    try:
        with urllib.request.urlopen(req) as r:
            data = r.read().decode("utf-8", errors="replace")
            return json.loads(data) if data else {}
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}", "body": e.read().decode("utf-8", errors="replace")}


def _post_json(url: str, payload: dict) -> dict:
    req = urllib.request.Request(
        url, method="POST",
        headers={"Content-Type": "application/json"},
        data=json.dumps(payload).encode(),
    )
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}", "body": e.read().decode()}


def _chunk_code_aware(text: str, chunk_size: int = 1500, overlap: int = 200) -> list[str]:
    """
    Chunking que respeta bloques logicos (lineas en blanco dobles) y no parte
    funciones/queries a la mitad cuando es posible.
    """
    import re
    norm = text.replace("\r\n", "\n").replace("\r", "\n")
    blocks = re.split(r"\n\s*\n", norm)
    chunks: list[str] = []
    current = ""

    def flush():
        nonlocal current
        if current.strip():
            chunks.append(current.strip())
        current = ""

    for block in blocks:
        if not block.strip():
            continue
        candidate = (current + "\n\n" + block) if current else block
        if len(candidate) <= chunk_size:
            current = candidate
            continue
        flush()
        if len(block) > chunk_size:
            i = 0
            while i < len(block):
                end = min(i + chunk_size, len(block))
                chunks.append(block[i:end])
                if end >= len(block):
                    break
                i += chunk_size - overlap
            current = ""
        else:
            current = block
    flush()
    return chunks


def _extract_ipynb(path: Path) -> str:
    """Extrae celdas code+markdown de un .ipynb (ignora outputs)."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        sys.exit(RED(f"No pude parsear el .ipynb: {e}"))
    parts: list[str] = []
    code_n = 0
    md_n = 0
    for cell in data.get("cells", []):
        src = cell.get("source", "")
        if isinstance(src, list):
            src = "".join(src)
        if not src.strip():
            continue
        if cell.get("cell_type") == "markdown":
            md_n += 1
            parts.append(f"[Celda markdown #{md_n}]\n{src}")
        elif cell.get("cell_type") == "code":
            code_n += 1
            parts.append(f"[Celda código #{code_n}]\n```\n{src}\n```")
    return "\n\n---\n\n".join(parts)


CODE_EXTS = {
    ".py", ".pyi", ".rb", ".php", ".pl",
    ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx",
    ".go", ".rs", ".java", ".kt", ".swift", ".c", ".cpp", ".cc", ".h", ".hpp",
    ".cs", ".scala", ".clj", ".ex", ".exs",
    ".sql", ".graphql", ".gql",
    ".json", ".jsonc", ".yaml", ".yml", ".toml", ".ini", ".env",
    ".xml", ".html", ".htm", ".css", ".scss", ".sass", ".less",
    ".sh", ".bash", ".zsh", ".fish", ".ps1", ".bat", ".cmd",
    ".dockerfile",
}


def _extract_code_or_text(path: Path, archivo: str, proyecto: str, path_original: str, tipo: str, code_aware: bool) -> tuple[list[dict], int]:
    text = path.read_text(encoding="utf-8", errors="replace")
    if not text.strip():
        sys.exit(RED(f"El archivo {archivo} esta vacio."))
    segments = _chunk_code_aware(text) if code_aware else None
    if segments is None:
        # chunking lineal por chars (texto plano)
        segments = []
        CHUNK_SIZE = 1000
        OVERLAP = 200
        i = 0
        while i < len(text):
            end = min(i + CHUNK_SIZE, len(text))
            segments.append(text[i:end])
            if end >= len(text):
                break
            i += CHUNK_SIZE - OVERLAP

    lenguaje = path.suffix.lower().lstrip(".") if tipo == "codigo" else None
    chunks = []
    for idx, seg in enumerate(segments):
        meta = {
            "archivo": archivo,
            "proyecto": proyecto,
            "tipo": tipo,
            "chunk_index": idx,
            "pagina": 1,
            "total_paginas": 1,
            "path_original": path_original,
        }
        if lenguaje:
            meta["lenguaje"] = lenguaje
        chunks.append({
            "id": f"{proyecto}__{archivo}__chunk_{idx}",
            "text": seg,
            "metadata": meta,
        })
    return chunks, len(chunks)


def _extract_image(path: Path, archivo: str, proyecto: str, path_original: str) -> tuple[list[dict], str]:
    """
    Procesa una imagen (.jpg/.png/etc) via Claude Vision: extrae texto si lo hay
    Y describe el contenido visual. Devuelve chunks + un texto resumen.
    """
    key = _load_openrouter_key()
    if not key:
        sys.exit(RED("OPENROUTER_API_KEY no esta en .env - imagenes requieren Claude Vision."))
    img_bytes = path.read_bytes()
    if len(img_bytes) > 5_000_000:
        sys.exit(RED(f"Imagen muy grande ({len(img_bytes)//1024//1024}MB). Limite: 5MB."))

    # Detectar MIME basico
    ext = path.suffix.lower().lstrip(".")
    mime = "image/png" if ext == "png" else "image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}"

    import base64
    import urllib.request, urllib.error
    b64 = base64.b64encode(img_bytes).decode()
    payload = {
        "model": "anthropic/claude-sonnet-4",
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                {"type": "text", "text": "Analiza esta imagen y produce DOS cosas separadas por '---':\n\n1. Texto visible: extrae TODO el texto que aparezca (tipo OCR). Si no hay texto, di '[sin texto]'.\n\n2. Descripcion: que muestra la imagen, objetos, personas, graficos, diagramas, etc. Se especifico y conciso. Si es un grafico/tabla, describe los datos.\n\nFormato exacto:\nTEXTO: ...\n---\nDESCRIPCION: ..."},
            ],
        }],
        "max_tokens": 2000,
        "temperature": 0,
    }
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions", method="POST",
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost",
            "X-Title": "CoWorkerIA Image",
        },
        data=json.dumps(payload).encode(),
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        d = json.loads(r.read())
        analysis = d["choices"][0]["message"]["content"]

    full_text = f"[Imagen: {archivo}]\n{analysis}"
    chunks = [{
        "id": f"{proyecto}__{archivo}__chunk_0",
        "text": full_text,
        "metadata": {
            "archivo": archivo,
            "proyecto": proyecto,
            "tipo": "imagen",
            "formato": ext,
            "tamanho_bytes": len(img_bytes),
            "chunk_index": 0,
            "pagina": 1,
            "total_paginas": 1,
            "path_original": path_original,
            "extraido_por": "claude_vision",
        },
    }]
    return chunks, analysis[:200]


def _ocr_page_with_claude(image_bytes: bytes, page_num: int, openrouter_key: str) -> str:
    """OCR de una pagina usando Claude vision via OpenRouter. Devuelve el texto extraido."""
    import base64
    import urllib.request
    import urllib.error
    b64 = base64.b64encode(image_bytes).decode()
    payload = {
        "model": "anthropic/claude-sonnet-4",
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
                {"type": "text", "text": "Extrae TODO el texto visible en esta pagina escaneada, exactamente como aparece. Mantene el orden de lectura natural. NO agregues comentarios ni explicaciones, solo el texto. Si la pagina esta en blanco, responde solo con: [pagina en blanco]."},
            ],
        }],
        "max_tokens": 4000,
        "temperature": 0,
    }
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        method="POST",
        headers={
            "Authorization": f"Bearer {openrouter_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost",
            "X-Title": "CoWorkerIA OCR",
        },
        data=json.dumps(payload).encode(),
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            d = json.loads(r.read())
            text = d["choices"][0]["message"]["content"]
            return "" if "[pagina en blanco]" in text else text
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:200]
        print(RED(f"  X OCR pag {page_num} fallo: HTTP {e.code} {body}"))
        return ""


def _load_openrouter_key() -> str | None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return None
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("OPENROUTER_API_KEY=") and "..." not in line:
            return line.split("=", 1)[1].strip()
    return None


def _extract_pdf_per_page_chunks(path: Path, archivo: str, proyecto: str, path_original: str) -> tuple[list[dict], int]:
    """
    Extrae texto por pagina con PyMuPDF y chunkea SIN cruzar bordes de pagina.
    Cada chunk lleva su numero de pagina REAL (no aproximado).
    Si una pagina no tiene texto extraible (PDF escaneado), hace fallback a OCR
    via Claude Vision (OpenRouter).
    """
    try:
        import fitz  # pymupdf
    except ImportError:
        sys.exit(RED("Falta pymupdf. Corre: pip install pymupdf"))

    CHUNK_SIZE = 1000
    OVERLAP = 200
    doc = fitz.open(str(path))
    total_paginas = len(doc)

    # Primera pasada: extraer texto nativo + tablas, detectar paginas vacias
    page_texts: list[tuple[int, str, bool]] = []  # (page_num, text, ocr_used)
    paginas_sin_texto = []
    for page_num, page in enumerate(doc, start=1):
        # Texto en orden de lectura (PyMuPDF maneja columnas mejor que pdf-parse)
        text = page.get_text("text", sort=True)

        # Buscar tablas y agregarlas como markdown (mejor que el texto lineal)
        try:
            found = page.find_tables()
            tables = list(getattr(found, "tables", []) or [])
            if tables:
                table_md_parts = []
                for t_idx, tab in enumerate(tables, start=1):
                    try:
                        rows = tab.extract()
                        if not rows or not any(any(c for c in r) for r in rows):
                            continue
                        rows = [[str(c or "").strip().replace("\n", " ") for c in r] for r in rows]
                        n_cols = max(len(r) for r in rows)
                        rows = [r + [""] * (n_cols - len(r)) for r in rows]
                        md = [f"\n[Tabla {t_idx} en pagina {page_num}]"]
                        md.append("| " + " | ".join(rows[0]) + " |")
                        md.append("| " + " | ".join(["---"] * n_cols) + " |")
                        for r in rows[1:]:
                            md.append("| " + " | ".join(r) + " |")
                        table_md_parts.append("\n".join(md))
                    except Exception:
                        continue
                if table_md_parts:
                    text = text + "\n\n" + "\n\n".join(table_md_parts)
        except Exception:
            # find_tables no esta en todas las versiones de pymupdf - silencioso fallback
            pass

        if text.strip():
            page_texts.append((page_num, text, False))
        else:
            paginas_sin_texto.append(page_num)
            page_texts.append((page_num, "", False))

    # Segunda pasada: si hay paginas sin texto, hacer OCR
    if paginas_sin_texto:
        print(YELLOW(f"  ! {len(paginas_sin_texto)} pagina(s) sin texto extraible - usando OCR (Claude Vision via OpenRouter)"))
        key = _load_openrouter_key()
        if not key:
            print(RED("  X No hay OPENROUTER_API_KEY en .env - no se puede hacer OCR. Estas paginas quedaran vacias."))
        else:
            for page_num in paginas_sin_texto:
                page = doc[page_num - 1]
                pix = page.get_pixmap(dpi=200)  # render a imagen
                img_bytes = pix.tobytes("png")
                print(DIM(f"    ... OCR pagina {page_num}/{total_paginas} ({len(img_bytes)//1024}KB)"))
                ocr_text = _ocr_page_with_claude(img_bytes, page_num, key)
                if ocr_text:
                    page_texts[page_num - 1] = (page_num, ocr_text, True)
                    print(DIM(f"    + {len(ocr_text)} chars extraidos por OCR"))

    # Chunkear todo (text nativo y OCR juntos)
    chunks: list[dict] = []
    chunk_idx = 0
    for page_num, text, ocr_used in page_texts:
        if not text.strip():
            continue
        i = 0
        while i < len(text):
            end = min(i + CHUNK_SIZE, len(text))
            chunks.append({
                "id": f"{proyecto}__{archivo}__chunk_{chunk_idx}",
                "text": text[i:end],
                "metadata": {
                    "archivo": archivo,
                    "proyecto": proyecto,
                    "tipo": "pdf_ocr" if ocr_used else "pdf",
                    "ocr": ocr_used,
                    "chunk_index": chunk_idx,
                    "pagina": page_num,
                    "total_paginas": total_paginas,
                    "char_start_in_page": i,
                    "char_end_in_page": end,
                    "path_original": path_original,
                },
            })
            chunk_idx += 1
            if end >= len(text):
                break
            i += CHUNK_SIZE - OVERLAP
    doc.close()
    return chunks, total_paginas


def _extract_xlsx_chunks(path: Path, archivo: str, proyecto: str, path_original: str) -> tuple[list[dict], int]:
    """
    Extrae cada hoja de un Excel como texto estructurado.
    Una hoja chica -> 1 chunk. Una hoja grande -> chunks por bloques de filas.
    Metadata incluye hoja + rango de celdas + tipo (datos/formulas detectables).
    Devuelve (chunks, total_hojas).
    """
    try:
        from openpyxl import load_workbook
    except ImportError:
        sys.exit(RED("Falta openpyxl. Corre: pip install openpyxl"))

    # data_only=False para preservar formulas; los valores cacheados estan en data_only=True
    # read_only=False para acceder a merged_cells (no soportado en read_only)
    wb_formulas = load_workbook(filename=str(path), data_only=False, read_only=False)
    wb_values = load_workbook(filename=str(path), data_only=True, read_only=False)

    def fmt_value(v):
        """Formatea valores: fechas como ISO, numeros sin decimales innecesarios."""
        if v is None or v == "":
            return None
        import datetime
        if isinstance(v, (datetime.datetime, datetime.date)):
            return v.isoformat()
        if isinstance(v, float) and v.is_integer():
            return int(v)
        return v

    def get_merged_value(ws_v, row, col):
        """Si la celda esta dentro de un merged range, devuelve el valor de la celda top-left."""
        from openpyxl.utils import get_column_letter
        cell_coord = f"{get_column_letter(col)}{row}"
        for merged_range in ws_v.merged_cells.ranges:
            if cell_coord in merged_range:
                return ws_v.cell(row=merged_range.min_row, column=merged_range.min_col).value
        return None

    ROWS_PER_CHUNK = 40  # Filas por chunk (cabe en ~1000-1500 chars con anchos razonables)
    chunks: list[dict] = []
    chunk_idx = 0
    total_hojas = len(wb_values.sheetnames)

    for hoja_idx, sheet_name in enumerate(wb_values.sheetnames, start=1):
        ws_v = wb_values[sheet_name]
        ws_f = wb_formulas[sheet_name]
        # Detectar si la hoja tiene formulas (al menos una celda con '=')
        tiene_formulas = False
        max_row = ws_v.max_row or 0
        max_col = ws_v.max_column or 0
        if max_row == 0 or max_col == 0:
            continue

        # Recorrer en bloques de ROWS_PER_CHUNK filas
        for start_row in range(1, max_row + 1, ROWS_PER_CHUNK):
            end_row = min(start_row + ROWS_PER_CHUNK - 1, max_row)
            lines = [f"Hoja: {sheet_name}  (filas {start_row}-{end_row} de {max_row})"]
            # Reconstruir como markdown table-like
            try:
                from openpyxl.utils import get_column_letter
            except Exception:
                def get_column_letter(n):
                    s = ""
                    while n > 0:
                        n, r = divmod(n - 1, 26)
                        s = chr(65 + r) + s
                    return s

            for row_idx in range(start_row, end_row + 1):
                cells_v = []
                for col_idx in range(1, max_col + 1):
                    cell_v = ws_v.cell(row=row_idx, column=col_idx)
                    val = fmt_value(cell_v.value)
                    formula = ws_f.cell(row=row_idx, column=col_idx).value
                    # Si la celda es parte de merged y esta vacia, usar el valor del top-left
                    if val is None:
                        merged_val = get_merged_value(ws_v, row_idx, col_idx)
                        if merged_val is not None:
                            val = fmt_value(merged_val)
                    addr = f"{get_column_letter(col_idx)}{row_idx}"
                    if isinstance(formula, str) and formula.startswith("="):
                        tiene_formulas = True
                        cells_v.append(f"{addr}={val} [{formula}]")
                    elif val is not None and val != "":
                        cells_v.append(f"{addr}={val}")
                if cells_v:
                    lines.append(" | ".join(str(c) for c in cells_v))
            text = "\n".join(lines)
            if len(text.strip()) < 30:
                continue
            chunks.append({
                "id": f"{proyecto}__{archivo}__chunk_{chunk_idx}",
                "text": text,
                "metadata": {
                    "archivo": archivo,
                    "proyecto": proyecto,
                    "tipo": "xlsx_formulas" if tiene_formulas else "xlsx",
                    "hoja": sheet_name,
                    "hoja_index": hoja_idx,
                    "total_hojas": total_hojas,
                    "rango_celdas": f"A{start_row}:{get_column_letter(max_col)}{end_row}",
                    "fila_inicio": start_row,
                    "fila_fin": end_row,
                    "chunk_index": chunk_idx,
                    "pagina": hoja_idx,  # mapeo: la "pagina" en Excel es la hoja
                    "total_paginas": total_hojas,
                    "path_original": path_original,
                },
            })
            chunk_idx += 1

    wb_formulas.close()
    wb_values.close()
    return chunks, total_hojas


def _extract_eml(path: Path, archivo: str, proyecto: str, path_original: str) -> tuple[list[dict], dict]:
    """
    Parsea un email .eml (export de Gmail/Outlook). Devuelve chunks + metadata del email.
    Cada email se vuelve UN chunk con headers + cuerpo, o varios si el cuerpo es largo.
    """
    import email
    from email import policy
    from email.utils import parsedate_to_datetime

    with open(path, "rb") as f:
        msg = email.message_from_binary_file(f, policy=policy.default)

    remitente = str(msg.get("From", "")).strip()
    destinatario = str(msg.get("To", "")).strip()
    cc = str(msg.get("Cc", "")).strip()
    asunto = str(msg.get("Subject", "")).strip()
    fecha_raw = msg.get("Date", "")
    try:
        fecha = parsedate_to_datetime(fecha_raw).isoformat() if fecha_raw else ""
    except Exception:
        fecha = str(fecha_raw)
    hilo_id = str(msg.get("Message-ID", "") or msg.get("Thread-Topic", "") or asunto)

    # Extraer cuerpo plano (preferir text/plain sobre text/html)
    cuerpo = ""
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            if ctype == "text/plain":
                try:
                    cuerpo = part.get_content()
                    break
                except Exception:
                    continue
        if not cuerpo:
            for part in msg.walk():
                if part.get_content_type() == "text/html":
                    try:
                        import re
                        html = part.get_content()
                        cuerpo = re.sub(r"<[^>]+>", " ", html)
                        cuerpo = re.sub(r"\s+", " ", cuerpo).strip()
                        break
                    except Exception:
                        continue
    else:
        try:
            cuerpo = msg.get_content()
        except Exception:
            cuerpo = msg.get_payload(decode=True).decode("utf-8", errors="replace")

    cuerpo = cuerpo or "(sin cuerpo)"

    # Construir texto representado: headers + cuerpo
    header_block = (
        f"De: {remitente}\n"
        f"Para: {destinatario}\n"
        + (f"Cc: {cc}\n" if cc else "")
        + f"Fecha: {fecha}\n"
        f"Asunto: {asunto}\n"
        f"---\n"
    )

    CHUNK_SIZE = 1000
    OVERLAP = 200
    chunks = []
    chunk_idx = 0
    # Si todo cabe en un chunk, hacer uno solo
    full_text = header_block + cuerpo
    if len(full_text) <= CHUNK_SIZE * 1.5:
        chunks.append({
            "id": f"{proyecto}__{archivo}__chunk_0",
            "text": full_text,
            "metadata": {
                "archivo": archivo,
                "proyecto": proyecto,
                "tipo": "email",
                "chunk_index": 0,
                "pagina": 1,
                "total_paginas": 1,
                "remitente": remitente,
                "destinatario": destinatario,
                "asunto": asunto,
                "fecha": fecha,
                "hilo_id": hilo_id[:120],
                "path_original": path_original,
            },
        })
    else:
        # Chunkear el cuerpo (manteniendo headers como prefijo en cada chunk)
        i = 0
        while i < len(cuerpo):
            end = min(i + CHUNK_SIZE, len(cuerpo))
            text = header_block + cuerpo[i:end]
            chunks.append({
                "id": f"{proyecto}__{archivo}__chunk_{chunk_idx}",
                "text": text,
                "metadata": {
                    "archivo": archivo,
                    "proyecto": proyecto,
                    "tipo": "email",
                    "chunk_index": chunk_idx,
                    "char_start": i,
                    "char_end": end,
                    "pagina": 1,
                    "total_paginas": 1,
                    "remitente": remitente,
                    "destinatario": destinatario,
                    "asunto": asunto,
                    "fecha": fecha,
                    "hilo_id": hilo_id[:120],
                    "path_original": path_original,
                },
            })
            chunk_idx += 1
            if end >= len(cuerpo):
                break
            i += CHUNK_SIZE - OVERLAP

    info = {"asunto": asunto, "remitente": remitente, "fecha": fecha, "chars_cuerpo": len(cuerpo)}
    return chunks, info


def _extract_docx_text(path: Path) -> str:
    """
    Extrae texto de un .docx preservando estructura como markdown:
    - Headings -> # / ## / ###
    - Listas con vinetas -> -
    - Listas numeradas -> 1. 2. 3.
    - Tablas -> markdown table (con header si la primera fila parece header)
    """
    try:
        import docx  # python-docx
    except ImportError:
        sys.exit(RED("Falta python-docx. Corre: pip install python-docx"))

    doc = docx.Document(str(path))
    parts: list[str] = []

    # Recorrer el body en orden (parrafos + tablas mezclados)
    # python-docx no expone esto facil; iteramos sobre body element
    from docx.oxml.ns import qn
    body = doc.element.body

    def heading_level(style_name: str) -> int:
        s = style_name.lower()
        if "heading 1" in s or "title" in s or "titulo 1" in s: return 1
        if "heading 2" in s or "titulo 2" in s: return 2
        if "heading 3" in s or "titulo 3" in s: return 3
        if "heading" in s or "titulo" in s: return 4
        return 0

    list_counter = 0
    last_was_list = False

    for child in body.iterchildren():
        tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag

        if tag == "p":
            # Buscar el parrafo correspondiente
            para = None
            for p in doc.paragraphs:
                if p._p is child:
                    para = p
                    break
            if para is None:
                continue
            text = para.text.strip()
            if not text:
                last_was_list = False
                list_counter = 0
                continue
            style = para.style.name if para.style else ""
            lvl = heading_level(style)
            if lvl:
                parts.append(f"\n{'#' * min(lvl, 6)} {text}\n")
                last_was_list = False
                list_counter = 0
            else:
                # Detectar si es item de lista (por pPr/numPr en el XML)
                pPr = para._p.find(qn("w:pPr"))
                numPr = pPr.find(qn("w:numPr")) if pPr is not None else None
                if numPr is not None:
                    # Es lista. Distinguir bullet vs numerada si hay info en numId
                    # Simple: si veniamos en lista, sumar contador
                    if last_was_list:
                        list_counter += 1
                    else:
                        list_counter = 1
                        last_was_list = True
                    # Por simplicidad usamos vinetas
                    parts.append(f"- {text}")
                else:
                    parts.append(text)
                    last_was_list = False
                    list_counter = 0
        elif tag == "tbl":
            tabla = None
            for t in doc.tables:
                if t._tbl is child:
                    tabla = t
                    break
            if tabla is None:
                continue
            rows = []
            for row in tabla.rows:
                cells = [c.text.strip().replace("\n", " ") for c in row.cells]
                if any(cells):
                    rows.append(cells)
            if not rows:
                continue
            n_cols = max(len(r) for r in rows)
            rows = [r + [""] * (n_cols - len(r)) for r in rows]
            # Markdown table con header
            md = ["| " + " | ".join(rows[0]) + " |"]
            md.append("| " + " | ".join(["---"] * n_cols) + " |")
            for r in rows[1:]:
                md.append("| " + " | ".join(r) + " |")
            parts.append("\n".join(md))
            last_was_list = False
            list_counter = 0

    return "\n\n".join(p for p in parts if p.strip())


def _extract_text_file(path: Path, archivo: str, proyecto: str, path_original: str, tipo: str) -> tuple[list[dict], int]:
    """Ingesta de .txt o .md: chunkear el texto crudo con chunks de 1000 chars."""
    text = path.read_text(encoding="utf-8", errors="replace")
    if not text.strip():
        sys.exit(RED(f"El archivo {archivo} esta vacio."))
    CHUNK_SIZE = 1000
    OVERLAP = 200
    chunks = []
    i = 0
    chunk_idx = 0
    while i < len(text):
        end = min(i + CHUNK_SIZE, len(text))
        chunks.append({
            "id": f"{proyecto}__{archivo}__chunk_{chunk_idx}",
            "text": text[i:end],
            "metadata": {
                "archivo": archivo,
                "proyecto": proyecto,
                "tipo": tipo,
                "chunk_index": chunk_idx,
                "char_start": i,
                "char_end": end,
                "pagina": 1,
                "total_paginas": 1,
                "path_original": path_original,
            },
        })
        chunk_idx += 1
        if end >= len(text):
            break
        i += CHUNK_SIZE - OVERLAP
    return chunks, len(chunks)


def cmd_ingest(args):
    src = Path(args.archivo).resolve()
    if not src.exists():
        sys.exit(RED(f"No existe: {src}"))
    suf = src.suffix.lower()
    SUPPORTED = {".pdf", ".docx", ".xlsx", ".xls", ".eml",
                 ".jpg", ".jpeg", ".png", ".gif", ".webp",
                 ".txt", ".md", ".markdown", ".rst",
                 ".ipynb"} | CODE_EXTS
    if suf not in SUPPORTED:
        sys.exit(RED(f"Formato no soportado: {suf}. Soportados: {', '.join(sorted(SUPPORTED))}"))

    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    dest_name = f"{args.proyecto}__{src.name}"
    dest = DOCS_DIR / dest_name
    shutil.copy2(src, dest)
    print(DIM(f"  + Copiado a {dest.relative_to(ROOT)}"))

    if suf == ".pdf":
        chunks, total_pag = _extract_pdf_per_page_chunks(src, src.name, args.proyecto, str(dest))
        if not chunks:
            sys.exit(RED("El PDF no contiene texto extraible (puede ser escaneado - OCR sera Fase 2)."))
        print(DIM(f"  + PDF parseado: {total_pag} paginas, {len(chunks)} chunk(s) con pagina REAL"))
        res = _post_json(
            f"{N8N}/webhook/ingesta-texto",
            {
                "chunks": chunks,
                "archivo": src.name,
                "proyecto": args.proyecto,
                "tipo": "pdf",
                "total_paginas": total_pag,
                "path_original": str(dest),
            },
        )
    elif suf in (".jpg", ".jpeg", ".png", ".gif", ".webp"):
        chunks, preview = _extract_image(src, src.name, args.proyecto, str(dest))
        print(DIM(f"  + Imagen analizada por Claude Vision: {preview[:120]}..."))
        res = _post_json(
            f"{N8N}/webhook/ingesta-texto",
            {
                "chunks": chunks,
                "archivo": src.name,
                "proyecto": args.proyecto,
                "tipo": "imagen",
                "total_paginas": 1,
                "path_original": str(dest),
            },
        )
    elif suf in (".txt", ".md", ".markdown", ".rst"):
        tipo = "markdown" if suf in (".md", ".markdown") else "texto"
        chunks, n = _extract_code_or_text(src, src.name, args.proyecto, str(dest), tipo, code_aware=False)
        print(DIM(f"  + Texto plano ({tipo}): {n} chunk(s)"))
        res = _post_json(
            f"{N8N}/webhook/ingesta-texto",
            {"chunks": chunks, "archivo": src.name, "proyecto": args.proyecto, "tipo": tipo, "total_paginas": 1, "path_original": str(dest)},
        )
    elif suf == ".ipynb":
        text = _extract_ipynb(src)
        if not text.strip():
            sys.exit(RED("El .ipynb no tiene celdas con contenido."))
        # Chunking code-aware (preserva bloques de codigo)
        segments = _chunk_code_aware(text)
        chunks = [{
            "id": f"{args.proyecto}__{src.name}__chunk_{i}",
            "text": seg,
            "metadata": {"archivo": src.name, "proyecto": args.proyecto, "tipo": "ipynb",
                         "chunk_index": i, "pagina": 1, "total_paginas": 1, "path_original": str(dest)},
        } for i, seg in enumerate(segments)]
        print(DIM(f"  + Notebook parseado: {len(chunks)} chunk(s)"))
        res = _post_json(
            f"{N8N}/webhook/ingesta-texto",
            {"chunks": chunks, "archivo": src.name, "proyecto": args.proyecto, "tipo": "ipynb", "total_paginas": 1, "path_original": str(dest)},
        )
    elif suf in CODE_EXTS:
        chunks, n = _extract_code_or_text(src, src.name, args.proyecto, str(dest), "codigo", code_aware=True)
        lenguaje = suf.lstrip(".")
        print(DIM(f"  + Codigo ({lenguaje}): {n} chunk(s) [code-aware]"))
        res = _post_json(
            f"{N8N}/webhook/ingesta-texto",
            {"chunks": chunks, "archivo": src.name, "proyecto": args.proyecto, "tipo": "codigo", "total_paginas": 1, "path_original": str(dest)},
        )
    elif suf == ".eml":
        chunks, info = _extract_eml(src, src.name, args.proyecto, str(dest))
        print(DIM(f"  + Email parseado: \"{info['asunto']}\" de {info['remitente']} ({info['chars_cuerpo']} chars)"))
        res = _post_json(
            f"{N8N}/webhook/ingesta-texto",
            {
                "chunks": chunks,
                "archivo": src.name,
                "proyecto": args.proyecto,
                "tipo": "email",
                "total_paginas": 1,
                "path_original": str(dest),
            },
        )
    elif suf in (".xlsx", ".xls"):
        chunks, total_hojas = _extract_xlsx_chunks(src, src.name, args.proyecto, str(dest))
        if not chunks:
            sys.exit(RED("El Excel no contiene celdas con datos."))
        tiene_formulas = any(c["metadata"].get("tipo") == "xlsx_formulas" for c in chunks)
        modo = "datos+formulas" if tiene_formulas else "datos"
        print(DIM(f"  + Excel parseado: {total_hojas} hoja(s), {len(chunks)} chunk(s), modo: {modo}"))
        res = _post_json(
            f"{N8N}/webhook/ingesta-texto",
            {
                "chunks": chunks,
                "archivo": src.name,
                "proyecto": args.proyecto,
                "tipo": "xlsx",
                "total_paginas": total_hojas,
                "path_original": str(dest),
            },
        )
    else:  # .docx
        text = _extract_docx_text(src)
        if not text.strip():
            sys.exit(RED("El .docx no contiene texto extraible."))
        print(DIM(f"  + Texto extraido del Word ({len(text)} chars)"))
        res = _post_json(
            f"{N8N}/webhook/ingesta-texto",
            {
                "text": text,
                "archivo": src.name,
                "proyecto": args.proyecto,
                "tipo": "docx",
                "path_original": str(dest),
            },
        )
    if "error" in res:
        print(RED(f"X Error de n8n: {res}"))
        return
    print(GREEN(f"  + Indexado en Chroma: {res.get('chunks_guardados', '?')} chunk(s)"))
    print(BOLD(f"\nOK '{src.name}' ingerido en proyecto '{args.proyecto}'."))


def cmd_ask(args):
    payload = {"pregunta": args.pregunta, "proyecto": args.proyecto, "n_results": args.top_k}
    res = _post_json(f"{N8N}/webhook/consulta", payload)
    if "error" in res:
        sys.exit(RED(f"Error: {res}"))

    print()
    print(BOLD(CYAN("? Pregunta: ")) + args.pregunta)
    if args.proyecto:
        print(DIM(f"  (filtrando por proyecto: {args.proyecto})"))
    print()
    print(BOLD(GREEN("> Respuesta:")))
    print(res.get("respuesta", "(sin respuesta)"))

    citas = res.get("citas", [])
    if citas:
        print()
        print(BOLD(YELLOW(f"# Citas ({len(citas)}):")))
        for i, c in enumerate(citas, 1):
            tilde = "" if c.get("pagina_exacta") else "~"
            print(f"  [{i}] {c.get('archivo')} pag {tilde}{c.get('pagina')}/{c.get('total_paginas')} "
                  f"(chunk {c.get('chunk_index')}, dist {c.get('distancia')})")
    if res.get("modo") == "mock":
        print()
        print(DIM("(Respuesta generada por mock - LLM real cuando configures ANTHROPIC_API_KEY)"))


def cmd_ls(args):
    col = _chroma()
    where = {"proyecto": args.proyecto} if args.proyecto else None
    res = col.get(where=where, include=["metadatas"])
    if not res["ids"]:
        msg = f"sin chunks indexados" + (f" en proyecto '{args.proyecto}'" if args.proyecto else "")
        print(DIM(msg))
        return
    # Agrupar por archivo
    by_file = {}
    for meta in res["metadatas"]:
        key = (meta.get("proyecto", "?"), meta.get("archivo", "?"))
        by_file.setdefault(key, {"chunks": 0, "paginas": 0})
        by_file[key]["chunks"] += 1
        by_file[key]["paginas"] = max(by_file[key]["paginas"], meta.get("total_paginas", 0))

    print(BOLD(f"Indexados ({len(by_file)} archivos, {len(res['ids'])} chunks totales):"))
    for (proy, arch), info in sorted(by_file.items()):
        print(f"  {CYAN(proy)}/{arch:<40} {info['chunks']:>4} chunks, {info['paginas']} paginas")


def cmd_rm(args):
    col = _chroma()
    where = {"$and": [{"archivo": args.archivo}, {"proyecto": args.proyecto}]}
    res = col.get(where=where)
    if not res["ids"]:
        print(YELLOW(f"No hay chunks de '{args.archivo}' en proyecto '{args.proyecto}'."))
        return
    col.delete(ids=res["ids"])
    # Borrar copia local
    dest = DOCS_DIR / f"{args.proyecto}__{args.archivo}"
    if dest.exists():
        dest.unlink()
        print(DIM(f"  - Borrado {dest.relative_to(ROOT)}"))
    print(GREEN(f"OK eliminados {len(res['ids'])} chunks de '{args.archivo}'."))


def main():
    p = argparse.ArgumentParser(description="CoWorkerIA CLI")
    sub = p.add_subparsers(dest="cmd", required=True)

    pi = sub.add_parser("ingest", help="Ingerir un PDF al proyecto")
    pi.add_argument("archivo")
    pi.add_argument("--proyecto", required=True)
    pi.set_defaults(func=cmd_ingest)

    pa = sub.add_parser("ask", help="Preguntar sobre el conocimiento indexado")
    pa.add_argument("pregunta")
    pa.add_argument("--proyecto", default=None)
    pa.add_argument("--top-k", type=int, default=5)
    pa.set_defaults(func=cmd_ask)

    pl = sub.add_parser("ls", help="Listar archivos indexados")
    pl.add_argument("--proyecto", default=None)
    pl.set_defaults(func=cmd_ls)

    pr = sub.add_parser("rm", help="Eliminar un archivo (y sus chunks)")
    pr.add_argument("archivo")
    pr.add_argument("--proyecto", required=True)
    pr.set_defaults(func=cmd_rm)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
