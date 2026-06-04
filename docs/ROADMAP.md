# ROADMAP — CoWorkerIA

Plan de construcción por fases y sesiones. El MVP es la Fase 1. Las fases siguientes son la visión del producto y no deben colarse al MVP.

---

## Visión general de fases

| Fase | Foco | Entregable |
|---|---|---|
| **1 — MVP** | El núcleo RAG funciona | Chatbot RAG + lector PDF/Word/texto + n8n + citas + modos conservador/crítico |
| **2 — Más fuentes** | Cubrir el caso real completo | OCR, Excels (datos+fórmulas), correos (Gmail/Outlook), búsqueda web mixta |
| **3 — Inteligencia temporal** | El diferenciador | Timeline de evolución + detección de contradicciones (alerta + decisión del usuario) |
| **4 — Visualización e ingesta** | Experiencia | Mapa de clusters auto-organizado + extensión de navegador |
| **5 — Colaboración** | Escalar a equipos | Cerebro compartido, fuentes y correos de equipo |

---

## Plan de sesiones — Fase 1 (MVP)

Trabajamos en **Modo B**: el desarrollador ejecuta, Claude Code asiste paso a paso. Cada sesión termina con algo verificable.

### Sesión 0 — Validar el stack
**Objetivo:** confirmar que todas las piezas están disponibles antes de construir.
- Verificar Node ≥ 18.
- Levantar n8n local (npx) y confirmar acceso en `localhost:5678`.
- Decidir base vectorial: Qdrant vs Chroma (prueba rápida de cuál es más simple de correr local).
- Confirmar acceso a API de embeddings y a la API de Claude (keys en `.env`).
- **Hito:** n8n corriendo + decisiones de stack cerradas.

### Sesión 1 — Primer workflow de ingesta (texto)
**Objetivo:** el camino más corto de ingesta, sin archivos todavía.
- Crear workflow en n8n: recibir texto pegado → chunking → embeddings → guardar en base vectorial.
- Verificar que los vectores se guardan con su metadata.
- **Hito:** pegar un texto y verlo almacenado como vectores.

### Sesión 2 — Ingesta de PDF y Word
**Objetivo:** sumar extracción de archivos.
- Agregar extracción de texto de PDF (con número de página) y Word.
- Conectar al chunking ya existente.
- **Hito:** subir un PDF y verlo procesado con metadata de página.

### Sesión 3 — Workflow de consulta (RAG)
**Objetivo:** preguntar y recibir respuesta fundamentada.
- Crear workflow: pregunta → embedding → búsqueda vectorial → contexto → LLM → respuesta.
- Implementar el principio "nunca inventa" en el prompt.
- **Hito:** hacer una pregunta y recibir respuesta basada en los documentos.

### Sesión 4 — Citas exactas
**Objetivo:** que cada respuesta cite fuente.
- Incluir en la respuesta: documento + página + extracto.
- Validar que la cita apunta al chunk correcto.
- **Hito:** respuestas con cita verificable.

### Sesión 5 — Modo crítico + gestión de documentos
**Objetivo:** personalidad del agente y manejo básico.
- Añadir el comportamiento crítico (señalar debilidades/contradicciones).
- Listar documentos, abrir original, borrar (con sus embeddings).
- **Hito:** agente crítico + gestión funcionando.

### Sesión 6 — Proyectos/temas + etiquetado
**Objetivo:** organización.
- Agrupar documentos por proyecto/tema.
- Etiquetado manual + sugerencia automática básica.
- **Hito:** documentos organizados por tema.

### Sesión 7 — Validación y pulido
**Objetivo:** medir que el MVP cumple su métrica #1.
- Crear set de preguntas de prueba sobre documentos conocidos.
- Medir precisión de recuperación y tasa de "no inventar".
- Pulir prompts y parámetros de chunking según resultados.
- **Hito:** MVP validado y listo para mostrar en portafolio.

---

## Decisiones confirmadas (no reabrir sin motivo)

- **Arquitectura:** local-first, IA por API.
- **n8n** es el centro de la orquestación.
- **MVP individual**; modo equipo es Fase 5.
- **Formatos MVP:** PDF, Word, texto. (OCR/Excel/correo → Fase 2.)
- **Búsqueda web:** mixta (a pedido + automática) → Fase 2.
- **Contradicciones:** alerta + decisión del usuario → Fase 3.
- **Excels:** datos + fórmulas, ambos → Fase 2.

## Decisiones abiertas (cerrar al construir)

- Base vectorial definitiva (Qdrant vs Chroma) → Sesión 0.
- Modelo de embeddings (costo vs calidad) → Sesión 0/1.
- ¿Interfaz en la UI de n8n o propia? → tras Sesión 3.
- ¿Cita a "párrafo exacto" alcanzable en MVP o se ajusta a "página"? → Sesión 4.
