#!/usr/bin/env python3
"""Mano Negra: arma index.html a partir de plantilla.html.

Toma las notas (news.json), la cotización del dólar (dolar.json) y los datos del
sitio (sitio.json) y escribe la página completa en HTML. Las notas quedan escritas
en la página, así se leen aunque el navegador no ejecute JavaScript.
Solo usa la biblioteca estándar de Python.
"""
import datetime as dt
import hashlib
import html
import json
import re
import unicodedata
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
TZ = ZoneInfo("America/Argentina/Cordoba")

SECCIONES = [  # (id, nombre en el menú)
    ("politica", "Política"),
    ("economia", "Economía"),
    ("cordoba", "Córdoba"),
    ("argentina", "Argentina"),
]
REGION = {"cordoba": "Córdoba", "argentina": "Argentina"}
TEMA = {"politica": "Política", "economia": "Economía"}
DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
DIAS_C = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre"]

N_GRILLA = 6      # notas destacadas debajo de la principal
N_SECCION = 4     # notas por bloque de sección
N_ULTIMAS = 12    # lista de últimas noticias


# --- utilidades -------------------------------------------------------------------------------
def leer(ruta, defecto):
    try:
        return json.loads((ROOT / ruta).read_text(encoding="utf-8"))
    except Exception:
        return defecto


def e(s):
    return html.escape(str(s or ""), quote=True)


def normalizar(texto):
    t = unicodedata.normalize("NFKD", (texto or "").lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def compilar(lista):
    pats = []
    for k in lista or []:
        exacta = k.endswith("$")
        k = normalizar(k.rstrip("$"))
        if k:
            pats.append(re.compile(rf"\b{re.escape(k)}\b" if exacta else rf"\b{re.escape(k)}"))
    return pats


def puntos(pats, texto):
    return sum(1 for p in pats if p.search(texto))


def fecha_de(iso, defecto):
    try:
        return dt.datetime.fromisoformat(iso).astimezone(TZ)
    except Exception:
        return defecto


def plata(v):
    """1540.5 -> '1.540,50'; 1540 -> '1.540'"""
    v = float(v)
    entero, dec = f"{v:,.2f}".split(".")
    entero = entero.replace(",", ".")
    return entero if dec == "00" else f"{entero},{dec}"


def recortar(texto, palabras):
    p = (texto or "").split()
    t = " ".join(p[:palabras])
    t = re.sub(r"\s*Leer más\.?$", "", t, flags=re.I)
    return t + ("…" if len(p) > palabras and not t.endswith(("…", ".")) else "")


def version(ruta):
    try:
        return hashlib.sha1((ROOT / ruta).read_bytes()).hexdigest()[:8]
    except Exception:
        return "1"


# --- clasificación ------------------------------------------------------------------------------
class Clasificador:
    def __init__(self, kw):
        self.eco = compilar(kw.get("economia"))
        self.pol = compilar(kw.get("politica"))

    def tema(self, n):
        if n.get("tema") in TEMA:
            return n["tema"]
        if n.get("seccion") == "economia":
            return "economia"
        t = normalizar(n.get("titulo"))
        d = normalizar(n.get("resumen"))
        eco = 2 * puntos(self.eco, t) + puntos(self.eco, d)
        pol = 2 * puntos(self.pol, t) + puntos(self.pol, d)
        return "economia" if eco > pol else "politica"

    @staticmethod
    def region(n):
        if n.get("region") in REGION:
            return n["region"]
        return "cordoba" if n.get("seccion") == "cordoba" else "argentina"


# --- piezas de HTML -----------------------------------------------------------------------------
def cuando(f, ahora):
    hoy = ahora.date()
    if f.date() == hoy:
        txt = f"Hoy {f:%H:%M}"
    elif f.date() == hoy - dt.timedelta(days=1):
        txt = f"Ayer {f:%H:%M}"
    else:
        txt = f"{DIAS_C[f.weekday()]} {f.day} {f:%H:%M}"
    return f'<time datetime="{f.isoformat(timespec="minutes")}" data-rel>{txt}</time>'


def marca(region):
    return f'<span class="mk mk-{region}" aria-hidden="true"></span>'


def volanta(n):
    return (f'<p class="kicker">{marca(n["_region"])}<span>{REGION[n["_region"]]}</span>'
            f'<span class="kicker-sep" aria-hidden="true">/</span><span>{TEMA[n["_tema"]]}</span></p>')


def meta(n, ahora):
    sus = ' <span class="tag-sus">(Con suscripción)</span>' if n.get("acceso") != "abierto" else ""
    return (f'<p class="meta"><span class="meta-fuente">{e(n["fuente"])}</span>'
            f'<span class="meta-sep" aria-hidden="true">—</span>{cuando(n["_f"], ahora)}{sus}</p>')


def indice(i):
    return f'<span class="idx" aria-hidden="true">MN/{i:02d}</span>'


def foto(n, clase, ancho, alto, prioridad=False):
    img = n.get("imagen")
    if not img:
        return ""
    pos = ""
    r = n.get("rostros")
    if isinstance(r, dict) and "y0" in r and "y1" in r:
        cy = max(8.0, min(92.0, (float(r["y0"]) + float(r["y1"])) / 2 * 100))
        pos = f' style="object-position:50% {cy:.0f}%"'
    carga = 'fetchpriority="high" decoding="async"' if prioridad else 'loading="lazy" decoding="async"'
    credito = f'<figcaption>(Foto: {e(n.get("imagen_credito") or n["fuente"])})</figcaption>' if clase == "foto-principal" else ""
    return (f'<figure class="{clase}"><img src="{e(img)}" alt="{e(n["titulo"])}" width="{ancho}" height="{alto}" '
            f'{carga} referrerpolicy="no-referrer"{pos}>{credito}</figure>')


def enlace(n, texto=None, clase="nota-link"):
    return (f'<a class="{clase}" href="{e(n["url"])}" target="_blank" rel="noopener">'
            f'{e(texto or n["titulo"])}</a>')


def principal(n, ahora):
    otros = ""
    if n.get("otros"):
        items = "".join(f'<li><a href="{e(o["url"])}" target="_blank" rel="noopener">'
                        f'<span class="otros-medio">{e(o["fuente"])}</span><span class="otros-tit-n">{e(o["titulo"])}</span>'
                        f'<span class="flecha" aria-hidden="true">↗</span></a></li>'
                        for o in n["otros"][:4])
        otros = f'<div class="otros"><h3 class="etiqueta">(También lo cubren)</h3><ul>{items}</ul></div>'
    clase = "lead" + ("" if n.get("imagen") else " lead--sin-foto")
    return f'''<article class="{clase}">
  <div class="lead-txt">
    <p class="lead-top"><span class="etiqueta">(Nota del día)</span>{indice(1)}</p>
    {volanta(n)}
    <h2 class="lead-tit">{enlace(n)}</h2>
    <p class="lead-bajada">{e(recortar(n.get("resumen"), 60))}</p>
    {meta(n, ahora)}
    <a class="btn" href="{e(n["url"])}" target="_blank" rel="noopener"><span>Leer en {e(n["fuente"])}</span><span class="flecha" aria-hidden="true">↗</span></a>
    {otros}
  </div>
  {foto(n, "foto-principal", 1200, 900, prioridad=True)}
</article>'''


def tarjeta(n, ahora, i=None, con_foto=True, palabras=26, nivel=3):
    f = foto(n, "foto-card", 640, 400) if con_foto else ""
    clase = "card" + (" card--foto" if f else " card--texto")
    bajada = f'<p class="card-bajada">{e(recortar(n.get("resumen"), palabras))}</p>' if palabras else ""
    num = f'<p class="card-top">{indice(i)}<span class="flecha" aria-hidden="true">↗</span></p>' if i else ""
    return f'''<article class="{clase}">
  {num}
  {f}
  <div class="card-txt">
    {volanta(n)}
    <h{nivel} class="card-tit">{enlace(n)}</h{nivel}>
    {bajada}
    {meta(n, ahora)}
  </div>
</article>'''


def bloque_seccion(sid, nombre, notas, total, ahora):
    if not notas:
        cuerpo = '<p class="vacio">No hay notas de esta sección en las últimas 48 horas.</p>'
    else:
        cuerpo = "".join(tarjeta(n, ahora, con_foto=(i == 0), palabras=(24 if i == 0 else 0)) for i, n in enumerate(notas))
    return f'''<section class="seccion" id="{sid}" aria-labelledby="t-{sid}">
  <header class="sec-head">
    <h2 class="sec-tit" id="t-{sid}">{nombre}</h2>
    <p class="sec-aux"><span class="etiqueta">({total:02d} notas)</span><span class="flecha flecha--grande" aria-hidden="true">↘</span></p>
  </header>
  <div class="sec-grid">{cuerpo}</div>
</section>'''


def ultimas(notas, ahora):
    items = []
    for i, n in enumerate(notas, 1):
        sus = '<span class="tag-sus">(Con suscripción)</span>' if n.get("acceso") != "abierto" else ""
        items.append(f'''<li class="fila">
  <span class="fila-n" aria-hidden="true">{i:02d}</span>
  <span class="fila-hora">{n["_f"]:%H:%M}</span>
  <span class="fila-sec">{marca(n["_region"])}{REGION[n["_region"]]} / {TEMA[n["_tema"]]}</span>
  <h3 class="fila-tit">{enlace(n)}</h3>
  <span class="fila-medio">{e(n["fuente"])}{sus}</span>
  <span class="flecha" aria-hidden="true">↗</span>
</li>''')
    return "".join(items)


def cinta(notas):
    items = "".join(f'<li><a href="{e(n["url"])}" target="_blank" rel="noopener"><b>{n["_f"]:%H:%M}</b> {e(n["titulo"])}</a></li>'
                    for n in notas)
    return items


def opinion(ops, ahora):
    if not ops:
        return ""
    items = []
    for i, o in enumerate(ops, 1):
        autor = f'<span class="op-autor">{e(o["autor"])}</span>' if o.get("autor") else ""
        items.append(f'''<article class="op">
  <p class="card-top"><span class="idx" aria-hidden="true">OP/{i:02d}</span><span class="flecha" aria-hidden="true">↗</span></p>
  <h3 class="op-tit"><a class="nota-link" href="{e(o["url"])}" target="_blank" rel="noopener">{e(o["titulo"])}</a></h3>
  <p class="op-firma">{autor}<span class="op-medio">{e(o.get("medio"))}</span></p>
  <p class="op-bajada">{e(recortar(o.get("resumen"), 30))}</p>
</article>''')
    return f'''<section class="opinion" id="opinion" aria-labelledby="t-opinion">
  <header class="sec-head">
    <h2 class="sec-tit" id="t-opinion">Opinión</h2>
    <p class="sec-aux"><span class="etiqueta">(Columnas y análisis elegidos por la redacción)</span></p>
  </header>
  <div class="op-grid">{"".join(items)}</div>
</section>'''


def barra_dolar(d):
    if not d.get("venta"):
        return '<p class="dolar-txt"><span class="etiqueta">(Dólar oficial)</span> <span>Cotización no disponible por el momento.</span></p>'
    f = fecha_de(d.get("actualizado"), None)
    cuando_txt = f"{f:%d/%m} {f:%H:%M} h" if f else ""
    viejo = "" if d.get("vigente", True) else ' <span class="dolar-aviso">(último valor disponible)</span>'
    return (f'<p class="dolar-txt"><span class="dolar-nom">(Dólar oficial)</span>'
            f'<span class="dolar-val">Compra <b data-dolar="compra">${plata(d["compra"])}</b></span>'
            f'<span class="dolar-val">Venta <b data-dolar="venta">${plata(d["venta"])}</b></span>'
            f'<span class="dolar-hora">Act. <span data-dolar="hora">{cuando_txt}</span>{viejo}</span></p>')


def pie_contacto(sitio):
    filas = []
    mail = (sitio.get("contacto_email") or "").strip()
    if mail:
        filas.append(f'<li><a href="mailto:{e(mail)}">{e(mail)}<span class="flecha" aria-hidden="true">↗</span></a></li>')
    redes = sitio.get("redes") or {}
    nombres = {"instagram": "Instagram", "x": "X (Twitter)", "facebook": "Facebook",
               "youtube": "YouTube", "tiktok": "TikTok", "whatsapp": "WhatsApp"}
    for k, url in redes.items():
        if (url or "").startswith("https://"):
            filas.append(f'<li><a href="{e(url)}" target="_blank" rel="noopener">{e(nombres.get(k, k.title()))}'
                         f'<span class="flecha" aria-hidden="true">↗</span></a></li>')
    return "".join(filas)


# --- página -------------------------------------------------------------------------------------
def armar(plantilla, datos, dolar, sitio, kw, fuentes):
    ahora = fecha_de(datos.get("actualizado"), dt.datetime.now(TZ))
    cl = Clasificador(kw)
    notas = list(datos.get("notas") or [])
    for n in notas:
        n["_f"] = fecha_de(n.get("fecha"), ahora)
        n["_tema"] = cl.tema(n)
        n["_region"] = cl.region(n)

    lead = notas[0] if notas else None
    grilla = notas[1:1 + N_GRILLA]
    vistas = {n["id"] for n in ([lead] if lead else []) + grilla}
    por_fecha = sorted(notas, key=lambda n: n["_f"], reverse=True)

    bloques = []
    for sid, nombre in SECCIONES:
        de_sec = [n for n in por_fecha if n["_tema"] == sid or n["_region"] == sid]
        nuevas = [n for n in de_sec if n["id"] not in vistas]
        elegidas = (nuevas + [n for n in de_sec if n["id"] in vistas])[:N_SECCION]
        vistas.update(n["id"] for n in elegidas)
        bloques.append(bloque_seccion(sid, nombre, elegidas, len(de_sec), ahora))

    hoy = f"{DIAS[ahora.weekday()]} {ahora.day} de {MESES[ahora.month - 1]} de {ahora.year}"
    menu_extra = '<li><a href="#opinion"><span class="idx">06</span>Opinión</a></li>' if datos.get("opinion") else ""
    contacto = pie_contacto(sitio)
    reemplazos = {
        "DOLAR": barra_dolar(dolar),
        "FECHA": e(hoy[:1].upper() + hoy[1:]),
        "EDICION": f"{ahora:%d.%m.%y}",
        "HORA": f"{ahora:%H:%M}",
        "RELOJ": f"{DIAS_C[ahora.weekday()]} {ahora:%d.%m.%y} — {ahora:%H:%M}",
        "N_NOTAS": f"{len(notas):02d}",
        "N_MEDIOS": f"{len(fuentes):02d}",
        "ACTUALIZADO_ISO": ahora.isoformat(timespec="minutes"),
        "MENU_EXTRA": menu_extra,
        "CINTA": cinta(por_fecha[:10]),
        "PRINCIPAL": principal(lead, ahora) if lead else '<p class="vacio">Todavía no hay notas cargadas.</p>',
        "GRILLA": "".join(tarjeta(n, ahora, i=i) for i, n in enumerate(grilla, 2)),
        "SECCIONES": "".join(bloques),
        "OPINION": opinion(datos.get("opinion"), ahora),
        "ULTIMAS": ultimas(por_fecha[:N_ULTIMAS], ahora),
        "CONTACTO": contacto or '<li class="pie-pendiente">Muy pronto, nuestros canales de contacto.</li>',
        "FUENTES": e(", ".join(fuentes)),
        "ANIO": str(ahora.year),
    }
    salida = plantilla
    for k, v in reemplazos.items():
        salida = salida.replace("{{" + k + "}}", v)
    # versión de cada archivo estático, para que los navegadores no usen una copia vieja
    salida = re.sub(r"\{\{V:([\w./-]+)\}\}", lambda m: version(m.group(1)), salida)
    falta = re.findall(r"\{\{[A-Z_:]+[^}]*\}\}", salida)
    if falta:
        raise SystemExit(f"[error] marcadores sin reemplazar en la plantilla: {falta[:5]}")
    return salida


def escribir_pagina():
    plantilla = (ROOT / "plantilla.html").read_text(encoding="utf-8")
    datos = leer("news.json", {})
    dolar = leer("dolar.json", {})
    sitio = leer("sitio.json", {})
    kw = leer("keywords.json", {})
    fuentes = [m["nombre"] for m in leer("sources.json", {}).get("medios", []) if m.get("activo", True)]
    pagina = armar(plantilla, datos, dolar, sitio, kw, fuentes)
    (ROOT / "index.html").write_text(pagina, encoding="utf-8")
    print(f"[ok] index.html armado con {len(datos.get('notas') or [])} notas")


if __name__ == "__main__":
    escribir_pagina()
