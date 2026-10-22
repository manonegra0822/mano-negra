/* Mano Negra: tinta del puntero.
   Computadora: el puntero deja un rastro fino que se seca en menos de un segundo, y
   arrastrando con el clic apretado sobre una foto se pinta un grafiti que dura 10 segundos
   y después se desvanece solo. Celular: manteniendo el dedo apretado sobre una foto queda
   una mancha de tinta que también se desvanece. Nada se guarda: al recargar no queda nada.
   El color elegido (rojo, amarillo, magenta o apagada) se recuerda en el navegador. */
(function () {
  "use strict";
  try {
    if (!window.requestAnimationFrame || !document.createElement("canvas").getContext) return;
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  } catch (e) { return; }

  var COLORES = { rojo: "--tinta-rojo", amarillo: "--tinta-amarillo", magenta: "--tinta-magenta" };
  var RASTRO_VIDA = 900;          // ms que tarda en secarse el rastro
  var GOTA_VIDA = 2000;           // ms que dura una gota chorreando del rastro
  var GRAFITI_QUIETO = 10000;     // ms que el grafiti queda entero
  var GRAFITI_FUNDIDO = 1600;     // ms que tarda en desvanecerse
  var FOTOS = ".foto-principal img, .foto-card img, .panel-foto img, figure img";

  var fino = window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches;
  var tinta = "rojo";
  try { tinta = localStorage.getItem("mn-tinta") || "rojo"; } catch (e) {}
  if (tinta !== "no" && !COLORES[tinta]) tinta = "rojo";

  var lienzo = document.createElement("canvas");
  lienzo.className = "tinta-lienzo";
  lienzo.setAttribute("aria-hidden", "true");
  document.body.appendChild(lienzo);
  var cx = lienzo.getContext("2d");
  // El rastro se dibuja opaco en una capa aparte y se pega con transparencia, así no se marcan las uniones
  var capa = document.createElement("canvas"), cc = capa.getContext("2d");
  var dpr = 1, ancho = 0, alto = 0;
  function medir() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    ancho = window.innerWidth; alto = window.innerHeight;
    lienzo.width = capa.width = Math.round(ancho * dpr); lienzo.height = capa.height = Math.round(alto * dpr);
    pedir();
  }
  window.addEventListener("resize", medir);
  medir();

  function color() {
    var v = getComputedStyle(document.documentElement).getPropertyValue(COLORES[tinta] || COLORES.rojo).trim();
    return v || "#b8332e";
  }

  /* ---- Selector de color (solo con mouse) ---- */
  var grupo = document.querySelector(".tinta");
  function marcar() {
    if (!grupo) return;
    grupo.querySelectorAll(".tinta-btn").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-tinta") === tinta));
    });
  }
  if (grupo) {
    grupo.hidden = false;
    marcar();
    grupo.addEventListener("click", function (ev) {
      var b = ev.target.closest(".tinta-btn");
      if (!b) return;
      tinta = b.getAttribute("data-tinta");
      try { localStorage.setItem("mn-tinta", tinta); } catch (e) {}
      marcar();
      if (tinta === "no") { rastro.length = 0; pedir(); }
    });
  }

  /* ---- Datos: todo en coordenadas de la página, para que el grafiti siga a la foto al hacer scroll ---- */
  var rastro = [];   // {x, y, t, c, w}
  var chorreas = []; // gotas que caen del rastro: {x, y, t, c, w, largo}
  var trazos = [];   // {img, c, t (último punto), pts:[{x,y,w}], gotas:[{x,y,r}]}
  var manchas = [];  // {img, c, t, x, y, forma:[...]}

  var pendiente = false;
  function pedir() { if (!pendiente) { pendiente = true; requestAnimationFrame(dibujar); } }

  function alfaGrafiti(t, ahora) {
    var edad = ahora - t;
    if (edad < GRAFITI_QUIETO) return 1;
    return Math.max(0, 1 - (edad - GRAFITI_QUIETO) / GRAFITI_FUNDIDO);
  }

  function recortar(img) {
    if (!img || !img.isConnected) return false;
    var r = img.getBoundingClientRect();
    if (r.width === 0 || r.bottom < 0 || r.top > alto) return false;
    cx.beginPath(); cx.rect(r.left, r.top, r.width, r.height); cx.clip();
    return true;
  }

  // Una gota que chorrea hacia abajo: crece rápido al principio y frena, con la cabeza redonda abajo
  function chorrear(g, sx, sy, ahora) {
    var e = Math.min(1, (ahora - g.t) / g.dur), crec = 1 - Math.pow(1 - e, 3);
    var y2 = g.y + g.largo * crec;
    cx.lineWidth = g.w;
    cx.beginPath(); cx.moveTo(g.x - sx, g.y - sy); cx.lineTo(g.x - sx, y2 - sy); cx.stroke();
    cx.beginPath(); cx.arc(g.x - sx, y2 - sy, g.w * 0.75, 0, 7); cx.fill();
  }

  function dibujar() {
    pendiente = false;
    var ahora = performance.now(), sx = window.scrollX, sy = window.scrollY;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.clearRect(0, 0, ancho, alto);
    cx.lineCap = "round"; cx.lineJoin = "round";

    // Rastro del puntero: segmentos que se afinan y se aclaran con la edad
    while (rastro.length && ahora - rastro[0].t > RASTRO_VIDA) rastro.shift();
    if (rastro.length > 1) {
      cc.setTransform(dpr, 0, 0, dpr, 0, 0);
      cc.clearRect(0, 0, ancho, alto);
      cc.lineCap = "round"; cc.lineJoin = "round";
      for (var i = 1; i < rastro.length; i++) {
        var a = rastro[i - 1], b = rastro[i];
        if (b.t - a.t > 120) continue;
        var vida = 1 - (ahora - b.t) / RASTRO_VIDA;
        cc.strokeStyle = b.c;
        cc.lineWidth = b.w * Math.min(1, vida * 1.4); // la cola se afina hasta desaparecer
        cc.beginPath(); cc.moveTo(a.x - sx, a.y - sy); cc.lineTo(b.x - sx, b.y - sy); cc.stroke();
      }
      cx.save(); cx.setTransform(1, 0, 0, 1, 0, 0); cx.globalAlpha = 0.75; cx.drawImage(capa, 0, 0); cx.restore();
    }

    // Gotas que chorrean del rastro
    chorreas = chorreas.filter(function (g) { return ahora - g.t < GOTA_VIDA; });
    chorreas.forEach(function (g) {
      var edad = ahora - g.t;
      cx.globalAlpha = 0.72 * Math.min(1, (GOTA_VIDA - edad) / 700);
      cx.strokeStyle = g.c; cx.fillStyle = g.c;
      chorrear(g, sx, sy, ahora);
    });

    // Grafitis sobre las fotos
    trazos = trazos.filter(function (tr) { return alfaGrafiti(tr.t, ahora) > 0 && tr.img.isConnected; });
    trazos.forEach(function (tr) {
      cx.save();
      if (recortar(tr.img)) {
        cx.globalAlpha = 0.82 * alfaGrafiti(tr.t, ahora);
        cx.strokeStyle = tr.c; cx.fillStyle = tr.c;
        var p = tr.pts;
        if (p.length === 1) { cx.beginPath(); cx.arc(p[0].x - sx, p[0].y - sy, p[0].w / 2, 0, 7); cx.fill(); }
        for (var k = 1; k < p.length; k++) {
          cx.lineWidth = p[k].w;
          cx.beginPath(); cx.moveTo(p[k - 1].x - sx, p[k - 1].y - sy); cx.lineTo(p[k].x - sx, p[k].y - sy); cx.stroke();
        }
        tr.gotas.forEach(function (g) { cx.beginPath(); cx.arc(g.x - sx, g.y - sy, g.r, 0, 7); cx.fill(); });
        tr.chorreas.forEach(function (g) { chorrear(g, sx, sy, ahora); });
      }
      cx.restore();
    });

    // Manchas del celular
    manchas = manchas.filter(function (m) { return alfaGrafiti(m.t, ahora) > 0 && m.img.isConnected; });
    manchas.forEach(function (m) {
      cx.save();
      if (recortar(m.img)) {
        cx.globalAlpha = 0.85 * alfaGrafiti(m.t, ahora);
        cx.fillStyle = m.c;
        // Contorno suave: curvas entre los puntos medios del borde irregular
        var pts = m.forma.map(function (q) { return [m.x - sx + Math.cos(q.a) * q.r, m.y - sy + Math.sin(q.a) * q.r]; });
        var n = pts.length;
        cx.beginPath();
        cx.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
        for (var j = 0; j < n; j++) {
          var sig = pts[(j + 1) % n];
          cx.quadraticCurveTo(pts[j][0], pts[j][1], (pts[j][0] + sig[0]) / 2, (pts[j][1] + sig[1]) / 2);
        }
        cx.closePath(); cx.fill();
        m.gotas.forEach(function (g) { cx.beginPath(); cx.arc(m.x - sx + g.x, m.y - sy + g.y, g.r, 0, 7); cx.fill(); });
      }
      cx.restore();
    });
    cx.globalAlpha = 1;

    if (rastro.length || chorreas.length || trazos.length || manchas.length) pedir();
  }
  window.addEventListener("scroll", function () { if (trazos.length || manchas.length) pedir(); }, { passive: true });

  // La foto que está debajo del puntero, aunque la tape el enlace invisible de la tarjeta
  function fotoBajo(ev) {
    var t = ev.target;
    var f = t && t.closest ? t.closest(FOTOS) : null;
    if (f || !document.elementsFromPoint) return f;
    var p = ev.touches && ev.touches[0] ? ev.touches[0] : ev;
    if (p.clientX == null) return null;
    var pila = document.elementsFromPoint(p.clientX, p.clientY);
    for (var i = 0; i < pila.length; i++) if (pila[i].matches && pila[i].matches(FOTOS)) return pila[i];
    return null;
  }

  /* ---- Computadora: rastro y grafiti ---- */
  if (fino) {
    var actual = null, inicio = null, movio = false, recorrido = 0;

    document.addEventListener("pointermove", function (ev) {
      if (ev.pointerType !== "mouse" || tinta === "no") return;
      var c = color(), x = ev.pageX, y = ev.pageY, ahora = performance.now();
      var prev = rastro[rastro.length - 1];
      var paso = prev && ahora - prev.t < 120 ? Math.hypot(x - prev.x, y - prev.y) : 0;
      // Más lento = más tinta: trazo más ancho
      var w = prev ? Math.max(5, Math.min(10, 11 - paso * 0.1)) : 8;
      if (prev) w = prev.w * 0.6 + w * 0.4;
      rastro.push({ x: x, y: y, t: ahora, c: c, w: w });
      if (rastro.length > 120) rastro.shift();
      // Goteo: cada tanto cae una gota del trazo
      recorrido += paso;
      if (!actual && recorrido > 34) {
        recorrido = 0;
        if (Math.random() < 0.6) {
          chorreas.push({ x: x + (Math.random() - 0.5) * w, y: y, t: ahora, c: c, w: 2 + Math.random() * 2.5, largo: 12 + Math.random() * 38, dur: 900 + Math.random() * 700 });
          if (chorreas.length > 40) chorreas.shift();
        }
      }
      if (actual) {
        var ult = actual.pts[actual.pts.length - 1];
        var d = Math.hypot(x - ult.x, y - ult.y);
        if (Math.hypot(x - inicio.x, y - inicio.y) > 5) movio = true;
        if (d > 1.5) {
          // Más rápido = trazo más fino, como un aerosol
          var w = Math.max(6, Math.min(14, 16 - d * 0.35));
          actual.pts.push({ x: x, y: y, w: w });
          if (Math.random() < 0.06) {
            actual.chorreas.push({ x: x + (Math.random() - 0.5) * w * 0.6, y: y + w * 0.3, t: ahora, c: actual.c, w: 2.5 + Math.random() * 3, largo: 18 + Math.random() * 60, dur: 1600 + Math.random() * 1600 });
          }
          if (Math.random() < 0.55) {
            var ang = Math.random() * Math.PI * 2, dist = w * (0.6 + Math.random() * 1.4);
            actual.gotas.push({ x: x + Math.cos(ang) * dist, y: y + Math.sin(ang) * dist, r: 0.6 + Math.random() * 1.8 });
          }
          actual.t = ahora;
        }
      }
      pedir();
    }, { passive: true });

    document.addEventListener("pointerdown", function (ev) {
      if (ev.pointerType !== "mouse" || ev.button !== 0 || tinta === "no") return;
      var img = fotoBajo(ev);
      if (!img) return;
      ev.preventDefault(); // sin arrastrar la imagen ni seleccionar texto
      inicio = { x: ev.pageX, y: ev.pageY }; movio = false;
      actual = { img: img, c: color(), t: performance.now(), pts: [{ x: ev.pageX, y: ev.pageY, w: 12 }], gotas: [], chorreas: [] };
      trazos.push(actual);
      document.documentElement.classList.add("tinta-pintando");
      pedir();
    });

    function soltar() {
      if (!actual) return;
      if (!movio) trazos.pop(); // fue un clic común: no deja marca y abre la nota
      actual = null;
      setTimeout(function () { movio = false; }, 0);
      document.documentElement.classList.remove("tinta-pintando");
      pedir();
    }
    document.addEventListener("pointerup", soltar);
    document.addEventListener("pointercancel", soltar);
    window.addEventListener("blur", soltar);

    // Si se pintó, ese clic no abre la nota
    document.addEventListener("click", function (ev) {
      if (movio) { ev.preventDefault(); ev.stopImmediatePropagation(); movio = false; }
    }, true);
    document.addEventListener("dragstart", function (ev) { if (tinta !== "no" && fotoBajo(ev)) ev.preventDefault(); });
    document.addEventListener("mouseleave", function () { rastro.length = 0; pedir(); });
  }

  /* ---- Celular: mantener el dedo sobre una foto deja una mancha ---- */
  if (!fino) {
    var reloj = null, toque = null, mancho = false;
    function mancha(img, x, y) {
      var forma = [], n = 18, base = 16 + Math.random() * 10;
      for (var i = 0; i < n; i++) {
        var a = (i / n) * Math.PI * 2;
        forma.push({ a: a, r: base * (0.8 + Math.random() * 0.35) * (Math.random() < 0.2 ? 1.35 : 1) });
      }
      var gotas = [];
      for (var j = 0; j < 14; j++) {
        var ang = Math.random() * Math.PI * 2, d = base * (1.3 + Math.random() * 1.8);
        gotas.push({ x: Math.cos(ang) * d, y: Math.sin(ang) * d, r: 1 + Math.random() * 3.5 });
      }
      manchas.push({ img: img, c: color(), t: performance.now(), x: x, y: y, forma: forma, gotas: gotas });
      if (manchas.length > 30) manchas.shift();
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
      pedir();
    }
    document.addEventListener("touchstart", function (ev) {
      if (tinta === "no" || ev.touches.length !== 1) return;
      var img = fotoBajo(ev);
      if (!img) return;
      var t = ev.touches[0];
      toque = { x: t.pageX, y: t.pageY, img: img }; mancho = false;
      clearTimeout(reloj);
      reloj = setTimeout(function () { if (toque) { mancha(toque.img, toque.x, toque.y); mancho = true; } }, 420);
    }, { passive: true });
    document.addEventListener("touchmove", function (ev) {
      if (!toque) return;
      var t = ev.touches[0];
      if (Math.hypot(t.pageX - toque.x, t.pageY - toque.y) > 10) { clearTimeout(reloj); toque = null; }
    }, { passive: true });
    document.addEventListener("touchend", function (ev) {
      clearTimeout(reloj); toque = null;
      if (mancho) { ev.preventDefault(); } // la mancha no abre la nota
    });
    document.addEventListener("click", function (ev) {
      if (mancho) { ev.preventDefault(); ev.stopImmediatePropagation(); mancho = false; }
    }, true);
    document.addEventListener("contextmenu", function (ev) { if (tinta !== "no" && fotoBajo(ev)) ev.preventDefault(); });
  }
})();
