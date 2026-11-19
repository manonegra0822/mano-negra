/* Mano Negra: la mano 3D que gira al lado del nombre, en la cabecera.
   - Se carga después de la página (no demora la lectura) y desde una copia fija de three.js.
   - Fondo transparente: sirve en modo claro y oscuro.
   - Solo dibuja mientras la cabecera está a la vista y la pestaña está abierta, a 30 cuadros
     por segundo como máximo (gira lento, no hace falta más) para no gastar batería ni trabar la página.
   - Si el navegador no tiene 3D o la persona pidió menos movimiento, queda la imagen fija. */
const cont = document.querySelector(".cab-mano");
const VUELTA_SEG = 14;

function hay3D() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; }
}
function cuandoLibre(fn) {
  const ir = () => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 600));
  if (document.readyState === "complete") ir(); else addEventListener("load", ir, { once: true });
}

if (cont && hay3D() && !matchMedia("(prefers-reduced-motion: reduce)").matches) cuandoLibre(iniciar);

async function iniciar() {
  let THREE, GLTFLoader, RoomEnvironment, MeshoptDecoder;
  try {
    THREE = await import("three");
    ({ GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js"));
    ({ RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js"));
    ({ MeshoptDecoder } = await import("three/addons/libs/meshopt_decoder.module.js"));
  } catch (e) { return; }   // sin conexión al CDN: queda la imagen fija

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  // Luz de estudio: clave cálida arriba a la izquierda, recorte frío atrás
  const clave = new THREE.DirectionalLight(0xfff2e0, 2.6); clave.position.set(-2, 4, 3); scene.add(clave);
  const recorte = new THREE.DirectionalLight(0xbfd4ff, 2.2); recorte.position.set(2.5, 2, -3); scene.add(recorte);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x111111, 0.25));

  const camera = new THREE.PerspectiveCamera(26, 1, 0.01, 100);
  const pivote = new THREE.Group(); scene.add(pivote);

  let listo = false;
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(cont.getAttribute("data-modelo"), (gltf) => {
    const m = gltf.scene;
    const caja = new THREE.Box3().setFromObject(m);
    m.scale.setScalar(1 / caja.getSize(new THREE.Vector3()).y);   // alto 1
    caja.setFromObject(m);
    const c = caja.getCenter(new THREE.Vector3());
    m.position.x -= c.x; m.position.z -= c.z; m.position.y -= c.y;  // centrada
    pivote.add(m);
    medir();
    listo = true;
    cont.appendChild(canvas);
    cont.classList.add("en-3d");
    pedir();
  }, undefined, () => {});

  function medir() {
    const w = cont.clientWidth || 1, h = cont.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Entra la mano entera (alto 1) y, al girar, también a lo ancho (hasta ~0,62)
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const alto = Math.max(1.12, 0.7 / camera.aspect);
    camera.position.set(0, 0, (alto / 2) / Math.tan(vfov / 2));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(() => { if (listo) { medir(); pedir(); } }).observe(cont);

  // Solo se anima a la vista y con la pestaña abierta, a 30 cuadros por segundo como máximo
  let visible = true, corriendo = false, ultimo = 0, angulo = 0, previo = 0;
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; pedir(); }).observe(cont);
  document.addEventListener("visibilitychange", pedir);
  function pedir() {
    const debe = listo && visible && !document.hidden;
    if (debe && !corriendo) { corriendo = true; previo = performance.now(); requestAnimationFrame(cuadro); }
  }
  function cuadro(t) {
    if (!(listo && visible && !document.hidden)) { corriendo = false; return; }
    angulo += (Math.PI * 2 / VUELTA_SEG) * Math.min(0.1, (t - previo) / 1000);
    previo = t;
    if (t - ultimo >= 1000 / 30 - 2) {
      ultimo = t;
      pivote.rotation.y = angulo;
      renderer.render(scene, camera);
    }
    requestAnimationFrame(cuadro);
  }
}
