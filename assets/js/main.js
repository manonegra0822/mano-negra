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
      var etiqueta = oscuro ? "Fondo blanco" : "Fondo negro";
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

  function iniciar() {
    seguro(iniciarTema, "tema");
    seguro(iniciarMenu, "menú");
    seguro(iniciarMarca, "marca");
    seguro(iniciarReloj, "reloj");
    seguro(iniciarSeccionActual, "sección actual");
    seguro(iniciarDolar, "dólar");
    seguro(iniciarTiempos, "tiempos");
    seguro(iniciarFotos, "fotos");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
