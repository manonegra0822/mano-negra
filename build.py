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
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
TZ = ZoneInfo("America/Argentina/Cordoba")
UA = "Mozilla/5.0 (compatible; ManoNegraBot/1.0; resumen de titulares con enlace a la fuente)"

MAX_NOTAS = 30               # cuántas notas muestra la página
MAX_HORAS = 36               # antigüedad máxima de una nota
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


def limpiar(s):
    s = re.sub(r"<!\[CDATA\[|\]\]>", "", s or "")
    s = re.sub(r"(?is)<(script|style).*?</\1>", " ", s)
    s = re.sub(r"(?s)<[^>]+>", " ", s)
    s = html.unescape(s)
    s = re.sub(r"\s+", " ", s).strip()
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
            salida.append({"titulo": titulo, "url": link.strip(), "desc": limpiar(desc), "fecha": fecha})
    return salida


def descargar(url):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        },
    )
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read()


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
                if horas > MAX_HORAS:
                    continue
            t_norm, d_norm = normalizar(it["titulo"]), normalizar(it["desc"])

            def pt(pats):
                return 2 * puntaje(pats, t_norm) + puntaje(pats, d_norm)

            pol, eco, cor = pt(pol_p), pt(eco_p), pt(cor_p)
            if not (pol + eco >= 1 or (cor >= 1 and m.get("local"))):
                continue
            if puntaje(exc_p, t_norm + " " + d_norm) and (pol + eco) < 3:
                continue
            if cor >= 1:
                seccion = "cordoba"
            elif eco >= pol and eco > 0:
                seccion = "economia"
            else:
                seccion = "argentina"
            base = min(pol + eco + cor, 8) * 2
            if horas is not None:
                base += max(0.0, 6 - max(horas, 0) / 6)
            candidatas.append({
                "fuente": m["nombre"], "acceso": m.get("acceso", "abierto"),
                "titulo": it["titulo"], "url": it["url"], "desc": it["desc"],
                "fecha": it["fecha"], "seccion": seccion, "base": base, "tok": tokens(it["titulo"]),
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
        notas.append({
            "id": hashlib.sha1(rep["url"].encode()).hexdigest()[:10],
            "seccion": rep["seccion"],
            "relevancia": round(rel, 1),
            "hora": hora,
            "titulo": rep["titulo"],
            "fuente": rep["fuente"],
            "url": rep["url"],
            "acceso": rep["acceso"],
            "resumen": resumen,
            "impacto": None,
            "otros": [{"fuente": x["fuente"], "titulo": x["titulo"], "url": x["url"]} for x in g if x is not rep],
        })

    notas.sort(key=lambda n: -n["relevancia"])
    notas = notas[:MAX_NOTAS]
    if not notas:
        print("[error] No quedó ninguna nota. No se modifica la página.", file=sys.stderr)
        sys.exit(1)

    datos = {"actualizado": ahora.isoformat(timespec="seconds"), "notas": notas}
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
