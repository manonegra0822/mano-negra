#!/usr/bin/env python3
"""Mano Negra: arma las notas del día y las inserta en index.html.

Lee los feeds RSS/Atom de sources.json, se queda con las notas de política y
economía, agrupa las que varios medios cubren sobre el mismo tema, elige la más
relevante y escribe todo dentro de index.html (y en news.json).

No usa inteligencia artificial ni servicios pagos. Solo la biblioteca estándar
de Python. El texto de cada nota es el extracto que el propio medio publica en su
feed, recortado, con el enlace a la nota original.
"""
import argparse
import datetime as dt
import hashlib
import html
import json
import re
import sys
import unicodedata
import urllib.request
from urllib.parse import urljoin, urlparse
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
TZ = ZoneInfo("America/Argentina/Cordoba")
UA = "Mozilla/5.0 (compatible; ManoNegraBot/1.0; resumen de titulares con enlace a la fuente)"

MAX_NOTAS = 40               # cuántas notas muestra la página
MAX_HORAS = 48               # antigüedad máxima de una nota (y cuánto se conserva)
MAX_PALABRAS = 65            # largo del extracto (medios abiertos)
MAX_PALABRAS_SUSCRIPCION = 40  # largo del extracto (medios con suscripción)

STOP = set(
    "de la el en y a los las del se que por con para un una su al lo como mas pero sus le ya o "
    "este si porque esta entre cuando muy sin sobre tambien me hasta hay donde quien desde todo "
    "nos durante todos uno les ni contra otros ese eso ante ellos e esto mi antes algunos otro "
    "otras otra tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas "
    "algo nosotros segun tras fue ser son han sera tiene tienen puede pueden".split()
)


def leer_json(ruta, defecto):
    try:
        return json.loads(Path(ruta).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return defecto


def normalizar(texto):
    t = unicodedata.normalize("NFKD", (texto or "").lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def compilar(lista):
    """Una palabra clave es un comienzo de palabra ("cordob" encuentra cordobés).
    Con "$" al final debe ser la palabra exacta ("ley$")."""
    patrones = []
    for k in lista:
        exacta = k.endswith("$")
        k = normalizar(k.rstrip("$"))
        if not k:
            continue
        patrones.append(re.compile(rf"\b{re.escape(k)}\b" if exacta else rf"\b{re.escape(k)}"))
    return patrones


def puntaje(patrones, texto):
    return sum(1 for p in patrones if p.search(texto))


def evaluar_pais(titulo, desc, url, pats):
    """Devuelve (es_extranjera, puntos_argentinos). Una nota es internacional si su sección lo dice
    o si nombra más cosas de otros países que de Argentina (el titular pesa el doble)."""
    ext_p, arg_p, cor_p, url_ex = pats
    t, d = normalizar(titulo), normalizar(desc)
    arg_t = puntaje(arg_p, t) + puntaje(cor_p, t)   # el titular nombra algo argentino: la nota se queda
    arg = 2 * arg_t + puntaje(arg_p, d) + puntaje(cor_p, d)
    ext = 2 * puntaje(ext_p, t) + puntaje(ext_p, d)
    por_url = any(u in (url or "").lower() for u in url_ex)
    return (arg_t == 0 and ((por_url and arg < 4) or (ext > 0 and arg < ext))), arg


def limpiar(s):
    s = re.sub(r"<!\[CDATA\[|\]\]>", "", s or "")
    s = re.sub(r"(?is)<(script|style).*?</\1>", " ", s)
    s = re.sub(r"(?s)<[^>]+>", " ", s)
    s = html.unescape(s)
    s = re.sub(r"\s+", " ", s).strip()
    # Datelines de agencia ("Buenos Aires, 10 oct (EFE).-"): confunden sobre dónde ocurre la nota
    s = re.sub(r"^[A-ZÁÉÍÓÚÑ][^,.()]{1,40},\s*\d{1,2}\s+(?:de\s+)?\w{3,10}\.?\s*\((?:EFE|AFP|AP|Reuters|DPA|Europa Press|Télam|NA|Noticias Argentinas|[A-Z]{2,12})\)\.?\s*[-–—]*\s*", "", s)
    s = re.sub(r"\s*La entrada .{0,300}? se publicó primero en .*$", "", s)
    s = re.sub(r"\s*The post .{0,300}? appeared first on .*$", "", s)
    return s.strip()


def recortar(texto, max_palabras):
    palabras = texto.split()
    if len(palabras) <= max_palabras:
        return texto
    corte = " ".join(palabras[:max_palabras])
    finales = list(re.finditer(r"[.!?](?=\s|$)", corte))
    if finales and finales[-1].end() > len(corte) * 0.5:
        return corte[: finales[-1].end()]
    return corte.rstrip(",;: ") + "…"


def etiqueta(el):
    return el.tag.rsplit("}", 1)[-1].lower()


def texto_hijo(el, nombres):
    for h in el:
        if etiqueta(h) in nombres and (h.text or "").strip():
            return h.text.strip()
    return ""


IMG_NO = re.compile(r"logo|favicon|avatar|gravatar|sprite|1x1|pixel|spacer|blank|placeholder", re.I)


def imagen_valida(url):
    """Solo se aceptan imágenes https que no parezcan íconos o logos."""
    if not url:
        return None
    url = url.strip()
    if url.startswith("http://"):
        url = "https://" + url[len("http://"):]
    p = urlparse(url)
    if p.scheme != "https" or not p.netloc or len(url) > 600 or IMG_NO.search(p.path):
        return None
    return url


def buscar_imagen(it):
    """Imagen que el medio publica en el feed: media:content, media:thumbnail,
    enclosure o la primera etiqueta img del contenido."""
    for h in it.iter():
        if etiqueta(h) in ("content", "thumbnail", "enclosure") and h.get("url"):
            tipo = (h.get("type") or "").lower()
            medio = (h.get("medium") or "").lower()
            u = h.get("url")
            if tipo.startswith("image/") or medio == "image" or etiqueta(h) == "thumbnail" \
                    or re.search(r"\.(jpe?g|png|webp)(\?|$)", u, re.I):
                if imagen_valida(u):
                    return imagen_valida(u)
    for nombre in ("encoded", "content", "description", "summary"):
        for m in re.finditer(r"<img[^>]+src=[\"']([^\"']+)", texto_hijo(it, (nombre,)), re.I):
            if imagen_valida(m.group(1)):
                return imagen_valida(m.group(1))
    return None


def imagen_de_la_pagina(url):
    """Plan B: la imagen de vista previa (og:image) que la propia nota declara."""
    try:
        pagina = descargar(url, limite=400_000, espera=12).decode("utf-8", "ignore")
    except Exception:
        return None
    patrones = (
        r"<meta[^>]+(?:property|name)=[\"'](?:og:image(?::secure_url)?|twitter:image)[\"'][^>]*?content=[\"']([^\"']+)",
        r"<meta[^>]+content=[\"']([^\"']+)[\"'][^>]*?(?:property|name)=[\"'](?:og:image|twitter:image)[\"']",
    )
    for pat in patrones:
        m = re.search(pat, pagina, re.I)
        if m:
            return imagen_valida(urljoin(url, html.unescape(m.group(1))))
    return None


def meta_de_la_pagina(url):
    """Título, extracto, autor y medio que la propia nota declara (og:title, og:description…)."""
    try:
        pagina = descargar(url, limite=400_000, espera=12).decode("utf-8", "ignore")
    except Exception as e:
        print(f"[aviso] no se pudo leer la nota de opinión {url[:70]} ({e})", file=sys.stderr)
        return {}

    def meta(*nombres):
        for nom in nombres:
            for pat in (rf"<meta[^>]+(?:property|name)=[\"']{nom}[\"'][^>]*?content=[\"']([^\"']*)",
                        rf"<meta[^>]+content=[\"']([^\"']*)[\"'][^>]*?(?:property|name)=[\"']{nom}[\"']"):
                m = re.search(pat, pagina, re.I)
                if m and m.group(1).strip():
                    return limpiar(html.unescape(m.group(1)))
        return None

    titulo = meta("og:title", "twitter:title")
    if not titulo:
        m = re.search(r"<title[^>]*>(.*?)</title>", pagina, re.I | re.S)
        titulo = limpiar(m.group(1)) if m else None
    return {"titulo": titulo, "resumen": meta("og:description", "description", "twitter:description"),
            "autor": meta("author", "article:author", "twitter:creator"), "medio": meta("og:site_name")}


def procesar_opinion(entradas, notas, previo, ahora):
    """Notas de opinión: solo las que se marcan en curaduria.json. Si la nota ya está entre las del día,
    se saca de ahí y pasa a esta columna; si no, se toma el título y el extracto de la propia página."""
    cache = {o.get("url"): o for o in previo.get("opinion", [])}
    salida = []
    for e in entradas:
        if isinstance(e, str):
            e = {"url": e} if e.strip().startswith("http") else {"buscar": e}
        clave = (e.get("url") or e.get("buscar") or "").strip()
        if not clave:
            continue
        es_url = clave.startswith("http")
        hallada = next((n for n in notas if (es_url and clave == n["url"]) or
                        (not es_url and normalizar(clave) in normalizar(n["titulo"]))), None)
        if hallada:
            notas.remove(hallada)
            o = {"titulo": hallada["titulo"], "url": hallada["url"], "medio": hallada["fuente"],
                 "resumen": hallada["resumen"], "autor": None, "fecha": hallada.get("fecha")}
        elif es_url:
            o = dict(cache.get(clave) or {})
            o.setdefault("url", clave)
            if not (o.get("titulo") and o.get("resumen")):
                meta = meta_de_la_pagina(clave)
                for campo in ("titulo", "resumen", "autor", "medio"):
                    o[campo] = o.get(campo) or meta.get(campo)
                if o.get("resumen"):
                    o["resumen"] = recortar(o["resumen"], 40)
            if not o.get("medio"):
                o["medio"] = urlparse(clave).netloc.removeprefix("www.")
            o.setdefault("fecha", ahora.isoformat(timespec="seconds"))
        else:
            print(f"[aviso] nota de opinión no encontrada: {clave}", file=sys.stderr)
            continue
        for campo in ("titulo", "autor", "medio", "resumen"):  # lo escrito a mano manda
            if e.get(campo):
                o[campo] = e[campo]
        o["resumen"] = recortar(o.get("resumen") or "", 40)
        if o.get("titulo") and o.get("url"):
            salida.append({c: o.get(c) for c in ("titulo", "url", "medio", "autor", "resumen", "fecha")})
    return salida[:10]


def parsear(datos):
    raiz = ET.fromstring(datos.lstrip())
    salida = []
    for it in raiz.iter():
        if etiqueta(it) not in ("item", "entry"):
            continue
        titulo = limpiar(texto_hijo(it, ("title",)))
        link = texto_hijo(it, ("link",))
        if not link:
            for h in it:
                if etiqueta(h) == "link" and h.get("href") and h.get("rel", "alternate") == "alternate":
                    link = h.get("href")
                    break
        desc = texto_hijo(it, ("description", "summary")) or texto_hijo(it, ("encoded", "content"))
        fecha_txt = texto_hijo(it, ("pubdate", "published", "updated", "date"))
        fecha = None
        if fecha_txt:
            try:
                fecha = parsedate_to_datetime(fecha_txt)
            except Exception:
                try:
                    fecha = dt.datetime.fromisoformat(fecha_txt.replace("Z", "+00:00"))
                except Exception:
                    fecha = None
        if fecha is not None and fecha.tzinfo is None:
            fecha = fecha.replace(tzinfo=dt.timezone.utc)
        if titulo and link:
            salida.append({"titulo": titulo, "url": link.strip(), "desc": limpiar(desc), "fecha": fecha,
                           "imagen": buscar_imagen(it)})
    return salida


def descargar(url, limite=None, espera=25):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        },
    )
    with urllib.request.urlopen(req, timeout=espera) as r:
        return r.read(limite) if limite else r.read()

try:  # opcional: si no está instalado, las fotos se muestran con encuadre por defecto
    import io
    import numpy as np
    from PIL import Image
    from skimage import data as _skdata
    from skimage.feature import Cascade
    _DETECTOR = Cascade(_skdata.lbp_frontal_face_cascade_filename())
except Exception:  # pragma: no cover
    _DETECTOR = None


def detectar_rostros(url):
    """Devuelve {"y0":…, "y1":…} (fracción de la altura de la foto que ocupan los rostros) o None.
    Solo se baja la imagen para medirla; no se guarda ni se publica copia."""
    if _DETECTOR is None:
        return None
    try:
        if url.startswith("fotos/"):  # foto propia subida al repositorio
            datos = (ROOT / url).read_bytes()
        else:
            datos = descargar(url, limite=3_000_000, espera=12)
        im = Image.open(io.BytesIO(datos)).convert("L")
        ancho0, alto0 = im.size
        if ancho0 > 700:
            im = im.resize((700, max(1, int(alto0 * 700 / ancho0))))
        arr = np.asarray(im)
        alto, ancho = arr.shape
        minimo = max(24, ancho // 20)
        cajas = _DETECTOR.detect_multi_scale(img=arr, scale_factor=1.2, step_ratio=1,
                                             min_size=(minimo, minimo),
                                             max_size=(ancho, ancho))
        if len(cajas) == 0:
            return None
        # se descartan detecciones chicas frente a la mayor (suelen ser falsos positivos)
        mayor = max(c["height"] * c["width"] for c in cajas)
        cajas = [c for c in cajas if c["height"] * c["width"] >= 0.45 * mayor]
        y0 = min(c["r"] for c in cajas) / alto
        y1 = max(c["r"] + c["height"] for c in cajas) / alto
        # margen: frente arriba y cuello/mentón abajo
        return {"y0": round(max(0.0, y0 - 0.06), 3), "y1": round(min(1.0, y1 + 0.06), 3)}
    except Exception as e:
        print(f"[aviso] no se pudo analizar la imagen {url[:60]} ({e})", file=sys.stderr)
        return None


def tokens(titulo):
    return {t for t in normalizar(titulo).split() if len(t) >= 4 and t not in STOP}


def agrupar(notas):
    """Junta las notas de distintos medios que hablan de lo mismo."""
    grupos = []
    for n in sorted(notas, key=lambda x: -x["base"]):
        for g in grupos:
            if any(m["fuente"] == n["fuente"] for m in g):
                continue
            inter = len(n["tok"] & g[0]["tok"])
            union = len(n["tok"] | g[0]["tok"])
            if inter >= 3 and union and inter / union >= 0.4:
                g.append(n)
                break
        else:
            grupos.append([n])
    return grupos


def main():
    ap = argparse.ArgumentParser(description="Actualiza las notas de Mano Negra")
    ap.add_argument("--sources", default=ROOT / "sources.json")
    ap.add_argument("--keywords", default=ROOT / "keywords.json")
    ap.add_argument("--curaduria", default=ROOT / "curaduria.json")
    ap.add_argument("--html", default=ROOT / "index.html")
    ap.add_argument("--json", default=ROOT / "news.json")
    args = ap.parse_args()

    medios = [m for m in leer_json(args.sources, {}).get("medios", []) if m.get("activo", True) and m.get("feed")]
    kw = leer_json(args.keywords, {})
    cur = leer_json(args.curaduria, {})
    pol_p, eco_p = compilar(kw.get("politica", [])), compilar(kw.get("economia", []))
    cor_p, exc_p = compilar(kw.get("cordoba", [])), compilar(kw.get("excluir", []))
    arg_p = compilar(kw.get("argentina", []))
    ext_p = compilar(kw.get("extranjero", []))
    pats_pais = (ext_p, arg_p, cor_p, [u.lower() for u in kw.get("url_excluir", [])])
    ocultar = [normalizar(o) for o in cur.get("ocultar", []) if o]
    fijar = (cur.get("fijar") or "").strip()

    ahora = dt.datetime.now(TZ)
    candidatas = []
    for m in medios:
        try:
            items = parsear(descargar(m["feed"]))
        except Exception as e:  # un medio caído no frena a los demás
            print(f"[aviso] {m['nombre']}: no se pudo leer el feed ({e})", file=sys.stderr)
            continue
        guardadas = 0
        for it in items:
            horas = None
            if it["fecha"] is not None:
                horas = (ahora - it["fecha"].astimezone(TZ)).total_seconds() / 3600
                if horas > m.get("max_horas", MAX_HORAS):
                    continue
            t_norm, d_norm = normalizar(it["titulo"]), normalizar(it["desc"])

            def pt(pats):
                return 2 * puntaje(pats, t_norm) + puntaje(pats, d_norm)

            pol, eco, cor, arg = pt(pol_p), pt(eco_p), pt(cor_p), pt(arg_p)
            # Si el medio indica secciones permitidas, solo se aceptan notas de esas secciones
            if m.get("url_permitir") and not any(u in it["url"].lower() for u in m["url_permitir"]):
                continue
            # Solo política y economía/finanzas: el titular tiene que nombrar al menos un tema de esas áreas
            tpe = puntaje(pol_p, t_norm) + puntaje(eco_p, t_norm)
            if tpe < 1:
                continue
            # Nada de deportes, policiales, clima ni espectáculos (salvo que el titular sea claramente político o económico)
            if (puntaje(exc_p, t_norm) or puntaje(exc_p, d_norm) >= 2) and tpe < 2:
                continue
            # Nada de notas internacionales: la nota tiene que ser sobre Argentina
            extranjera, arg_pts = evaluar_pais(it["titulo"], it["desc"], it["url"], pats_pais)
            if extranjera:
                continue
            if m.get("filtrar_argentina", True) and arg_pts < 1:
                continue
            if cor >= 1:
                seccion = "cordoba"
            elif eco >= pol and eco > 0:
                seccion = "economia"
            elif m.get("region") == "cordoba":
                seccion = "cordoba"  # política de un medio cordobés, aunque no nombre a Córdoba
            else:
                seccion = "argentina"
            base = min(pol + eco + cor + arg, 8) * 2
            if horas is not None:
                base += max(0.0, 6 - max(horas, 0) / 6)
            candidatas.append({
                "fuente": m["nombre"], "acceso": m.get("acceso", "abierto"),
                "titulo": it["titulo"], "url": it["url"], "desc": it["desc"],
                "fecha": it["fecha"], "seccion": seccion, "base": base, "tok": tokens(it["titulo"]),
                "imagen": it["imagen"],
            })
            guardadas += 1
        print(f"[ok] {m['nombre']}: {len(items)} notas en el feed, {guardadas} de política/economía")

    notas = []
    for g in agrupar(candidatas):
        rep = max(g, key=lambda x: (x["acceso"] == "abierto", len(x["desc"])))
        urls = " ".join(x["url"] for x in g)
        texto_g = normalizar(" ".join(x["titulo"] for x in g))
        if any(o and (o in normalizar(urls) or o in texto_g) for o in ocultar):
            continue
        rel = max(x["base"] for x in g) + 12 * (len(g) - 1)
        if fijar and fijar in urls:
            rel += 10000
        limite = MAX_PALABRAS if rep["acceso"] == "abierto" else MAX_PALABRAS_SUSCRIPCION
        resumen = recortar(rep["desc"], limite) or "El medio no publica un extracto de esta nota. Se puede leer completa en el enlace."
        hora = rep["fecha"].astimezone(TZ).strftime("%H:%M") if rep["fecha"] else ""
        imagen, credito = rep.get("imagen"), rep["fuente"]
        if not imagen:
            for x in g:
                if x.get("imagen"):
                    imagen, credito = x["imagen"], x["fuente"]
                    break
        notas.append({
            "id": hashlib.sha1(rep["url"].encode()).hexdigest()[:10],
            "seccion": rep["seccion"],
            "rel": round(rel, 1),
            "relevancia": round(rel, 1),
            "fecha": (rep["fecha"] or ahora).astimezone(TZ).isoformat(timespec="seconds"),
            "hora": hora,
            "titulo": rep["titulo"],
            "fuente": rep["fuente"],
            "url": rep["url"],
            "acceso": rep["acceso"],
            "resumen": resumen,
            "impacto": None,
            "imagen": imagen,
            "imagen_credito": credito if imagen else None,
            "otros": [{"fuente": x["fuente"], "titulo": x["titulo"], "url": x["url"]} for x in g if x is not rep],
        })

    # Notas de la corrida anterior que siguen dentro de la ventana de 48 horas
    previo = leer_json(args.json, {})
    vistas_url = {u for n in notas for u in [n["url"]] + [o["url"] for o in n["otros"]]}
    vistos_tit = {normalizar(n["titulo"]) for n in notas}
    arrastradas = 0
    for v in previo.get("notas", []):
        try:
            f = dt.datetime.fromisoformat(v.get("fecha") or previo.get("actualizado"))
        except Exception:
            continue
        if (ahora - f.astimezone(TZ)).total_seconds() / 3600 > MAX_HORAS:
            continue
        tv, rv = normalizar(v.get("titulo", "")), normalizar(v.get("resumen", ""))
        tpe_v = puntaje(pol_p, tv) + puntaje(eco_p, tv)
        if tpe_v < 1 or ((puntaje(exc_p, tv) or puntaje(exc_p, rv) >= 2) and tpe_v < 2):
            continue  # los filtros de tema también rigen para lo ya guardado
        extranjera, _ = evaluar_pais(v.get("titulo", ""), v.get("resumen", ""), v.get("url", ""), pats_pais)
        if extranjera:
            continue  # la regla de otros países también rige para lo ya guardado
        if v.get("url") in vistas_url or normalizar(v.get("titulo", "")) in vistos_tit:
            continue
        if any(o and (o in normalizar(v.get("url", "")) or o in normalizar(v.get("titulo", ""))) for o in ocultar):
            continue
        v["fecha"] = f.astimezone(TZ).isoformat(timespec="seconds")
        v["rel"] = v.get("rel", v.get("relevancia", 0))
        notas.append(v)
        arrastradas += 1
    print(f"[ok] {arrastradas} notas conservadas de la corrida anterior (ventana de {MAX_HORAS} h)")

    opinion = procesar_opinion(cur.get("opinion", []), notas, previo, ahora)
    print(f"[ok] {len(opinion)} notas de opinión")

    # Hoy primero: lo de ayer queda debajo de lo de hoy y la nota del día siempre es reciente
    for n in notas:
        f = dt.datetime.fromisoformat(n["fecha"]).astimezone(TZ)
        n["dia"] = max(0, (ahora.date() - f.date()).days)
        viejo = (ahora - f).total_seconds() / 3600 > 24
        n["relevancia"] = round(n["rel"] - (500 if viejo else 0), 1)
    notas.sort(key=lambda n: -n["relevancia"])
    notas = notas[:MAX_NOTAS]
    if not notas:
        print("[error] No quedó ninguna nota. No se modifica la página.", file=sys.stderr)
        sys.exit(1)

    # Fotos puestas a mano en curaduria.json: mandan sobre las del medio
    for f in cur.get("fotos", []):
        buscar, archivo = normalizar(f.get("buscar", "")), f.get("archivo", "")
        if not buscar or not re.fullmatch(r"fotos/[\w.\-]+", archivo) or not (ROOT / archivo).is_file():
            print(f"[aviso] foto manual ignorada: {f}", file=sys.stderr)
            continue
        for n in notas:
            if buscar in normalizar(n["titulo"]) or buscar in n["url"].lower():
                n["imagen"], n["imagen_credito"] = archivo, f.get("credito") or "Foto propia"

    # Las notas más importantes que no traen imagen en el feed: se busca la de la propia página
    for n in notas[:12]:
        if not n["imagen"]:
            img = imagen_de_la_pagina(n["url"])
            if img:
                n["imagen"], n["imagen_credito"] = img, n["fuente"]
    print(f"[ok] {sum(1 for n in notas if n['imagen'])} de {len(notas)} notas con imagen")
    cache_rostros = {v["imagen"]: v.get("rostros") for v in previo.get("notas", []) if v.get("imagen") and "rostros" in v}
    # Encuadre: si hay rostros, la página centra la foto en ellos para no cortarlos
    for n in notas:
        if not n["imagen"]:
            n["rostros"] = None
        elif n["imagen"] in cache_rostros:
            n["rostros"] = cache_rostros[n["imagen"]]
        else:
            n["rostros"] = cache_rostros[n["imagen"]] = detectar_rostros(n["imagen"])
    print(f"[ok] {sum(1 for n in notas if n['rostros'])} fotos con rostros detectados" + ("" if _DETECTOR else " (detector no instalado)"))

    datos = {"actualizado": ahora.isoformat(timespec="seconds"), "notas": notas, "opinion": opinion}
    Path(args.json).write_text(json.dumps(datos, ensure_ascii=False, indent=2), encoding="utf-8")

    pagina = Path(args.html).read_text(encoding="utf-8")
    patron = re.compile(r'(<script type="application/json" id="news-data">)(.*?)(</script>)', re.S)
    if not patron.search(pagina):
        print("[error] No encuentro el bloque news-data en index.html.", file=sys.stderr)
        sys.exit(1)
    cuerpo = json.dumps(datos, ensure_ascii=False, indent=2).replace("</", "<\\/")
    nueva = patron.sub(lambda mo: mo.group(1) + "\n" + cuerpo + "\n" + mo.group(3), pagina, count=1)
    Path(args.html).write_text(nueva, encoding="utf-8")
    print(f"[listo] {len(notas)} notas. Nota del día: {notas[0]['titulo']}")


if __name__ == "__main__":
    main()
