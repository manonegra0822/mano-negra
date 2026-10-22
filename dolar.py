#!/usr/bin/env python3
"""Mano Negra: actualiza la cotización del dólar oficial en dolar.json.

Consulta la API pública y gratuita de dolarapi.com (dólar oficial). Si la consulta
falla, conserva el último valor guardado y lo marca como tal, para que la barra
de la página nunca quede vacía. Después vuelve a armar index.html con el valor nuevo.
Solo usa la biblioteca estándar de Python.
"""
import datetime as dt
import json
import sys
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
TZ = ZoneInfo("America/Argentina/Cordoba")
API = "https://dolarapi.com/v1/dolares/oficial"
ARCHIVO = ROOT / "dolar.json"


def leer_previo():
    try:
        return json.loads(ARCHIVO.read_text(encoding="utf-8"))
    except Exception:
        return {}


def consultar():
    req = urllib.request.Request(API, headers={"User-Agent": "ManoNegraBot/1.0", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        d = json.loads(r.read().decode("utf-8"))
    compra, venta = float(d["compra"]), float(d["venta"])
    if not (0 < compra < 1e7 and 0 < venta < 1e7):
        raise ValueError("valores fuera de rango")
    fecha = d.get("fechaActualizacion")
    if fecha:
        fecha = dt.datetime.fromisoformat(fecha.replace("Z", "+00:00")).astimezone(TZ).isoformat(timespec="minutes")
    return compra, venta, fecha


HORARIOS = ((10, 30), (15, 0))


def ya_actualizado(previo, ahora):
    """True si ya se consultó después del último horario programado (para las corridas de respaldo)."""
    try:
        ultimo = dt.datetime.fromisoformat(previo["consultado"])
    except Exception:
        return False
    pasados = [ahora.replace(hour=h, minute=m, second=0, microsecond=0) for h, m in HORARIOS]
    pasados = [x for x in pasados if x <= ahora]
    return bool(pasados) and ultimo >= pasados[-1]


def main():
    ahora_dt = dt.datetime.now(TZ)
    ahora = ahora_dt.isoformat(timespec="minutes")
    previo = leer_previo()
    if "--si-falta" in sys.argv and previo.get("vigente") and ya_actualizado(previo, ahora_dt):
        print("[ok] Ya se actualizó en el último horario; no hace falta repetir.")
        return
    try:
        compra, venta, fecha = consultar()
        datos = {
            "nombre": "Dólar oficial",
            "compra": compra,
            "venta": venta,
            # Fecha que se muestra en la página: el momento en que se verificó la cotización
            "actualizado": ahora,
            "consultado": ahora,
            "fecha_fuente": fecha,
            "fuente": "dolarapi.com",
            "vigente": True,
        }
        # Se guarda la cotización anterior para mostrar si subió o bajó
        if previo.get("venta") and (previo.get("venta"), previo.get("compra")) != (venta, compra):
            datos["anterior"] = {k: previo.get(k) for k in ("compra", "venta", "actualizado")}
        elif previo.get("anterior"):
            datos["anterior"] = previo["anterior"]
        print(f"[ok] Dólar oficial: compra {compra} / venta {venta} ({datos['actualizado']})")
    except Exception as e:
        if not previo.get("venta"):
            print(f"[error] No hay cotización y tampoco un valor guardado: {e}", file=sys.stderr)
            sys.exit(1)
        datos = dict(previo, vigente=False, consultado=ahora)
        print(f"[aviso] Falló la consulta ({e}); se mantiene el último valor guardado.", file=sys.stderr)
    ARCHIVO.write_text(json.dumps(datos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # Rearma la página con la cotización nueva (sin volver a leer los medios)
    import render
    render.escribir_pagina()


if __name__ == "__main__":
    main()
