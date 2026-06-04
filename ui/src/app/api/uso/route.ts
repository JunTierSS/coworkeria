import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import type { UsoRecord } from "@/lib/uso";

export const runtime = "nodejs";

const LOG_PATH = path.resolve(process.cwd(), "..", "data", "uso.jsonl");

function leerLog(): UsoRecord[] {
  if (!fs.existsSync(LOG_PATH)) return [];
  const content = fs.readFileSync(LOG_PATH, "utf-8");
  const out: UsoRecord[] = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // skip linea corrupta
    }
  }
  return out;
}

function fechaSolo(iso: string): string {
  return iso.slice(0, 10);
}

function mesSolo(iso: string): string {
  return iso.slice(0, 7);
}

export async function GET() {
  const records = leerLog();
  const ahora = new Date();
  const mesActual = ahora.toISOString().slice(0, 7);
  const inicioMes = `${mesActual}-01`;

  const delMes = records.filter((r) => r.ts >= inicioMes);

  // Totales
  const totalMesUsd = delMes.reduce((a, r) => a + (r.cost_usd || 0), 0);
  const totalMesTokens = delMes.reduce((a, r) => a + (r.total_tokens || 0), 0);
  const totalHistoricoUsd = records.reduce((a, r) => a + (r.cost_usd || 0), 0);

  // Por tipo
  const porTipo = new Map<string, { count: number; cost: number; tokens: number }>();
  for (const r of delMes) {
    const k = r.tipo;
    const cur = porTipo.get(k) || { count: 0, cost: 0, tokens: 0 };
    cur.count++;
    cur.cost += r.cost_usd || 0;
    cur.tokens += r.total_tokens || 0;
    porTipo.set(k, cur);
  }
  const porTipoArr = Array.from(porTipo.entries())
    .map(([tipo, v]) => ({ tipo, ...v }))
    .sort((a, b) => b.cost - a.cost);

  // Por modelo
  const porModelo = new Map<string, { count: number; cost: number; tokens: number }>();
  for (const r of delMes) {
    const k = r.modelo || "?";
    const cur = porModelo.get(k) || { count: 0, cost: 0, tokens: 0 };
    cur.count++;
    cur.cost += r.cost_usd || 0;
    cur.tokens += r.total_tokens || 0;
    porModelo.set(k, cur);
  }
  const porModeloArr = Array.from(porModelo.entries())
    .map(([modelo, v]) => ({ modelo, ...v }))
    .sort((a, b) => b.cost - a.cost);

  // Por proyecto
  const porProyecto = new Map<string, { count: number; cost: number; tokens: number }>();
  for (const r of delMes) {
    const k = r.proyecto || "(global)";
    const cur = porProyecto.get(k) || { count: 0, cost: 0, tokens: 0 };
    cur.count++;
    cur.cost += r.cost_usd || 0;
    cur.tokens += r.total_tokens || 0;
    porProyecto.set(k, cur);
  }
  const porProyectoArr = Array.from(porProyecto.entries())
    .map(([proyecto, v]) => ({ proyecto, ...v }))
    .sort((a, b) => b.cost - a.cost);

  // Por día (últimos 30)
  const porDia = new Map<string, { count: number; cost: number }>();
  const desde = new Date(ahora);
  desde.setDate(desde.getDate() - 29);
  for (let d = new Date(desde); d <= ahora; d.setDate(d.getDate() + 1)) {
    const f = d.toISOString().slice(0, 10);
    porDia.set(f, { count: 0, cost: 0 });
  }
  for (const r of records) {
    const f = fechaSolo(r.ts);
    if (!porDia.has(f)) continue;
    const cur = porDia.get(f)!;
    cur.count++;
    cur.cost += r.cost_usd || 0;
  }
  const porDiaArr = Array.from(porDia.entries()).map(([fecha, v]) => ({ fecha, ...v }));

  // Top archivos consumidores (ingestas más caras)
  const porArchivo = new Map<string, { count: number; cost: number }>();
  for (const r of records) {
    if (!r.archivo) continue;
    const k = `${r.proyecto || "(global)"}/${r.archivo}`;
    const cur = porArchivo.get(k) || { count: 0, cost: 0 };
    cur.count++;
    cur.cost += r.cost_usd || 0;
    porArchivo.set(k, cur);
  }
  const topArchivos = Array.from(porArchivo.entries())
    .map(([archivo, v]) => ({ archivo, ...v }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 10);

  // Proyección mensual
  const diasDelMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate();
  const diaDelMes = ahora.getDate();
  const proyeccionMesUsd = diaDelMes > 0 ? (totalMesUsd / diaDelMes) * diasDelMes : 0;

  // Ultimos eventos
  const recientes = records.slice(-20).reverse();

  return NextResponse.json({
    mes_actual: mesActual,
    total_mes_usd: Number(totalMesUsd.toFixed(4)),
    total_mes_tokens: totalMesTokens,
    total_historico_usd: Number(totalHistoricoUsd.toFixed(4)),
    proyeccion_mes_usd: Number(proyeccionMesUsd.toFixed(4)),
    total_records: records.length,
    por_tipo: porTipoArr,
    por_modelo: porModeloArr,
    por_proyecto: porProyectoArr,
    por_dia: porDiaArr,
    top_archivos: topArchivos,
    recientes,
  });
}
