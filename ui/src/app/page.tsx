"use client";
import { useEffect, useState, useRef } from "react";
import { useProject } from "@/components/ProjectProvider";
import { Upload, Trash2, FileText, Loader2, Inbox, FolderUp, CheckCircle2, XCircle } from "lucide-react";
import clsx from "clsx";

type Doc = {
  proyecto: string;
  archivo: string;
  chunks: number;
  paginas: number;
};

type Item = {
  name: string;
  status: "pending" | "uploading" | "done" | "error" | "skipped";
  error?: string;
  chunks?: number;
};

const SUPPORTED = new Set([
  ".pdf", ".docx", ".xlsx", ".xls", ".eml",
  ".jpg", ".jpeg", ".png", ".gif", ".webp",
  ".txt", ".md", ".markdown", ".rst",
  ".ipynb",
  // codigo y configs
  ".py", ".pyi", ".rb", ".php", ".pl",
  ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx",
  ".go", ".rs", ".java", ".kt", ".swift", ".c", ".cpp", ".cc", ".h", ".hpp",
  ".cs", ".scala", ".clj", ".ex", ".exs",
  ".sql", ".graphql", ".gql",
  ".json", ".jsonc", ".yaml", ".yml", ".toml", ".ini", ".env",
  ".xml", ".html", ".htm", ".css", ".scss", ".sass", ".less",
  ".sh", ".bash", ".zsh", ".fish", ".ps1", ".bat", ".cmd",
  ".dockerfile",
]);

// Carpetas/archivos a saltear silenciosamente
const SKIP_PATH_PARTS = new Set([
  "node_modules", ".git", ".next", "__pycache__", ".venv", "venv",
  "dist", "build", ".cache", ".vscode", ".idea", ".turbo", "target", "vendor",
  ".pytest_cache", ".mypy_cache",
]);
const SKIP_FILES = new Set([".DS_Store", "Thumbs.db", ".gitignore"]);

function getExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i).toLowerCase();
}

function shouldSkip(file: File): boolean {
  const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
  for (const part of relativePath.split(/[/\\]/)) {
    if (SKIP_PATH_PARTS.has(part)) return true;
  }
  if (SKIP_FILES.has(file.name)) return true;
  return false;
}

function isSupported(file: File): boolean {
  const ext = getExt(file.name);
  return SUPPORTED.has(ext);
}

export default function DocumentosPage() {
  const { proyecto, refresh } = useProject();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [batchItems, setBatchItems] = useState<Item[]>([]);
  const [batchActive, setBatchActive] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const cargar = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/documents?proyecto=${encodeURIComponent(proyecto)}`);
      const data = await r.json();
      setDocs(data.documentos || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyecto]);

  const subirBatch = async (files: File[]) => {
    // Filtrar
    const items: Item[] = [];
    const toUpload: File[] = [];
    for (const f of files) {
      if (shouldSkip(f)) {
        items.push({ name: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, status: "skipped" });
        continue;
      }
      if (!isSupported(f)) {
        items.push({ name: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, status: "skipped", error: `formato ${getExt(f.name)} no soportado` });
        continue;
      }
      items.push({ name: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, status: "pending" });
      toUpload.push(f);
    }

    if (toUpload.length === 0 && items.every((i) => i.status === "skipped")) {
      setBatchItems(items);
      return;
    }

    setBatchItems(items);
    setBatchActive(true);

    // Subir secuencialmente (mas seguro para no saturar n8n y para visibilidad)
    let processedIdx = -1;
    for (let i = 0; i < items.length; i++) {
      if (items[i].status !== "pending") continue;
      processedIdx++;
      const file = toUpload[processedIdx];
      setBatchItems((prev) =>
        prev.map((it, idx) => (idx === i ? { ...it, status: "uploading" } : it))
      );
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("proyecto", proyecto);
        const r = await fetch("/api/ingest", { method: "POST", body: fd });
        const data = await r.json();
        if (!r.ok) {
          setBatchItems((prev) =>
            prev.map((it, idx) =>
              idx === i ? { ...it, status: "error", error: data.error || `HTTP ${r.status}` } : it
            )
          );
        } else {
          setBatchItems((prev) =>
            prev.map((it, idx) =>
              idx === i ? { ...it, status: "done", chunks: data.chunks_guardados } : it
            )
          );
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setBatchItems((prev) =>
          prev.map((it, idx) =>
            idx === i ? { ...it, status: "error", error: msg } : it
          )
        );
      }
    }

    setBatchActive(false);
    await cargar();
    await refresh();
  };

  // Drag & drop: leer recursivamente si traen items con webkit entries (carpetas)
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files: File[] = [];
    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const promises: Promise<void>[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        type DTEntry = { isFile?: boolean; isDirectory?: boolean; createReader?: () => { readEntries: (cb: (entries: DTEntry[]) => void) => void }; file?: (cb: (f: File) => void) => void; name?: string; fullPath?: string };
        type DTItemWithEntry = DataTransferItem & { webkitGetAsEntry?: () => DTEntry | null };
        const entry = (it as DTItemWithEntry).webkitGetAsEntry?.();
        if (entry && entry.isDirectory) {
          promises.push(walkDirectory(entry, files));
        } else if (entry && entry.isFile && entry.file) {
          promises.push(
            new Promise<void>((resolve) => {
              entry.file!((f) => {
                Object.defineProperty(f, "webkitRelativePath", { value: entry.fullPath?.replace(/^\//, "") || f.name });
                files.push(f);
                resolve();
              });
            })
          );
        } else {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      await Promise.all(promises);
    } else if (e.dataTransfer.files) {
      for (const f of e.dataTransfer.files) files.push(f);
    }
    if (files.length > 0) await subirBatch(files);
  };

  type WalkEntry = { isFile?: boolean; isDirectory?: boolean; createReader?: () => { readEntries: (cb: (entries: WalkEntry[]) => void) => void }; file?: (cb: (f: File) => void) => void; name?: string; fullPath?: string };

  async function walkDirectory(dirEntry: WalkEntry, accumulator: File[]): Promise<void> {
    const reader = dirEntry.createReader!();
    return new Promise<void>((resolve) => {
      const readBatch = () => {
        reader.readEntries(async (entries: WalkEntry[]) => {
          if (entries.length === 0) {
            resolve();
            return;
          }
          await Promise.all(
            entries.map((entry) => {
              if (entry.isDirectory) return walkDirectory(entry, accumulator);
              if (entry.isFile && entry.file) {
                return new Promise<void>((res) => {
                  entry.file!((f) => {
                    Object.defineProperty(f, "webkitRelativePath", { value: entry.fullPath?.replace(/^\//, "") || f.name });
                    accumulator.push(f);
                    res();
                  });
                });
              }
              return Promise.resolve();
            })
          );
          readBatch();
        });
      };
      readBatch();
    });
  }

  const eliminar = async (archivo: string) => {
    if (!confirm(`Eliminar "${archivo}" del proyecto "${proyecto}"?`)) return;
    const r = await fetch(
      `/api/documents?proyecto=${encodeURIComponent(proyecto)}&archivo=${encodeURIComponent(archivo)}`,
      { method: "DELETE" }
    );
    if (r.ok) { await cargar(); await refresh(); }
  };

  const skipped = batchItems.filter((i) => i.status === "skipped").length;
  const done = batchItems.filter((i) => i.status === "done").length;
  const errors = batchItems.filter((i) => i.status === "error").length;
  const total = batchItems.length;
  const remaining = batchItems.filter((i) => i.status === "pending" || i.status === "uploading").length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-4 sm:p-8">
        <header className="mb-6 sm:mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Documentos</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Proyecto: <span className="font-medium text-zinc-900 dark:text-zinc-100">{proyecto}</span>
          </p>
        </header>

        {/* Uploader */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={clsx(
            "border-2 border-dashed rounded-lg p-6 sm:p-8 text-center transition",
            dragOver
              ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
              : "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-zinc-400 dark:hover:border-zinc-600"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const fs = Array.from(e.target.files || []);
              if (fs.length) subirBatch(fs);
              e.target.value = "";
            }}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            // @ts-expect-error - webkitdirectory no esta tipado nativamente
            webkitdirectory=""
            directory=""
            className="hidden"
            onChange={(e) => {
              const fs = Array.from(e.target.files || []);
              if (fs.length) subirBatch(fs);
              e.target.value = "";
            }}
          />
          <div className="flex flex-col items-center gap-3">
            <Upload className="w-8 h-8 text-zinc-400 dark:text-zinc-500" />
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              Arrastrá archivos o carpetas, o usá los botones
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs px-3 py-1.5 rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-300 flex items-center gap-1.5"
              >
                <Upload className="w-3 h-3" />
                Seleccionar archivos
              </button>
              <button
                onClick={() => folderInputRef.current?.click()}
                className="text-xs px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-1.5"
              >
                <FolderUp className="w-3 h-3" />
                Seleccionar carpeta
              </button>
            </div>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 max-w-md">
              PDF · Word · Excel · email (.eml) · imágenes · markdown · .ipynb · código (Python, JS/TS, SQL, JSON, YAML, etc.)<br />
              Se saltan automáticamente: <code>node_modules/</code>, <code>.git/</code>, <code>__pycache__/</code>, etc.
            </p>
          </div>
        </div>

        {/* Batch progress */}
        {batchItems.length > 0 && (
          <div className="mt-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800">
              <div className="text-xs">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {batchActive ? "Subiendo..." : "Resultado"}
                </span>
                <span className="text-zinc-500 dark:text-zinc-400 ml-2">
                  {done} OK · {errors} errores · {skipped} salteados
                  {remaining > 0 && ` · ${remaining} pendientes`}
                  {total > 0 && ` de ${total}`}
                </span>
              </div>
              {!batchActive && (
                <button
                  onClick={() => setBatchItems([])}
                  className="text-[10px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  cerrar
                </button>
              )}
            </div>
            <div className="max-h-60 overflow-y-auto">
              {batchItems.map((it, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-4 py-1.5 text-xs border-b border-zinc-50 dark:border-zinc-800 last:border-b-0"
                >
                  <div className="w-4 shrink-0">
                    {it.status === "done" && <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
                    {it.status === "error" && <XCircle className="w-3.5 h-3.5 text-red-600" />}
                    {it.status === "uploading" && <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />}
                    {it.status === "pending" && <span className="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-600 block" />}
                    {it.status === "skipped" && <span className="text-[8px] text-zinc-400">—</span>}
                  </div>
                  <span
                    className={clsx(
                      "flex-1 font-mono truncate",
                      it.status === "skipped" ? "text-zinc-400 dark:text-zinc-600 line-through" :
                      it.status === "error" ? "text-red-700 dark:text-red-400" :
                      it.status === "done" ? "text-zinc-700 dark:text-zinc-300" :
                      "text-zinc-900 dark:text-zinc-100"
                    )}
                  >
                    {it.name}
                  </span>
                  {it.status === "done" && it.chunks !== undefined && (
                    <span className="text-zinc-500 dark:text-zinc-400 text-[10px]">
                      {it.chunks} chunks
                    </span>
                  )}
                  {it.error && it.status === "error" && (
                    <span className="text-red-600 dark:text-red-400 text-[10px] truncate max-w-[200px]">
                      {it.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lista de docs */}
        <section className="mt-10">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">
            Indexados ({docs.length})
          </h2>
          {loading ? (
            <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
            </div>
          ) : docs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-zinc-400 dark:text-zinc-500">
              <Inbox className="w-10 h-10" />
              <p className="text-sm">Aún no hay documentos en este proyecto.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {docs.map((d) => (
                <li
                  key={`${d.proyecto}/${d.archivo}`}
                  className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:border-zinc-300 dark:hover:border-zinc-700 transition group"
                >
                  <FileText className="w-5 h-5 text-zinc-400 dark:text-zinc-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{d.archivo}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {d.chunks} chunks · {d.paginas} páginas
                    </p>
                  </div>
                  <button
                    onClick={() => eliminar(d.archivo)}
                    className="md:opacity-0 md:group-hover:opacity-100 transition p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/30 rounded"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
