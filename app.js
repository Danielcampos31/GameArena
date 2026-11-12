const API_URL = "http://localhost:8080";
 
(() => {
  const $ = id => document.getElementById(id);
 
  // ---------- Estado en memoria ----------
  let videojuegos = [];
  let jugadores = [];
  let torneos = [];            // lista completa (sin filtrar)
  let torneoEditando = null;   // torneo que se está editando (objeto) o null
  let jugadorEditando = null;  // id del jugador que se está editando o null
  let torneoParticipantesId = null; // torneo cuyo panel de participantes está abierto
  let temporizadorAviso = null;
 
  // ---------- Utilidades ----------
  // Crea un elemento y usa textContent (así no se interpreta HTML de los datos)
  function el(tag, props = {}, ...hijos) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") e.className = v;
      else if (k === "texto") e.textContent = v;
      else e.setAttribute(k, v);
    }
    hijos.forEach(h => e.append(h));
    return e;
  }
 
  // Aviso verde (ok), amarillo (el usuario puede corregirlo) o rojo (fallo grave)
  function aviso(tipo, texto) {
    const clase = { ok: "success", warn: "warning", error: "danger" }[tipo];
    $("aviso").replaceChildren(el("div", { class: `alert alert-${clase} mb-0`, role: "alert", texto }));
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => $("aviso").replaceChildren(), 6000);
  }
 
  function estadoConexion(conectado) {
    const b = $("conexion");
    b.textContent = conectado ? "Conectado" : "Sin conexión";
    b.classList.toggle("ok", conectado);
    b.classList.toggle("error", !conectado);
  }
 
  // Todas las peticiones pasan por aquí: añade API_URL, lee el JSON
  // y lanza un Error si el servidor responde con 4xx / 5xx.
  async function api(ruta, metodo = "GET", cuerpo = null) {
    const opciones = { method: metodo, headers: {} };
    if (cuerpo !== null) {
      opciones.headers["Content-Type"] = "application/json";
      opciones.body = JSON.stringify(cuerpo);
    }
 
    let respuesta;
    try {
      respuesta = await fetch(API_URL + ruta, opciones);
    } catch (e) {
      estadoConexion(false);
      const err = new Error("No se puede conectar con el servidor. ¿Está arrancado en " + API_URL + "?");
      err.status = 0;
      throw err;
    }
    estadoConexion(true);
 
    const texto = await respuesta.text();
    let datos = null;
    if (texto) {
      try { datos = JSON.parse(texto); } catch (e) { datos = texto; }
    }
 
    if (!respuesta.ok) {
      const detalle = (datos && datos.message) || (datos && datos.error) || respuesta.statusText;
      const err = new Error(`Error ${respuesta.status}: ${detalle}`);
      err.status = respuesta.status;
      throw err;
    }
    return datos;
  }
 
  // 400 / 404 / 409 los puede corregir el usuario (amarillo); el resto es rojo
  function avisarError(err) {
    const tipo = [400, 404, 409].includes(err.status) ? "warn" : "error";
    aviso(tipo, err.message);
  }
 
  // Ejecuta una acción y avisa si falla (nunca falla en silencio)
  async function seguro(accion) {
    try {
      await accion();
    } catch (err) {
      avisarError(err);
    }
  }
 
  function botonFila(texto, clase, onClick) {
    const b = el("button", { type: "button", class: `btn btn-sm ${clase}`, texto });
    b.addEventListener("click", onClick);
    return b;
  }
 
  function celdaAcciones(...botones) {
    const td = el("td", { class: "text-end" });
    const caja = el("div", { class: "d-inline-flex gap-2" }, ...botones);
    td.append(caja);
    return td;
  }
 
  function rellenarSelect(select, lista, textoItem, conservar = true) {
    const anterior = select.value;
    select.replaceChildren(el("option", { value: "" }));
    lista.forEach(x => select.append(el("option", { value: x.id, texto: textoItem(x) })));
    if (conservar && lista.some(x => String(x.id) === anterior)) select.value = anterior;
  }
 
  function filaVacia(columnas, texto) {
    return el("tr", {}, el("td", { colspan: columnas, class: "text-center text-secondary", texto }));
  }
 
  // =====================================================================
  //  VIDEOJUEGOS
  // =====================================================================
 
  // GET /videojuegos
  async function cargarVideojuegos() {
    videojuegos = await api("/videojuegos");
    const cuerpo = $("cuerpoJuegos");
    cuerpo.replaceChildren();
    if (videojuegos.length === 0) cuerpo.append(filaVacia(2, "No hay videojuegos"));
    videojuegos.forEach(v => {
      cuerpo.append(el("tr", {}, el("td", { texto: v.id }), el("td", { texto: v.nombre })));
    });
    rellenarSelect($("filtroVideojuego"), videojuegos, v => v.nombre);
    rellenarSelect($("tVideojuego"), videojuegos, v => v.nombre);
  }
 
  // GET /videojuegos/{id}
  async function buscarVideojuego() {
    const id = $("buscarJuegoId").value;
    $("resJuego").replaceChildren();
    if (!id) return aviso("warn", "Escribe el ID del videojuego que quieres buscar");
    const v = await api("/videojuegos/" + id);
    $("resJuego").append(el("div", { class: "list-group-item", texto: `#${v.id} · ${v.nombre}` }));
  }
 
  // POST /videojuegos
  async function crearVideojuego() {
    if (!$("formJuego").reportValidity()) return;
    const v = await api("/videojuegos", "POST", { nombre: $("vNombre").value.trim() });
    aviso("ok", `Videojuego "${v.nombre}" creado`);
    $("formJuego").reset();
    await cargarVideojuegos();
  }
 
  // =====================================================================
  //  JUGADORES
  // =====================================================================
 
  // GET /jugadores
  async function cargarJugadores() {
    jugadores = await api("/jugadores");
    const cuerpo = $("cuerpoJugadores");
    cuerpo.replaceChildren();
    if (jugadores.length === 0) cuerpo.append(filaVacia(5, "No hay jugadores"));
    jugadores.forEach(j => {
      cuerpo.append(el("tr", {},
        el("td", { texto: j.id }),
        el("td", { texto: j.nick }),
        el("td", { texto: j.email }),
        el("td", { texto: j.nivel }),
        celdaAcciones(
          botonFila("Torneos", "btn-outline-primary", () => seguro(() => verTorneosDeJugador(j))),
          botonFila("Editar", "btn-outline-primary", () => editarJugador(j)),
          botonFila("Eliminar", "btn-outline-danger", () => seguro(() => eliminarJugador(j)))
        )
      ));
    });
    rellenarSelect($("iJugador"), jugadores, j => j.nick);
  }
 
  // GET /jugadores/{id}
  async function buscarJugador() {
    const id = $("buscarJugadorId").value;
    $("resJugador").replaceChildren();
    if (!id) return aviso("warn", "Escribe el ID del jugador que quieres buscar");
    const j = await api("/jugadores/" + id);
    $("resJugador").append(el("div", { class: "list-group-item", texto: `#${j.id} · ${j.nick} · ${j.email} · nivel ${j.nivel}` }));
  }
 
  // POST /jugadores  o  PUT /jugadores/{id}
  async function guardarJugador() {
    if (!$("formJugador").reportValidity()) return;
    const datos = {
      nick: $("jNick").value.trim(),
      email: $("jEmail").value.trim(),
      nivel: Number($("jNivel").value)
    };
    if (jugadorEditando === null) {
      const j = await api("/jugadores", "POST", datos);
      aviso("ok", `Jugador "${j.nick}" creado`);
    } else {
      const j = await api("/jugadores/" + jugadorEditando, "PUT", datos);
      aviso("ok", `Jugador "${j.nick}" modificado`);
    }
    salirEdicionJugador();
    await cargarJugadores();
  }
 
  function editarJugador(j) {
    jugadorEditando = j.id;
    $("jNick").value = j.nick;
    $("jEmail").value = j.email;
    $("jNivel").value = j.nivel;
    $("btnJugador").textContent = "Guardar cambios";
    $("btnCancelarJugador").hidden = false;
    $("formJugador").scrollIntoView({ behavior: "smooth", block: "center" });
  }
 
  function salirEdicionJugador() {
    jugadorEditando = null;
    $("formJugador").reset();
    $("btnJugador").textContent = "Crear jugador";
    $("btnCancelarJugador").hidden = true;
  }
 
  // DELETE /jugadores/{id}
  async function eliminarJugador(j) {
    if (!confirm(`¿Eliminar al jugador "${j.nick}"?`)) return;
    await api("/jugadores/" + j.id, "DELETE");
    aviso("ok", `Jugador "${j.nick}" eliminado`);
    if (jugadorEditando === j.id) salirEdicionJugador();
    $("panelTorneosJugador").hidden = true;
    await cargarJugadores();
  }
 
  // GET /jugadores/{id}/participaciones
  async function verTorneosDeJugador(j) {
    const lista = await api(`/jugadores/${j.id}/participaciones`);
    $("tituloTorneosJugador").textContent = `Torneos de ${j.nick}`;
    const ul = $("listaTorneosJugador");
    ul.replaceChildren();
    if (lista.length === 0) ul.append(el("li", { class: "list-group-item", texto: "No participa en ningún torneo" }));
    lista.forEach(p => {
      const t = p.torneo;
      const juego = t.videojuego ? t.videojuego.nombre : "sin videojuego";
      ul.append(el("li", { class: "list-group-item", texto: `${t.nombre} · ${juego} · ${t.estado}` }));
    });
    $("panelTorneosJugador").hidden = false;
  }
 
  // =====================================================================
  //  TORNEOS
  // =====================================================================
 
  function pintarTorneos(lista) {
    const cuerpo = $("cuerpoTorneos");
    cuerpo.replaceChildren();
    if (lista.length === 0) cuerpo.append(filaVacia(5, "No hay torneos"));
    lista.forEach(t => {
      cuerpo.append(el("tr", {},
        el("td", { texto: t.id }),
        el("td", { texto: t.nombre }),
        el("td", { texto: t.videojuego ? t.videojuego.nombre : "—" }),
        el("td", { texto: t.estado }),
        celdaAcciones(
          botonFila("Participantes", "btn-outline-primary", () => seguro(() => verParticipantes(t))),
          botonFila("Editar", "btn-outline-primary", () => editarTorneo(t)),
          botonFila("Eliminar", "btn-outline-danger", () => seguro(() => eliminarTorneo(t)))
        )
      ));
    });
  }
 
  // GET /torneos
  async function cargarTorneos() {
    torneos = await api("/torneos");
    pintarTorneos(torneos);
    rellenarSelect($("iTorneo"), torneos, t => t.nombre);
  }
 
  // GET /torneos?estado=  |  ?videojuegoId=  |  ?estado=&videojuegoId=
  async function filtrarTorneos() {
    const estado = $("filtroEstado").value;
    const videojuegoId = $("filtroVideojuego").value;
    const params = new URLSearchParams();
    if (estado) params.set("estado", estado);
    if (videojuegoId) params.set("videojuegoId", videojuegoId);
    const consulta = params.toString();
    const lista = await api("/torneos" + (consulta ? "?" + consulta : ""));
    pintarTorneos(lista);
    aviso("ok", consulta ? `${lista.length} torneo(s) encontrados con el filtro` : "Mostrando todos los torneos");
  }
 
  // GET /torneos/{id}
  async function buscarTorneo() {
    const id = $("buscarTorneoId").value;
    $("resTorneo").replaceChildren();
    if (!id) return aviso("warn", "Escribe el ID del torneo que quieres buscar");
    const t = await api("/torneos/" + id);
    const juego = t.videojuego ? t.videojuego.nombre : "sin videojuego";
    $("resTorneo").append(el("div", { class: "list-group-item", texto: `#${t.id} · ${t.nombre} · ${juego} · ${t.estado}` }));
  }
 
  // POST /torneos  o  PUT /torneos/{id}
  async function guardarTorneo() {
    if (!$("formTorneo").reportValidity()) return;
    const datos = {
      nombre: $("tNombre").value.trim(),
      estado: $("tEstado").value,
      videojuego: { id: Number($("tVideojuego").value) }
    };
    if (torneoEditando === null) {
      const t = await api("/torneos", "POST", datos);
      aviso("ok", `Torneo "${t.nombre}" creado`);
    } else {
      // se conservan la fecha y el premio que ya tenía el torneo
      if (torneoEditando.fecha) datos.fecha = torneoEditando.fecha;
      if (torneoEditando.premio !== null && torneoEditando.premio !== undefined) datos.premio = torneoEditando.premio;
      const t = await api("/torneos/" + torneoEditando.id, "PUT", datos);
      aviso("ok", `Torneo "${t.nombre}" modificado`);
    }
    salirEdicionTorneo();
    await cargarTorneos();
  }
 
  function editarTorneo(t) {
    torneoEditando = t;
    $("tNombre").value = t.nombre;
    $("tVideojuego").value = t.videojuego ? t.videojuego.id : "";
    $("tEstado").value = t.estado;
    $("btnTorneo").textContent = "Guardar cambios";
    $("btnCancelarTorneo").hidden = false;
    $("formTorneo").scrollIntoView({ behavior: "smooth", block: "center" });
  }
 
  function salirEdicionTorneo() {
    torneoEditando = null;
    $("formTorneo").reset();
    $("btnTorneo").textContent = "Crear torneo";
    $("btnCancelarTorneo").hidden = true;
  }
 
  // DELETE /torneos/{id}
  async function eliminarTorneo(t) {
    if (!confirm(`¿Eliminar el torneo "${t.nombre}"?`)) return;
    await api("/torneos/" + t.id, "DELETE");
    aviso("ok", `Torneo "${t.nombre}" eliminado`);
    if (torneoEditando && torneoEditando.id === t.id) salirEdicionTorneo();
    if (torneoParticipantesId === t.id) {
      $("panelParticipantesTorneo").hidden = true;
      torneoParticipantesId = null;
    }
    await cargarTorneos();
  }
 
  // GET /torneos/{id}/participaciones
  async function verParticipantes(t) {
    const lista = await api(`/torneos/${t.id}/participaciones`);
    torneoParticipantesId = t.id;
    $("tituloParticipantesTorneo").textContent = `Participantes de ${t.nombre}`;
    const ul = $("listaParticipantesTorneo");
    ul.replaceChildren();
    if (lista.length === 0) ul.append(el("li", { class: "list-group-item", texto: "Todavía no hay jugadores inscritos" }));
    lista.forEach(p => {
      const detalle = p.puntos !== null && p.puntos !== undefined ? ` · ${p.puntos} puntos` : "";
      ul.append(el("li", { class: "list-group-item", texto: `${p.jugador.nick} (nivel ${p.jugador.nivel})${detalle}` }));
    });
    $("panelParticipantesTorneo").hidden = false;
  }
 
  // POST /participaciones?jugadorId=&torneoId=
  async function inscribir() {
    if (!$("formInscripcion").reportValidity()) return;
    const jugadorId = $("iJugador").value;
    const torneoId = $("iTorneo").value;
    await api(`/participaciones?jugadorId=${jugadorId}&torneoId=${torneoId}`, "POST", {});
    aviso("ok", "Jugador inscrito en el torneo");
    $("formInscripcion").reset();
    if (torneoParticipantesId !== null && String(torneoParticipantesId) === torneoId) {
      const t = torneos.find(x => String(x.id) === torneoId);
      if (t) await verParticipantes(t);
    }
  }
 
  // =====================================================================
  //  ARRANQUE: enlazar botones y cargar las listas solas
  // =====================================================================
  function crearBotonCancelar(idBoton, idNuevo, alCancelar) {
    const cancelar = el("button", { type: "button", id: idNuevo, class: "btn btn-outline-primary w-100 mt-2", texto: "Cancelar edición" });
    cancelar.hidden = true;
    cancelar.addEventListener("click", alCancelar);
    $(idBoton).after(cancelar);
  }
 
  function iniciar() {
    crearBotonCancelar("btnTorneo", "btnCancelarTorneo", salirEdicionTorneo);
    crearBotonCancelar("btnJugador", "btnCancelarJugador", salirEdicionJugador);
 
    $("btnFiltrarTorneos").addEventListener("click", () => seguro(filtrarTorneos));
    $("btnBuscarTorneo").addEventListener("click", () => seguro(buscarTorneo));
    $("btnTorneo").addEventListener("click", () => seguro(guardarTorneo));
    $("btnInscribir").addEventListener("click", () => seguro(inscribir));
 
    $("btnBuscarJugador").addEventListener("click", () => seguro(buscarJugador));
    $("btnJugador").addEventListener("click", () => seguro(guardarJugador));
 
    $("btnBuscarJuego").addEventListener("click", () => seguro(buscarVideojuego));
    $("btnJuego").addEventListener("click", () => seguro(crearVideojuego));
 
    // Al cambiar de pestaña se vuelven a pedir los datos
    $("tabTorneos").addEventListener("shown.bs.tab", () => seguro(async () => { await cargarVideojuegos(); await cargarTorneos(); }));
    $("tabJugadores").addEventListener("shown.bs.tab", () => seguro(cargarJugadores));
    $("tabVideojuegos").addEventListener("shown.bs.tab", () => seguro(cargarVideojuegos));
 
    // Carga inicial (sin botón "Ver")
    seguro(async () => {
      await cargarVideojuegos();
      await cargarJugadores();
      await cargarTorneos();
    });
  }
 
  iniciar();
})();
 
 
// =====================================================================
//  Efectos visuales (tu código original, sin cambios)
// =====================================================================
(() => {
  // Brillo que sigue al ratón dentro de cada tarjeta
  document.addEventListener('pointermove', e => {
    const c = e.target.closest && e.target.closest('.card');
    if (!c) return;
    const r = c.getBoundingClientRect();
    c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    c.style.setProperty('--my', (e.clientY - r.top) + 'px');
  });
 
  // Onda al pulsar un botón
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.btn');
    if (!b) return;
    const r = b.getBoundingClientRect();
    const d = Math.max(r.width, r.height);
    const o = document.createElement('span');
    o.className = 'ripple';
    o.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    b.appendChild(o);
    setTimeout(() => o.remove(), 650);
  });
 
  // Partículas conectadas en el fondo
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = document.getElementById('particulas');
  const ctx = cv.getContext('2d');
  let w, h, dpr, pts = [];
  const mouse = { x: -999, y: -999 };
 
  function medir() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.min(80, Math.floor(w * h / 18000));
    pts = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35,
      r: Math.random() * 1.6 + .6, c: Math.random() < .5 ? '34,211,238' : '139,92,246'
    }));
  }
  addEventListener('resize', medir);
  addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
 
  function pintar() {
    ctx.clearRect(0, 0, w, h);
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, 6.283);
      ctx.fillStyle = `rgba(${p.c},.85)`;
      ctx.fill();
    }
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
        if (d < 120) {
          ctx.strokeStyle = `rgba(139,92,246,${(1 - d / 120) * .35})`;
          ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke();
        }
      }
      const dm = Math.hypot(pts[i].x - mouse.x, pts[i].y - mouse.y);
      if (dm < 170) {
        ctx.strokeStyle = `rgba(34,211,238,${(1 - dm / 170) * .6})`;
        ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
      }
    }
    requestAnimationFrame(pintar);
  }
  medir();
  pintar();
})();