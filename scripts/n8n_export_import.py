"""
Utilidades para versionar workflows de n8n en el repo y crearlos desde JSON.

Uso:
  python scripts/n8n_export_import.py export   -> guarda todos los workflows en n8n/workflows/
  python scripts/n8n_export_import.py import <file.json>  -> crea el workflow en n8n

Requiere N8N_API_KEY exportada como env var (NO commitear).
"""
import json
import os
import sys
import re
from pathlib import Path
import urllib.request
import urllib.error

N8N_BASE = "http://localhost:5678"
WORKFLOWS_DIR = Path(__file__).resolve().parent.parent / "n8n" / "workflows"

# Campos generados por n8n al persistir, no deben commitearse
NOISY_FIELDS = {
    "id", "createdAt", "updatedAt", "versionId", "activeVersionId",
    "triggerCount", "isArchived", "active", "shared", "tags",
    "projectId", "homeProject", "activeVersion", "staticData",
    "pinData", "meta", "description",
}


def _api_key() -> str:
    key = os.environ.get("N8N_API_KEY")
    if not key:
        sys.exit("ERROR: export N8N_API_KEY antes de correr este script.")
    return key


def _request(method: str, path: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(
        f"{N8N_BASE}{path}",
        method=method,
        headers={
            "X-N8N-API-KEY": _api_key(),
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        data=json.dumps(body).encode() if body else None,
    )
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        sys.exit(f"ERROR {e.code}: {body}")


def _clean(workflow: dict) -> dict:
    """Quita campos efímeros para producir un JSON limpio versionable."""
    clean = {k: v for k, v in workflow.items() if k not in NOISY_FIELDS}
    # Limpia ids internos efímeros de webhooks
    for node in clean.get("nodes", []):
        node.pop("webhookId", None)
    return clean


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def cmd_export():
    WORKFLOWS_DIR.mkdir(parents=True, exist_ok=True)
    data = _request("GET", "/api/v1/workflows")
    workflows = data.get("data", [])
    if not workflows:
        print("No hay workflows en n8n.")
        return
    for wf in workflows:
        clean = _clean(wf)
        slug = _slug(clean["name"])
        path = WORKFLOWS_DIR / f"{slug}.json"
        path.write_text(json.dumps(clean, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"  -> {path.relative_to(WORKFLOWS_DIR.parent.parent)}")
    print(f"\nExportados {len(workflows)} workflow(s).")


def cmd_import(filepath: str):
    p = Path(filepath)
    if not p.exists():
        sys.exit(f"No existe: {p}")
    wf = json.loads(p.read_text(encoding="utf-8"))
    # n8n exige solo name + nodes + connections + settings al crear
    payload = {
        "name": wf["name"],
        "nodes": wf["nodes"],
        "connections": wf["connections"],
        "settings": wf.get("settings", {"executionOrder": "v1"}),
    }
    result = _request("POST", "/api/v1/workflows", payload)
    print(f"Creado workflow id={result.get('id')} name={result.get('name')}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    cmd = sys.argv[1]
    if cmd == "export":
        cmd_export()
    elif cmd == "import" and len(sys.argv) >= 3:
        cmd_import(sys.argv[2])
    else:
        sys.exit(__doc__)
