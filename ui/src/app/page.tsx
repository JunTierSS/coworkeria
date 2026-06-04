"use client";
import { useEffect, useState, useRef } from "react";
import { useProject } from "@/components/ProjectProvider";
import { Upload, Trash2, FileText, Loader2, Inbox } from "lucide-react";
import clsx from "clsx";

type Doc = {
  proyecto: string;
  archivo: string;
  chunks: number;
  paginas: number;
};

export default function DocumentosPage() {
  const { proyecto, refresh } = useProject();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const subir = async (file: File) => {
    const name = file.name.toLowerCase();
    const ok = name.endsWith(".pdf") || name.endsWith(".docx");
    if (!ok) {
      setUploadMsg("Solo se aceptan archivos PDF o DOCX.");
      return;
    }
    setUploading(true);
    setUploadMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("proyecto", proyecto);
    try {
      const r = await fetch("/api/ingest", { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) {
        setUploadMsg(`Error: ${data.error || "?"}`);
      } else {
        setUploadMsg(`OK: ${file.name} indexado (${data.chunks_guardados ?? "?"} chunks)`);
        await cargar();
        await refresh();
      }
    } catch (e: unknown) {
      setUploadMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setUploading(false);
    }
  };

  const eliminar = async (archivo: string) => {
    if (!confirm(`Eliminar "${archivo}" del proyecto "${proyecto}"?`)) return;
    const r = await fetch(
      `/api/documents?proyecto=${encodeURIComponent(proyecto)}&archivo=${encodeURIComponent(archivo)}`,
      { method: "DELETE" }
    );
    if (r.ok) {
      await cargar();
      await refresh();
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-8">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Documentos</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Proyecto: <span className="font-medium text-zinc-900">{proyecto}</span>
          </p>
        </header>

        {/* Uploader */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) subir(f);
          }}
          onClick={() => inputRef.current?.click()}
          className={clsx(
            "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition",
            dragOver
              ? "border-indigo-500 bg-indigo-50"
              : "border-zinc-300 bg-white hover:border-zinc-400 hover:bg-zinc-50"
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) subir(f);
              e.target.value = "";
            }}
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-2 text-zinc-600">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-sm">Procesando documento... extrayendo texto y generando embeddings</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="w-8 h-8 text-zinc-400" />
              <p className="text-sm font-medium text-zinc-700">
                Arrastra un PDF o DOCX aquí o haz click para seleccionar
              </p>
              <p className="text-xs text-zinc-500">
                Se indexará en el proyecto <strong>{proyecto}</strong>
              </p>
            </div>
          )}
        </div>

        {uploadMsg && (
          <div
            className={clsx(
              "mt-4 px-4 py-2 rounded text-sm",
              uploadMsg.startsWith("OK")
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            )}
          >
            {uploadMsg}
          </div>
        )}

        {/* Lista */}
        <section className="mt-10">
          <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-3">
            Indexados ({docs.length})
          </h2>
          {loading ? (
            <div className="flex items-center gap-2 text-zinc-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
            </div>
          ) : docs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-zinc-400">
              <Inbox className="w-10 h-10" />
              <p className="text-sm">Aún no hay documentos en este proyecto.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {docs.map((d) => (
                <li
                  key={`${d.proyecto}/${d.archivo}`}
                  className="flex items-center gap-3 px-4 py-3 bg-white border border-zinc-200 rounded-lg hover:border-zinc-300 transition group"
                >
                  <FileText className="w-5 h-5 text-zinc-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 truncate">{d.archivo}</p>
                    <p className="text-xs text-zinc-500">
                      {d.chunks} chunks · {d.paginas} páginas
                    </p>
                  </div>
                  <button
                    onClick={() => eliminar(d.archivo)}
                    className="opacity-0 group-hover:opacity-100 transition p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded"
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
