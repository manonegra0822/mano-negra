/* Mano Negra · comportamiento de la página.
   Todo es un agregado: si este archivo no carga, las notas se leen igual. */
(function () {
  "use strict";
  var raiz = document.documentElement;

  function seguro(fn, nombre) {
    try { fn(); } catch (e) { if (window.console) console.warn("[mano negra] " + nombre, e); }
  }

  /* ---- Fondo blanco / fondo negro ---- */
  function iniciarTema() {
    var btn = document.querySelector(".tema-btn");
    if (!btn) return;
    var txt = btn.querySelector(".tema-txt");
    function pintar() {
      var oscuro = raiz.getAttribute("data-tema") === "oscuro";
      btn.setAttribute("aria-pressed", oscuro ? "true" : "false");
      var etiqueta = oscuro ? "Claro" : "Oscuro";
      if (txt) txt.textContent = etiqueta;
      btn.setAttribute("aria-label", oscuro ? "Cambiar a fondo blanco" : "Cambiar a fondo negro");
      btn.setAttribute("data-tip", oscuro ? "Fondo claro" : "Fondo oscuro");
    }
    btn.addEventListener("click", function () {
      var nuevo = raiz.getAttribute("data-tema") === "oscuro" ? "claro" : "oscuro";
      raiz.setAttribute("data-tema", nuevo);
      try { localStorage.setItem("mn-tema", nuevo); } catch (e) {}
      pintar();
    });
    pintar();
  }

  /* ---- Menú hamburguesa (celular) ---- */
  function iniciarMenu() {
    var btn = document.querySelector(".menu-btn");
    var menu = document.getElementById("menu");
    if (!btn || !menu) return;
    var sr = btn.querySelector(".menu-txt");
    function poner(abierto) {
      btn.setAttribute("aria-expanded", abierto ? "true" : "false");
      menu.classList.toggle("abierto", abierto);
      btn.setAttribute("aria-label", abierto ? "Cerrar el menú" : "Abrir el menú");
      if (sr) sr.textContent = abierto ? "Cerrar" : "Menú";
    }
    btn.addEventListener("click", function () { poner(btn.getAttribute("aria-expanded") !== "true"); });
    menu.addEventListener("click", function (ev) { if (ev.target.closest("a")) poner(false); });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && btn.getAttribute("aria-expanded") === "true") { poner(false); btn.focus(); }
    });
    window.addEventListener("resize", function () { if (window.innerWidth >= 960) poner(false); });
  }

  /* ---- La barra fija muestra la marca cuando la cabecera grande sale de pantalla ---- */
  function iniciarMarca() {
    var cab = document.getElementById("cabecera");
    if (!cab || !("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (en) {
      raiz.classList.toggle("cab-visible", en[0].isIntersecting);
    }, { rootMargin: "-64px 0px 0px 0px", threshold: 0 });
    io.observe(cab);
  }

  /* ---- Reloj de Córdoba en la franja superior ---- */
  function iniciarReloj() {
    var el = document.querySelector("[data-reloj]");
    if (!el || !window.Intl) return;
    var dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    function tic() {
      var p = {};
      new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Cordoba", weekday: "short", day: "2-digit",
        month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
        .formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
      var d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Cordoba" }));
      el.textContent = dias[d.getDay()] + " " + p.day + "." + p.month + "." + p.year + " — " + p.hour + ":" + p.minute;
    }
    tic();
    setInterval(tic, 15000);
  }

  /* ---- Marcar la sección visible en el menú ---- */
  function iniciarSeccionActual() {
    if (!("IntersectionObserver" in window)) return;
    var enlaces = document.querySelectorAll(".menu-lista a[href^='#'], .riel-lista a[href^='#']");
    var mapa = {};
    enlaces.forEach(function (a) { var id = a.getAttribute("href").slice(1); (mapa[id] = mapa[id] || []).push(a); });
    var io = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (en) {
        if (!en.isIntersecting || !mapa[en.target.id]) return;
        enlaces.forEach(function (a) { a.removeAttribute("aria-current"); });
        mapa[en.target.id].forEach(function (a) { a.setAttribute("aria-current", "page"); });
      });
    }, { rootMargin: "-40% 0px -55% 0px", threshold: 0 });
    Object.keys(mapa).forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
  }

  /* ---- Cotización del dólar: se lee dolar.json; si falla, queda el último valor escrito en la página ---- */
  function plata(v) {
    var n = Number(v);
    if (!isFinite(n) || n <= 0) return null;
    return "$" + n.toLocaleString("es-AR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }
  function iniciarDolar() {
    if (!window.fetch) return;
    fetch("dolar.json?t=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        var compra = plata(d.compra), venta = plata(d.venta);
        if (!compra || !venta) return;
        var f = new Date(d.actualizado);
        var hora = isNaN(f) ? "" : f.toLocaleString("es-AR", {
          timeZone: "America/Argentina/Cordoba", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
        }).replace(",", "") + " h";
        var el;
        if ((el = document.querySelector("[data-dolar='compra']"))) el.textContent = compra;
        if ((el = document.querySelector("[data-dolar='venta']"))) el.textContent = venta;
        if (hora && (el = document.querySelector("[data-dolar='hora']"))) el.textContent = hora;
        var ind = d.indicadores || {};
        ["blue"].forEach(function (k) {
          var v = ind[k] && plata(ind[k].venta), x = document.querySelector("[data-ind='" + k + "']");
          if (v && x) x.textContent = v;
        });
        var rp = ind.riesgo && Number(ind.riesgo.valor), xr = document.querySelector("[data-ind='riesgo']");
        if (rp > 0 && xr) xr.textContent = Math.round(rp).toLocaleString("es-AR");
        var t = document.querySelector("[data-dolar='tend']"), ant = d.anterior && Number(d.anterior.venta);
        if (t && ant) {
          var dif = Number(d.venta) - ant, span = document.createElement("span");
          if (Math.abs(dif) < 0.005) { span.className = "tend tend--igual"; span.textContent = "= 0"; }
          else {
            span.className = "tend tend--" + (dif > 0 ? "sube" : "baja");
            span.textContent = (dif > 0 ? "▲ " : "▼ ") + plata(Math.abs(dif));
            var sr = document.createElement("span"); sr.className = "sr";
            sr.textContent = dif > 0 ? " (Subió respecto de la cotización anterior)" : " (Bajó respecto de la cotización anterior)";
            span.appendChild(sr);
          }
          t.textContent = ""; t.appendChild(span);
        }
      })
      .catch(function () { /* se mantiene el valor que ya está en la página */ });
  }

  /* ---- Horarios relativos ("Hace 25 min") ---- */
  function iniciarTiempos() {
    var marcas = document.querySelectorAll("time[data-rel]");
    if (!marcas.length) return;
    function texto(f) {
      var min = Math.round((Date.now() - f.getTime()) / 60000);
      if (min < 1) return "Recién";
      if (min < 60) return "Hace " + min + " min";
      var h = Math.floor(min / 60);
      if (h < 24) return "Hace " + h + " h";
      return null;
    }
    function actualizar() {
      marcas.forEach(function (t) {
        var f = new Date(t.getAttribute("datetime"));
        if (isNaN(f)) return;
        var nuevo = texto(f);
        if (nuevo) t.textContent = nuevo;
      });
    }
    actualizar();
    setInterval(actualizar, 60000);
  }

  /* ---- Si una foto del medio no carga, se oculta su marco ---- */
  function iniciarFotos() {
    function ocultar(img) {
      var fig = img.closest("figure");
      if (!fig) return;
      fig.classList.add("sin-foto");
      var art = fig.closest(".card, .lead");
      if (art) art.classList.add(art.classList.contains("lead") ? "lead--sin-foto" : "card--texto");
    }
    // Si falla la foto achicada, se prueba una vez con la original del medio; si también falla, se oculta.
    function fallo(img) {
      var orig = img.getAttribute("data-orig");
      if (orig && img.getAttribute("src") !== orig) { img.removeAttribute("data-orig"); img.src = orig; return; }
      ocultar(img);
    }
    document.querySelectorAll("figure img").forEach(function (img) {
      img.addEventListener("error", function () { fallo(img); });
      if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) fallo(img);
    });
  }


  /* ======================================================================
     Datos de las notas (para el panel de lectura, el buscador y las nuevas)
     ====================================================================== */
  var NOTAS = {};
  try { NOTAS = JSON.parse(document.getElementById("notas-data").textContent) || {}; } catch (e) { NOTAS = {}; }
  var TZ = "America/Argentina/Cordoba";

  function horaTxt(iso) {
    var f = new Date(iso);
    if (isNaN(f)) return "";
    var min = Math.round((Date.now() - f.getTime()) / 60000);
    if (min < 1) return "Recién";
    if (min < 60) return "Hace " + min + " min";
    if (min < 24 * 60) return "Hace " + Math.floor(min / 60) + " h";
    return f.toLocaleString("es-AR", { timeZone: TZ, weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  }
  function normal(t) {
    return (t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  function el(tag, clase, texto) {
    var x = document.createElement(tag);
    if (clase) x.className = clase;
    if (texto != null) x.textContent = texto;
    return x;
  }

  /* ---- Panel de lectura rápida (abre la nota sin salir del sitio) ---- */
  var abrirPanel = null;
  function iniciarPanel() {
    var dlg = document.getElementById("panel");
    if (!dlg || typeof dlg.showModal !== "function") return;   // navegador viejo: los enlaces van directo al medio
    function q(k) { return dlg.querySelector("[data-p='" + k + "']"); }
    var orden = [], vistos = {};
    Array.prototype.slice.call(document.querySelectorAll("main [data-id]"))
      .concat(Array.prototype.slice.call(document.querySelectorAll(".cinta-lista:not([aria-hidden]) [data-id]"))).forEach(function (n) {
      var id = n.getAttribute("data-id");
      if (NOTAS[id] && !vistos[id]) { vistos[id] = 1; orden.push(id); }
    });
    var actual = null, enHistorial = false;

    function compartirUrls(n) {
      var texto = n.t + " — vía Mano Negra";
      q("wa").href = "https://wa.me/?text=" + encodeURIComponent(texto + " " + n.u);
      q("x").href = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(texto) + "&url=" + encodeURIComponent(n.u);
      q("fb").href = "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(n.u);
    }
    function pintar(id) {
      var n = NOTAS[id];
      if (!n) return;
      actual = id;
      var i = orden.indexOf(id);
      q("pos").textContent = "(Lectura rápida" + (i >= 0 ? " · " + String(i + 1).padStart(2, "0") + "/" + String(orden.length).padStart(2, "0") : "") + ")";
      q("prev").disabled = i <= 0;
      q("next").disabled = i < 0 || i >= orden.length - 1;
      var fig = q("fig"), img = q("img");
      if (n.i) { fig.hidden = false; fig.classList.remove("sin-foto"); img.src = n.i; img.alt = n.t; q("cred").textContent = "(Foto: " + n.c + ")"; }
      else { fig.hidden = true; img.removeAttribute("src"); }
      img.onerror = function () { fig.hidden = true; };
      var k = q("kick"); k.textContent = "";
      var mk = el("span", "mk mk-" + n.g); mk.setAttribute("aria-hidden", "true"); k.appendChild(mk); k.appendChild(el("span", "", n.k));
      q("tit").textContent = n.t;
      q("res").textContent = n.r || "";
      var m = q("meta"); m.textContent = "";
      m.appendChild(el("span", "meta-fuente", n.f)); m.appendChild(el("span", "meta-sep", "—")); m.appendChild(el("span", "", horaTxt(n.h)));
      if (n.s) m.appendChild(el("span", "tag-sus", "(Con suscripción)"));
      q("leer").href = n.u;
      q("leer-txt").textContent = "Leer en " + n.f;
      compartirUrls(n);
      q("opciones").hidden = true; q("compartir").setAttribute("aria-expanded", "false"); q("copiado").textContent = "";
      var o = q("otros"); o.textContent = "";
      if (n.o && n.o.length) {
        o.appendChild(el("h3", "etiqueta", "(También lo cubren)"));
        var ul = el("ul");
        n.o.forEach(function (x) {
          var li = el("li"), a = el("a");
          a.href = x.u; a.target = "_blank"; a.rel = "noopener";
          a.appendChild(el("span", "otros-medio", x.f)); a.appendChild(el("span", "otros-tit-n", x.t));
          var fl = el("span", "flecha", "↗"); fl.setAttribute("aria-hidden", "true"); a.appendChild(fl);
          li.appendChild(a); ul.appendChild(li);
        });
        o.appendChild(ul);
      }
      dlg.querySelector(".panel-cuerpo").scrollTop = 0;
    }
    /* El panel nace de la tarjeta tocada: arranca con su tamaño y lugar, crece hasta el suyo y al cerrar vuelve */
    var animando = false;
    function sinMovimiento() { return matchMedia("(prefers-reduced-motion: reduce)").matches || typeof dlg.animate !== "function"; }
    function marcoDe(id, desde) {
      var el = desde || document.querySelector("main [data-id='" + id + "']");
      if (!el) return null;
      el = el.querySelector(".slide-marco") || el;
      var r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 30 || r.bottom < 0 || r.top > innerHeight) return null;   // tiene que estar a la vista
      return r;
    }
    function viaje(r) {
      var f = dlg.getBoundingClientRect();
      return "translate(" + (r.left - f.left).toFixed(1) + "px," + (r.top - f.top).toFixed(1) + "px) scale(" + (r.width / f.width).toFixed(4) + "," + (r.height / f.height).toFixed(4) + ")";
    }
    function crecer(r) {
      if (!r || sinMovimiento()) return;
      dlg.classList.add("nace");
      var a = dlg.animate([
        { transformOrigin: "0 0", transform: viaje(r), borderRadius: "16px" },
        { transformOrigin: "0 0", transform: "none", borderRadius: "0px" }
      ], { duration: 460, easing: "cubic-bezier(.2,.75,.15,1)" });
      dlg.querySelector(".panel-in").animate([{ opacity: 0 }, { opacity: 0, offset: .35 }, { opacity: 1 }], { duration: 460, easing: "ease-out" });
      a.onfinish = a.oncancel = function () { dlg.classList.remove("nace"); };
      setTimeout(function () { dlg.classList.remove("nace"); }, 700);   // seguro si el navegador frena la animación
    }
    function abrir(id, desde) {
      pintar(id);
      if (!dlg.open) {
        var r = marcoDe(id, desde);
        dlg.showModal();
        raiz.classList.add("con-panel");
        try { history.pushState({ mnPanel: 1 }, ""); enHistorial = true; } catch (e) { enHistorial = false; }
        crecer(r);
      }
      q("cerrar").focus();
    }
    function cerrar(desdeHistorial) {
      if (!dlg.open || animando) return;
      var r = marcoDe(actual);
      if (r && !sinMovimiento()) {
        animando = true;
        dlg.classList.add("nace");
        dlg.querySelector(".panel-in").animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: "forwards" });
        var a = dlg.animate([
          { transformOrigin: "0 0", transform: "none", borderRadius: "0px" },
          { transformOrigin: "0 0", transform: viaje(r), borderRadius: "16px", opacity: .4 }
        ], { duration: 380, easing: "cubic-bezier(.5,0,.2,1)", fill: "forwards" });
        var listo = false;
        var terminar = function () {
          if (listo) return; listo = true;
          animando = false;
          dlg.getAnimations({ subtree: true }).forEach(function (x) { x.cancel(); });
          dlg.classList.remove("nace");
          cerrarYa(desdeHistorial);
        };
        a.onfinish = terminar;
        setTimeout(terminar, 520);   // seguro: cierra aunque el navegador frene la animación
        return;
      }
      cerrarYa(desdeHistorial);
    }
    function cerrarYa(desdeHistorial) {
      if (!dlg.open) return;
      dlg.close();
      raiz.classList.remove("con-panel");
      if (enHistorial && !desdeHistorial) { enHistorial = false; try { history.back(); } catch (e) {} }
      enHistorial = false;
      var origen = actual && document.querySelector("main [data-id='" + actual + "'] .nota-link");
      if (origen) origen.focus({ preventScroll: true });
    }
    function mover(d) {
      var i = orden.indexOf(actual) + d;
      while (i >= 0 && i < orden.length && sinSus() && NOTAS[orden[i]].s) i += d;   // salta las ocultas por el filtro
      if (i >= 0 && i < orden.length) pintar(orden[i]);
    }
    abrirPanel = abrir;
    window.addEventListener("popstate", function () { if (dlg.open) { enHistorial = false; cerrar(true); } });
    q("cerrar").addEventListener("click", function () { cerrar(); });
    q("prev").addEventListener("click", function () { mover(-1); });
    q("next").addEventListener("click", function () { mover(1); });
    dlg.addEventListener("cancel", function (ev) { ev.preventDefault(); cerrar(); });
    dlg.addEventListener("click", function (ev) { if (ev.target === dlg) cerrar(); });   // tocar fuera del panel
    dlg.addEventListener("keydown", function (ev) {
      if (ev.target.tagName === "INPUT") return;
      if (ev.key === "ArrowRight") { mover(1); ev.preventDefault(); }
      if (ev.key === "ArrowLeft") { mover(-1); ev.preventDefault(); }
    });

    /* Compartir: menú nativo del teléfono; si no existe, opciones */
    q("compartir").addEventListener("click", function () {
      var n = NOTAS[actual];
      if (!n) return;
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
        navigator.share({ title: n.t, text: n.t + " — vía Mano Negra", url: n.u }).catch(function () {});
        return;
      }
      var op = q("opciones"), ab = op.hidden;
      op.hidden = !ab;
      q("compartir").setAttribute("aria-expanded", ab ? "true" : "false");
    });
    /* Instagram no tiene un enlace para compartir desde la web: se copia el enlace y se abren los mensajes */
    q("ig").addEventListener("click", function () {
      var n = NOTAS[actual];
      if (!n) return;
      var ventana = window.open("https://www.instagram.com/direct/inbox/", "_blank", "noopener");
      function aviso() { q("copiado").textContent = "Enlace copiado: pegalo en un mensaje o en tu historia de Instagram"; }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(n.t + " — vía Mano Negra " + n.u).then(aviso, function () { q("copiado").textContent = n.u; });
      else q("copiado").textContent = n.u;
      if (!ventana) aviso();
    });
    q("copiar").addEventListener("click", function () {
      var n = NOTAS[actual];
      if (!n) return;
      function ok() { q("copiado").textContent = "Enlace copiado"; }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(n.u).then(ok, function () { q("copiado").textContent = n.u; });
      else q("copiado").textContent = n.u;
    });

    /* Cualquier titular de la portada abre el panel (Ctrl/Cmd + clic sigue yendo al medio) */
    document.addEventListener("click", function (ev) {
      if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      var a = ev.target.closest && ev.target.closest("a.nota-link");
      if (!a || dlg.contains(a)) return;
      var cont = a.closest("[data-id]");
      var id = cont && cont.getAttribute("data-id");
      if (!id || !NOTAS[id]) return;
      ev.preventDefault();
      abrirConZoom(cont, id);
    });
    /* Tocar cualquier parte de una principal (no solo el título) también la abre, con un pequeño zoom */
    document.addEventListener("click", function (ev) {
      if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      var s = ev.target.closest && ev.target.closest(".slider .slide");
      if (!s || ev.target.closest("a, button")) return;
      var id = s.getAttribute("data-id");
      if (id && NOTAS[id]) abrirConZoom(s, id);
    });
    function abrirConZoom(cont, id) {
      // Una tarjeta de costado del carrusel no se abre: se trae al centro
      if (cont.classList.contains("slide") && !cont.classList.contains("es-activa")) {
        cont.dispatchEvent(new CustomEvent("mn-centrar", { bubbles: true }));
        return;
      }
      if (!cont.classList.contains("slide") || matchMedia("(prefers-reduced-motion: reduce)").matches) { abrir(id, cont); return; }
      cont.classList.add("zoom");
      setTimeout(function () { abrir(id, cont); }, 200);
      setTimeout(function () { cont.classList.remove("zoom"); }, 650);
    }
  }

  /* ---- Buscador ---- */
  function iniciarBuscador() {
    var dlg = document.getElementById("buscador");
    var btns = Array.prototype.slice.call(document.querySelectorAll(".buscar-btn")), btn = btns[0];
    if (!dlg || !btn || typeof dlg.showModal !== "function") { btns.forEach(function (b) { b.hidden = true; }); return; }
    var input = dlg.querySelector(".busc-input"), res = dlg.querySelector(".busc-res"), estado = dlg.querySelector(".busc-estado");
    var lista = Object.keys(NOTAS).map(function (id) {
      var n = NOTAS[id];
      return { id: id, n: n, txt: normal(n.t + " " + n.r + " " + n.f + " " + n.k) };
    }).sort(function (a, b) { return a.n.h < b.n.h ? 1 : -1; });
    function buscar() {
      var t = normal(input.value.trim());
      res.textContent = "";
      if (t.length < 2) { estado.textContent = "Escribí al menos 2 letras. Hay " + lista.length + " notas de las últimas 48 horas."; return; }
      var palabras = t.split(/\s+/);
      var hallados = lista.filter(function (x) {
        if (sinSus() && x.n.s) return false;   // filtro "ocultar notas con suscripción"
        return palabras.every(function (p) { return x.txt.indexOf(p) >= 0; });
      });
      estado.textContent = hallados.length ? hallados.length + (hallados.length === 1 ? " nota encontrada" : " notas encontradas") : "No hay notas con esas palabras.";
      hallados.slice(0, 30).forEach(function (x) {
        var li = el("li", "busc-item"), b = el("button", "busc-link");
        b.type = "button";
        var mk = el("span", "mk mk-" + x.n.g); mk.setAttribute("aria-hidden", "true");
        var k = el("span", "busc-kick"); k.appendChild(mk); k.appendChild(el("span", "", x.n.k + " · " + horaTxt(x.n.h)));
        b.appendChild(k); b.appendChild(el("span", "busc-tit", x.n.t)); b.appendChild(el("span", "busc-medio", x.n.f));
        b.addEventListener("click", function () { dlg.close(); if (abrirPanel) abrirPanel(x.id); else window.open(x.n.u, "_blank", "noopener"); });
        li.appendChild(b); res.appendChild(li);
      });
    }
    function abrir(ev) { if (ev && ev.currentTarget && ev.currentTarget.nodeType === 1) btn = ev.currentTarget; dlg.showModal(); input.focus(); input.select(); buscar(); }
    btns.forEach(function (b) { b.addEventListener("click", abrir); });
    input.addEventListener("input", buscar);
    dlg.querySelector("[data-b='cerrar']").addEventListener("click", function () { dlg.close(); btn.focus(); });
    dlg.addEventListener("click", function (ev) { if (ev.target === dlg) dlg.close(); });
    document.addEventListener("keydown", function (ev) {
      var t = ev.target, escribiendo = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (ev.key === "/" && !escribiendo && !dlg.open && !document.querySelector("dialog[open]")) { ev.preventDefault(); abrir(); }
    });
  }

  /* ---- Nuevas desde la última visita ---- */
  function iniciarNuevas() {
    var ahora = Date.now(), previa = null;
    try {
      previa = sessionStorage.getItem("mn-visita-previa");
      if (previa === null) {
        previa = localStorage.getItem("mn-visita") || "";
        sessionStorage.setItem("mn-visita-previa", previa);
      }
      localStorage.setItem("mn-visita", String(ahora));
    } catch (e) { return; }
    previa = Number(previa);
    if (!previa || ahora - previa > 48 * 3600 * 1000) return;     // primera visita o hace más de 48 h
    var nuevas = 0;
    Object.keys(NOTAS).forEach(function (id) {
      var f = new Date(NOTAS[id].h).getTime();
      if (!(f > previa)) return;
      nuevas++;
      document.querySelectorAll("main [data-id='" + id + "']").forEach(function (n) {
        n.classList.add("es-nueva");
        var k = n.querySelector(".kicker, .fila-sec, .mas-hora");
        if (k && !n.querySelector(".nueva")) { var b = el("span", "nueva", "Nueva"); k.insertBefore(b, k.firstChild); }
      });
    });
    var aviso = document.querySelector("[data-nuevas]");
    if (!aviso) return;
    var hora = new Date(previa).toLocaleTimeString("es-AR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
    aviso.textContent = "";
    if (nuevas) {
      aviso.appendChild(el("span", "etiqueta", "(" + String(nuevas).padStart(2, "0") + (nuevas === 1 ? " nota nueva" : " notas nuevas") + " desde tu última visita, a las " + hora + " h)"));
      var a = el("a", "aviso-link", "Ver las nuevas "); a.href = "#ultimas";
      var fl = el("span", "flecha", "↘"); fl.setAttribute("aria-hidden", "true"); a.appendChild(fl);
      aviso.appendChild(a);
    } else {
      aviso.appendChild(el("span", "etiqueta", "(Sin notas nuevas desde tu última visita, a las " + hora + " h)"));
    }
    aviso.hidden = false;
  }

  /* ---- Filtro: ocultar las notas con suscripción (se recuerda en el navegador) ---- */
  function sinSus() { return raiz.hasAttribute("data-sin-sus"); }
  function iniciarFiltro() {
    var btns = Array.prototype.slice.call(document.querySelectorAll("[data-filtro-sus]"));
    if (!btns.length) return;
    function pintar() {
      btns.forEach(function (b) { b.setAttribute("aria-pressed", sinSus() ? "true" : "false"); });
    }
    // Cuántas notas piden suscripción, al lado del texto del interruptor
    var cuantas = Object.keys(NOTAS).filter(function (id) { return NOTAS[id].s; }).length;
    btns.forEach(function (b) {
      var txt = b.querySelector(".sus-txt");
      if (txt && cuantas) txt.appendChild(el("span", "sus-cuenta", " (" + cuantas + ")"));
    });
    btns.forEach(function (b) { b.addEventListener("click", function () {
      if (sinSus()) raiz.removeAttribute("data-sin-sus"); else raiz.setAttribute("data-sin-sus", "");
      try { localStorage.setItem("mn-sus", sinSus() ? "ocultar" : "mostrar"); } catch (e) {}
      pintar();
      document.dispatchEvent(new Event("manonegra:filtro"));
    }); });
    pintar();
  }

  /* ---- Principales del día: slider ---- */
  function iniciarSlider() {
    var sl = document.querySelector("[data-slider]");
    if (!sl) return;
    var pista = sl.querySelector(".slider-pista"), puntos = sl.querySelector(".slider-puntos");
    var prev = sl.querySelector(".slider-prev"), next = sl.querySelector(".slider-next");
    var nEl = sl.querySelector("[data-slider-n]"), tEl = sl.querySelector("[data-slider-t]");
    var info = sl.querySelector(".slider-info");
    var todas = Array.prototype.slice.call(pista.querySelectorAll(".slide")), visibles = [], actual = 0;
    var reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;
    function dos(n) { return String(n).padStart(2, "0"); }

    // Bajada y botón de la tarjeta del centro
    var cambio = null;
    function pintarInfo(id) {
      var n = NOTAS[id];
      if (!info || !n) return;
      var bajada = info.querySelector("[data-info='bajada']"), link = info.querySelector("[data-info='link']"), medio = info.querySelector("[data-info='medio']");
      var pal = (n.r || "").split(/\s+/).filter(Boolean);
      function poner() {
        if (bajada) bajada.textContent = pal.slice(0, 40).join(" ") + (pal.length > 40 ? "…" : "");
        if (link) link.href = n.u;
        if (medio) medio.textContent = "Leer en " + n.f + (n.s ? " (con suscripción)" : "");
        info.classList.remove("cambia");
      }
      clearTimeout(cambio);
      if (reducido) { poner(); return; }
      info.classList.add("cambia");
      cambio = setTimeout(poner, 160);
    }
    function activa(i) {
      var antes = visibles[actual];
      actual = Math.max(0, Math.min(visibles.length - 1, i));
      todas.forEach(function (s) { s.classList.remove("es-activa"); });
      var s = visibles[actual];
      if (s) s.classList.add("es-activa");
      Array.prototype.forEach.call(puntos ? puntos.children : [], function (li, k) {
        li.firstChild.setAttribute("aria-current", k === actual ? "true" : "false");
      });
      if (nEl) nEl.textContent = dos(actual + 1);
      if (prev) prev.disabled = actual === 0;
      if (next) next.disabled = actual >= visibles.length - 1;
      if (s && s !== antes) alDetenerse(s);
    }
    // La bajada y la luz del fondo (pesada de dibujar) cambian recién cuando el carrusel se detiene,
    // no a mitad del gesto: así el deslizamiento no se traba en el celular.
    var espera = null, pendienteInfo = null;
    function alDetenerse(s) {
      pendienteInfo = s;
      clearTimeout(espera);
      espera = setTimeout(aplicarInfo, 140);
    }
    function aplicarInfo() {
      clearTimeout(espera);
      var s = pendienteInfo; pendienteInfo = null;
      if (s) { pintarInfo(s.getAttribute("data-id")); luz(s); }
    }

    // Luz ambiental: detrás del carrusel brilla, difuminada, la foto de la tarjeta del centro
    var capas = [], capa = 0;
    var amb = el("div", "slider-luz"); amb.setAttribute("aria-hidden", "true");
    for (var c = 0; c < 2; c++) capas.push(amb.appendChild(el("span")));
    sl.insertBefore(amb, sl.firstChild);
    function luz(s) {
      var img = s && s.querySelector(".foto-slide img");
      var src = img && img.style.display !== "none" ? (img.currentSrc || img.src) : "";
      var sale = capas[capa];
      if (!src) { sale.classList.remove("prendida"); return; }
      capa = 1 - capa;
      var entra = capas[capa];
      entra.style.backgroundImage = "url(\"" + src.replace(/"/g, "%22") + "\")";
      entra.classList.add("prendida");
      sale.classList.remove("prendida");
    }

    // Efecto en perspectiva: cada tarjeta gira y se aleja según su distancia al centro
    // Las medidas de cada tarjeta se guardan (no cambian al deslizar) para no recalcular la página en cada cuadro
    var medidas = [], anchoPista = 0;
    function medir() {
      anchoPista = pista.clientWidth;
      medidas = visibles.map(function (s) { return { izq: s.offsetLeft, w: s.offsetWidth || 1 }; });
    }
    var cuadro = 0;
    function pedirPerspectiva() { if (!cuadro) cuadro = requestAnimationFrame(function () { cuadro = 0; perspectiva(); }); }
    // Estado de una tarjeta según su distancia al centro (d, en "pasos" de tarjeta)
    function estado(d, w) {
      var a = Math.min(Math.abs(d), 4.5), sg = d < 0 ? -1 : 1;
      // El borde de afuera de cada tarjeta lateral se va al fondo, como un mazo abierto en abanico
      var giro = sg * Math.min(a, 1) * 48;                     // hasta 48° en la vecina; las demás quedan igual de giradas
      var fondo = -Math.min(a, 1) * 230 - Math.max(0, a - 1) * 70;
      var junta = -sg * Math.max(0, a - 1) * w * 0.45;         // las lejanas se apilan detrás
      var escala = 1 - Math.min(a, 1) * 0.06;
      return {
        tr: "translateX(" + junta.toFixed(1) + "px) translateZ(" + fondo.toFixed(1) + "px) rotateY(" + giro.toFixed(2) + "deg) scale(" + escala.toFixed(3) + ")",
        z: String(100 - Math.round(a * 10)),
        op: a > 3.4 ? String(Math.max(0, 4.4 - a)) : ""
      };
    }

    // Donde el navegador lo permite, el abanico lo anima el propio navegador atado al desplazamiento
    // (animaciones ligadas al scroll): va pegado al dedo, sin pasar por este programa en cada cuadro.
    var porCSS = false;
    try { porCSS = !reducido && !!(window.CSS && CSS.supports("(animation-timeline: scroll()) and (scroll-timeline-name: --mn)")); } catch (e) {}
    var hoja = null;
    function animacionesCSS() {
      if (!porCSS) return;
      if (!hoja) { hoja = document.createElement("style"); document.head.appendChild(hoja); pista.style.scrollTimeline = "--mn-pista inline"; }
      var max = pista.scrollWidth - pista.clientWidth, css = "";
      if (max <= 0) { hoja.textContent = ""; return; }
      visibles.forEach(function (s, k) {
        var w = medidas[k].w, paso = w * 0.7, c = medidas[k].izq + w / 2 - anchoPista / 2;
        // Puntos donde cambia la forma del movimiento: centro, vecinas, apiladas y desvanecidas
        var pts = [0, max];
        [0, 1, -1, 3.4, -3.4, 4.4, -4.4, 4.5, -4.5].forEach(function (dd) { var L = c - dd * paso; if (L > 0 && L < max) pts.push(L); });
        pts.sort(function (x, y) { return x - y; });
        var kf = "", kz = "";
        pts.forEach(function (L) {
          var e = estado((c - L) / paso, w), pc = (L / max * 100).toFixed(3) + "%";
          kf += pc + "{transform:" + e.tr + ";opacity:" + (e.op === "" ? 1 : e.op) + "}";
          kz += pc + "{z-index:" + e.z + "}";
        });
        css += "@keyframes mn-s" + k + "{" + kf + "}@keyframes mn-z" + k + "{" + kz + "}";
        s.style.transform = ""; s.style.opacity = ""; s.style.zIndex = ""; s._tr = s._z = s._op = null;
        // El movimiento (transform y opacidad) y el orden de apilado van en animaciones separadas,
        // para que el navegador pueda mover las tarjetas sin esperar al resto de la página
        s.style.animation = "mn-s" + k + " linear both, mn-z" + k + " linear both";
        s.style.animationTimeline = "--mn-pista, --mn-pista";
      });
      todas.forEach(function (s) { if (visibles.indexOf(s) < 0) { s.style.animation = ""; s.style.animationTimeline = ""; } });
      hoja.textContent = css;
    }

    function perspectiva() {
      if (medidas.length !== visibles.length) medir();
      var centro = pista.scrollLeft + anchoPista / 2, mejor = 0, dist = Infinity;
      visibles.forEach(function (s, k) {
        var w = medidas[k].w, paso = w * 0.7;
        var d = (medidas[k].izq + w / 2 - centro) / paso;
        var a = Math.min(Math.abs(d), 4.5);
        if (Math.abs(d) < dist) { dist = Math.abs(d); mejor = k; }
        if (porCSS) return;   // el navegador ya mueve la tarjeta
        if (reducido) { s.style.transform = ""; s.style.zIndex = String(100 - Math.round(a * 10)); return; }
        var e = estado(d, w), tr = e.tr, z = e.z, op = e.op;
        // Solo se escribe lo que cambió
        if (s._tr !== tr) { s.style.transform = tr; s._tr = tr; }
        if (s._z !== z) { s.style.zIndex = z; s._z = z; }
        if (s._op !== op) { s.style.opacity = op; s._op = op; }
      });
      if (mejor !== actual) activa(mejor);
    }
    function destinoDe(s) { return s.offsetLeft + s.offsetWidth / 2 - pista.clientWidth / 2; }
    var seguro = null;
    function ir(i) {
      var s = visibles[Math.max(0, Math.min(visibles.length - 1, i))];
      if (!s) return;
      var suave = !document.hidden && !reducido, destino = destinoDe(s);
      pista.scrollTo({ left: destino, behavior: suave ? "smooth" : "instant" });
      clearTimeout(seguro);
      seguro = setTimeout(function () {
        // Seguro: si el movimiento suave no llegó, se acomoda en la tarjeta elegida
        if (Math.abs(pista.scrollLeft - destinoDe(s)) > 2) pista.scrollTo({ left: destinoDe(s), behavior: "instant" });
        perspectiva();
      }, suave ? 900 : 30);
    }
    function armar() {
      visibles = todas.filter(function (s) { return s.offsetParent !== null; });
      if (puntos) {
        puntos.textContent = "";
        visibles.forEach(function (s, k) {
          var li = document.createElement("li"), b = document.createElement("button");
          b.type = "button"; b.setAttribute("aria-label", "Noticia " + (k + 1) + " de " + visibles.length);
          b.addEventListener("click", function () { ir(k); });
          li.appendChild(b); puntos.appendChild(li);
        });
      }
      if (tEl) tEl.textContent = dos(visibles.length);
      sl.classList.toggle("es-uno", visibles.length < 2);
      medir();
      animacionesCSS();
      actual = -1;
      if (visibles[0]) pista.scrollTo({ left: destinoDe(visibles[0]), behavior: "instant" });
      activa(0);
      perspectiva();
      aplicarInfo();
    }
    pista.addEventListener("scroll", pedirPerspectiva, { passive: true });
    pista.addEventListener("scrollend", function () { perspectiva(); aplicarInfo(); });
    window.addEventListener("resize", function () { medir(); animacionesCSS(); if (visibles[actual]) pista.scrollTo({ left: destinoDe(visibles[actual]), behavior: "instant" }); perspectiva(); });
    if (prev) prev.addEventListener("click", function () { ir(actual - 1); });
    if (next) next.addEventListener("click", function () { ir(actual + 1); });
    pista.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowRight") { ir(actual + 1); ev.preventDefault(); }
      if (ev.key === "ArrowLeft") { ir(actual - 1); ev.preventDefault(); }
    });
    // Tocar una tarjeta de costado la trae al centro (la del centro abre la nota)
    pista.addEventListener("mn-centrar", function (ev) {
      var k = visibles.indexOf(ev.target);
      if (k >= 0) ir(k);
    });
    document.addEventListener("manonegra:filtro", armar);
    armar();
    // Primera visita en el celular: se asoma una vez para mostrar que se desliza
    var yaVio = null;
    try { yaVio = localStorage.getItem("mn-slider-visto"); } catch (e) {}
    if (!yaVio && visibles.length > 1 && matchMedia("(hover: none)").matches && !reducido && "IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (en) {
        if (!en[0].isIntersecting) return;
        io.disconnect();
        pista.classList.add("asoma");
        pista.addEventListener("animationend", function () { pista.classList.remove("asoma"); }, { once: true });
        try { localStorage.setItem("mn-slider-visto", "1"); } catch (e) {}
      }, { threshold: 0.6 });
      io.observe(pista);
    }
  }

  /* ---- Profundidad: cartas que se inclinan con el mouse y aparecen desde el fondo al bajar ---- */
  function iniciarProfundidad() {
    var reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;
    var cartas = Array.prototype.slice.call(document.querySelectorAll(".destacadas .grilla > .card"));
    if (!cartas.length || reducido) return;

    // Inclinación: hasta 7° hacia donde está el puntero, con un reflejo de luz
    if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
      cartas.forEach(function (c) {
        c.addEventListener("pointerenter", function () { c.classList.add("inclina"); });
        c.addEventListener("pointermove", function (ev) {
          var r = c.getBoundingClientRect();
          var x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
          c.style.setProperty("--ry", ((x - 0.5) * 14).toFixed(2) + "deg");
          c.style.setProperty("--rx", ((0.5 - y) * 10).toFixed(2) + "deg");
          c.style.setProperty("--gx", (x * 100).toFixed(1) + "%");
          c.style.setProperty("--gy", (y * 100).toFixed(1) + "%");
        });
        c.addEventListener("pointerleave", function () {
          c.classList.remove("inclina");
          c.style.setProperty("--rx", "0deg"); c.style.setProperty("--ry", "0deg");
        });
      });
    }

    // Aparición: cada carta sube desde atrás, inclinada, y se endereza al entrar en pantalla
    if (!("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (en) {
        if (!en.isIntersecting) return;
        var c = en.target, k = cartas.indexOf(c);
        io.unobserve(c);
        var demora = (k % 3) * 90;
        c.style.transitionDelay = demora + "ms";
        c.classList.add("visto");
        setTimeout(function () { c.classList.remove("revela", "visto"); c.style.transitionDelay = ""; }, 800 + demora);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    cartas.forEach(function (c) {
      var r = c.getBoundingClientRect();
      if (r.top < innerHeight && r.bottom > 0) return;   // las que ya se ven al cargar no se animan
      c.classList.add("revela");
      io.observe(c);
    });
  }

  /* ---- Secciones como mazo: la carta de adelante se va al fondo y aparece la siguiente ---- */
  function iniciarMazos() {
    var reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;
    Array.prototype.forEach.call(document.querySelectorAll(".seccion .sec-grid"), function (grid) {
      var todas = Array.prototype.slice.call(grid.querySelectorAll(":scope > .card"));
      if (todas.length < 2) return;
      var zona = el("div", "mazo-zona");
      grid.parentNode.insertBefore(zona, grid);
      var escena = el("div", "mazo-escena");
      zona.appendChild(escena);
      escena.appendChild(grid);
      // Flechas redondas a los costados, a la altura del medio de la foto
      function flecha(clase, etiqueta, d) {
        var b = el("button", "mazo-flecha " + clase); b.type = "button"; b.setAttribute("aria-label", etiqueta);
        b.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
        escena.appendChild(b);
        return b;
      }
      var bAnt = flecha("mazo-prev", "Carta anterior", "M19 12H5M11 6l-6 6 6 6");
      var bSig = flecha("mazo-next", "Carta siguiente", "M5 12h14M13 6l6 6-6 6");
      var nav = el("div", "mazo-nav");
      var cont = el("p", "mazo-cont");
      nav.appendChild(cont);
      zona.appendChild(nav);
      var indice = el("nav", "mazo-indice"); indice.setAttribute("aria-label", "Cartas de esta sección");
      indice.appendChild(el("span", "etiqueta", "(En este mazo)"));
      zona.appendChild(indice);
      grid.classList.add("mazo");

      var orden = [], frente = 0;   // orden: cartas visibles; frente: índice de la que está adelante
      function pintar() {
        var n = orden.length;
        todas.forEach(function (c) { c.classList.remove("al-frente", "lejos"); });
        orden.forEach(function (c, k) {
          var p = (k - frente + n) % n;
          c.style.setProperty("--p", String(p));
          c.classList.toggle("al-frente", p === 0);
          c.classList.toggle("lejos", p > 3);
          c.setAttribute("aria-hidden", p === 0 ? "false" : "true");
        });
        cont.textContent = "";
        cont.appendChild(el("b", "", String(frente + 1).padStart(2, "0")));
        cont.appendChild(document.createTextNode(" / " + String(n).padStart(2, "0")));
        Array.prototype.forEach.call(indice.querySelectorAll("button"), function (b, k) {
          b.setAttribute("aria-current", k === frente ? "true" : "false");
        });
        bAnt.disabled = bSig.disabled = n < 2;
      }
      function armar() {
        orden = todas.filter(function (c) { return getComputedStyle(c).display !== "none"; });
        todas.forEach(function (c) { if (orden.indexOf(c) < 0) c.removeAttribute("aria-hidden"); });
        frente = 0;
        Array.prototype.slice.call(indice.querySelectorAll("button")).forEach(function (b) { b.remove(); });
        orden.forEach(function (c, k) {
          var t = c.querySelector(".card-tit");
          var b = el("button", "", t ? t.textContent.trim() : "Nota " + (k + 1)); b.type = "button";
          b.addEventListener("click", function () { ir(k); });
          indice.appendChild(b);
        });
        nav.hidden = orden.length < 2;
        escena.classList.toggle("es-uno", orden.length < 2);
        pintar();
      }
      // La que sale vuela hacia un costado y vuelve al fondo del mazo
      function volar(c, dir) {
        if (reducido || typeof c.animate !== "function") return;
        c.animate([
          { transform: getComputedStyle(c).transform, zIndex: 30 },
          { transform: "translateX(" + (dir > 0 ? -72 : 72) + "%) rotate(" + (dir > 0 ? -7 : 7) + "deg)", zIndex: 30, offset: .45 }
        ], { duration: 560, easing: "cubic-bezier(.3,.6,.2,1)" });
      }
      function ir(k) {
        var n = orden.length;
        if (n < 2) return;
        k = ((k % n) + n) % n;
        if (k === frente) return;
        var sale = orden[frente], adelante = k === (frente + 1) % n;
        frente = k;
        if (adelante) volar(sale, 1);          // la de adelante se va al fondo
        else volar(orden[frente], -1);          // la elegida llega desde el costado
        pintar();
      }
      bSig.addEventListener("click", function () { ir(frente + 1); });
      bAnt.addEventListener("click", function () { ir(frente - 1); });
      // Deslizar la carta de adelante con el dedo
      var x0 = null, y0 = null;
      grid.addEventListener("pointerdown", function (ev) { x0 = ev.clientX; y0 = ev.clientY; });
      grid.addEventListener("pointerup", function (ev) {
        if (x0 === null) return;
        var dx = ev.clientX - x0, dy = ev.clientY - y0; x0 = null;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) {
          ir(frente + (dx < 0 ? 1 : -1));
          var frenar = function (e) { e.stopPropagation(); e.preventDefault(); };
          grid.addEventListener("click", frenar, { capture: true, once: true });
          setTimeout(function () { grid.removeEventListener("click", frenar, { capture: true }); }, 350);
        }
      });
      document.addEventListener("manonegra:filtro", armar);
      armar();
    });
  }

  /* ---- "Hoy en 60 segundos": resumen tipo historias para el celular ---- */
  function iniciarResumen() {
    if (typeof document.createElement("dialog").showModal !== "function" || !Object.keys(NOTAS).length) return;
    var POR_NOTA = 12000, reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;
    var btn = el("button", "resumen-btn"); btn.type = "button";
    btn.setAttribute("aria-label", "Ver el resumen del día en 60 segundos");
    btn.appendChild(el("span", "resumen-punto")).setAttribute("aria-hidden", "true");
    btn.appendChild(el("span", "", "Hoy en 60 s"));
    var dlg = el("dialog", "resumen"); dlg.setAttribute("aria-label", "Hoy en 60 segundos");
    dlg.innerHTML =
      '<div class="res-barras" aria-hidden="true"></div>' +
      '<p class="res-marca"><span>(Hoy en 60 s)</span><span class="res-n"></span></p>' +
      '<div class="res-escena" aria-live="polite"></div>' +
      '<button class="res-zona res-ant" type="button" aria-label="Noticia anterior"></button>' +
      '<button class="res-zona res-sig" type="button" aria-label="Noticia siguiente"></button>' +
      '<div class="res-ctrl"><button class="res-pausa" type="button" aria-label="Pausar">❚❚</button>' +
      '<button class="res-cerrar" type="button" aria-label="Cerrar el resumen">✕</button></div>';
    document.body.appendChild(btn); document.body.appendChild(dlg);
    var barras = dlg.querySelector(".res-barras"), escena = dlg.querySelector(".res-escena"), nTxt = dlg.querySelector(".res-n");
    var pausa = dlg.querySelector(".res-pausa");
    var ids = [], i = 0, transcurrido = 0, pausado = false, reloj = null, enHistorial = false;

    function sumar(lista, id) {
      if (lista.length < 5 && NOTAS[id] && lista.indexOf(id) < 0 && !(sinSus() && NOTAS[id].s)) lista.push(id);
    }
    function elegir() {   // las principales del slider, en su orden; sin las ocultas por el filtro
      var lista = [];
      document.querySelectorAll(".portada [data-id]").forEach(function (n) { if (!sinSus() && n.classList.contains("slide--relleno")) return; sumar(lista, n.getAttribute("data-id")); });
      document.querySelectorAll(".grilla [data-id]").forEach(function (n) { if (!sinSus() && n.classList.contains("card--relleno")) return; sumar(lista, n.getAttribute("data-id")); });
      return lista;
    }
    function pintarBarras() {
      Array.prototype.forEach.call(barras.children, function (b, k) {
        var p = k < i ? 1 : k > i ? 0 : Math.min(1, transcurrido / POR_NOTA);
        b.firstChild.style.transform = "scaleX(" + p + ")";
      });
    }
    function escenaNota(id) {
      var n = NOTAS[id], frag = document.createDocumentFragment();
      if (n.i) {
        var fig = el("figure", "res-foto"), img = el("img");
        img.src = n.i; img.alt = ""; img.referrerPolicy = "no-referrer";
        img.onerror = function () { fig.hidden = true; };
        fig.appendChild(img); frag.appendChild(fig);
      }
      var txt = el("div", "res-txt");
      var kick = el("p", "res-kick"), mk = el("span", "mk mk-" + n.g); mk.setAttribute("aria-hidden", "true");
      kick.appendChild(mk); kick.appendChild(el("span", "", n.k));
      txt.appendChild(kick);
      txt.appendChild(el("h2", "res-tit", n.t));
      var pal = (n.r || "").split(/\s+/).filter(Boolean);
      if (pal.length) txt.appendChild(el("p", "res-baj", pal.slice(0, 28).join(" ") + (pal.length > 28 ? "…" : "")));
      var a = el("a", "res-leer"); a.href = n.u; a.target = "_blank"; a.rel = "noopener";
      a.appendChild(el("span", "", "Leer en " + n.f + (n.s ? " (con suscripción)" : "")));
      a.appendChild(el("span", "flecha", "↗")).setAttribute("aria-hidden", "true");
      txt.appendChild(a);
      if (n.i) txt.appendChild(el("p", "res-cred", "(Foto: " + n.c + ")"));
      frag.appendChild(txt);
      return frag;
    }
    function escenaFin() {
      var txt = el("div", "res-txt res-fin");
      txt.appendChild(el("p", "res-kick", "(Fin del resumen)"));
      txt.appendChild(el("h2", "res-tit", "Eso es lo principal de hoy."));
      var prox = document.querySelector("[data-prox]");
      txt.appendChild(el("p", "res-baj", "Próxima actualización: " + (prox ? prox.textContent : "") + " h. Todas las notas siguen en la portada."));
      var b = el("button", "res-leer", "Ver todas las notas"); b.type = "button";
      b.addEventListener("click", function () { cerrar(); });
      txt.appendChild(b);
      return txt;
    }
    function mostrar(k) {
      i = Math.max(0, Math.min(ids.length, k)); transcurrido = 0;
      escena.classList.remove("entra"); void escena.offsetWidth;
      escena.textContent = "";
      escena.appendChild(i < ids.length ? escenaNota(ids[i]) : escenaFin());
      escena.classList.add("entra");
      nTxt.textContent = i < ids.length ? String(i + 1).padStart(2, "0") + " / " + String(ids.length).padStart(2, "0") : "";
      dlg.classList.toggle("en-fin", i >= ids.length);
      pintarBarras();
    }
    function tic() {
      if (pausado || document.hidden || i >= ids.length) return;
      transcurrido += 100;
      if (transcurrido >= POR_NOTA) mostrar(i + 1); else pintarBarras();
    }
    function ponerPausa(v) {
      pausado = v; dlg.classList.toggle("pausado", v);
      pausa.textContent = v ? "▶" : "❚❚"; pausa.setAttribute("aria-label", v ? "Seguir" : "Pausar");
    }
    function abrir() {
      ids = elegir();
      if (!ids.length) return;
      barras.textContent = "";
      ids.forEach(function () { var b = el("span", "res-barra"); b.appendChild(el("span", "res-lleno")); barras.appendChild(b); });
      ponerPausa(reducido);   // con "reducir movimiento" no avanza solo
      dlg.showModal(); raiz.classList.add("con-panel");
      try { history.pushState({ mnResumen: 1 }, ""); enHistorial = true; } catch (e) { enHistorial = false; }
      mostrar(0);
      clearInterval(reloj); reloj = setInterval(tic, 100);
    }
    function cerrar(desdeHistorial) {
      if (!dlg.open) return;
      clearInterval(reloj); dlg.close(); raiz.classList.remove("con-panel");
      if (enHistorial && !desdeHistorial) { enHistorial = false; try { history.back(); } catch (e) {} }
      enHistorial = false; btn.focus();
    }
    function siguiente() { if (i < ids.length) mostrar(i + 1); else cerrar(); }
    btn.addEventListener("click", abrir);
    dlg.querySelector(".res-cerrar").addEventListener("click", function () { cerrar(); });
    dlg.querySelector(".res-ant").addEventListener("click", function () { mostrar(i - 1); });
    dlg.querySelector(".res-sig").addEventListener("click", siguiente);
    pausa.addEventListener("click", function () { ponerPausa(!pausado); });
    dlg.addEventListener("cancel", function (ev) { ev.preventDefault(); cerrar(); });
    window.addEventListener("popstate", function () { if (dlg.open) { enHistorial = false; cerrar(true); } });
    dlg.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowRight") { siguiente(); ev.preventDefault(); }
      if (ev.key === "ArrowLeft") { mostrar(i - 1); ev.preventDefault(); }
      if (ev.key === " " && ev.target.tagName !== "BUTTON" && ev.target.tagName !== "A") { ponerPausa(!pausado); ev.preventDefault(); }
    });
    // Deslizar con el dedo: hacia la izquierda = siguiente, hacia la derecha = anterior
    var x0 = null, y0 = null;
    dlg.addEventListener("pointerdown", function (ev) { x0 = ev.clientX; y0 = ev.clientY; });
    dlg.addEventListener("pointerup", function (ev) {
      if (x0 === null) return;
      var dx = ev.clientX - x0, dy = ev.clientY - y0; x0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) siguiente(); else mostrar(i - 1);
        // que el deslizamiento no cuente además como un toque
        var frenar = function (e) { e.stopPropagation(); e.preventDefault(); };
        dlg.addEventListener("click", frenar, { capture: true, once: true });
        setTimeout(function () { dlg.removeEventListener("click", frenar, { capture: true }); }, 350);
      }
    });
  }

  /* ---- Tamaño de letra A− / A+ ---- */
  function iniciarLetra() {
    var botones = document.querySelectorAll(".letra-btn");
    if (!botones.length) return;
    function nivel() { return Number(raiz.getAttribute("data-letra") || 0); }
    function pintar() {
      botones.forEach(function (b) {
        var d = Number(b.getAttribute("data-letra"));
        b.disabled = (d < 0 && nivel() === 0) || (d > 0 && nivel() === 2);
      });
    }
    botones.forEach(function (b) {
      b.addEventListener("click", function () {
        var n = Math.max(0, Math.min(2, nivel() + Number(b.getAttribute("data-letra"))));
        if (n) raiz.setAttribute("data-letra", String(n)); else raiz.removeAttribute("data-letra");
        try { localStorage.setItem("mn-letra", String(n)); } catch (e) {}
        pintar();
      });
    });
    pintar();
  }

  /* ---- Próxima actualización (8, 13 y 20 h de Córdoba) ---- */
  function iniciarProxima() {
    var span = document.querySelector("[data-prox]");
    if (!span) return;
    var h = Number(new Date().toLocaleString("en-US", { timeZone: TZ, hour: "numeric", hour12: false })) % 24;
    var prox = [8, 13, 20].filter(function (x) { return x > h; })[0] || 8;
    span.textContent = String(prox).padStart(2, "0") + ":00";
  }

  /* ---- Barra lateral (computadora) / barra inferior (celular) ---- */
  function iniciarRiel() {
    var riel = document.getElementById("riel");
    if (!riel) return;
    var mas = riel.querySelector(".riel-mas");
    var tinta = riel.querySelector(".riel-tinta");
    var abrirTinta = tinta && tinta.querySelector(".riel-abrir");
    function ponerMas(v) {
      if (!mas) return;
      riel.classList.toggle("riel-abierto", v);
      mas.setAttribute("aria-expanded", v ? "true" : "false");
      mas.setAttribute("aria-label", v ? "Cerrar opciones" : "Más opciones");
    }
    function ponerTinta(v) {
      if (!tinta) return;
      tinta.classList.toggle("abierta", v);
      abrirTinta.setAttribute("aria-expanded", v ? "true" : "false");
    }
    if (mas) mas.addEventListener("click", function () { ponerMas(!riel.classList.contains("riel-abierto")); });
    if (abrirTinta) abrirTinta.addEventListener("click", function () { ponerTinta(!tinta.classList.contains("abierta")); });
    // Al elegir un color, se cierra el menú de la tinta
    if (tinta) tinta.addEventListener("click", function (ev) { if (ev.target.closest(".tinta-btn")) setTimeout(function () { ponerTinta(false); }, 150); });
    riel.addEventListener("click", function (ev) { if (ev.target.closest("a[href^='#']")) ponerMas(false); });
    document.addEventListener("click", function (ev) {
      if (!riel.contains(ev.target)) { ponerMas(false); ponerTinta(false); }
      else if (tinta && !tinta.contains(ev.target)) ponerTinta(false);
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      if (tinta && tinta.classList.contains("abierta")) { ponerTinta(false); abrirTinta.focus(); }
      else if (riel.classList.contains("riel-abierto")) { ponerMas(false); mas.focus(); }
    });
  }

  function iniciar() {
    seguro(iniciarRiel, "barra lateral");
    seguro(iniciarTema, "tema");
    seguro(iniciarMenu, "menú");
    seguro(iniciarMarca, "marca");
    seguro(iniciarReloj, "reloj");
    seguro(iniciarSeccionActual, "sección actual");
    seguro(iniciarDolar, "dólar");
    seguro(iniciarTiempos, "tiempos");
    seguro(iniciarFotos, "fotos");
    seguro(iniciarNuevas, "nuevas");
    seguro(iniciarPanel, "panel");
    seguro(iniciarBuscador, "buscador");
    seguro(iniciarFiltro, "filtro");
    seguro(iniciarSlider, "slider");
    seguro(iniciarResumen, "resumen");
    seguro(iniciarProfundidad, "profundidad");
    seguro(iniciarMazos, "mazos");
    seguro(iniciarProxima, "próxima");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
