"""
Genera un dataset realista de un proyecto de 10 meses:
apertura de un restaurante "Cocina del Rio".

Incluye:
- ~35 documentos (PDFs, Excels, emails .eml, texto)
- Cronología real con fechas explícitas
- Contradicciones intencionales: presupuesto $200k→$285k,
  deadline movido, cambio de contratista, cocina ampliada
- Material para timeline temporal: cambios documentados mes a mes
"""
import os, sys, json, shutil, uuid, urllib.request
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tmp_restaurante"
OUT.mkdir(exist_ok=True)

PROYECTO = "restaurante"
N8N = "http://localhost:5678"


def gen_pdf(name: str, title: str, body: list[str]):
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.utils import simpleSplit
    path = OUT / name
    c = canvas.Canvas(str(path), pagesize=A4)
    W, H = A4
    c.setFont("Helvetica-Bold", 16)
    c.drawString(72, H - 72, title)
    y = H - 110
    c.setFont("Helvetica", 11)
    for para in body:
        if not para.strip():
            y -= 8
            continue
        if para.startswith("# "):
            c.setFont("Helvetica-Bold", 13)
            c.drawString(72, y, para[2:])
            y -= 18
            c.setFont("Helvetica", 11)
            continue
        for line in simpleSplit(para, "Helvetica", 11, W - 144):
            if y < 72:
                c.showPage(); c.setFont("Helvetica", 11); y = H - 72
            c.drawString(72, y, line)
            y -= 14
        y -= 6
    c.save()


def gen_eml(name: str, headers: dict, body: str):
    path = OUT / name
    hdr = "\n".join(f"{k}: {v}" for k, v in headers.items())
    full = f"{hdr}\nContent-Type: text/plain; charset=utf-8\n\n{body}"
    path.write_text(full, encoding="utf-8")


def gen_xlsx(name: str, sheets: dict):
    from openpyxl import Workbook
    path = OUT / name
    wb = Workbook()
    wb.remove(wb.active)
    for sheet_name, rows in sheets.items():
        ws = wb.create_sheet(title=sheet_name[:30])
        for row in rows:
            ws.append(row)
    wb.save(str(path))


def gen_txt(name: str, text: str):
    (OUT / name).write_text(text, encoding="utf-8")


# ===================================================================
# MES 1 — Búsqueda de terreno (Febrero 2026)
# ===================================================================
gen_eml("01_inmobiliaria_contacto.eml", {
    "From": "Laura Mendez <laura@inmobiliaria-norte.com>",
    "To": "Jun Wei He <jun@cocinadelrio.com>",
    "Date": "Mon, 02 Feb 2026 10:30:00 -0300",
    "Subject": "Locales disponibles para restaurante zona Palermo/Villa Crespo",
    "Message-ID": "<inm-001@inmobiliaria-norte.com>",
}, """Hola Jun Wei,

Tras nuestra charla del viernes, te paso 3 opciones que cumplen el perfil que buscás (160-220m2, planta baja, zona gastronómica activa, contrato 5 años mínimo):

1. Av. Honduras 5500, Palermo Hollywood
   - 180m2, planta baja + entrepiso
   - Alquiler: USD 4.500/mes + expensas USD 800
   - Estado: necesita refacción integral (era oficina)
   - Contrato: 6 años + 4 de prórroga

2. Thames 2200, Villa Crespo
   - 210m2, planta baja
   - Alquiler: USD 3.800/mes + expensas USD 600
   - Estado: ex-bar, instalaciones gastro parciales (cocina semi-completa)
   - Contrato: 5+5 años

3. Costa Rica 4800, Palermo Soho
   - 165m2, planta baja
   - Alquiler: USD 5.200/mes + expensas USD 950
   - Estado: ex-restaurante cerrado hace 8 meses, equipamiento completo (a negociar)
   - Contrato: 5 años, sin prórroga

Te recomiendo arrancar por Thames por la relación m2/precio. Coordino visitas la próxima semana?

Saludos,
Laura
""")

gen_xlsx("02_comparacion_locales.xlsx", {
    "Comparación": [
        ["Local", "Dirección", "M2", "Alquiler USD", "Expensas USD", "Estado", "Contrato"],
        ["Opción A", "Av. Honduras 5500 Palermo Hollywood", 180, 4500, 800, "Refacción total", "6+4 años"],
        ["Opción B", "Thames 2200 Villa Crespo", 210, 3800, 600, "Ex-bar, parcial", "5+5 años"],
        ["Opción C", "Costa Rica 4800 Palermo Soho", 165, 5200, 950, "Equipado completo", "5 años"],
        [],
        ["Métricas calculadas", "", "", "", "", "", ""],
        ["Costo total mensual USD", "", "", 5300, 4400, 6150, ""],
        ["USD/m2/mes", "", "", 29.4, 21.0, 37.3, ""],
        ["Score zona (1-10)", "", "", 9, 7, 10, ""],
        ["Score estado (1-10)", "", "", 3, 6, 10, ""],
    ]
})

gen_eml("03_visita_locales.eml", {
    "From": "Jun Wei He <jun@cocinadelrio.com>",
    "To": "Laura Mendez <laura@inmobiliaria-norte.com>",
    "Date": "Fri, 13 Feb 2026 18:00:00 -0300",
    "Subject": "Re: Locales disponibles - decisión preliminar Thames",
    "Message-ID": "<jun-003@cocinadelrio.com>",
}, """Laura,

Después de visitar los 3, vamos con Thames 2200 (Opción B).

Razones:
- Mejor USD/m2 (21 vs 29-37)
- 210m2 nos deja crecer (proyectamos 80 cubiertos vs 60 originales)
- Las instalaciones gastronómicas parciales ahorran ~USD 30k en cocina
- Zona en alza con buen flujo nocturno

Necesito que coordines:
1. Visita del arquitecto Andrés Pereyra esta semana
2. Avalúo del local (perito de tu inmobiliaria o externo?)
3. Empezamos a negociar el alquiler: nuestra oferta inicial USD 3.500 (ellos piden 3.800)

Slds,
Jun Wei
""")


# ===================================================================
# MES 2 — Due diligence + Negociación (Marzo 2026)
# ===================================================================
gen_pdf("04_informe_tecnico_thames2200.pdf", "Informe técnico - Thames 2200",
[
    "# Datos del relevamiento",
    "Fecha: 5 de marzo de 2026",
    "Inmueble: Thames 2200, Villa Crespo, CABA",
    "Superficie cubierta: 210 m2 (planta baja, sin altillo)",
    "Solicitante: Jun Wei He / Cocina del Río SRL en formación",
    "Perito: Ing. Roberto Salinas (matrícula CABA 8472)",
    "",
    "# Instalaciones existentes",
    "Cocina parcial: campana extractora industrial Coldex 2.4m, conexión gas envasado, "
    "anafe 6 hornallas Wassi (sin freidoras ni planchas). Bachas dobles acero inoxidable.",
    "Eléctrica: tablero principal 40A, sub-tableros sector cocina y sector salón. "
    "RECOMENDACION: ampliar a 63A para cocina industrial completa.",
    "Sanitaria: 2 baños públicos (M y F, sin accesibilidad universal — requiere obra), "
    "1 baño personal cocina, vestuario chico.",
    "",
    "# Reformas requeridas para habilitación restaurant",
    "1. Adaptación baño accesibilidad (Ley 962 CABA) — obra civil estimada USD 8.000",
    "2. Ampliación eléctrica a 63A — USD 4.500",
    "3. Salida emergencia trasera (hoy ventana, requiere puerta) — USD 3.200",
    "4. Sistema detección incendios + matafuegos — USD 5.500",
    "5. Cambio piso sector cocina (gres antideslizante reglamentario) — USD 6.000",
    "",
    "Total reformas obligatorias: USD 27.200",
    "",
    "# Valor de mercado",
    "Alquiler de mercado para la zona y condiciones: USD 3.600-4.000/mes.",
    "La oferta del propietario (USD 3.800) está dentro de rango.",
    "Recomendamos negociar entre USD 3.500 y 3.650 incluyendo 2 meses de gracia.",
])

gen_eml("05_contraoferta_alquiler.eml", {
    "From": "Jun Wei He <jun@cocinadelrio.com>",
    "To": "Carlos Vidal <c.vidal@vidalpropiedades.com>",
    "Date": "Tue, 10 Mar 2026 14:00:00 -0300",
    "Subject": "Contraoferta Thames 2200 - alquiler y condiciones",
    "Message-ID": "<jun-005@cocinadelrio.com>",
}, """Carlos,

Sobre el local de Thames 2200, le acercamos nuestra propuesta formal:

ALQUILER: USD 3.500/mes ajustable por CER cada 6 meses
EXPENSAS: USD 600/mes (a cargo nuestro)
PLAZO: 5 años + 5 años de prórroga
DEPOSITO: 2 meses de alquiler (USD 7.000)
GRACIA: 2 meses sin alquiler para refacciones
GARANTIA: seguro de caución por monto equivalente a 12 meses

Comentarios:
- Tras el informe técnico (que les anexamos), las reformas obligatorias para
  habilitación gastronómica suman USD 27.200 a cargo nuestro
- Por eso pedimos los 2 meses de gracia
- Asumimos también las mejoras menores (pintura, accesos)

Quedamos atentos a su respuesta. Si están de acuerdo en los grandes puntos,
podemos firmar antes de fin de mes.

Saludos,
Jun Wei He
""")

gen_eml("06_aceptacion_alquiler.eml", {
    "From": "Carlos Vidal <c.vidal@vidalpropiedades.com>",
    "To": "Jun Wei He <jun@cocinadelrio.com>",
    "Date": "Thu, 19 Mar 2026 11:30:00 -0300",
    "Subject": "Re: Contraoferta Thames 2200 - condiciones aceptadas (con cambios)",
    "Message-ID": "<vidal-006@vidalpropiedades.com>",
}, """Jun Wei,

Hablado con el dueño, aceptamos con los siguientes ajustes:

- ALQUILER: USD 3.600/mes (intermedio entre nuestras posturas)
- EXPENSAS: USD 600/mes (acordado)
- PLAZO: 5+5 años (acordado)
- DEPOSITO: 3 meses (USD 10.800) - el dueño pidió 3 por la inversión que harán
- GRACIA: 1 mes sin alquiler (no 2)
- GARANTIA: seguro de caución, OK

El contrato lo redacta el escribano del dueño. Estimamos firmar 27/03.

Saludos,
Carlos
""")

gen_xlsx("07_proyeccion_financiera.xlsx", {
    "Inversión inicial": [
        ["Concepto", "USD"],
        ["Depósito alquiler (3 meses)", 10800],
        ["Reformas obligatorias", 27200],
        ["Equipamiento cocina industrial", 45000],
        ["Mobiliario salón", 18000],
        ["Diseño y branding", 12000],
        ["Permisos y trámites", 5500],
        ["Sistemas (POS, contable, reservas)", 4500],
        ["Capital de trabajo (3 meses)", 35000],
        ["Imprevistos (10%)", 15800],
        ["TOTAL", 173800],
        [],
        ["Presupuesto aprobado a inversores", 200000],
        ["Margen de seguridad", 26200],
    ],
    "Proyección mensual": [
        ["Mes 1", "Mes 2", "Mes 3", "Mes 4", "Mes 5", "Mes 6"],
        ["Ingresos esperados USD"],
        [8000, 14000, 22000, 28000, 33000, 36000],
        ["Costos fijos USD"],
        [9100, 9100, 9100, 9100, 9100, 9100],
        ["Costos variables USD (~32%)"],
        [2560, 4480, 7040, 8960, 10560, 11520],
        ["Resultado USD"],
        [-3660, 420, 5860, 9940, 13340, 15380],
    ],
})


# ===================================================================
# MES 3 — Contrato de alquiler + arquitecto + permisos iniciales (Abril)
# ===================================================================
gen_pdf("08_contrato_alquiler.pdf", "Contrato de Locación Comercial - Thames 2200",
[
    "Entre LOCADOR: Sr. Hugo Bertolino, DNI 14.527.881, con domicilio en Av. Cabildo 3200, CABA,",
    "y LOCATARIO: Jun Wei He Mai, DNI 38.221.450, en representación de Cocina del Río SRL (en formación),",
    "con domicilio en Thames 2200, CABA.",
    "",
    "# CLAUSULA PRIMERA - OBJETO",
    "El LOCADOR da en locación al LOCATARIO el inmueble sito en Thames 2200, ",
    "planta baja, Villa Crespo, CABA. Superficie: 210 m2. Destino exclusivo: ",
    "explotación gastronómica (restaurante).",
    "",
    "# CLAUSULA SEGUNDA - PLAZO",
    "El presente contrato tiene un plazo de CINCO (5) años contados a partir del 1 de abril 2026, ",
    "con derecho del LOCATARIO a una prórroga de CINCO (5) años adicionales bajo las mismas condiciones.",
    "",
    "# CLAUSULA TERCERA - CANON LOCATIVO",
    "El canon mensual será de USD 3.600 (dólares estadounidenses tres mil seiscientos), ",
    "ajustable cada SEIS (6) meses por CER + 1%. Vencimiento día 10 de cada mes.",
    "",
    "# CLAUSULA CUARTA - DEPOSITO",
    "El LOCATARIO entrega USD 10.800 equivalente a TRES (3) meses de alquiler, ",
    "reintegrable al finalizar el contrato siempre que el inmueble se restituya en buenas condiciones.",
    "",
    "# CLAUSULA QUINTA - PERIODO DE GRACIA",
    "El LOCATARIO no abonará canon durante el primer mes (abril 2026), destinado a refacciones.",
    "",
    "# CLAUSULA SEXTA - DESTINO Y HABILITACIONES",
    "El LOCATARIO se compromete a obtener a su exclusivo cargo todas las habilitaciones ",
    "necesarias para la actividad gastronómica (CABA, AGC, Bomberos, Bromatología).",
    "",
    "Firmado en CABA, a los 28 días del mes de marzo de 2026.",
])

gen_eml("09_contratacion_arquitecto.eml", {
    "From": "Jun Wei He <jun@cocinadelrio.com>",
    "To": "Andres Pereyra <andres@pereyra-arq.com>",
    "Date": "Mon, 06 Apr 2026 09:30:00 -0300",
    "Subject": "Contratación honorarios - proyecto Cocina del Río",
    "Message-ID": "<jun-009@cocinadelrio.com>",
}, """Andrés,

Confirmamos tu contratación para el proyecto integral. Honorarios acordados:

ALCANCE:
- Anteproyecto (3 propuestas)
- Proyecto ejecutivo (planos + memorias + cómputos)
- Dirección de obra (mes 5 a mes 9, frecuencia semanal)
- Trámites de habilitación (AGC + Bromatología + Bomberos)

HONORARIOS: USD 14.500 totales, en 5 pagos:
- 20% a la firma (USD 2.900) - ahora
- 20% entrega anteproyecto (mes 4)
- 20% entrega proyecto ejecutivo (mes 5)
- 30% mensual durante obra (mes 6-9)
- 10% contra habilitación final (mes 10)

TIMELINE COMPROMETIDO:
- Anteproyecto: 30 abril
- Proyecto ejecutivo aprobado: 31 mayo
- Inicio obra: 1 junio
- Habilitación final: 30 noviembre 2026

Cualquier cambio mayor al alcance lo presupuestamos aparte. Hablamos esta semana para arrancar.

Saludos,
Jun Wei
""")

gen_pdf("10_anteproyecto_arquitectonico.pdf", "Anteproyecto Cocina del Río - 3 propuestas",
[
    "# Premisas del proyecto",
    "Capacidad: 80 cubiertos en salón principal + 20 en barra alta",
    "Cocina: zona caliente, zona fría, lavadero, depósito, vestuario personal",
    "Estilo: industrial-mediterráneo, paleta tonos tierra y verdes",
    "Iluminación: mixta (cálida ambiente + funcional cocina)",
    "Sustentabilidad: separación residuos, eficiencia energética",
    "",
    "# Propuesta A - Salón abierto",
    "Open kitchen visible desde 40% del salón. Barra centrada como elemento principal.",
    "Bodega visible cerca de la entrada. Sin terraza. Ventajas: dramático, ideal para fotos/redes.",
    "Desventajas: ruidoso, requiere extracción reforzada en salón.",
    "Costo estimado obra: USD 78.000 (sin equipamiento).",
    "",
    "# Propuesta B - Salón cerrado + patio",
    "Cocina cerrada tradicional. Salón con mesas tradicionales. Aprovecha patio trasero 25m2 ",
    "como terraza descubierta (12 cubiertos extra en verano).",
    "Ventajas: salón tranquilo, capacidad extra estacional.",
    "Desventajas: pierde el factor 'experiencia visual cocina'.",
    "Costo estimado obra: USD 72.000.",
    "",
    "# Propuesta C - Híbrido (RECOMENDADA)",
    "Salón mixto: 60% mesas tradicionales + 30% barra alta con vista parcial a cocina ",
    "(ventanal de servicio) + 10% terraza descubierta (8 cubiertos).",
    "Cocina semi-abierta con pase visible pero contenido acústicamente.",
    "Ventajas: balance entre experiencia, capacidad, costos.",
    "Costo estimado obra: USD 75.000.",
])

gen_eml("11_tramite_habilitacion_inicio.eml", {
    "From": "Andres Pereyra <andres@pereyra-arq.com>",
    "To": "Jun Wei He <jun@cocinadelrio.com>",
    "Date": "Mon, 27 Apr 2026 16:00:00 -0300",
    "Subject": "Trámite habilitación iniciado - número de expediente",
    "Message-ID": "<andres-011@pereyra-arq.com>",
}, """Jun Wei,

Ingresé hoy el trámite de habilitación gastronómica en la AGC (Agencia Gubernamental de Control).

EXPEDIENTE: EX-2026-12458793-CABA-AGC
RUBRO: Restaurante (código 602010)
ETAPA ACTUAL: Visado de planos (estimado 30 días)
PROXIMAS ETAPAS:
- Inspección obra (post-construcción, mes 8-9)
- Habilitación condicional (mes 9)
- Habilitación definitiva (mes 10)

OBSERVACIONES INICIALES de AGC (no son obstáculos pero hay que cumplir):
1. Salida emergencia debe tener ancho mínimo 0.90m (planos OK)
2. Distancia entre mesas debe permitir circulación 1.20m (verificar layout)
3. Baño accesibilidad - certificado IRAM
4. Cocina con piso antideslizante R10 mínimo

Costo del trámite hasta ahora: USD 1.850. Faltan tasas posteriores estimadas USD 2.200.

Andrés
""")


# ===================================================================
# MES 4 — Proyecto ejecutivo + presupuestos construcción (Mayo)
# ===================================================================
gen_pdf("12_proyecto_ejecutivo_resumen.pdf", "Proyecto ejecutivo - Resumen + cómputos",
[
    "# Diseño aprobado (Propuesta C híbrida)",
    "Capacidad total: 92 cubiertos (60 salón + 24 barra + 8 terraza)",
    "Sup. construida útil: 198 m2 (salón) + 12 m2 (terraza)",
    "Sup. cocina: 38 m2 (zona caliente 18m2, fría 12m2, lavadero/depósito 8m2)",
    "",
    "# Cómputos principales",
    "Demolición: 22 m3",
    "Mampostería nueva: 18 m2",
    "Pisos: gres antideslizante 38 m2 (cocina) + porcelanato 160 m2 (salón)",
    "Cielorraso suspendido: 200 m2",
    "Instalación eléctrica: 65 puntos + tablero 63A",
    "Instalación sanitaria: 12 artefactos nuevos",
    "Pintura: 320 m2",
    "Carpintería: barra principal 6.5m, pase cocina-salón, vidriera frontal",
    "",
    "# Cronograma",
    "Mes 5 (junio): demolición + albañilería estructural + instalaciones",
    "Mes 6 (julio): cerramientos + cielorrasos + revoques",
    "Mes 7 (agosto): pisos + sanitarios + carpintería de obra",
    "Mes 8 (septiembre): pintura + carpintería de detalle + instalación eléctrica fina",
    "Mes 9 (octubre): equipamiento cocina + mobiliario + branding + inspecciones",
    "Mes 10 (noviembre): habilitación final + soft opening",
])

gen_xlsx("13_presupuestos_constructoras.xlsx", {
    "Comparación contratistas": [
        ["Rubro", "Constructora Aguirre USD", "Obras del Sur USD", "Pasamonte SRL USD"],
        ["Demolición", 4500, 5200, 3800],
        ["Albañilería + revoques", 12000, 11500, 13200],
        ["Pisos cocina (gres)", 4800, 4500, 5100],
        ["Pisos salón (porcelanato)", 11200, 12000, 10800],
        ["Cielorrasos", 8500, 8200, 9000],
        ["Instalación eléctrica", 9800, 11200, 9500],
        ["Instalación sanitaria", 7200, 7800, 6900],
        ["Pintura", 4200, 4500, 4100],
        ["Carpintería de obra", 8500, 9200, 8800],
        ["Subtotal mano obra+materiales", 70700, 74100, 71200],
        ["Gastos generales (10%)", 7070, 7410, 7120],
        ["Honorarios contratista (12%)", 8484, 8892, 8544],
        ["TOTAL", 86254, 90402, 86864],
        [],
        ["Plazo en semanas", 16, 14, 18],
        ["Garantía vicios ocultos (meses)", 12, 6, 12],
        ["Referencias verificadas", 5, 3, 7],
        ["Score técnico (1-10)", 8, 7, 9],
    ]
})

gen_eml("14_seleccion_contratista.eml", {
    "From": "Andres Pereyra <andres@pereyra-arq.com>",
    "To": "Jun Wei He <jun@cocinadelrio.com>",
    "Date": "Wed, 20 May 2026 17:30:00 -0300",
    "Subject": "Recomendación contratista - Pasamonte SRL",
    "Message-ID": "<andres-014@pereyra-arq.com>",
}, """Jun Wei,

Después de evaluar las 3 ofertas y verificar referencias, te recomiendo a Pasamonte SRL:

POR QUE NO LOS OTROS DOS:
- Aguirre: ya tienen 2 obras en paralelo, el dueño me confirmó que podría tener atrasos
- Obras del Sur: presupuesto más alto y solo 6 meses garantía (estándar es 12)

POR QUE PASAMONTE:
- 7 obras verificadas, hablé con 2 dueños de restaurantes que abrieron con ellos
  (Bocacalle y Vermut Bar) - ambos los recomendaron
- 12 meses de garantía (cubre verano completo post-apertura)
- Tienen equipo propio fijo (no subcontratan, reduce riesgo de calidad)
- Su presupuesto USD 86.864 está sólo 0.7% arriba de Aguirre

UNICO PUNTO EN CONTRA: 18 semanas de plazo vs 14-16 de los otros.
Para tu fecha objetivo de apertura (noviembre) igual entra con margen.

Procedo con el contrato? Necesito tu OK para firmar la semana próxima.

Andrés
""")


# ===================================================================
# MES 5 — Inicio de obra (Junio)
# ===================================================================
gen_pdf("15_contrato_constructora.pdf", "Contrato de Locación de Obra - Pasamonte SRL",
[
    "# Partes",
    "COMITENTE: Cocina del Río SRL (CUIT 30-71834562-2), representada por Jun Wei He Mai",
    "CONTRATISTA: Pasamonte SRL (CUIT 30-71285642-9), representada por Hernán Pasamonte",
    "DIRECTOR DE OBRA: Arq. Andrés Pereyra (mat. CPAU 28471)",
    "",
    "# Objeto",
    "Ejecución de obra civil completa según proyecto ejecutivo del Arq. Pereyra ",
    "(planos PR-001 a PR-018, especificaciones técnicas adjuntas).",
    "Ubicación: Thames 2200, CABA.",
    "",
    "# Precio y forma de pago",
    "Precio total: USD 86.864 (dólares estadounidenses ochenta y seis mil ochocientos sesenta y cuatro).",
    "Anticipo: 15% (USD 13.029) a la firma.",
    "Pagos mensuales por avance certificado por DO: 70% del total.",
    "Fondo de reparo: 10% retenido hasta 30 días post-entrega.",
    "Pago final: 5% contra acta de recepción definitiva.",
    "",
    "# Plazo",
    "Inicio: 1 de junio de 2026.",
    "Plazo de ejecución: 18 semanas calendario (incluye eventuales paros climáticos hasta 5 días).",
    "Fecha estimada de entrega: 5 de octubre de 2026.",
    "Multa por atraso injustificado: USD 200/día.",
    "",
    "# Garantías",
    "Vicios ocultos: 12 meses desde recepción definitiva.",
    "Seguros: ART al día, responsabilidad civil USD 100.000.",
    "",
    "Firmado en CABA, 28 de mayo de 2026.",
])

gen_xlsx("16_cronograma_obra.xlsx", {
    "Cronograma Gantt": [
        ["Tarea", "Inicio", "Fin", "Duración (días)", "Estado"],
        ["Demolición y limpieza", "2026-06-01", "2026-06-10", 10, "planificado"],
        ["Albañilería estructural", "2026-06-08", "2026-06-30", 23, "planificado"],
        ["Instalación eléctrica gruesa", "2026-06-15", "2026-07-10", 26, "planificado"],
        ["Instalación sanitaria gruesa", "2026-06-15", "2026-07-08", 24, "planificado"],
        ["Mampostería divisiones", "2026-07-01", "2026-07-20", 20, "planificado"],
        ["Cielorrasos suspendidos", "2026-07-15", "2026-08-05", 22, "planificado"],
        ["Pisos cocina (gres)", "2026-08-01", "2026-08-12", 12, "planificado"],
        ["Pisos salón (porcelanato)", "2026-08-08", "2026-08-25", 18, "planificado"],
        ["Sanitarios artefactos", "2026-08-15", "2026-08-30", 16, "planificado"],
        ["Pintura general", "2026-09-01", "2026-09-15", 15, "planificado"],
        ["Carpintería de obra (barra)", "2026-09-10", "2026-09-25", 16, "planificado"],
        ["Eléctrica fina + artefactos", "2026-09-15", "2026-09-30", 16, "planificado"],
        ["Limpieza final + entrega", "2026-10-01", "2026-10-05", 5, "planificado"],
    ]
})

gen_eml("17_kickoff_obra.eml", {
    "From": "Andres Pereyra <andres@pereyra-arq.com>",
    "To": "Jun Wei He <jun@cocinadelrio.com>, Hernan Pasamonte <hernan@pasamonte-srl.com>",
    "Date": "Mon, 01 Jun 2026 08:30:00 -0300",
    "Subject": "Kick-off Obra Cocina del Río - acta de inicio",
    "Message-ID": "<andres-017@pereyra-arq.com>",
}, """Buenos días,

Hoy lunes 1 de junio iniciamos formalmente la obra. Resumen del kick-off:

PRESENTES:
- Hernán Pasamonte (contratista)
- Jun Wei He (comitente)
- Andrés Pereyra (DO)
- Maestro mayor de obra: Diego Saavedra (Pasamonte SRL)

CONFIRMACIONES:
- Anticipo USD 13.029 transferido el viernes (comprobante adjunto)
- Equipo en obra desde mañana 7am
- Cuadrilla inicial: 5 personas (demolición)
- Volquete contratado para 7 días

CRONOGRAMA SEMANAL:
- Lunes 10:00: reunión avance en obra
- Jueves: informe escrito de avance + fotos

PRIMERA QUINCENA - HITOS:
- Demolición completa antes del 10/6
- Inicio albañilería estructural antes del 12/6
- Inspección eléctrica para definir tablero antes del 15/6

Cualquier cambio fuera del alcance contratado lo presupuestamos aparte (Cláusula 8).
La idea es minimizar adicionales para mantener el budget.

Andrés
""")


# ===================================================================
# MES 6 — Avance + CAMBIO IMPORTANTE en la cocina (Julio)
# ===================================================================
gen_eml("18_solicitud_ampliacion_cocina.eml", {
    "From": "Jun Wei He <jun@cocinadelrio.com>",
    "To": "Andres Pereyra <andres@pereyra-arq.com>, Hernan Pasamonte <hernan@pasamonte-srl.com>",
    "Date": "Mon, 06 Jul 2026 19:45:00 -0300",
    "Subject": "Cambio importante: ampliar cocina + agregar planchas para parrilla",
    "Message-ID": "<jun-018@cocinadelrio.com>",
}, """Andrés, Hernán,

Después de definir el menú con el chef Lucas Romero (se sumó al proyecto la semana
pasada), necesitamos modificar la cocina:

CAMBIO 1 - AMPLIAR ZONA COCINA:
La zona caliente actual (18m2) queda chica. Necesitamos sumar 4 m2 más quitando
parte del depósito. Pasaría a 22m2 (cocina) y 4m2 (depósito).

CAMBIO 2 - AGREGAR PARRILLA + ANAFE EXTRA:
Lucas quiere incorporar parrilla a la carbón en zona visible al pase. Esto requiere:
- Conducto adicional de extracción a azotea
- Refuerzo eléctrico (sería el segundo anafe industrial)
- Modificación del pase para mostrar la parrilla

CAMBIO 3 - CAMBIO DE PISO ANTIDESLIZANTE:
El R10 cumple pero el chef sugiere R11 (mayor adherencia para zona de parrilla).
Cambio de proveedor + 4m2 extra.

Sé que estos cambios impactan presupuesto y timeline. Pasen estimado lo antes
posible para decidir.

Saludos,
Jun Wei
""")

gen_xlsx("19_repuesto_obra_con_cambios.xlsx", {
    "Re-presupuesto cambios": [
        ["Concepto", "Original USD", "Con cambios USD", "Diferencia USD"],
        ["Albañilería (re-distribución)", 12000, 14500, 2500],
        ["Cocina obra civil ampliada", 0, 4200, 4200],
        ["Conducto extracción parrilla", 0, 3800, 3800],
        ["Refuerzo eléctrico (segundo anafe)", 9800, 11200, 1400],
        ["Piso gres R11 (vs R10)", 4800, 5900, 1100],
        ["Modificación pase cocina-salón", 0, 2400, 2400],
        ["Resto sin cambios", 55564, 55564, 0],
        ["Sub-total obra civil", 82164, 97564, 15400],
        ["Honorarios contratista (12%)", 8484, 9907, 1423],
        ["NUEVO TOTAL OBRA", 90648, 107471, 16823],
        [],
        ["Plazo adicional estimado", "0 días", "+18 días", ""],
        ["Nueva fecha de entrega", "5-oct-2026", "23-oct-2026", ""],
    ]
})

gen_pdf("20_aprobacion_municipal.pdf", "Constancia AGC - Planos aprobados",
[
    "AGENCIA GUBERNAMENTAL DE CONTROL - GCBA",
    "Expediente: EX-2026-12458793-CABA-AGC",
    "Fecha: 14 de julio de 2026",
    "",
    "# CONSTANCIA DE APROBACION DE PLANOS",
    "Se hace saber al titular del trámite que los planos correspondientes al proyecto ",
    "de habilitación gastronómica del inmueble sito en Thames 2200, CABA, han sido ",
    "APROBADOS con las siguientes observaciones menores:",
    "",
    "1. Adjuntar certificado de matafuegos al momento de la inspección final",
    "2. Verificar in situ ancho de pasillos de evacuación (1.20m mínimo)",
    "3. Presentar plan de manejo de residuos orgánicos firmado por gestor habilitado",
    "",
    "El trámite avanza a la siguiente etapa (inspección obra) una vez completada la ",
    "construcción.",
    "",
    "Funcionario: Ing. Mariela Quiroga - DGFyC",
])

gen_eml("21_avance_obra_semana4.eml", {
    "From": "Andres Pereyra <andres@pereyra-arq.com>",
    "To": "Jun Wei He <jun@cocinadelrio.com>",
    "Date": "Thu, 24 Jul 2026 18:00:00 -0300",
    "Subject": "Informe avance obra - semana 4 (con cambios de cocina aprobados)",
    "Message-ID": "<andres-021@pereyra-arq.com>",
}, """Jun Wei,

Informe semanal:

AVANCE FÍSICO ACUMULADO: 32% (planificado 35%)
Atraso menor de 3 días por el re-diseño de cocina.

ESTA SEMANA:
- Albañilería estructural completa ✓
- Inicio re-distribución cocina (cambio aprobado) ✓
- Eléctrica gruesa al 60%
- Sanitaria gruesa al 75%
- Inicio conducto extracción parrilla (ya pasamos por la traza, no hay conflictos)

PROXIMA SEMANA:
- Cerrar mampostería divisiones nuevas
- Completar eléctrica gruesa
- Inicio cielorraso sector cocina

INVERSION ACUMULADA: USD 45.230 (52% del nuevo total USD 107.471)

ALERTA:
La parrilla a carbón requiere certificación adicional de bomberos (no estaba en
el trámite original). Estoy gestionando, costo extra estimado USD 800.

Andrés
""")


# ===================================================================
# MES 7 — Compra equipamiento (Agosto)
# ===================================================================
gen_xlsx("22_lista_equipamiento.xlsx", {
    "Cocina industrial": [
        ["Equipo", "Cantidad", "Marca/Modelo", "Precio unit USD", "Total USD"],
        ["Anafe 6 hornallas industrial", 1, "Coldex CR-600 (existente)", 0, 0],
        ["Anafe 4 hornallas + plancha", 1, "Sanson 4P", 2200, 2200],
        ["Parrilla a carbón industrial", 1, "Fierro Bs As (custom)", 4500, 4500],
        ["Horno convector 10 bandejas", 1, "Rational SCC", 8800, 8800],
        ["Freidora doble 18L", 1, "Wassi WI-218", 1900, 1900],
        ["Heladera 2 puertas", 2, "Lanutrición LX-1200", 1450, 2900],
        ["Freezer horizontal 500L", 1, "Briket", 1100, 1100],
        ["Bachas dobles inox", 1, "Existentes refaccionadas", 0, 0],
        ["Mesa central trabajo", 3, "Inox 1.8m", 650, 1950],
        ["Estantería cocina inox", 4, "Various", 380, 1520],
        ["Campana ampliada (parrilla)", 1, "Custom + conducto", 3200, 3200],
        ["Lavavajillas industrial", 1, "Hobart AM-15", 6500, 6500],
        ["Utensilios + ollería completa", "lote", "Various", 3800, 3800],
        ["Sistema POS 2 estaciones", 1, "Fiserv + impresoras", 2400, 2400],
        ["TOTAL COCINA", "", "", "", 40770],
    ],
    "Salón": [
        ["Item", "Cantidad", "Precio unit USD", "Total USD"],
        ["Mesa 4 pax (madera maciza)", 12, 280, 3360],
        ["Mesa 2 pax", 6, 180, 1080],
        ["Sillas tapizadas", 60, 95, 5700],
        ["Banqueta barra alta", 20, 85, 1700],
        ["Iluminación colgante (lámparas)", 18, 120, 2160],
        ["Vajilla completa (80 cubiertos)", 1, 4500, 4500],
        ["Cristalería", "lote", 0, 2200],
        ["Decoración / vegetación", "lote", 0, 1800],
        ["TOTAL SALON", "", "", 22500],
    ]
})

gen_eml("23_negociacion_proveedor_cocina.eml", {
    "From": "Lucas Romero <lucas@cocinadelrio.com>",
    "To": "Jun Wei He <jun@cocinadelrio.com>",
    "Date": "Mon, 11 Aug 2026 14:00:00 -0300",
    "Subject": "Negociación equipamiento - Rational vs alternativa",
    "Message-ID": "<lucas-023@cocinadelrio.com>",
}, """Jun,

Hablé con 3 proveedores por el horno convector. Te resumo:

OPCIÓN 1 - Rational SCC (lo presupuestado): USD 8.800
- Top de gama, garantía 2 años, repuestos asegurados en BA
- Pero costo y plazo de entrega 4 semanas (justo en el límite)

OPCIÓN 2 - Unox ChefTop XEVL: USD 6.500
- Buena calidad, marca italiana, garantía 1 año
- Entrega 2 semanas, repuestos OK
- Ahorro: USD 2.300 vs Rational

OPCIÓN 3 - Coldex usado (3 años): USD 3.200
- Equipo nacional, refaccionado, garantía 6 meses
- Ahorro: USD 5.600
- Pero riesgo de fallas en pleno servicio = pésimo cliente experience

MI RECOMENDACION: Unox.
Calidad técnica comparable a Rational para nuestro volumen proyectado, ahorro relevante,
y el plazo nos da más margen. Si en 2-3 años necesitamos escalar, vamos a Rational.

Hablamos mañana? Si decidís hoy mismo, lo trabamos antes que suba el dólar.

Lucas
""")

gen_eml("24_decision_unox.eml", {
    "From": "Jun Wei He <jun@cocinadelrio.com>",
    "To": "Lucas Romero <lucas@cocinadelrio.com>",
    "Date": "Tue, 12 Aug 2026 09:00:00 -0300",
    "Subject": "Re: Negociación equipamiento - vamos con Unox",
    "Message-ID": "<jun-024@cocinadelrio.com>",
}, """Lucas, OK Unox. Trabá hoy.

Aprovecho:
- Las heladeras Lanutrición: probemos pedirles 5% descuento por las 2 juntas
- El lavavajillas Hobart: confirmá el modelo AM-15 (no el más chico) por el volumen
- La parrilla custom Fierro BsAs: necesito el contrato antes del viernes con plazo
  fijo (no se puede atrasar, es ruta crítica)

Sumá los ahorros al fondo de imprevistos. Ya estamos USD 23k arriba del presupuesto
original (el cambio de cocina pesó).

Jun
""")


# ===================================================================
# MES 8 — Diseño interior + branding (Septiembre)
# ===================================================================
gen_pdf("25_propuesta_branding.pdf", "Identidad visual Cocina del Río - Estudio Hervá",
[
    "# Concepto",
    "Restaurante mediterráneo de cocina argentina contemporánea. Producto fresco, ",
    "técnica respetuosa, presentación honesta. La identidad debe transmitir: ",
    "artesanía, calidez, conexión con la materia prima.",
    "",
    "# Naming validado",
    "Cocina del Río — referencia al río como flujo natural, fuente de vida, conexión ",
    "con productos del litoral.",
    "",
    "# Logo (propuestas)",
    "Versión principal: tipografía custom serif modulada, con detalle de onda en la 'i' ",
    "de 'Río'. Paleta: verde oliva oscuro (#3D4F38) + crema (#F2EAD9) + acento naranja ",
    "quemado (#C75A3A).",
    "",
    "# Aplicaciones (entregables)",
    "1. Logo principal + variantes (color, b/n, monocromo)",
    "2. Cartelería frontal (chapa pintada + iluminada)",
    "3. Menús (carta principal + bebidas + degustación)",
    "4. Uniformes (delantal + remera staff con bordado)",
    "5. Packaging delivery (cajas + bolsas + servilletas con logo)",
    "6. Identidad digital (web + Instagram + Google Business)",
    "",
    "# Inversión",
    "Honorarios diseño: USD 6.800",
    "Producción (cartelería + menús + packaging primera tanda): USD 4.200",
    "TOTAL: USD 11.000",
    "Plazo: 4 semanas hasta entrega completa.",
])

gen_eml("26_feedback_diseño_interior.eml", {
    "From": "Sofia Garcia <sofia@estudio-soga.com>",
    "To": "Jun Wei He <jun@cocinadelrio.com>",
    "Date": "Mon, 08 Sep 2026 16:30:00 -0300",
    "Subject": "Diseño interior - revisión propuestas mobiliario y materiales",
    "Message-ID": "<sofia-026@estudio-soga.com>",
}, """Jun Wei,

Adjunto las propuestas finales de mobiliario y materiales. Te resumo lo más importante:

MESAS:
- Madera maciza algarrobo, espesor 4cm, terminación aceite hidrófugo
- Patas hierro negro mate, base tipo X
- 12 mesas para 4 + 6 mesas para 2 (60 cubiertos salón)
- Costo: confirmado USD 280/mesa de 4, USD 180 de 2 (USD 4.440 total)

SILLAS:
- Modelo "Nora" - estructura roble, asiento tapizado en pana verde oliva (combina con
  paleta) o lino crudo (más neutro)
- Mi sugerencia: 40 verde + 20 crudo, da movimiento sin perder coherencia

ILUMINACIÓN:
- 18 lámparas colgantes individuales sobre mesas (modelo Tonal en bronce envejecido)
- Riel LED indirecto en perímetro
- Spots dirigibles en cocina abierta

PISOS:
- Aprobamos el porcelanato gris claro mate (210x90) en salón
- Confirmamos gres R11 caoba en cocina

DECORACIÓN:
- Plantas: 8 macetas grandes (olivo + lavanda + romero + tomillo aromáticos a la
  vista). Conexión visual con cocina mediterránea.
- Vajilla cerámica artesanal proveedor Salamanca BsAs

Quedo a la espera de tu confirmación para arrancar producción.

Sofía
""")


# ===================================================================
# MES 9 — Habilitación + permisos finales (Octubre)
# ===================================================================
gen_pdf("27_certificado_bomberos.pdf", "Certificado Final - Bomberos CABA",
[
    "CUERPO DE BOMBEROS DE LA CIUDAD AUTÓNOMA DE BUENOS AIRES",
    "",
    "# CERTIFICADO DE PREVENCION CONTRA INCENDIOS",
    "",
    "Inmueble: Thames 2200, planta baja, CABA",
    "Titular: Cocina del Río SRL (CUIT 30-71834562-2)",
    "Rubro: Restaurante",
    "Capacidad declarada: 92 personas + 8 personal",
    "Inspección realizada: 14 de octubre de 2026",
    "",
    "# Sistemas verificados",
    "- 6 matafuegos ABC tipo Polvo (correctamente distribuidos y señalizados)",
    "- 2 matafuegos clase K específicos para cocina (parrilla y freidora)",
    "- Sistema de detección con 8 sensores humo + 2 térmicos",
    "- Alarma audiovisual conectada a central",
    "- Luces de emergencia autónomas (12 puntos)",
    "- Señalética de evacuación reglamentaria",
    "- Salidas de emergencia: principal + trasera, ambas con apertura antipánico",
    "- Conducto extracción cocina con cierre cortafuego automático",
    "",
    "# Resolución",
    "Se otorga el presente Certificado de Prevención válido por 24 (veinticuatro) meses.",
    "Próxima revisión obligatoria: 14 de octubre de 2028.",
    "",
    "Inspector: Of. Mauricio Cabrera - Legajo 4471",
])

gen_pdf("28_habilitacion_municipal_definitiva.pdf", "Habilitación CABA - Resolución definitiva",
[
    "AGENCIA GUBERNAMENTAL DE CONTROL - GCBA",
    "Expediente: EX-2026-12458793-CABA-AGC",
    "Resolución: 2026-RES-AGC-15782",
    "Fecha: 22 de octubre de 2026",
    "",
    "# HABILITACION DEFINITIVA OTORGADA",
    "",
    "Vistos los antecedentes del expediente, el informe técnico del inspector ",
    "asignado y la documentación complementaria presentada, ",
    "",
    "EL TITULAR DE LA AGENCIA GUBERNAMENTAL DE CONTROL RESUELVE:",
    "",
    "Artículo 1° - Otórgase la HABILITACION DEFINITIVA al establecimiento de Cocina ",
    "del Río SRL para desarrollar la actividad de RESTAURANTE (rubro 602010) en ",
    "el inmueble sito en Thames 2200, planta baja, CABA.",
    "",
    "Artículo 2° - Capacidad habilitada: NOVENTA Y DOS (92) cubiertos en salón ",
    "principal más OCHO (8) personas de personal.",
    "",
    "Artículo 3° - Horario autorizado: lunes a domingos de 11:00 a 02:00 horas.",
    "",
    "Artículo 4° - La presente habilitación deberá renovarse cada 5 años o ante ",
    "modificaciones sustanciales del local o la actividad.",
])

gen_pdf("29_certificado_bromatologico.pdf", "Certificado Bromatológico - Subsecretaría Salud",
[
    "SUBSECRETARÍA DE SALUD - GCBA",
    "Dirección de Higiene y Seguridad Alimentaria",
    "",
    "# CERTIFICADO DE INSPECCION BROMATOLOGICA",
    "",
    "Establecimiento: Cocina del Río SRL",
    "Domicilio: Thames 2200, CABA",
    "Actividad: Restaurante con elaboración propia",
    "Fecha inspección: 18 de octubre de 2026",
    "",
    "# Verificaciones realizadas",
    "Cumple ✓ Condiciones de higiene generales",
    "Cumple ✓ Cadena de frío (heladeras a 4°C, freezer a -18°C, registros diarios)",
    "Cumple ✓ Almacenamiento de materias primas (separación carnes/verduras)",
    "Cumple ✓ Manejo de residuos orgánicos (gestor habilitado contratado: ECOGESTION SRL)",
    "Cumple ✓ Vestuarios y sanitarios para personal",
    "Cumple ✓ Manipuladores de alimentos: 6 personas con carnet vigente",
    "Cumple ✓ Plan POES (Procedimientos Operativos Estandarizados Sanitarios) aprobado",
    "Cumple ✓ Sistema de Control HACCP implementado",
    "",
    "Observación menor: actualizar pizarra de alérgenos al iniciar carta definitiva.",
    "",
    "# Resolución",
    "APROBADO. Habilitación bromatológica vigente por 12 meses.",
    "Inspector: Lic. Patricia Solano - Mat. 8821",
])

gen_eml("30_cronograma_apertura.eml", {
    "From": "Jun Wei He <jun@cocinadelrio.com>",
    "To": "equipo@cocinadelrio.com",
    "Date": "Fri, 23 Oct 2026 10:00:00 -0300",
    "Subject": "Cronograma APERTURA - confirmado para 15 de noviembre",
    "Message-ID": "<jun-030@cocinadelrio.com>",
}, """Equipo,

¡Llegamos! Tenemos las 3 habilitaciones (Bomberos, AGC, Bromatología) y la obra
está en estado de detalles finales.

Confirmo cronograma:

SEMANA 1 (27-31 octubre):
- Cierre detalles obra (limpieza fina, retoques, instalación última iluminación)
- Acta de recepción definitiva con Pasamonte (28/10)
- Inicio limpieza profunda integral

SEMANA 2 (3-7 noviembre):
- Stock inicial materia prima (compra fuerte miércoles)
- Pruebas operativas cocina (jueves todo el día con todo el equipo)
- Calibración POS + sistema reservas
- Foto sesión para redes (sábado por la mañana)

SEMANA 3 (10-14 noviembre):
- 11/11 (martes): Soft opening cerrado para familia + amigos (40 personas, gratis)
- 12-13 (mié-jue): Dinners de prueba con bloggers/críticos invitados (USD 5/cubierto
  simbólico para no perder costos)
- 14/11 (viernes): Día de simulacro completo con staff a tiempo final

15 DE NOVIEMBRE: APERTURA OFICIAL AL PUBLICO 🎉

Cualquier tema, ping me directo. Vamos.

Jun
""")


# ===================================================================
# MES 10 — Pre-apertura + recruiting (Noviembre)
# ===================================================================
gen_xlsx("31_organigrama_puestos.xlsx", {
    "Organigrama": [
        ["Rol", "Cantidad", "Reporta a", "Salario USD mensual", "Estado"],
        ["Gerente general", 1, "Socios", 2800, "cubierto (Jun Wei)"],
        ["Chef ejecutivo", 1, "Gerente", 2400, "cubierto (Lucas Romero)"],
        ["Sous chef", 1, "Chef ejecutivo", 1500, "POR CUBRIR"],
        ["Cocinero línea fría", 1, "Sous chef", 1100, "POR CUBRIR"],
        ["Cocinero línea caliente", 2, "Chef ejecutivo", 1100, "POR CUBRIR (2)"],
        ["Parrillero", 1, "Chef ejecutivo", 1300, "POR CUBRIR"],
        ["Bachero", 2, "Sous chef", 700, "POR CUBRIR (2)"],
        ["Encargado salón", 1, "Gerente", 1400, "POR CUBRIR"],
        ["Mozos", 4, "Encargado salón", 850, "POR CUBRIR (4)"],
        ["Bartender", 1, "Encargado salón", 1200, "POR CUBRIR"],
        ["Runner / apoyo salón", 2, "Encargado salón", 750, "POR CUBRIR (2)"],
        ["TOTAL PERSONAS", 17, "", "", ""],
        ["TOTAL SALARIOS MENSUALES USD", "", "", 19800, ""],
    ]
})

gen_pdf("32_contrato_tipo_cocina.pdf", "Modelo de Contrato Laboral - Cocina (CCT 401/05)",
[
    "Cocina del Río SRL - Modelo de Contrato por Tiempo Indeterminado",
    "Convenio Colectivo aplicable: CCT 401/05 (Gastronómicos UTHGRA)",
    "",
    "# Datos del empleado",
    "Nombre: _________________________",
    "DNI: ____________________________",
    "Domicilio: ______________________",
    "Fecha de ingreso: ________________",
    "",
    "# Posición y categoría",
    "Puesto: _________________________ (ej: Cocinero/a línea caliente)",
    "Categoría CCT: ___________________ (ej: Cocinero principal)",
    "Jornada: 8 horas diarias, 6 días por semana, 1 franco rotativo",
    "Lugar de trabajo: Thames 2200, CABA",
    "",
    "# Remuneración",
    "Sueldo bruto mensual: $___________ + adicionales según convenio (antigüedad, ",
    "comida, etc.)",
    "Forma de pago: depósito bancario antes del día 4 hábil",
    "Período de prueba: 3 meses (art. 92 bis LCT)",
    "",
    "# Beneficios adicionales",
    "- Comida al personal durante turno (cubierta por la empresa)",
    "- Uniforme provisto por la empresa",
    "- Capacitación interna (POES, HACCP, atención al cliente)",
    "- Premio por permanencia: bono semestral según resultados",
    "",
    "# Obligaciones del trabajador",
    "- Cumplir POES y normas HACCP",
    "- Mantener carnet de manipulador de alimentos vigente",
    "- Confidencialidad sobre recetas y procedimientos",
])

gen_eml("33_busqueda_personal.eml", {
    "From": "Maria Soledad Vega <hr@cocinadelrio.com>",
    "To": "Jun Wei He <jun@cocinadelrio.com>",
    "Date": "Mon, 03 Nov 2026 11:00:00 -0300",
    "Subject": "Pre-selección 17 puestos - publicación CompuTrabajo + Bumeran + red interna",
    "Message-ID": "<hr-033@cocinadelrio.com>",
}, """Jun Wei,

Update búsqueda:

PUBLICADAS HOY (CompuTrabajo + Bumeran + LinkedIn):
- Sous chef, parrillero, encargado salón (los 3 puestos clave senior)

PUBLICADAS AYER:
- 2 cocineros línea caliente, 1 línea fría
- 1 bartender
- 4 mozos, 2 runners

POR RED INTERNA + RECOMENDADOS DEL CHEF:
- Lucas (chef) recomienda a Tomás Espíndola como sous chef (lo trabajó 3 años en
  Sucre). Le ofrecimos USD 1.500, pidió USD 1.700. Negociar.
- Para parrillero, recomendación fuerte de Don Julio: Walter Quesada (15 años en
  parrilla). Disponible desde 8 noviembre. Acuerdo: USD 1.300 + bono performance.
- Para bachero, dos personas ya trabajando con Walter en su anterior, vienen como
  pack.

CANDIDATOS A ENTREVISTA ESTA SEMANA:
- 6 entrevistas mozos (jueves+viernes)
- 4 entrevistas cocineros (miércoles)
- 2 entrevistas encargado salón (martes)

TIMING:
Si confirmamos los pre-selectos al 6/11, llegamos a tener TODOS contratados antes
del soft opening 11/11. Apretado pero posible.

¿Apruebo los USD 1.700 al sous chef?

Maru
""")

gen_xlsx("34_presupuesto_operativo_mensual.xlsx", {
    "Presupuesto operativo": [
        ["Categoría", "Detalle", "USD/mes"],
        ["INGRESOS PROYECTADOS", "Mes 1 conservador (40% ocupación)", 36000],
        ["", "Mes 6 normalizado (70% ocupación)", 65000],
        [],
        ["COSTOS FIJOS", "", ""],
        ["Alquiler + expensas", "Thames 2200", 4200],
        ["Sueldos (17 personas + cargas sociales 35%)", "Brutos $19.800 + cargas", 26730],
        ["Servicios (luz, gas, agua, internet)", "Estimado mes 6", 1800],
        ["Sistemas (POS, contable, reservas, hosting)", "Subscripciones", 350],
        ["Seguros (ART + responsabilidad civil + incendio)", "Mensual prorrateado", 480],
        ["Honorarios contable + abogado", "Iguala mensual", 850],
        ["Marketing recurrente", "Ads + community + producción contenido", 1200],
        ["Limpieza profunda externa", "Cada 15 días", 380],
        ["TOTAL COSTOS FIJOS", "", 35990],
        [],
        ["COSTOS VARIABLES", "% sobre ingresos", "$"],
        ["Food cost", "32% sobre ingresos", "variable"],
        ["Bebidas y costos asociados", "8%", "variable"],
        ["Comisiones tarjetas", "3.5%", "variable"],
        ["Delivery apps (Rappi/PedidosYa)", "15% del delivery (estimado 20% ventas)", "variable"],
        [],
        ["PUNTO DE EQUILIBRIO", "Ingresos mensuales para cubrir fijos+variables", 58500],
        ["MARGEN ESPERADO MES 6", "Sobre 65k ingresos", 9700],
    ]
})

gen_pdf("35_manual_procedimientos.pdf", "Manual de Procedimientos Operativos - v1.0",
[
    "# Misión del manual",
    "Establecer los procedimientos operativos estándar que garantizan calidad, ",
    "consistencia, seguridad alimentaria e higiene en todos los servicios.",
    "",
    "# Apertura del local",
    "1. Llegada del primer turno cocina: 09:00",
    "2. Check sanitario: temperatura heladeras (4°C +/- 1), freezer (-18°C +/- 2)",
    "3. Recepción de materia prima (proveedores horario 8-10): registro POES",
    "4. Limpieza superficies cocina + sanitización (cloro 200ppm)",
    "5. Preparación de mise en place según planilla diaria",
    "6. Llegada equipo salón: 11:00",
    "7. Briefing diario 11:30: menú, sugerencias, alérgenos, especiales",
    "8. Apertura puertas: 12:00 (almuerzos) / 19:30 (cenas)",
    "",
    "# Protocolo durante el servicio",
    "- Pase cocina-salón: tickets impresos, gritado por sous chef",
    "- Tiempo máximo desde toma de pedido a salida primer plato: 18 minutos",
    "- Verificación visual de cada plato antes de salir (pase)",
    "- Cambio de uniforme/delantal si hay contacto con alimentos crudos y cocidos",
    "",
    "# Cierre del local",
    "1. Última orden: 23:30 (sem) / 00:30 (vie-sáb)",
    "2. Cierre cocina: 00:30 / 01:30",
    "3. Limpieza profunda zona cocina + sanitización",
    "4. Conteo de caja + cuadre POS",
    "5. Stock final del día + pedido reposición proveedores",
    "6. Cierre: 02:00 máximo",
    "",
    "# Manejo de alérgenos",
    "Carta debe identificar visualmente platos con gluten, lácteos, frutos secos.",
    "Personal debe poder responder con certeza sobre composición de cada plato.",
    "Cocina cuenta con utensilios separados marcados para preparaciones sin gluten.",
])

gen_eml("36_invitacion_soft_opening.eml", {
    "From": "Jun Wei He <jun@cocinadelrio.com>",
    "To": "amigos@cocinadelrio.com",
    "Date": "Wed, 05 Nov 2026 16:00:00 -0300",
    "Subject": "INVITACION: Soft Opening Cocina del Río - 11 de noviembre",
    "Message-ID": "<jun-036@cocinadelrio.com>",
}, """Familia y amigos,

¡Lo logramos! Después de casi 10 meses de proyecto, abrimos las puertas.

Los invitamos a nuestro SOFT OPENING:
📅 Martes 11 de noviembre 2026
🕐 20:00 hs
📍 Thames 2200, Villa Crespo

Servicio cerrado para 40 personas (familia + amigos cercanos). Sin costo, idea es
probar todo el flujo operativo con cariño antes de la apertura oficial el viernes 15.

Va a estar el menú degustación completo del chef Lucas (5 pasos):
- Tapeo: aceitunas marinadas + pan de masa madre con manteca de hierbas
- Entrada: vitel toné con alcaparras
- Principal a elegir: bondiola braseada o lomo a la parrilla con chimichurri
- Postre: mil hojas con dulce de leche artesanal
- Café o té de despedida

Cupos limitados, confirmar asistencia antes del 9/11 respondiendo este mail.

¡Gracias por bancarnos todo el camino!

Jun Wei + Lucas + todo el equipo Cocina del Río
""")

print(f"OK - generados {len(list(OUT.iterdir()))} archivos en {OUT}")
print()
print("Subiendo a CoWorkerIA via /api/ingest...")
print()

success = 0
errors = 0
for f in sorted(OUT.iterdir()):
    if not f.is_file():
        continue
    boundary = uuid.uuid4().hex
    body = bytearray()
    body += f"--{boundary}\r\n".encode()
    body += b'Content-Disposition: form-data; name="proyecto"\r\n\r\n'
    body += PROYECTO.encode() + b"\r\n"
    body += f"--{boundary}\r\n".encode()
    body += f'Content-Disposition: form-data; name="file"; filename="{f.name}"\r\n'.encode()
    import mimetypes
    mtype = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
    body += f"Content-Type: {mtype}\r\n\r\n".encode()
    body += f.read_bytes()
    body += f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request("http://localhost:3000/api/ingest", method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        data=bytes(body))
    try:
        r = json.loads(urllib.request.urlopen(req, timeout=180).read())
        idx = r.get("indice", {})
        tema = idx.get("tema", "?")[:55] if isinstance(idx, dict) else "?"
        chunks = r.get("chunks_guardados", "?")
        print(f"  + {f.name:<42} {chunks} chunks | {tema}")
        success += 1
    except Exception as e:
        msg = str(e)[:150]
        print(f"  X {f.name}: {msg}")
        errors += 1

print()
print(f"=== {success} OK · {errors} errores ===")
print(f"Proyecto: {PROYECTO}")
print(f"Capturas: ~{success} archivos cubriendo 10 meses (Feb-Nov 2026)")
print(f"Limpieza: archivos quedan en {OUT.relative_to(ROOT)}")
