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
    var enlaces = document.querySelectorAll(".menu-lista a[href^='#']");
    var mapa = {};
    enlaces.forEach(function (a) { mapa[a.getAttribute("href").slice(1)] = a; });
    var io = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (en) {
        if (!en.isIntersecting || !mapa[en.target.id]) return;
        enlaces.forEach(function (a) { a.removeAttribute("aria-current"); });
        mapa[en.target.id].setAttribute("aria-current", "page");
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
    document.querySelectorAll("figure img").forEach(function (img) {
      if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) ocultar(img);
      img.addEventListener("error", function () { ocultar(img); });
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
    function abrir(id) {
      pintar(id);
      if (!dlg.open) {
        dlg.showModal();
        raiz.classList.add("con-panel");
        try { history.pushState({ mnPanel: 1 }, ""); enHistorial = true; } catch (e) { enHistorial = false; }
      }
      q("cerrar").focus();
    }
    function cerrar(desdeHistorial) {
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
      abrir(id);
    });
  }

  /* ---- Buscador ---- */
  function iniciarBuscador() {
    var dlg = document.getElementById("buscador");
    var btn = document.querySelector(".buscar-btn");
    if (!dlg || !btn || typeof dlg.showModal !== "function") { if (btn) btn.hidden = true; return; }
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
      var hallados = lista.filter(function (x) { return palabras.every(function (p) { return x.txt.indexOf(p) >= 0; }); });
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
    function abrir() { dlg.showModal(); input.focus(); input.select(); buscar(); }
    btn.addEventListener("click", abrir);
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

  function iniciar() {
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
    seguro(iniciarLetra, "letra");
    seguro(iniciarProxima, "próxima");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
