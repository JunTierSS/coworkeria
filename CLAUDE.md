# CLAUDE.md — Briefing para Claude Code

> Este archivo es el contexto que debes leer antes de trabajar en este repositorio. Define qué es el proyecto, cómo está organizado, y **cómo debemos trabajar juntos**.

---

## 1. Qué es CoWorkerIA

CoWorkerIA es un asistente de conocimiento **local-first** que convierte documentos desordenados (PDFs, Word, texto, y más adelante correos, Excels, web) en un "segundo cerebro" consultable mediante RAG. El usuario guarda fuentes, el sistema las procesa y organiza, y responde preguntas en lenguaje natural **con citas a la fuente exacta, sin inventar nunca**.

Diferenciador central (visión): rastrear cómo **evoluciona la información en el tiempo** (timeline + detección de contradicciones).

Es un **prototipo / producto técnico para portafolio**, NO un SaaS comercial. No hay cuentas, facturación ni infraestructura de negocio.

Pertenece a la familia de productos **CoWorker** (junto a CoWorkerPOS). No confundir ambos.

**El detalle completo del producto está en `docs/PRD.md`. Léelo antes de proponer arquitectura o código.**

---

## 2. Cómo trabajamos — MODO B (IMPORTANTE)

Trabajamos en **Modo B: el desarrollador ejecuta, tú (Claude Code) asistes paso a paso.**

Reglas de colaboración que debes seguir SIEMPRE:

1. **No te adelantes.** Avanza una etapa a la vez. No construyas tres pasos de golpe.
2. **Explica antes de actuar.** Antes de cada cambio o comando, explica QUÉ vas a hacer y POR QUÉ, en lenguaje claro.
3. **El desarrollador ejecuta los comandos.** Propón los comandos; deja que él los corra y te reporte el resultado. No asumas que un comando funcionó: espera confirmación.
4. **Una pregunta a la vez cuando necesites decidir algo.** No satures con cinco preguntas.
5. **Prioriza el aprendizaje.** Este proyecto es también para aprender. Explica los conceptos nuevos (n8n, embeddings, RAG, base vectorial) cuando aparezcan, sin asumir conocimiento previo.
6. **Favorece acciones concretas sobre explicaciones largas.** Explica lo justo, luego propón el paso concreto.
7. **Confirma antes de acciones irreversibles** (borrar archivos, sobreescribir, instalar globalmente).

El objetivo es trabajar EN SINTONÍA, no que construyas solo.

---

## 3. Principios de diseño del producto (no negociables)

Estos principios guían TODA decisión técnica:

1. **Nunca inventa.** Si no hay información en las fuentes, el sistema responde "no encontré eso en tus fuentes". Ultra-conservador con los hechos. Preferible callar a alucinar.
2. **Siempre cita.** Toda afirmación va anclada a su fuente exacta: documento → página → párrafo. La metadata de posición se guarda desde la ingesta.
3. **Es crítico, no complaciente.** El agente señala debilidades, contradicciones y supuestos no verificados para mejorar las ideas del usuario.
4. **Local-first.** Documentos y base vectorial viven locales. La nube se usa solo para inferencia de IA (embeddings + LLM vía API).
5. **Se organiza solo.** El sistema sugiere estructura (temas/clusters); el usuario también puede etiquetar manualmente. Ambos coexisten.
6. **La verdad tiene fecha.** La información se trata como algo que evoluciona.

---

## 4. Stack tecnológico

> Propuesto en el PRD; **a validar en la Sesión 0** antes de comprometer.

| Capa | Tecnología | Estado |
|---|---|---|
| Orquestación | **n8n** (self-hosted local, vía npx/Docker) | Centro del proyecto |
| Extracción PDF/Word | librerías de parsing | A validar |
| Chunking | nodos n8n / código JS | A definir parámetros |
| Embeddings | API (OpenAI `text-embedding-3` o equiv.) | A validar costo/calidad |
| Base vectorial | **Qdrant** o **Chroma** (local) | Decidir en Sesión 0 |
| LLM (generación) | Claude (Anthropic API) | Confirmado |
| Agente | nodo AI Agent de n8n (LangChain) | Confirmado |
| Interfaz | Chat del propio n8n para el MVP; UI propia después | A definir |

**No cambies el stack sin avisar y justificar.** Si propones una alternativa, explica el trade-off y deja que el desarrollador decida.

---

## 5. Alcance del MVP (Fase 1)

Construimos SOLO esto primero. Todo lo demás está en `docs/ROADMAP.md` y NO debe colarse al MVP.

**Las 3 capacidades núcleo:**
1. Chatbot RAG (preguntar y recibir respuestas con citas)
2. Lector de documentos (PDF, Word, texto pegado)
3. Orquestación en n8n (pipeline completo: ingesta → chunking → embeddings → base vectorial → consulta)

**Funcionalidades MVP:** guardar documento, procesamiento automático, chat + búsqueda, citas exactas, modo conservador, modo crítico, gestión de documentos (ver/abrir/borrar), concepto de proyecto/tema.

**FUERA del MVP (NO construir aún):** OCR, Excels, correos Gmail/Outlook, búsqueda web, timeline evolutivo, detección de contradicciones, mapa de clusters, extensión de navegador, modo equipo.

---

## 6. Estructura del repositorio

```
coworkeria/
├── CLAUDE.md           # Este archivo (briefing)
├── README.md           # Cara pública + arranque
├── docs/
│   ├── PRD.md          # Product Requirements Document
│   └── ROADMAP.md      # Plan por fases y sesiones
├── n8n/
│   └── workflows/      # Workflows de n8n exportados (JSON)
├── src/
│   ├── ingesta/        # Código de la pipeline de ingesta
│   ├── consulta/       # Código de la pipeline de consulta RAG
│   └── ui/             # Interfaz (si se construye propia)
├── data/
│   ├── documentos/     # Documentos originales (NO se versiona)
│   └── vectordb/       # Base vectorial local (NO se versiona)
├── tests/              # Pruebas (incluido el set de preguntas de validación)
├── .gitignore
└── .env.example        # Plantilla de variables de entorno (sin secrets)
```

---

## 7. Seguridad y secrets

- **NUNCA** subir API keys, tokens ni `.env` al repo. Usar `.env.example` como plantilla.
- Los documentos del usuario (`data/`) son privados y NO se versionan.
- Local-first: no enviar datos del usuario a ningún servicio salvo la llamada explícita a la API de IA.

---

## 8. Estado actual

- ✅ PRD definido (v1.0)
- ✅ Roadmap definido
- ✅ Estructura del repo creada
- ⬜ **Próximo paso: Sesión 0 — validar stack (acceso a n8n, elegir base vectorial, confirmar APIs)**
- ⬜ Sesión 1 — primer workflow de ingesta en n8n

Ver `docs/ROADMAP.md` para el plan de sesiones detallado.
