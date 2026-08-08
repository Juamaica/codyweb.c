// ============================================================
//  CODYWEB.COM — script.js
//  U.E. Juana Azurduy de Padilla
// ============================================================

'use strict';

/* ── Estado global ──────────────────────────────────────────── */
const App = {
  paginaActual : 'inicio',
  cursos       : [],
  estudiantes  : [],
  asistencias  : [],
  videoStream  : null,
  scannerActive: false,
  chartDona    : null,
  chartBarras  : null,
  chartLinea   : null,
  chartPie     : null,
  ultimosEscan : [],
  importFile   : null,
};

/* ══════════════════════════════════════════════════════════════
   NAVEGACIÓN
═══════════════════════════════════════════════════════════════ */
function navTo(pagina, el) {
  // Desactivar página actual
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  // Activar nueva
  const pg = document.getElementById('page-' + pagina);
  if (pg) pg.classList.add('active');

  const nav = el || document.querySelector(`[data-page="${pagina}"]`);
  if (nav) nav.classList.add('active');

  // Topbar
  const titulos = {
    inicio       : 'Inicio',
    estudiantes  : 'Estudiantes',
    qr           : 'Códigos QR',
    escanear     : 'Escanear QR',
    asistencias  : 'Asistencias',
    reportes     : 'Reportes',
    configuracion: 'Configuración',
  };
  document.getElementById('topbarTitle').textContent = titulos[pagina] || pagina;
  App.paginaActual = pagina;

  // Parar cámara si salimos de escanear
  if (pagina !== 'escanear') detenerCamara();

  closeSidebar();
  cargarPagina(pagina);
}

function cargarPagina(pagina) {
  switch (pagina) {
    case 'inicio'       : cargarInicio();        break;
    case 'estudiantes'  : cargarEstudiantes();   break;
    case 'qr'           : cargarQR();            break;
    case 'asistencias'  : iniciarAsistencias();  break;
    case 'reportes'     : iniciarReportes();     break;
    case 'configuracion': cargarConfiguracion(); break;
  }
}

/* ── Sidebar mobile ─────────────────────────────────────────── */
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarBackdrop').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('open');
}

/* ══════════════════════════════════════════════════════════════
   RELOJ
═══════════════════════════════════════════════════════════════ */
function actualizarReloj() {
  const ahora = new Date();
  const fecha = ahora.toLocaleDateString('es-BO', { day:'2-digit', month:'2-digit', year:'numeric' });
  const hora  = ahora.toLocaleTimeString('es-BO', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  const ampm  = ahora.getHours() >= 12 ? 'PM' : 'AM';
  document.getElementById('topbarClock').textContent = `📅 ${fecha}   🕐 ${hora.slice(0,5)} ${ampm}`;
  document.getElementById('fechaHoyBadge').textContent = fecha;
}
setInterval(actualizarReloj, 1000);
actualizarReloj();

/* ══════════════════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════════════════════ */
function toast(titulo, msg = '', tipo = 'success', duracion = 4000) {
  const iconos = { success: '✅', error: '❌', warn: '⚠️', info: 'ℹ️' };
  const t = document.createElement('div');
  t.className = `toast ${tipo === 'success' ? '' : tipo}`;
  t.innerHTML = `
    <span class="toast-icon">${iconos[tipo] || '✅'}</span>
    <div class="toast-body">
      <div class="toast-title">${titulo}</div>
      ${msg ? `<div class="toast-msg">${msg}</div>` : ''}
    </div>
    <button onclick="this.parentElement.remove()"
      style="background:none;border:none;cursor:pointer;font-size:1rem;color:var(--text-muted);padding:0 0 0 8px;">✕</button>
  `;
  document.getElementById('toastContainer').appendChild(t);
  setTimeout(() => t.style.opacity = '0', duracion - 400);
  setTimeout(() => t.remove(), duracion);
}

/* ══════════════════════════════════════════════════════════════
   FETCH HELPERS
═══════════════════════════════════════════════════════════════ */
/* Las funciones get() y post() ahora viven en api.js (conectan con Supabase) */

/* ══════════════════════════════════════════════════════════════
   MODALES
═══════════════════════════════════════════════════════════════ */
function abrirModal(id)  { document.getElementById(id).classList.add('open'); }
function cerrarModal(id) { document.getElementById(id).classList.remove('open'); }

// Cerrar al hacer clic fuera
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

/* ══════════════════════════════════════════════════════════════
   INICIO — Dashboard
═══════════════════════════════════════════════════════════════ */
async function cargarInicio() {
  // KPI Total estudiantes
  const est = await get('listar.php?accion=estudiantes&estado=Activo');
  const total = est.data ? est.data.length : 0;
  document.getElementById('kpi-total').textContent = total;
  document.getElementById('kpi-dona-total').textContent = total;

  // Cursos
  const cur = await get('listar.php?accion=cursos');
  document.getElementById('kpi-cursos').textContent = cur.data ? cur.data.length : 0;
  document.getElementById('kpi-qr').textContent = total;

  // Resumen del día
  const hoy  = new Date().toISOString().slice(0, 10);
  const res  = await get(`listar.php?accion=resumen_dia&fecha=${hoy}`);
  const data = res.data || {};
  document.getElementById('kpi-presentes').textContent = data.presentes || 0;

  // Dona
  dibujarDona(data);

  // Barras por curso
  if (cur.data) dibujarBarras(cur.data);

  // Actividad reciente (últimas asistencias)
  const asist = await get(`listar.php?accion=asistencias&fecha=${hoy}`);
  dibujarActividad(asist.data || []);
}

function dibujarDona(data) {
  const presentes  = data.presentes    || 0;
  const tardanzas  = data.tardanzas    || 0;
  const ausentes   = data.ausentes     || 0;
  const justif     = data.justificados || 0;

  const canvas = document.getElementById('chartDona');
  if (!canvas) return;
  if (App.chartDona) App.chartDona.destroy();

  App.chartDona = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Presentes', 'Licencia', 'Ausentes', 'Tarde'],
      datasets: [{ data: [presentes, justif, ausentes, tardanzas],
        backgroundColor: ['#22C55E', '#F59E0B', '#EF4444', '#3B82F6'],
        borderWidth: 0, hoverOffset: 6 }]
    },
    options: {
      cutout: '72%',
      plugins: { legend: { display: false }, tooltip: { callbacks: {
        label: ctx => ` ${ctx.label}: ${ctx.raw} (${total > 0 ? ((ctx.raw/total)*100).toFixed(1) : 0}%)`
      }}},
      animation: { animateRotate: true, duration: 800 }
    }
  });

  // Leyenda manual
  const leyenda = document.getElementById('legendaDona');
  const total = presentes + justif + ausentes + tardanzas;
  const items = [
    { label: 'Presentes', val: presentes, color: '#22C55E' },
    { label: 'Licencia',  val: justif,    color: '#F59E0B' },
    { label: 'Ausentes',  val: ausentes,  color: '#EF4444' },
  ];
  leyenda.innerHTML = items.map(i => `
    <div style="display:flex;align-items:center;justify-content:space-between;font-size:.82rem;">
      <span style="display:flex;align-items:center;gap:8px;">
        <span style="width:10px;height:10px;border-radius:50%;background:${i.color};display:inline-block;"></span>
        ${i.label}
      </span>
      <span style="font-weight:600;">${i.val} (${total > 0 ? ((i.val/total)*100).toFixed(2) : 0}%)</span>
    </div>
  `).join('');
}

async function dibujarBarras(cursos) {
  // Obtener asistencias de hoy y agrupar por curso
  const hoy   = new Date().toISOString().slice(0, 10);
  const asist = await get(`listar.php?accion=asistencias&fecha=${hoy}`);
  const datos  = asist.data || [];

  const counts = {};
  datos.forEach(a => {
    counts[a.curso_nombre] = (counts[a.curso_nombre] || 0) + 1;
  });

  const labels = cursos.slice(0, 8).map(c => c.nombre.replace(' Secundaria', ''));
  const vals   = cursos.slice(0, 8).map(c => counts[c.nombre] || 0);

  const canvas = document.getElementById('chartBarras');
  if (!canvas) return;
  if (App.chartBarras) App.chartBarras.destroy();

  App.chartBarras = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: vals,
        backgroundColor: '#3B82F6',
        borderRadius: 6, borderSkipped: false }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: '#E2EAF4' },
             ticks: { font: { size: 11 }, color: '#5A7BA0' } },
        x: { grid: { display: false },
             ticks: { font: { size: 10 }, color: '#5A7BA0' } }
      },
      animation: { duration: 700 }
    }
  });
}

function dibujarActividad(asistencias) {
  const ul = document.getElementById('actividadReciente');
  if (!asistencias.length) {
    ul.innerHTML = '<li style="padding:20px;text-align:center;color:var(--text-muted);font-size:.84rem;">Sin actividad hoy</li>';
    return;
  }
  const iconos = { Presente: '📋', Tarde: '⏰', Ausente: '❌', Justificado: '📄' };
  const colores = { Presente: '', Tarde: 'late', Ausente: 'absent', Justificado: '' };

  ul.innerHTML = asistencias.slice(0, 8).map(a => `
    <li class="activity-item">
      <div class="activity-dot ${colores[a.estado] || ''}"></div>
      <div>
        <div class="activity-text">${iconos[a.estado] || ''} ${a.nombre} ${a.apellido} - ${a.curso_nombre}</div>
        <div class="activity-time">${a.hora_entrada || '—'}</div>
      </div>
    </li>
  `).join('');
}

/* ══════════════════════════════════════════════════════════════
   ESTUDIANTES
═══════════════════════════════════════════════════════════════ */
async function cargarEstudiantes() {
  await cargarCursosFiltros();
  filtrarEstudiantes();
}

async function filtrarEstudiantes() {
  const buscar  = document.getElementById('buscarEstudiante')?.value || '';
  const curso   = document.getElementById('filtroCurso')?.value || '';
  const estado  = document.getElementById('filtroEstado')?.value || 'Activo';

  let url = `listar.php?accion=estudiantes&estado=${estado}`;
  if (curso)  url += `&curso_id=${curso}`;
  if (buscar) url += `&buscar=${encodeURIComponent(buscar)}`;

  const res = await get(url);
  App.estudiantes = res.data || [];

  document.getElementById('totalEstLabel').textContent = `${App.estudiantes.length} estudiantes`;
  renderTablaEstudiantes(App.estudiantes);
}

function renderTablaEstudiantes(lista) {
  const tbody = document.getElementById('bodyEstudiantes');
  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="8">
      <div class="empty-state" style="padding:40px 0;">
        <div class="empty-state-icon">👤</div>
        <h3>Sin resultados</h3>
        <p>No hay estudiantes con esos filtros</p>
      </div></td></tr>`;
    return;
  }
  const badgeEst = { Activo: 'badge-green', Inactivo: 'badge-red' };
  const badgeGen = { M: 'badge-blue', F: 'badge-purple', Otro: 'badge-gold' };
  const genTxt   = { M: '♂ Masc.', F: '♀ Fem.', Otro: '⚥ Otro' };

  tbody.innerHTML = lista.map((e, i) => `
    <tr>
      <td>${i + 1}</td>
      <td class="td-code">${e.codigo}</td>
      <td><strong>${e.apellido}</strong>, ${e.nombre}</td>
      <td>${e.curso_nombre}</td>
      <td>${e.ci || '—'}</td>
      <td><span class="badge ${badgeGen[e.genero] || 'badge-gold'}">${genTxt[e.genero] || e.genero}</span></td>
      <td><span class="badge ${badgeEst[e.estado] || 'badge-red'}">${e.estado}</span></td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-outline btn-sm" onclick="editarEstudiante(${e.id})" title="Editar">✏️</button>
          <button class="btn btn-outline btn-sm" onclick="verQREstudiante(${e.id})" title="Ver QR">📱</button>
          <button class="btn btn-danger btn-sm" onclick="eliminarEstudiante(${e.id}, '${e.nombre} ${e.apellido}')" title="Desactivar">🗑</button>
        </div>
      </td>
    </tr>
  `).join('');
}

/* Abrir modal nuevo estudiante */
async function abrirModalEstudiante() {
  document.getElementById('estId').value        = '';
  document.getElementById('estNombre').value    = '';
  document.getElementById('estApellido').value  = '';
  document.getElementById('estCI').value        = '';
  document.getElementById('estTelefono').value  = '';
  document.getElementById('estEmail').value     = '';
  document.getElementById('modalEstTitulo').textContent = 'Nuevo estudiante';

  await llenarSelectCursos('estCurso');
  abrirModal('modalEstudiante');
}

async function editarEstudiante(id) {
  const res = await get(`listar.php?accion=estudiante&id=${id}`);
  if (!res.ok) return toast('Error', res.msg, 'error');
  const e = res.data;

  document.getElementById('estId').value       = e.id;
  document.getElementById('estNombre').value   = e.nombre;
  document.getElementById('estApellido').value = e.apellido;
  document.getElementById('estCI').value       = e.ci;
  document.getElementById('estTelefono').value = e.telefono_tutor;
  document.getElementById('estEmail').value    = e.email;
  document.getElementById('modalEstTitulo').textContent = 'Editar estudiante';

  await llenarSelectCursos('estCurso', e.curso_id);
  abrirModal('modalEstudiante');
}

async function guardarEstudiante() {
  const data = {
    accion  : 'guardar_estudiante',
    id      : document.getElementById('estId').value,
    nombre  : document.getElementById('estNombre').value.trim(),
    apellido: document.getElementById('estApellido').value.trim(),
    ci      : document.getElementById('estCI').value.trim(),
    curso_id: document.getElementById('estCurso').value,
    genero  : document.getElementById('estGenero').value,
    telefono: document.getElementById('estTelefono').value.trim(),
    email   : document.getElementById('estEmail').value.trim(),
    estado  : 'Activo',
  };

  if (!data.nombre || !data.apellido || !data.curso_id) {
    return toast('Campos incompletos', 'Nombre, apellido y curso son obligatorios', 'warn');
  }

  const res = await post('guardar.php', data);
  if (res.ok) {
    toast('Guardado', res.msg, 'success');
    cerrarModal('modalEstudiante');
    filtrarEstudiantes();
  } else {
    toast('Error', res.msg, 'error');
  }
}

async function eliminarEstudiante(id, nombre) {
  if (!confirm(`¿Desactivar a ${nombre}? Podrás reactivarlo después.`)) return;
  const res = await post('guardar.php', { accion: 'eliminar_estudiante', id });
  if (res.ok) { toast('Hecho', res.msg); filtrarEstudiantes(); }
  else toast('Error', res.msg, 'error');
}

/* ══════════════════════════════════════════════════════════════
   QR
═══════════════════════════════════════════════════════════════ */
async function cargarQR() {
  const filtroCurso = document.getElementById('qrFiltroCurso')?.value || '';
  const buscar      = (document.getElementById('qrBuscar')?.value || '').toLowerCase();

  await cargarCursosFiltros('qrFiltroCurso');

  let url = 'listar.php?accion=estudiantes&estado=Activo';
  if (filtroCurso) url += `&curso_id=${filtroCurso}`;

  const res  = await get(url);
  let lista  = res.data || [];
  if (buscar) lista = lista.filter(e =>
    (e.nombre + ' ' + e.apellido).toLowerCase().includes(buscar)
  );

  const grid = document.getElementById('qrGrid');

  if (!lista.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;padding:60px 0;">
        <div class="empty-state-icon">📱</div>
        <h3>Sin estudiantes</h3>
        <p>Selecciona un curso o registra estudiantes</p>
      </div>`;
    return;
  }

  grid.innerHTML = lista.map(e => `
    <div class="qr-card" id="qrcard-${e.id}">
      <div class="qr-card-header">
        <div class="qr-colegio-name">U.E. Juana Azurduy de Padilla</div>
        <div class="qr-sede">Satélite Norte - Warnes</div>
      </div>
      <div class="qr-canvas-wrap">
        <div id="qr-${e.id}"></div>
      </div>
      <div class="qr-student-info">
        <div class="qr-student-name">${e.nombre} ${e.apellido}</div>
        <div class="qr-student-curso">${e.curso_nombre} · ${e.codigo}</div>
      </div>
      <div class="qr-card-actions">
        <button class="btn btn-primary btn-sm" onclick="descargarQR(${e.id}, '${e.nombre} ${e.apellido}')">⬇ Descargar</button>
        <button class="btn btn-outline btn-sm" onclick="imprimirQR(${e.id})">🖨 Imprimir</button>
      </div>
    </div>
  `).join('');

  // Generar QR para cada estudiante
  lista.forEach(e => {
    const contenedor = document.getElementById(`qr-${e.id}`);
    if (!contenedor) return;
    contenedor.innerHTML = '';
    new QRCode(contenedor, {
      text   : e.qr_token,
      width  : 160,
      height : 160,
      colorDark  : '#0A1628',
      colorLight : '#FFFFFF',
      correctLevel: QRCode.CorrectLevel.H,
    });
  });
}

async function descargarQR(id, nombre) {
  const card = document.getElementById(`qrcard-${id}`);
  if (!card) return;
  try {
    const canvas = await html2canvas(card, { scale: 2, backgroundColor: '#fff' });
    const a = document.createElement('a');
    a.download = `QR_${nombre.replace(/ /g, '_')}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
    toast('Descargado', `QR de ${nombre}`, 'success');
  } catch (err) {
    toast('Error', 'No se pudo generar la imagen', 'error');
  }
}

function imprimirQR(id) {
  const card = document.getElementById(`qrcard-${id}`);
  if (!card) return;
  const ventana = window.open('', '_blank');
  ventana.document.write(`
    <html><head><title>QR</title>
    <style>body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;}
    img{max-width:300px;}</style></head>
    <body>${card.outerHTML}</body></html>
  `);
  ventana.document.close();
  ventana.onload = () => { ventana.print(); ventana.close(); };
}

/* Ver QR de un estudiante rápido */
async function verQREstudiante(id) {
  navTo('qr');
  setTimeout(async () => {
    const res = await get(`listar.php?accion=estudiante&id=${id}`);
    if (!res.ok) return;
    const e    = res.data;
    const grid = document.getElementById('qrGrid');
    grid.innerHTML = `
      <div class="qr-card" id="qrcard-${e.id}" style="max-width:280px;margin:auto;">
        <div class="qr-card-header">
          <div class="qr-colegio-name">U.E. Juana Azurduy de Padilla</div>
          <div class="qr-sede">Satélite Norte - Warnes</div>
        </div>
        <div class="qr-canvas-wrap">
          <div id="qr-${e.id}"></div>
        </div>
        <div class="qr-student-info">
          <div class="qr-student-name">${e.nombre} ${e.apellido}</div>
          <div class="qr-student-curso">${e.curso_nombre} · ${e.codigo}</div>
        </div>
        <div class="qr-card-actions">
          <button class="btn btn-primary btn-sm" onclick="descargarQR(${e.id}, '${e.nombre} ${e.apellido}')">⬇ Descargar</button>
          <button class="btn btn-outline btn-sm" onclick="cargarQR()">← Todos</button>
        </div>
      </div>`;
    new QRCode(document.getElementById(`qr-${e.id}`), {
      text: e.qr_token, width: 180, height: 180,
      colorDark: '#0A1628', colorLight: '#FFFFFF',
      correctLevel: QRCode.CorrectLevel.H,
    });
  }, 200);
}

/* ══════════════════════════════════════════════════════════════
   ESCANEAR QR
═══════════════════════════════════════════════════════════════ */
async function iniciarCamara() {
  try {
    document.getElementById('scannerStatus').textContent = '⏳ Iniciando cámara…';
    document.getElementById('btnCamara').textContent = '⏳ Iniciando…';

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
    });

    App.videoStream   = stream;
    App.scannerActive = true;

    const video = document.getElementById('video-preview');
    video.srcObject = stream;
    await video.play();

    document.getElementById('scannerStatus').textContent = '📷 Cámara activa — acerca el QR';
    document.getElementById('btnCamara').textContent = '✅ Cámara activa';

    const canvas  = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    let procesando = false;

    const escanear = () => {
      if (!App.scannerActive) return;

      if (!procesando && video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        });

        if (code && code.data && code.data.trim() !== '') {
          procesando = true;
          procesarQR(code.data.trim()).finally(() => {
            setTimeout(() => { procesando = false; }, 4000);
          });
        }
      }
      setTimeout(() => requestAnimationFrame(escanear), 300);
    };

    requestAnimationFrame(escanear);

  } catch (err) {
    let mensaje = 'No se pudo acceder a la cámara';
    if (err.name === 'NotAllowedError')  mensaje = 'Permiso denegado — activa la cámara en Chrome';
    if (err.name === 'NotFoundError')    mensaje = 'No se encontró ninguna cámara';
    if (err.name === 'NotReadableError') mensaje = 'La cámara está en uso por otra aplicación';

    toast('Error de cámara', mensaje, 'error');
    document.getElementById('scannerStatus').textContent = '❌ ' + mensaje;
    document.getElementById('btnCamara').textContent = '📷 Activar cámara';
  }
}

function detenerCamara() {
  App.scannerActive = false;
  if (App.videoStream) {
    App.videoStream.getTracks().forEach(t => t.stop());
    App.videoStream = null;
  }
  const video = document.getElementById('video-preview');
  if (video) { video.srcObject = null; }
  const status = document.getElementById('scannerStatus');
  if (status) status.textContent = 'Cámara detenida';
  const btnCam = document.getElementById('btnCamara');
  if (btnCam) btnCam.textContent = '📷 Activar cámara';
}

async function registrarManual() {
  const token = document.getElementById('tokenManual').value.trim();
  if (!token) return toast('Vacío', 'Ingresa un token QR', 'warn');
  await procesarQR(token);
  document.getElementById('tokenManual').value = '';
}

// ── Leer QR desde foto subida ─────────────────────────────
function leerFotoQR(event) {
  const file = event.target.files[0];
  if (!file) return;

  document.getElementById('fotoQRStatus').textContent = '⏳ Leyendo QR…';

  const img    = new Image();
  const reader = new FileReader();

  reader.onload = (e) => {
    img.onload = () => {
      const canvas  = document.getElementById('canvasFotoQR');
      const context = canvas.getContext('2d', { willReadFrequently: true });

      canvas.width  = img.width;
      canvas.height = img.height;
      canvas.style.display = 'block';
      context.drawImage(img, 0, 0);

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const code      = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      });

      if (code && code.data) {
        document.getElementById('fotoQRStatus').textContent = '✅ QR detectado';
        procesarQR(code.data.trim());
      } else {
        document.getElementById('fotoQRStatus').textContent = '❌ No se detectó QR — intenta con mejor luz';
        toast('No detectado', 'Asegúrate que el QR esté bien enfocado y con buena luz', 'warn');
      }
      // Limpiar input para permitir subir la misma foto de nuevo
      event.target.value = '';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

let ultimoToken     = "";
let ultimaHoraEscan = 0;

async function procesarQR(token) {
  const ahora = Date.now();
  if (token === ultimoToken && ahora - ultimaHoraEscan < 5000) return;
  ultimoToken      = token;
  ultimaHoraEscan  = ahora;

  document.getElementById('scannerStatus').textContent = '⏳ Procesando…';

  const res = await post('guardar.php', { accion: 'registrar_asistencia', token });

  if (res.ok) {
    const e = res.estudiante;
    mostrarResultadoEscan(e, res.estado, true);
    toast('✅ Asistencia registrada', `${e.nombre} ${e.apellido} — ${res.estado}`, 'success');
    agregarEscanReciente(e, res.estado);
  } else {
    if (res.estudiante) {
      mostrarResultadoEscan(res.estudiante, 'Ya registrado hoy', false);
    }
    toast('Aviso', res.msg, res.estudiante ? 'warn' : 'error');
  }
  document.getElementById('scannerStatus').textContent = '📷 Listo para escanear';
}

function mostrarResultadoEscan(e, estado, ok) {
  const colores = {
    'Presente'      : '#22C55E',
    'Tarde'         : '#F59E0B',
    'Ya registrado hoy': '#3B82F6',
  };
  const color = colores[estado] || (ok ? '#22C55E' : '#EF4444');
  const ini   = (e.nombre[0] + e.apellido[0]).toUpperCase();

  document.getElementById('scanAvatar').textContent       = ini;
  document.getElementById('scanAvatar').style.background  = `linear-gradient(135deg, ${color}, #0A1628)`;
  document.getElementById('scanNombre').textContent       = `${e.nombre} ${e.apellido}`;
  document.getElementById('scanCurso').textContent        = e.curso_nombre;
  document.getElementById('scanBadge').innerHTML          =
    `<span class="badge" style="background:${color}20;color:${color};font-size:.82rem;">${estado}</span>`;

  document.getElementById('scanResultBody').innerHTML = `
    <div class="scan-result-row">
      <span class="scan-result-label">Código</span>
      <span class="td-code">${e.codigo}</span>
    </div>
    <div class="scan-result-row">
      <span class="scan-result-label">Curso</span>
      <span>${e.curso_nombre}</span>
    </div>
    <div class="scan-result-row">
      <span class="scan-result-label">Estado</span>
      <span class="badge" style="background:${color}20;color:${color};">${estado}</span>
    </div>
    <div class="scan-result-row">
      <span class="scan-result-label">Hora</span>
      <span>${new Date().toLocaleTimeString('es-BO')}</span>
    </div>
  `;
}

function agregarEscanReciente(e, estado) {
  const ul = document.getElementById('ultimosEscaneos');
  const iconos = { Presente: '✅', Tarde: '⏰', Justificado: '📄' };
  const li = document.createElement('li');
  li.className = 'activity-item';
  li.innerHTML = `
    <div class="activity-dot ${estado === 'Tarde' ? 'late' : ''}"></div>
    <div>
      <div class="activity-text">${iconos[estado] || '📋'} ${e.nombre} ${e.apellido}</div>
      <div class="activity-time">${e.curso_nombre} · ${new Date().toLocaleTimeString('es-BO')}</div>
    </div>
  `;
  if (ul.firstElementChild?.style.textAlign === 'center') ul.innerHTML = '';
  ul.insertBefore(li, ul.firstChild);
}

/* ══════════════════════════════════════════════════════════════
   ASISTENCIAS
═══════════════════════════════════════════════════════════════ */
async function iniciarAsistencias() {
  await cargarCursosFiltros('asistCurso');
  // Fecha por defecto = hoy
  const hoy = new Date().toISOString().slice(0, 10);
  document.getElementById('asistFecha').value = hoy;
  cargarAsistencias();
}

async function cargarAsistencias() {
  const fecha  = document.getElementById('asistFecha')?.value  || new Date().toISOString().slice(0, 10);
  const curso  = document.getElementById('asistCurso')?.value  || '';
  const turno  = document.getElementById('asistTurno')?.value  || '';

  // Resumen
  const resD = await get(`listar.php?accion=resumen_dia&fecha=${fecha}`);
  renderResumenAsistencias(resD.data || {});

  let url = `listar.php?accion=asistencias&fecha=${fecha}`;
  if (curso) url += `&curso_id=${curso}`;
  if (turno) url += `&turno=${encodeURIComponent(turno)}`;
  const res = await get(url);
  App.asistencias = res.data || [];

  document.getElementById('totalAsistLabel').textContent = `${App.asistencias.length} registros`;
  renderTablaAsistencias(App.asistencias);
}

function renderResumenAsistencias(data) {
  const el = document.getElementById('resumenAsistencias');
  const items = [
    { label: 'Total estudiantes', val: data.total_estudiantes || 0, color: 'var(--blue-soft)',  icon: '🎓' },
    { label: 'Presentes',         val: data.presentes || 0,         color: 'var(--green)',      icon: '✅' },
    { label: 'Tardanzas',         val: data.tardanzas || 0,         color: 'var(--orange)',     icon: '⏰' },
    { label: 'Ausentes',          val: data.ausentes  || 0,         color: 'var(--red)',        icon: '❌' },
    { label: 'Sin registrar',     val: data.sin_registrar || 0,     color: 'var(--text-muted)', icon: '➖' },
  ];
  el.innerHTML = items.map(i => `
    <div class="kpi-card" style="border-left:4px solid ${i.color};">
      <div class="kpi-label">${i.label}</div>
      <div class="kpi-value">${i.val}</div>
      <div class="kpi-icon">${i.icon}</div>
    </div>
  `).join('');
}

function renderTablaAsistencias(lista) {
  const tbody = document.getElementById('bodyAsistencias');
  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="9">
      <div class="empty-state" style="padding:40px 0;">
        <div class="empty-state-icon">📋</div>
        <h3>Sin registros</h3>
        <p>No hay asistencias para esa fecha/filtro</p>
      </div></td></tr>`;
    return;
  }
  const badgeEst = {
    Presente  : 'badge-green',
    Tarde     : 'badge-orange',
    Ausente   : 'badge-red',
    Justificado: 'badge-blue',
  };
  tbody.innerHTML = lista.map((a, i) => `
    <tr>
      <td>${i + 1}</td>
      <td class="td-code">${a.codigo}</td>
      <td><strong>${a.apellido}</strong>, ${a.nombre}</td>
      <td>${a.curso_nombre}</td>
      <td>${a.fecha}</td>
      <td>${a.hora_entrada || '—'}</td>
      <td><span class="badge ${badgeEst[a.estado] || 'badge-blue'}">${a.estado}</span></td>
      <td style="font-size:.8rem;color:var(--text-muted);">${a.observacion || '—'}</td>
      <td>
        <select class="form-control" style="font-size:.78rem;padding:4px 6px;width:auto;"
          onchange="cambiarEstadoAsist(${a.id}, this.value)">
          <option ${a.estado==='Presente'   ? 'selected':''}>Presente</option>
          <option ${a.estado==='Tarde'      ? 'selected':''}>Tarde</option>
          <option ${a.estado==='Ausente'    ? 'selected':''}>Ausente</option>
          <option ${a.estado==='Justificado'? 'selected':''}>Justificado</option>
        </select>
      </td>
    </tr>
  `).join('');
}

async function cambiarEstadoAsist(id, estado) {
  const registro = App.asistencias.find(a => a.id === id);
  if (!registro) return;
  const res = await post('guardar.php', {
    accion: 'asistencia_manual',
    estudiante_id: registro.estudiante_id,
    fecha: registro.fecha,
    estado,
    obs: registro.observacion || '',
  });
  if (res.ok) toast('Guardado', 'Estado actualizado', 'success', 1800);
  else toast('Error', res.msg, 'error');
}

function exportarAsistencias() {
  const fecha = document.getElementById('asistFecha')?.value || '';
  const curso = document.getElementById('asistCurso')?.value || '';
  exportarAsistenciasCSV(fecha, curso);
  toast('Exportando', 'Descarga iniciada', 'success');
}

/* ══════════════════════════════════════════════════════════════
   REPORTES
═══════════════════════════════════════════════════════════════ */
async function iniciarReportes() {
  await cargarCursosFiltros('repCurso');
  // Mes actual
  document.getElementById('repMes').value = new Date().getMonth() + 1;
  cargarReporte();
}

async function cargarReporte() {
  const mes   = document.getElementById('repMes')?.value   || (new Date().getMonth() + 1);
  const anio  = document.getElementById('repAnio')?.value  || new Date().getFullYear();
  const curso = document.getElementById('repCurso')?.value || '';

  let url = `listar.php?accion=reporte_mensual&mes=${mes}&anio=${anio}`;
  if (curso) url += `&curso_id=${curso}`;

  const res  = await get(url);
  const data = res.data || [];

  document.getElementById('totalRepLabel').textContent = `${data.length} estudiantes`;
  renderTablaReporte(data);
  dibujarGraficasReporte(data);
}

function renderTablaReporte(data) {
  const tbody = document.getElementById('bodyReporte');
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--text-muted);">Sin datos</td></tr>`;
    return;
  }
  tbody.innerHTML = data.map((e, i) => {
    const total  = (e.presentes || 0) + (e.tardanzas || 0) + (e.ausentes || 0);
    const pct    = total > 0 ? Math.round(((e.presentes || 0) / total) * 100) : 0;
    const cls    = pct >= 80 ? 'badge-green' : pct >= 60 ? 'badge-orange' : 'badge-red';
    return `
      <tr>
        <td>${i + 1}</td>
        <td class="td-code">${e.codigo}</td>
        <td><strong>${e.apellido}</strong>, ${e.nombre}</td>
        <td>${e.curso}</td>
        <td>${e.dias_registrados || 0}</td>
        <td>${e.presentes || 0}</td>
        <td>${e.tardanzas || 0}</td>
        <td>${e.ausentes  || 0}</td>
        <td><span class="badge ${cls}">${pct}%</span></td>
      </tr>`;
  }).join('');
}

function dibujarGraficasReporte(data) {
  // Totales
  let totalPres = 0, totalTard = 0, totalAus = 0, totalJust = 0;
  data.forEach(e => {
    totalPres += parseInt(e.presentes  || 0);
    totalTard += parseInt(e.tardanzas  || 0);
    totalAus  += parseInt(e.ausentes   || 0);
    totalJust += parseInt(e.justificados || 0);
  });

  // Pie
  const cvPie = document.getElementById('chartPie');
  if (cvPie) {
    if (App.chartPie) App.chartPie.destroy();
    App.chartPie = new Chart(cvPie, {
      type: 'pie',
      data: {
        labels: ['Presentes', 'Tardanzas', 'Ausentes', 'Justificados'],
        datasets: [{ data: [totalPres, totalTard, totalAus, totalJust],
          backgroundColor: ['#22C55E','#F59E0B','#EF4444','#3B82F6'],
          borderWidth: 2, borderColor: '#fff' }]
      },
      options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } }
    });
  }

  // Linea (por curso)
  const cursos  = [...new Set(data.map(e => e.curso))].slice(0, 8);
  const pctData = cursos.map(c => {
    const rows = data.filter(e => e.curso === c);
    const p    = rows.reduce((s, e) => s + parseInt(e.presentes || 0), 0);
    const t    = rows.reduce((s, e) => s + parseInt(e.dias_registrados || 0), 0);
    return t > 0 ? Math.round((p / t) * 100) : 0;
  });

  const cvLinea = document.getElementById('chartLinea');
  if (cvLinea) {
    if (App.chartLinea) App.chartLinea.destroy();
    App.chartLinea = new Chart(cvLinea, {
      type: 'bar',
      data: {
        labels: cursos.map(c => c.replace(' Secundaria', '')),
        datasets: [{
          label: '% Asistencia',
          data: pctData,
          backgroundColor: pctData.map(v => v >= 80 ? '#22C55E' : v >= 60 ? '#F59E0B' : '#EF4444'),
          borderRadius: 6,
        }]
      },
      options: {
        scales: {
          y: { max: 100, beginAtZero: true, ticks: { callback: v => v + '%' } },
          x: { grid: { display: false } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }
}

function exportarReporte() {
  const mes   = document.getElementById('repMes')?.value  || '';
  const anio  = document.getElementById('repAnio')?.value || '';
  const curso = document.getElementById('repCurso')?.value || '';
  exportarReporteCSV(mes, anio, curso);
  toast('Exportando', 'Descarga iniciada', 'success');
}

/* ══════════════════════════════════════════════════════════════
   CONFIGURACIÓN
═══════════════════════════════════════════════════════════════ */
async function cargarConfiguracion() {
  // Datos del colegio y horarios
  const resCfg = await get('listar.php?accion=configuracion');
  if (resCfg.ok) {
    const cfg = resCfg.data || {};
    if (cfg.nombre_colegio) document.getElementById('cfgNombreColegio').value = cfg.nombre_colegio;
    if (cfg.sede)           document.getElementById('cfgSede').value = cfg.sede;
    if (cfg.gestion)        document.getElementById('cfgGestion').value = cfg.gestion;
    if (cfg.hora_entrada)    document.getElementById('cfgHoraEntrada').value = cfg.hora_entrada;
    if (cfg.hora_tolerancia) document.getElementById('cfgHoraTolerancia').value = cfg.hora_tolerancia;
    if (cfg.hora_salida)     document.getElementById('cfgHoraSalida').value = cfg.hora_salida;
  }

  const res = await get('listar.php?accion=cursos');
  const cursos = res.data || [];
  const tbody  = document.getElementById('bodyCursos');
  tbody.innerHTML = cursos.map((c, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${c.nombre}</strong></td>
      <td>${c.nivel}</td>
      <td>${c.turno}</td>
      <td><span class="badge badge-blue">${c.total_estudiantes} estudiantes</span></td>
    </tr>
  `).join('') || `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted);">Sin cursos</td></tr>`;
}

async function guardarConfigColegio() {
  const gestion = document.getElementById('cfgGestion').value.trim();
  const res = await post('guardar.php', { accion: 'guardar_configuracion', gestion });
  if (res.ok) toast('Guardado', 'Datos del colegio actualizados', 'success');
  else toast('Error', res.msg, 'error');
}

async function guardarHorarios() {
  const hora_entrada    = document.getElementById('cfgHoraEntrada').value;
  const hora_tolerancia = document.getElementById('cfgHoraTolerancia').value;
  const hora_salida     = document.getElementById('cfgHoraSalida').value;
  const res = await post('guardar.php', { accion: 'guardar_configuracion', hora_entrada, hora_tolerancia, hora_salida });
  if (res.ok) toast('Guardado', 'Horarios actualizados', 'success');
  else toast('Error', res.msg, 'error');
}

function abrirModalCurso() {
  document.getElementById('cursoNombre').value = '';
  abrirModal('modalCurso');
}

async function guardarCurso() {
  const nombre = document.getElementById('cursoNombre').value.trim();
  const nivel  = document.getElementById('cursoNivel').value;
  const turno  = document.getElementById('cursoTurno').value;
  if (!nombre) return toast('Nombre requerido', '', 'warn');

  const res = await post('guardar.php', { accion: 'guardar_curso', nombre, nivel, turno });
  if (res.ok) {
    toast('Guardado', 'Curso registrado', 'success');
    cerrarModal('modalCurso');
    cargarConfiguracion();
    App.cursos = []; // Invalidar caché
  } else {
    toast('Error', res.msg, 'error');
  }
}

/* ══════════════════════════════════════════════════════════════
   IMPORTAR EXCEL
═══════════════════════════════════════════════════════════════ */
function abrirModalImportar() {
  document.getElementById('importPreview').innerHTML = '';
  document.getElementById('btnImportar').disabled = true;
  App.importFile = null;
  abrirModal('modalImportar');
}

function dropHandler(e) {
  e.preventDefault();
  document.getElementById('dropzone').classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) previewImportFile(file);
}

function previewImport(e) {
  previewImportFile(e.target.files[0]);
}

function previewImportFile(file) {
  if (!file) return;
  App.importFile = file;
  document.getElementById('importPreview').innerHTML = `
    <div style="background:var(--surface);border-radius:8px;padding:10px 14px;font-size:.83rem;display:flex;align-items:center;gap:10px;">
      <span style="font-size:1.5rem;">📄</span>
      <div>
        <strong>${file.name}</strong><br>
        <span style="color:var(--text-muted);">${(file.size / 1024).toFixed(1)} KB</span>
      </div>
    </div>
  `;
  document.getElementById('btnImportar').disabled = false;
  toast('Archivo listo', file.name, 'info');
}

async function importarExcel() {
  if (!App.importFile) return toast('Sin archivo', 'Selecciona un archivo CSV', 'warn');

  document.getElementById('btnImportar').textContent = '⏳ Importando…';
  document.getElementById('btnImportar').disabled = true;

  const res = await importarExcelSupabase(App.importFile);

  document.getElementById('btnImportar').textContent = '📥 Importar';
  document.getElementById('btnImportar').disabled = false;

  if (res.ok) {
    toast('Importación completada', `${res.insertados} estudiante(s) importado(s)`, 'success');
    if (res.errores?.length) {
      document.getElementById('importPreview').innerHTML += `
        <div style="margin-top:10px;background:#FEF9C3;border-radius:8px;padding:10px 14px;font-size:.8rem;">
          ⚠️ ${res.errores.length} advertencia(s):<br>
          ${res.errores.slice(0, 5).join('<br>')}
        </div>`;
    }
    cerrarModal('modalImportar');
    filtrarEstudiantes();
  } else {
    toast('Error', res.msg, 'error');
  }
}

/* ══════════════════════════════════════════════════════════════
   HELPERS SHARED
═══════════════════════════════════════════════════════════════ */

/* Llenar todos los select de cursos */
async function cargarCursosFiltros(selectId = null) {
  if (!App.cursos.length) {
    const res  = await get('listar.php?accion=cursos');
    App.cursos = res.data || [];
  }
  const opts = '<option value="">Todos los cursos</option>' +
    App.cursos.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');

  const ids = selectId
    ? [selectId]
    : ['filtroCurso', 'asistCurso', 'repCurso', 'qrFiltroCurso'];

  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts;
  });
}

async function llenarSelectCursos(selectId, seleccionado = null) {
  if (!App.cursos.length) {
    const res  = await get('listar.php?accion=cursos');
    App.cursos = res.data || [];
  }
  const el = document.getElementById(selectId);
  if (!el) return;
  el.innerHTML = App.cursos.map(c =>
    `<option value="${c.id}" ${seleccionado == c.id ? 'selected' : ''}>${c.nombre}</option>`
  ).join('');
}

function confirmarCerrarSesion() {
  if (confirm("¿Estás seguro que deseas cerrar sesión?")) {
    sb.auth.signOut().then(() => {
      window.location.href = "login.html";
    });
  }
}







/* ══════════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Precargar cursos
  cargarCursosFiltros();
  // Página inicial
  cargarInicio();
});

/* ══════════════════════════════════════════════════════════════
   ASISTENCIAS — FILTRO TURNO Y TABS
═══════════════════════════════════════════════════════════════ */
function switchTabAsist(tab) {
  if (tab === 'diario') {
    document.getElementById('tabDiarioContent').style.display = 'block';
    document.getElementById('tabIndividualContent').style.display = 'none';
    document.getElementById('tabDiario').className = 'btn btn-primary';
    document.getElementById('tabIndividual').className = 'btn btn-outline';
  } else {
    document.getElementById('tabDiarioContent').style.display = 'none';
    document.getElementById('tabIndividualContent').style.display = 'block';
    document.getElementById('tabDiario').className = 'btn btn-outline';
    document.getElementById('tabIndividual').className = 'btn btn-primary';
    cargarSelectEstudiantes();
    // Mes actual
    document.getElementById('indMes').value = new Date().getMonth() + 1;
  }
}

async function cargarSelectEstudiantes() {
  const res  = await get('listar.php?accion=estudiantes&estado=Activo');
  const lista = res.data || [];
  const sel   = document.getElementById('indEstudiante');
  sel.innerHTML = '<option value="">Selecciona un estudiante...</option>' +
    lista.map(e => `<option value="${e.id}">${e.apellido} ${e.nombre} — ${e.curso_nombre}</option>`).join('');
}

async function cargarReporteIndividual() {
  const estId = document.getElementById('indEstudiante').value;
  const mes   = document.getElementById('indMes').value;
  const anio  = new Date().getFullYear();

  if (!estId) return toast('Selecciona un estudiante', '', 'warn');

  const url = `listar.php?accion=asistencias&mes=${mes}&anio=${anio}&estudiante_id=${estId}`;
  const res  = await get(url);
  const data = res.data || [];

  // Obtener info del estudiante
  const resEst = await get(`listar.php?accion=estudiante&id=${estId}`);
  const est    = resEst.data || {};

  // Contar totales
  let presentes = 0, tardanzas = 0, ausentes = 0, justificados = 0;
  data.forEach(a => {
    if (a.estado === 'Presente')    presentes++;
    if (a.estado === 'Tarde')       tardanzas++;
    if (a.estado === 'Ausente')     ausentes++;
    if (a.estado === 'Justificado') justificados++;
  });
  const total = presentes + tardanzas + ausentes + justificados;
  const pct   = total > 0 ? Math.round((presentes / total) * 100) : 0;

  // Título
  document.getElementById('tituloReporteInd').textContent =
    `${est.nombre} ${est.apellido} — ${est.curso_nombre}`;
  document.getElementById('totalIndLabel').textContent = `${total} días registrados`;

  // KPIs individuales
  const resDiv = document.getElementById('resumenIndividual');
  resDiv.style.display = 'grid';
  resDiv.innerHTML = [
    { label: 'Presentes',    val: presentes,   color: 'var(--green)',     icon: '✅' },
    { label: 'Tardanzas',    val: tardanzas,   color: 'var(--orange)',    icon: '⏰' },
    { label: 'Ausentes',     val: ausentes,    color: 'var(--red)',       icon: '❌' },
    { label: 'Justificados', val: justificados,color: 'var(--blue-soft)', icon: '📄' },
    { label: '% Asistencia', val: pct + '%',   color: pct >= 80 ? 'var(--green)' : pct >= 60 ? 'var(--orange)' : 'var(--red)', icon: '📊' },
  ].map(i => `
    <div class="kpi-card" style="border-left:4px solid ${i.color};">
      <div class="kpi-label">${i.label}</div>
      <div class="kpi-value">${i.val}</div>
      <div class="kpi-icon">${i.icon}</div>
    </div>
  `).join('');

  // Tabla detalle
  document.getElementById('cardReporteInd').style.display = 'block';
  const badgeEst = { Presente:'badge-green', Tarde:'badge-orange', Ausente:'badge-red', Justificado:'badge-blue' };
  const tbody = document.getElementById('bodyReporteInd');

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-muted);">Sin registros este mes</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map((a, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${a.fecha}</td>
      <td>${a.hora_entrada || '—'}</td>
      <td><span class="badge ${badgeEst[a.estado] || 'badge-blue'}">${a.estado}</span></td>
      <td style="font-size:.8rem;color:var(--text-muted);">${a.observacion || '—'}</td>
    </tr>
  `).join('');
}