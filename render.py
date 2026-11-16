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
import urllib.parse
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

N_SLIDER = 6      # principales del día (slider)
N_GRILLA = 6      # notas destacadas debajo del slider
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


def meta(n, ahora, con_otros=True):
    sus = ' <span class="tag-sus">(Con suscripción)</span>' if n.get("acceso") != "abierto" else ""
    k = len({o.get("fuente") for o in (n.get("otros") or [])} - {n.get("fuente")})   # medios distintos
    otros = (f' <span class="tag-otros">(+{k} {"medio" if k == 1 else "medios"})</span>'
             if k and con_otros else "")
    return (f'<p class="meta"><span class="meta-fuente">{e(n["fuente"])}</span>'
            f'<span class="meta-sep" aria-hidden="true">—</span>{cuando(n["_f"], ahora)}{otros}{sus}</p>')


def indice(i):
    return f'<span class="idx" aria-hidden="true">MN/{i:02d}</span>'


# Las fotos de los medios pasan por wsrv.nl (gratuito), que las achica y las convierte a WebP:
# una foto de 600 KB queda en unos 25 KB. Si el servicio falla, main.js vuelve a la foto original.
ACHICADOR = "https://wsrv.nl/?url={url}&w={ancho}&output=webp&q=78"
SIN_ACHICAR = ("comercioyjusticia.info",)  # medios cuyas fotos el servicio no puede leer


def achicada(url, ancho):
    if not url.startswith("http") or any(d in url for d in SIN_ACHICAR):
        return url
    return ACHICADOR.format(url=urllib.parse.quote(url, safe=""), ancho=ancho)


def foto(n, clase, ancho, alto, prioridad=False):
    img = n.get("imagen")
    if not img:
        return ""
    src = achicada(img, ancho)
    orig = f' data-orig="{e(img)}"' if src != img else ""
    pos = ""
    r = n.get("rostros")
    if isinstance(r, dict) and "y0" in r and "y1" in r:
        cy = max(8.0, min(92.0, (float(r["y0"]) + float(r["y1"])) / 2 * 100))
        cx = 50.0
        if "x0" in r and "x1" in r:  # centra también en lo ancho, para que no se corten las caras a los costados
            cx = max(8.0, min(92.0, (float(r["x0"]) + float(r["x1"])) / 2 * 100))
        pos = f' style="object-position:{cx:.0f}% {cy:.0f}%"'
    carga = 'fetchpriority="high" decoding="async"' if prioridad else 'loading="lazy" decoding="async"'
    credito = f'<figcaption>(Foto: {e(n.get("imagen_credito") or n["fuente"])})</figcaption>' if clase == "foto-principal" else ""
    return (f'<figure class="{clase}"><img src="{e(src)}"{orig} alt="{e(n["titulo"])}" width="{ancho}" height="{alto}" '
            f'{carga} referrerpolicy="no-referrer"{pos}>{credito}</figure>')


def did(n):
    """Identificador de la nota; las que piden suscripción llevan data-sus para el filtro."""
    return f'data-id="{e(n["id"])}"' + (" data-sus" if n.get("acceso") != "abierto" else "")


def enlace(n, texto=None, clase="nota-link"):
    return (f'<a class="{clase}" href="{e(n["url"])}" target="_blank" rel="noopener">'
            f'{e(texto or n["titulo"])}</a>')


def principal(n, ahora, i=1, total=1, relleno=False):
    """Una tarjeta del carrusel de principales. La primera es la nota del día.
    relleno: reemplazo sin suscripción, solo visible si el lector oculta las notas con suscripción."""
    dia = i == 1
    clase = ("slide" + (" slide--dia" if dia else "") + (" es-activa" if dia and not relleno else "")
             + (" slide--relleno" if relleno else "") + ("" if n.get("imagen") else " slide--sin-foto"))
    rotulo = "(Nota del día)" if dia else "(Principal)"
    cred = f'<p class="slide-cred">(Foto: {e(n.get("imagen_credito") or n["fuente"])})</p>' if n.get("imagen") else ""
    return f'''<article class="{clase}" {did(n)} aria-roledescription="diapositiva" aria-label="{i} de {total}">
  <div class="slide-marco">
    {foto(n, "foto-slide", 900, 1100, prioridad=dia)}
    <div class="slide-txt">
      <p class="slide-top"><span>{rotulo}</span>{indice(i)}</p>
      {volanta(n)}
      <h2 class="slide-tit">{enlace(n)}</h2>
      {meta(n, ahora)}
      {cred}
    </div>
  </div>
</article>'''


def info_slide(n):
    """Bajada y botón de la tarjeta del centro (main.js la cambia al pasar de tarjeta)."""
    sus = " (con suscripción)" if n.get("acceso") != "abierto" else ""
    return (f'<p class="slider-bajada" data-info="bajada">{e(recortar(n.get("resumen"), 40))}</p>'
            f'<a class="btn" data-info="link" href="{e(n["url"])}" target="_blank" rel="noopener">'
            f'<span data-info="medio">Leer en {e(n["fuente"])}{sus}</span><span class="flecha" aria-hidden="true">↗</span></a>')


def slider(notas, ahora, reservas=()):
    """Principales del día: carrusel de tarjetas en perspectiva (flechas en compu, deslizar en el celular).
    reservas: notas abiertas que reemplazan, en el mismo lugar, a las que piden suscripción
    cuando el lector activa el filtro; así el carrusel siempre muestra la misma cantidad."""
    total = len(notas)
    libres = iter(reservas)
    slides = ""
    for i, n in enumerate(notas, 1):
        slides += principal(n, ahora, i, total)
        if n.get("acceso") != "abierto":
            r = next(libres, None)
            if r:
                slides += principal(r, ahora, i, total, relleno=True)
    flechas = "" if total < 2 else '''
  <button class="slider-flecha slider-prev" type="button" aria-label="Noticia anterior"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M19 12H5M11 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
  <button class="slider-flecha slider-next" type="button" aria-label="Noticia siguiente"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'''
    pie = "" if total < 2 else f'''
  <div class="slider-pie">
    <p class="slider-ayuda"><span class="slider-mano" aria-hidden="true">↔</span><span>Deslizá</span></p>
    <ol class="slider-puntos" aria-label="Elegir noticia"></ol>
    <p class="slider-cont" aria-live="polite"><b data-slider-n>01</b> / <span data-slider-t>{total:02d}</span></p>
  </div>'''
    return f'''<div class="slider" data-slider>
  <header class="slider-cab">
    <h2 class="slider-titulo">Principales del día</h2>
    <p class="etiqueta">({total:02d} notas · Edición {ahora:%d.%m} · {ahora:%H:%M} h)</p>
  </header>
  <div class="slider-escena">
    <div class="slider-pista" tabindex="0" aria-label="Principales del día. Deslizá o usá las flechas para pasar.">{slides}</div>{flechas}
  </div>
  <div class="slider-info" aria-live="polite">{info_slide(notas[0])}</div>{pie}
</div>'''


def tarjeta(n, ahora, i=None, con_foto=True, palabras=26, nivel=3, extra=""):
    f = foto(n, "foto-card", 640, 400) if con_foto else ""
    clase = "card" + (" card--foto" if f else " card--texto") + extra
    bajada = f'<p class="card-bajada">{e(recortar(n.get("resumen"), palabras))}</p>' if palabras else ""
    num = f'<p class="card-top">{indice(i)}<span class="flecha" aria-hidden="true">↗</span></p>' if i else ""
    return f'''<article class="{clase}" {did(n)}>
  {num}
  {f}
  <div class="card-txt">
    {volanta(n)}
    <h{nivel} class="card-tit">{enlace(n)}</h{nivel}>
    {bajada}
    {meta(n, ahora)}
  </div>
</article>'''


def bloque_seccion(sid, nombre, notas, resto, total, ahora, ya=frozenset()):
    if not notas:
        cuerpo = '<p class="vacio">No hay notas de esta sección en las últimas 48 horas.</p>'
    else:
        # Todas las cartas llevan foto y bajada: con JavaScript la sección se arma como un mazo
        cuerpo = "".join(tarjeta(n, ahora, con_foto=True, palabras=24) for n in notas)
        # Relleno: notas abiertas de la lista que solo se ven si el lector oculta las de suscripción,
        # para que la sección no quede vacía.
        faltan = len(notas) - sum(1 for n in notas if n.get("acceso") == "abierto")
        abiertas = [n for n in resto if n.get("acceso") == "abierto"]
        # primero las que todavía no aparecen en la portada ni en otra sección
        relleno = ([n for n in abiertas if n["id"] not in ya] + [n for n in abiertas if n["id"] in ya])[:faltan]
        cuerpo += "".join(tarjeta(n, ahora, con_foto=True, palabras=24, extra=" card--relleno") for n in relleno)
    mas = ""
    if resto:
        filas = "".join(f'''<li class="mas-fila" {did(n)}>
  <span class="mas-hora">{cuando(n["_f"], ahora)}</span>
  <h3 class="mas-tit">{enlace(n)}</h3>
  <span class="mas-medio">{e(n["fuente"])}</span>
</li>''' for n in resto)
        mas = f'''<details class="sec-mas">
  <summary><span class="sec-mas-abrir">Ver las {total:02d} notas de {nombre}</span><span class="sec-mas-cerrar">Ver menos</span><span class="flecha" aria-hidden="true">↘</span></summary>
  <ol class="mas-lista">{filas}</ol>
</details>'''
    return f'''<section class="seccion" id="{sid}" aria-labelledby="t-{sid}">
  <header class="sec-head">
    <h2 class="sec-tit" id="t-{sid}">{nombre}</h2>
    <p class="sec-aux"><span class="etiqueta">({total:02d} notas)</span><span class="flecha flecha--grande" aria-hidden="true">↘</span></p>
  </header>
  <div class="sec-grid">{cuerpo}</div>
  {mas}
</section>'''


def ultimas(notas, ahora):
    items = []
    for i, n in enumerate(notas, 1):
        sus = '<span class="tag-sus">(Con suscripción)</span>' if n.get("acceso") != "abierto" else ""
        items.append(f'''<li class="fila" {did(n)}>
  <span class="fila-n" aria-hidden="true">{i:02d}</span>
  <span class="fila-hora">{n["_f"]:%H:%M}</span>
  <span class="fila-sec">{marca(n["_region"])}{REGION[n["_region"]]} / {TEMA[n["_tema"]]}</span>
  <h3 class="fila-tit">{enlace(n)}</h3>
  <span class="fila-medio">{e(n["fuente"])}{sus}</span>
  <span class="flecha" aria-hidden="true">↗</span>
</li>''')
    return "".join(items)


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


def tendencia(actual, anterior):
    try:
        dif = float(actual) - float(anterior)
    except (TypeError, ValueError):
        return ""
    if abs(dif) < 0.005:
        return '<span class="tend tend--igual" title="Sin cambios respecto de la cotización anterior">= 0</span>'
    clase, signo, txt = ("sube", "▲", "Subió") if dif > 0 else ("baja", "▼", "Bajó")
    return (f'<span class="tend tend--{clase}"><span aria-hidden="true">{signo}</span> ${plata(abs(dif))}'
            f'<span class="sr"> ({txt} respecto de la cotización anterior)</span></span>')


def indicadores(d):
    """Dólar blue (venta) y riesgo país, si dolar.py ya los guardó."""
    ind = d.get("indicadores") or {}
    partes = []
    for clave, nombre in (("blue", "Blue"),):
        v = (ind.get(clave) or {}).get("venta")
        if v:
            partes.append(f'<span class="dolar-val dolar-ind">{nombre} <b data-ind="{clave}">${plata(v)}</b></span>')
    r = (ind.get("riesgo") or {}).get("valor")
    if r:
        partes.append(f'<span class="dolar-val dolar-ind">Riesgo país <b data-ind="riesgo">{plata(round(float(r)))}</b></span>')
    return "".join(partes)


def barra_dolar(d):
    if not d.get("venta"):
        return ('<p class="dolar-txt"><span class="etiqueta">(Dólar oficial)</span> <span>Cotización no disponible por el momento.</span>'
                f'{indicadores(d)}</p>')
    f = fecha_de(d.get("actualizado"), None)
    cuando_txt = f"{f:%d/%m} {f:%H:%M} h" if f else ""
    viejo = "" if d.get("vigente", True) else ' <span class="dolar-aviso">(último valor disponible)</span>'
    ant = d.get("anterior") or {}
    return (f'<p class="dolar-txt"><span class="dolar-nom">(Dólar oficial)</span>'
            f'<span class="dolar-val">Compra <b data-dolar="compra">${plata(d["compra"])}</b></span>'
            f'<span class="dolar-val">Venta <b data-dolar="venta">${plata(d["venta"])}</b>'
            f'<span data-dolar="tend">{tendencia(d["venta"], ant.get("venta"))}</span></span>'
            f'{indicadores(d)}'
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


HORARIOS = (8, 13, 20)  # actualizaciones de notas (hora de Córdoba)


def proxima_actualizacion(ahora):
    for h in HORARIOS:
        if ahora.hour < h:
            return f"{h:02d}:00"
    return f"{HORARIOS[0]:02d}:00"


# --- página -------------------------------------------------------------------------------------
def armar(plantilla, datos, dolar, sitio, kw, fuentes):
    ahora = fecha_de(datos.get("actualizado"), dt.datetime.now(TZ))
    cl = Clasificador(kw)
    notas = list(datos.get("notas") or [])
    for n in notas:
        n["_f"] = fecha_de(n.get("fecha"), ahora)
        n["_tema"] = cl.tema(n)
        n["_region"] = cl.region(n)

    principales = notas[:N_SLIDER]
    grilla = notas[N_SLIDER:N_SLIDER + N_GRILLA]
    # Reemplazos sin suscripción para el carrusel: primero las que no están en la portada y tienen foto
    usadas = {n["id"] for n in principales + grilla}
    abiertas = [n for n in notas if n.get("acceso") == "abierto" and n["id"] not in usadas]
    reservas = [n for n in abiertas if n.get("imagen")] + [n for n in abiertas if not n.get("imagen")]
    libres = iter(reservas)   # se comparte: el carrusel toma primero y Titulares sigue con las que quedan
    html_slider = slider(principales, ahora, libres) if principales else '<p class="vacio">Todavía no hay notas cargadas.</p>'
    html_grilla = ""
    for i, n in enumerate(grilla, N_SLIDER + 1):
        html_grilla += tarjeta(n, ahora, i=i)
        if n.get("acceso") != "abierto":
            r = next(libres, None)
            if r:
                html_grilla += tarjeta(r, ahora, i=i, extra=" card--relleno")
    vistas = {n["id"] for n in principales + grilla}
    por_fecha = sorted(notas, key=lambda n: n["_f"], reverse=True)

    bloques = []
    for sid, nombre in SECCIONES:
        de_sec = [n for n in por_fecha if n["_tema"] == sid or n["_region"] == sid]
        nuevas = [n for n in de_sec if n["id"] not in vistas]
        elegidas = (nuevas + [n for n in de_sec if n["id"] in vistas])[:N_SECCION]
        vistas.update(n["id"] for n in elegidas)
        ids = {n["id"] for n in elegidas}
        resto = [n for n in de_sec if n["id"] not in ids]
        bloques.append(bloque_seccion(sid, nombre, elegidas, resto, len(de_sec), ahora, frozenset(vistas)))

    hoy = f"{DIAS[ahora.weekday()]} {ahora.day} de {MESES[ahora.month - 1]} de {ahora.year}"
    menu_extra = '<li><a href="#opinion"><span class="idx">06</span>Opinión</a></li>' if datos.get("opinion") else ""
    contacto = pie_contacto(sitio)
    datos_js = {n["id"]: {
        "t": n["titulo"], "r": recortar(n.get("resumen"), 70), "u": n["url"], "f": n["fuente"],
        "i": n.get("imagen") or "", "c": n.get("imagen_credito") or n["fuente"],
        "h": n["_f"].isoformat(timespec="minutes"), "s": n.get("acceso") != "abierto",
        "k": f'{REGION[n["_region"]]} / {TEMA[n["_tema"]]}', "g": n["_region"],
        "o": [{"f": o["fuente"], "t": o["titulo"], "u": o["url"]} for o in (n.get("otros") or [])[:5]],
    } for n in notas}
    reemplazos = {
        "DOLAR": barra_dolar(dolar),
        "FECHA": e(hoy[:1].upper() + hoy[1:]),
        "EDICION": f"{ahora:%d.%m.%y}",
        "HORA": f"{ahora:%H:%M}",
        "RELOJ": f"{DIAS_C[ahora.weekday()]} {ahora:%d.%m.%y} — {ahora:%H:%M}",
        "N_NOTAS": f"{len(notas):02d}",
        "PROXIMA": proxima_actualizacion(ahora),
        "NOTAS_JSON": json.dumps(datos_js, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/"),
        "N_MEDIOS": f"{len(fuentes):02d}",
        "ACTUALIZADO_ISO": ahora.isoformat(timespec="minutes"),
        "MENU_EXTRA": menu_extra,
        "RIEL_EXTRA": ('<li class="riel-sec"><a class="riel-btn" href="#opinion" data-tip="Opinión" aria-label="Opinión">'
                       '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.5 12a8.5 8.5 0 0 1-12.4 7.5L3.5 21l1.4-4.4A8.5 8.5 0 1 1 20.5 12z"/></svg></a></li>'
                       if datos.get("opinion") else ""),
        "PRINCIPAL": html_slider,
        "GRILLA": html_grilla,
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
