import { NextRequest, NextResponse } from "next/server";
import { chromaBase } from "@/lib/config";

export const runtime = "nodejs";

type ChromaGetResponse = {
  ids: string[];
  metadatas: Record<string, unknown>[] | null;
};

type DocSummary = {
  proyecto: string;
  archivo: string;
  chunks: number;
  paginas: number;
};

export async function GET(req: NextRequest) {
  const proyecto = req.nextUrl.searchParams.get("proyecto");

  const payload: Record<string, unknown> = { include: ["metadatas"], limit: 10000 };
  if (proyecto) payload.where = { proyecto };

  try {
    const res = await fetch(`${chromaBase()}/get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text();
      return NextResponse.json({ error: `chroma ${res.status}`, body: txt }, { status: 502 });
    }
    const data: ChromaGetResponse = await res.json();

    const docMap = new Map<string, DocSummary>();
    const proyectos = new Set<string>();
    for (const meta of data.metadatas || []) {
      const m = meta as Record<string, string | number>;
      const proy = String(m.proyecto ?? "default");
      const arch = String(m.archivo ?? "?");
      proyectos.add(proy);
      const key = `${proy}::${arch}`;
      const cur = docMap.get(key);
      if (cur) {
        cur.chunks++;
        cur.paginas = Math.max(cur.paginas, Number(m.total_paginas ?? 0));
      } else {
        docMap.set(key, {
          proyecto: proy,
          archivo: arch,
          chunks: 1,
          paginas: Number(m.total_paginas ?? 0),
        });
      }
    }
    return NextResponse.json({
      total_chunks: (data.ids || []).length,
      documentos: Array.from(docMap.values()).sort((a, b) =>
        a.proyecto.localeCompare(b.proyecto) || a.archivo.localeCompare(b.archivo)
      ),
      proyectos: Array.from(proyectos).sort(),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const proyecto = req.nextUrl.searchParams.get("proyecto");
  const archivo = req.nextUrl.searchParams.get("archivo");
  if (!proyecto || !archivo) {
    return NextResponse.json({ error: "Faltan params proyecto y archivo" }, { status: 400 });
  }

  try {
    const res = await fetch(`${chromaBase()}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ where: { $and: [{ proyecto }, { archivo }] } }),
    });
    if (!res.ok) {
      const txt = await res.text();
      return NextResponse.json({ error: `chroma ${res.status}`, body: txt }, { status: 502 });
    }
    return NextResponse.json({ status: "ok" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
