# CoWorkerIA 🧠

> Tu segundo cerebro para proyectos e investigación. Guarda tus documentos, pregúntale como a un colega experto, y recibe respuestas con **fuente exacta** — sin invenciones.

CoWorkerIA es un asistente de conocimiento **local-first** construido sobre **n8n**. Ingiere documentos (PDF, Word, texto, y más), los organiza automáticamente por temas, y permite consultarlos en lenguaje natural mediante RAG (Retrieval-Augmented Generation). Cada respuesta cita el documento, la página y el párrafo de origen.

**Estado:** 🚧 En desarrollo — MVP (Fase 1).

---

## El problema

Cuando trabajas en investigación o en un proyecto grande, acumulas decenas o cientos de documentos. La información existe, pero se pierde: ¿en qué paper leíste *ese* dato? ¿cuál es la versión vigente de ese requerimiento que cambió por correo? Buscar consume más tiempo que usar.

Las soluciones actuales (carpetas, Ctrl+F, copiar/pegar a un chatbot) no organizan solas, no citan con precisión, y no entienden que **la información evoluciona en el tiempo**.

## La solución

Un asistente que:

- 🗂️ **Ingiere y organiza** tus fuentes automáticamente por temas.
- 💬 **Responde preguntas** en lenguaje natural sobre todo tu conocimiento.
- 📎 **Cita la fuente exacta** (documento → página → párrafo) en cada respuesta.
- 🚫 **Nunca inventa.** Si no está en tus fuentes, lo dice.
- 🧐 **Es crítico:** señala debilidades y contradicciones para mejorar tus ideas.
- 🔒 **Local-first:** tus documentos no salen de tu máquina (solo la inferencia de IA usa la nube).

## Diferenciador

A diferencia de "chatea con tus PDFs", CoWorkerIA rastrea **cómo evoluciona la información en el tiempo**: detecta cuándo una fuente nueva contradice una anterior, te alerta, y muestra un timeline de cómo cambió la verdad. *(Visión — Fase 3 del roadmap.)*

---

## Arquitectura (MVP)

```
INGESTA:  Documento → [n8n: extraer texto] → [chunking] → [embeddings vía API] → [base vectorial local]

CONSULTA: Pregunta → [embedding] → [búsqueda vectorial] → [contexto + LLM] → Respuesta con citas
```

**Stack:** n8n (orquestación) · base vectorial local (Qdrant/Chroma) · embeddings y LLM vía API (Claude) · agente RAG con LangChain.

Ver [`docs/PRD.md`](docs/PRD.md) para la especificación completa de producto y [`docs/ROADMAP.md`](docs/ROADMAP.md) para el plan de construcción.

---

## Roadmap

| Fase | Foco |
|---|---|
| **1 — MVP** ✅ en curso | RAG + lector PDF/Word/texto + citas + n8n |
| **2 — Más fuentes** | OCR, Excels, correos (Gmail/Outlook), búsqueda web |
| **3 — Inteligencia temporal** | Timeline de evolución + detección de contradicciones |
| **4 — Visualización** | Mapa de clusters + extensión de navegador |
| **5 — Colaboración** | Modo equipo |

---

## Cómo correr el MVP

**Requisitos:** Node ≥ 18, Python ≥ 3.11, una API key de [OpenRouter](https://openrouter.ai/keys).

### 1. Configurar `.env`

```bash
cp .env.example .env
# Editar .env y poner tu OPENROUTER_API_KEY
# (cubre LLM y embeddings con una sola key)
```

### 2. Levantar los tres servicios (en tres terminales)

```bash
# Terminal A — Chroma (base vectorial local)
pip install chromadb reportlab python-dotenv
chroma run --path ./data/vectordb --host localhost --port 8000
```

```bash
# Terminal B — crear colección + setear ID en .env (una vez)
python -c "
import chromadb, re
from pathlib import Path
c = chromadb.HttpClient(host='localhost', port=8000)
col = c.get_or_create_collection('coworkeria')
env = Path('.env').read_text(encoding='utf-8')
env = re.sub(r'^CHROMA_COLLECTION_ID=.*$', f'CHROMA_COLLECTION_ID={col.id}', env, flags=re.MULTILINE)
Path('.env').write_text(env, encoding='utf-8')
print(f'Coleccion: {col.id}')
"
```

```bash
# Terminal C — n8n (orquestador) con env vars cargadas
set -a && source .env && set +a && export N8N_BLOCK_ENV_ACCESS_IN_NODE=false && npx n8n
#   → corre en http://localhost:5678
#   primer arranque ~3min; crear cuenta de owner (local, no se manda a internet)
```

### 3. Importar los workflows en n8n

UI de n8n (`localhost:5678`) → menú **⋮** → **Import from File**:
- `n8n/workflows/ingesta_pdf.json`
- `n8n/workflows/consulta_rag.json`

Activar ambos con el toggle.

### 4. Usar el CLI o la Web UI

**CLI:**
```bash
python scripts/coworkeria.py ingest mi_paper.pdf --proyecto tesis
python scripts/coworkeria.py ask "Cuál es la tesis principal?" --proyecto tesis
python scripts/coworkeria.py ls
python scripts/coworkeria.py rm mi_paper.pdf --proyecto tesis
```

**Web UI (Next.js):**
```bash
cd ui
cp ../.env.local.example .env.local 2>/dev/null || python -c "
from pathlib import Path
env = Path('../.env').read_text(encoding='utf-8')
keep = {}
for line in env.splitlines():
    if '=' in line and not line.startswith('#'):
        k, v = line.split('=', 1)
        if k.strip() in ('N8N_URL', 'CHROMA_URL', 'CHROMA_COLLECTION_ID'):
            keep[k.strip()] = v.strip()
Path('.env.local').write_text('\n'.join(f'{k}={v}' for k,v in keep.items()), encoding='utf-8')
"
npm install
npm run dev
# → http://localhost:3000
```

### Estado del MVP por funcionalidad del PRD

| # | Función | Estado |
|---|---|---|
| F1 | Guardar documento | ✅ PDF (Word → Fase 2) |
| F2 | Procesamiento automático | ✅ chunking + embed (OpenAI text-embedding-3-small) + store |
| F3 | Chat sobre el conocimiento | ✅ Claude Sonnet 4 vía OpenRouter |
| F4 | Búsqueda semántica | ✅ Chroma query con filtro por proyecto |
| F5 | Citas exactas | ✅ archivo + página aprox + chunk_index, inline `[archivo, pag. N]` |
| F6 | Modo conservador | ✅ "no encontré eso en tus fuentes" cuando vacío |
| F7 | Modo crítico | ✅ Claude detecta debilidades + contradicciones en la sección "Observación crítica" |
| F8 | Gestión de documentos | ✅ ls + rm + copia local en `data/documentos/` + UI con drag&drop |
| F9 | Concepto de proyecto/tema | ✅ selector de proyecto en sidebar; filtro `--proyecto` en CLI |

### Stack final

| Capa | Tecnología | Notas |
|---|---|---|
| Orquestación | **n8n** local | 2 workflows: ingesta PDF, consulta RAG |
| Base vectorial | **Chroma** local (Python) | Reemplazó Qdrant por fricción con Docker Desktop |
| LLM | **Claude Sonnet 4** vía OpenRouter | ~$0.0001 por respuesta |
| Embeddings | **OpenAI text-embedding-3-small** vía OpenRouter | 1536 dims |
| CLI | Python stdlib (sin deps externas para el wrapper) | ingest / ask / ls / rm |
| Web UI | **Next.js 16 + Tailwind v4** | Sidebar + Documentos + Chat con citas inline |

---

## Sobre este proyecto

CoWorkerIA es un proyecto que combina **ingeniería de IA** (RAG, embeddings, agentes, orquestación) con **pensamiento de producto** (PRD, scope disciplinado, métricas). Nace de un dolor real: gestionar la información de una tesis de magíster sin perderse en ella.

Forma parte de la familia de productos **CoWorker**.

---

## Licencia

Por definir.
