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


def _extract_docx_text(path: Path) -> str:
    """Extrae texto plano de un .docx preservando estructura basica."""
    try:
        import docx  # python-docx
    except ImportError:
        sys.exit(RED("Falta python-docx. Corre: pip install python-docx"))
    doc = docx.Document(str(path))
    parts: list[str] = []
    for p in doc.paragraphs:
        t = p.text.strip()
        if not t:
            continue
        # Hint visual de seccion: marca headings con doble salto
        style = (p.style.name or "").lower() if p.style else ""
        if "heading" in style or "titulo" in style:
            parts.append(f"\n\n{t}\n")
        else:
            parts.append(t)
    # Tambien extrae texto de tablas
    for table in doc.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells if c.text.strip()]
            if cells:
                parts.append(" | ".join(cells))
    return "\n\n".join(parts)


def cmd_ingest(args):
    src = Path(args.archivo).resolve()
    if not src.exists():
        sys.exit(RED(f"No existe: {src}"))
    suf = src.suffix.lower()
    if suf not in (".pdf", ".docx"):
        sys.exit(RED(f"Formato no soportado: {suf}. Soportados: .pdf, .docx"))

    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    dest_name = f"{args.proyecto}__{src.name}"
    dest = DOCS_DIR / dest_name
    shutil.copy2(src, dest)
    print(DIM(f"  + Copiado a {dest.relative_to(ROOT)}"))

    if suf == ".pdf":
        res = _post_multipart(
            f"{N8N}/webhook/ingesta-pdf", src,
            {"proyecto": args.proyecto, "path_original": str(dest)},
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
            print(f"  [{i}] {c.get('archivo')} pag ~{c.get('pagina')}/{c.get('total_paginas')} "
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
