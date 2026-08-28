// ============================================================
//  CODYWEB.COM — api.js
//  Traduce las llamadas que antes iban a listar.php / guardar.php
//  hacia Supabase. Mantiene las mismas funciones get()/post()
//  para que el resto de script.js no necesite cambios.
// ============================================================

'use strict';

/* ── Helpers de fecha ──────────────────────────────────────── */
function _rangoMes(mes, anio) {
  const m = parseInt(mes), a = parseInt(anio);
  const inicio = `${a}-${String(m).padStart(2, '0')}-01`;
  const finDate = new Date(a, m, 0); // último día del mes
  const fin = `${a}-${String(m).padStart(2, '0')}-${String(finDate.getDate()).padStart(2, '0')}`;
  return { inicio, fin };
}

function _aplanarEstudiante(e) {
  return {
    ...e,
    curso_nombre: e.cursos ? e.cursos.nombre : '',
  };
}

function _aplanarAsistencia(a) {
  const est = a.estudiantes || {};
  const curso = est.cursos || {};
  return {
    ...a,
    nombre: est.nombre || '',
    apellido: est.apellido || '',
    codigo: est.codigo || '',
    curso_nombre: curso.nombre || '',
    turno: curso.turno || '',
  };
}

// Calcula el siguiente código EST-XXXX de forma robusta: trae TODOS los
// códigos existentes (no solo el "último" por orden alfabético, que falla
// si hay algún registro con código NULL) y toma el número más alto real.
async function _siguienteCodigoEstudiante() {
  const { data: todos } = await sb.from('estudiantes').select('codigo');
  let maxNum = 0;
  (todos || []).forEach((r) => {
    if (!r.codigo) return;
    const n = parseInt(String(r.codigo).replace('EST-', ''), 10);
    if (!isNaN(n) && n > maxNum) maxNum = n;
  });
  return 'EST-' + String(maxNum + 1).padStart(4, '0');
}

/* ══════════════════════════════════════════════════════════════
   GET — equivalente a listar.php
═══════════════════════════════════════════════════════════════ */
async function get(url) {
  const [ruta, queryStr] = url.split('?');
  const params = new URLSearchParams(queryStr || '');
  const accion = params.get('accion');

  try {
    switch (accion) {

      case 'cursos': {
        const { data: cursos, error } = await sb.from('cursos').select('*').order('nombre');
        if (error) throw error;
        const { data: activos } = await sb.from('estudiantes').select('curso_id').eq('estado', 'Activo');
        const conteo = {};
        (activos || []).forEach(e => { conteo[e.curso_id] = (conteo[e.curso_id] || 0) + 1; });
        const data = cursos.map(c => ({ ...c, total_estudiantes: conteo[c.id] || 0 }));
        return { ok: true, data };
      }

      case 'estudiantes': {
        const estado  = params.get('estado') || 'Activo';
        const cursoId = params.get('curso_id');
        const buscar  = (params.get('buscar') || '').toLowerCase();

        let q = sb.from('estudiantes').select('*, cursos(nombre)');
        if (estado !== 'todos') q = q.eq('estado', estado);
        if (cursoId) q = q.eq('curso_id', cursoId);

        const { data, error } = await q.order('apellido');
        if (error) throw error;

        let lista = (data || []).map(_aplanarEstudiante);
        if (buscar) {
          lista = lista.filter(e =>
            (e.nombre || '').toLowerCase().includes(buscar) ||
            (e.apellido || '').toLowerCase().includes(buscar) ||
            (e.codigo || '').toLowerCase().includes(buscar) ||
            (e.ci || '').toLowerCase().includes(buscar)
          );
        }
        return { ok: true, data: lista };
      }

      case 'estudiante': {
        const id    = params.get('id');
        const token = params.get('token');
        let q = sb.from('estudiantes').select('*, cursos(nombre)');
        q = token ? q.eq('qr_token', token).eq('estado', 'Activo') : q.eq('id', id);
        const { data, error } = await q.maybeSingle();
        if (error) throw error;
        if (!data) return { ok: false, msg: 'Estudiante no encontrado' };
        return { ok: true, data: _aplanarEstudiante(data) };
      }

      case 'asistencias': {
        const fecha  = params.get('fecha');
        const mes    = params.get('mes');
        const anio   = params.get('anio') || new Date().getFullYear();
        const cursoId= params.get('curso_id');
        const turno  = params.get('turno');
        const estId  = params.get('estudiante_id');

        let q = sb.from('asistencias').select('*, estudiantes(nombre,apellido,codigo,curso_id,cursos(nombre,turno))');

        if (mes) {
          const { inicio, fin } = _rangoMes(mes, anio);
          q = q.gte('fecha', inicio).lte('fecha', fin);
        } else {
          q = q.eq('fecha', fecha || new Date().toISOString().slice(0, 10));
        }
        if (estId) q = q.eq('estudiante_id', estId);

        const { data, error } = await q.order('fecha', { ascending: false });
        if (error) throw error;

        let lista = (data || []).map(_aplanarAsistencia);
        if (cursoId) lista = lista.filter(a => a.estudiantes?.curso_id == cursoId);
        if (turno)   lista = lista.filter(a => a.turno === turno);
        lista.sort((a, b) => (a.apellido || '').localeCompare(b.apellido || ''));

        return { ok: true, data: lista };
      }

      case 'resumen_dia': {
        const fecha = params.get('fecha') || new Date().toISOString().slice(0, 10);

        const { count: total } = await sb.from('estudiantes')
          .select('*', { count: 'exact', head: true }).eq('estado', 'Activo');

        const { data: asist, error } = await sb.from('asistencias').select('estado').eq('fecha', fecha);
        if (error) throw error;

        const conteo = { Presente: 0, Tarde: 0, Ausente: 0, Justificado: 0 };
        (asist || []).forEach(a => { if (conteo[a.estado] !== undefined) conteo[a.estado]++; });
        const registrados = conteo.Presente + conteo.Tarde + conteo.Ausente + conteo.Justificado;

        return {
          ok: true,
          data: {
            total_estudiantes: total || 0,
            registrados,
            presentes: conteo.Presente,
            tardanzas: conteo.Tarde,
            ausentes: conteo.Ausente,
            justificados: conteo.Justificado,
            sin_registrar: (total || 0) - registrados,
            fecha,
          }
        };
      }

      case 'reporte_mensual': {
        const mes    = params.get('mes')  || (new Date().getMonth() + 1);
        const anio   = params.get('anio') || new Date().getFullYear();
        const cursoId= params.get('curso_id');
        const { inicio, fin } = _rangoMes(mes, anio);

        let qEst = sb.from('estudiantes').select('*, cursos(nombre)').eq('estado', 'Activo');
        if (cursoId) qEst = qEst.eq('curso_id', cursoId);
        const { data: estudiantes, error: e1 } = await qEst;
        if (e1) throw e1;

        const { data: asist, error: e2 } = await sb.from('asistencias')
          .select('estudiante_id, estado').gte('fecha', inicio).lte('fecha', fin);
        if (e2) throw e2;

        const data = (estudiantes || []).map(e => {
          const regs = (asist || []).filter(a => a.estudiante_id === e.id);
          const presentes    = regs.filter(a => a.estado === 'Presente').length;
          const tardanzas    = regs.filter(a => a.estado === 'Tarde').length;
          const ausentes     = regs.filter(a => a.estado === 'Ausente').length;
          const justificados = regs.filter(a => a.estado === 'Justificado').length;
          return {
            codigo: e.codigo, nombre: e.nombre, apellido: e.apellido,
            curso: e.cursos ? e.cursos.nombre : '',
            dias_registrados: regs.length,
            presentes, tardanzas, ausentes, justificados,
          };
        }).sort((a, b) => (a.curso + a.apellido).localeCompare(b.curso + b.apellido));

        return { ok: true, data };
      }

      case 'verificar_hoy': {
        const estId = params.get('estudiante_id');
        const hoy = new Date().toISOString().slice(0, 10);
        const { data, error } = await sb.from('asistencias').select('*')
          .eq('estudiante_id', estId).eq('fecha', hoy).maybeSingle();
        if (error) throw error;
        return { ok: true, registrado: !!data, data: data || null };
      }

      case 'configuracion': {
        const { data, error } = await sb.from('configuracion').select('*');
        if (error) throw error;
        const cfg = {};
        (data || []).forEach(r => { cfg[r.clave] = r.valor; });
        return { ok: true, data: cfg };
      }

      default:
        return { ok: false, msg: 'Acción no reconocida' };
    }
  } catch (err) {
    console.error(err);
    return { ok: false, msg: err.message || 'Error de conexión con Supabase' };
  }
}

/* ══════════════════════════════════════════════════════════════
   POST — equivalente a guardar.php
═══════════════════════════════════════════════════════════════ */
async function post(url, data) {
  const accion = data.accion;

  try {
    switch (accion) {

      case 'registrar_asistencia': {
        const token = data.token;
        const { data: est, error: e1 } = await sb.from('estudiantes')
          .select('*, cursos(nombre)').eq('qr_token', token).eq('estado', 'Activo').maybeSingle();
        if (e1) throw e1;
        if (!est) return { ok: false, msg: 'QR no válido o estudiante inactivo' };

        const hoy = new Date().toISOString().slice(0, 10);
        const { data: existe } = await sb.from('asistencias').select('id')
          .eq('estudiante_id', est.id).eq('fecha', hoy).maybeSingle();
        if (existe) {
          return { ok: false, msg: 'Ya se registró asistencia hoy para este estudiante', estudiante: _aplanarEstudiante(est) };
        }

        const ahora = new Date();
        const horaActual = ahora.toTimeString().slice(0, 8);
        const { data: cfgRow } = await sb.from('configuracion').select('valor').eq('clave', 'hora_tolerancia').maybeSingle();
        const tolerancia = (cfgRow?.valor || '08:15') + ':00';
        const estadoAsist = horaActual > tolerancia ? 'Tarde' : 'Presente';

        const { error: e2 } = await sb.from('asistencias').insert({
          estudiante_id: est.id, fecha: hoy, hora_entrada: horaActual, estado: estadoAsist,
        });
        if (e2) throw e2;

        return { ok: true, msg: `✅ Asistencia registrada — ${estadoAsist}`, estudiante: _aplanarEstudiante(est), estado: estadoAsist, hora: horaActual };
      }

      case 'asistencia_manual': {
        const { estudiante_id, fecha, estado, obs } = data;
        const { error } = await sb.from('asistencias').upsert({
          estudiante_id: parseInt(estudiante_id),
          fecha: fecha || new Date().toISOString().slice(0, 10),
          estado: estado || 'Presente',
          observacion: obs || null,
        }, { onConflict: 'estudiante_id,fecha' });
        if (error) throw error;
        return { ok: true, msg: 'Asistencia guardada correctamente' };
      }

      case 'guardar_estudiante': {
        const id = parseInt(data.id) || 0;
        const { nombre, apellido, ci, curso_id, genero, telefono, email, estado } = data;

        if (!nombre || !apellido || !curso_id) {
          return { ok: false, msg: 'Nombre, apellido y curso son obligatorios' };
        }

        if (id > 0) {
          const { error } = await sb.from('estudiantes').update({
            nombre, apellido, ci, curso_id: parseInt(curso_id), genero,
            telefono_tutor: telefono, email, estado: estado || 'Activo',
          }).eq('id', id);
          if (error) throw error;
          return { ok: true, msg: 'Estudiante actualizado', id };
        } else {
          // Generar código único EST-0001, EST-0002... (robusto ante códigos NULL)
          const codigo = await _siguienteCodigoEstudiante();
          const token  = crypto.randomUUID();

          const { data: nuevo, error } = await sb.from('estudiantes').insert({
            codigo, nombre, apellido, ci, curso_id: parseInt(curso_id), genero,
            telefono_tutor: telefono, email, qr_token: token, estado: 'Activo',
          }).select().single();
          if (error) throw error;
          return { ok: true, msg: 'Estudiante registrado', id: nuevo.id, codigo };
        }
      }

      case 'eliminar_estudiante': {
        const { error } = await sb.from('estudiantes').update({ estado: 'Inactivo' }).eq('id', data.id);
        if (error) throw error;
        return { ok: true, msg: 'Estudiante desactivado' };
      }

      case 'guardar_curso': {
        const id = parseInt(data.id) || 0;
        const { nombre, nivel, turno } = data;
        if (!nombre) return { ok: false, msg: 'Nombre del curso requerido' };

        if (id > 0) {
          const { error } = await sb.from('cursos').update({ nombre, nivel, turno }).eq('id', id);
          if (error) throw error;
        } else {
          const { error } = await sb.from('cursos').insert({ nombre, nivel, turno });
          if (error) throw error;
        }
        return { ok: true, msg: 'Curso guardado' };
      }

      case 'guardar_configuracion': {
        // data trae pares clave->valor a actualizar (ej: { hora_entrada: '08:00', hora_tolerancia: '08:15' })
        const entradas = Object.entries(data).filter(([k]) => k !== 'accion');
        for (const [clave, valor] of entradas) {
          const { error } = await sb.from('configuracion').upsert({ clave, valor: String(valor) }, { onConflict: 'clave' });
          if (error) throw error;
        }
        return { ok: true, msg: 'Configuración guardada' };
      }

      default:
        return { ok: false, msg: 'Acción no reconocida' };
    }
  } catch (err) {
    console.error(err);
    return { ok: false, msg: err.message || 'Error de conexión con Supabase' };
  }
}

/* ══════════════════════════════════════════════════════════════
   LICENCIAS (justificaciones de falta)
═══════════════════════════════════════════════════════════════ */

// Genera un array de fechas 'YYYY-MM-DD' entre inicio y fin (inclusive)
function _rangoFechas(inicio, fin) {
  const fechas = [];
  let actual = new Date(inicio + 'T00:00:00');
  const final = new Date(fin + 'T00:00:00');
  while (actual <= final) {
    fechas.push(actual.toISOString().slice(0, 10));
    actual.setDate(actual.getDate() + 1);
  }
  return fechas;
}

async function guardarLicenciaSupabase(estudianteId, fechaInicio, fechaFin, motivo, archivo) {
  try {
    let archivoUrl = null;

    // 1. Subir archivo si existe
    if (archivo) {
      const ext = archivo.name.split('.').pop();
      const nombreArchivo = `licencia_${estudianteId}_${Date.now()}.${ext}`;

      const { error: errorSubida } = await sb.storage
        .from('licencias')
        .upload(nombreArchivo, archivo);

      if (errorSubida) throw errorSubida;

      const { data: urlData } = sb.storage.from('licencias').getPublicUrl(nombreArchivo);
      archivoUrl = urlData.publicUrl;
    }

    // 2. Obtener usuario actual (profesor que registra)
    const { data: { user } } = await sb.auth.getUser();

    // 3. Insertar registro en tabla licencias
    const { error: errorInsert } = await sb.from('licencias').insert({
      estudiante_id: parseInt(estudianteId),
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      motivo,
      archivo_url: archivoUrl,
      creado_por: user ? user.id : null,
    });
    if (errorInsert) throw errorInsert;

    // 4. Marcar cada día del rango como "Justificado" en asistencias
    const fechas = _rangoFechas(fechaInicio, fechaFin);
    for (const fecha of fechas) {
      const { error: errorAsist } = await sb.from('asistencias').upsert({
        estudiante_id: parseInt(estudianteId),
        fecha,
        estado: 'Justificado',
        observacion: motivo,
      }, { onConflict: 'estudiante_id,fecha' });
      if (errorAsist) throw errorAsist;
    }

    return { ok: true, msg: `Licencia registrada — ${fechas.length} día(s) marcado(s) como justificado`, archivoUrl };

  } catch (err) {
    console.error(err);
    return { ok: false, msg: err.message || 'Error al guardar la licencia' };
  }
}

/* ══════════════════════════════════════════════════════════════
   IMPORTAR EXCEL (CSV) — antes era guardar.php con multipart
═══════════════════════════════════════════════════════════════ */
async function importarExcelSupabase(file) {
  const texto = await file.text();
  const filas = texto.split(/\r?\n/).map(f => f.trim()).filter(Boolean);

  const { data: cursos } = await sb.from('cursos').select('id, nombre');
  const { data: todosCod } = await sb.from('estudiantes').select('codigo');
  let numero = 1;
  (todosCod || []).forEach((r) => {
    if (!r.codigo) return;
    const n = parseInt(String(r.codigo).replace('EST-', ''), 10);
    if (!isNaN(n) && n >= numero) numero = n + 1;
  });

  let insertados = 0;
  const errores = [];

  for (let i = 1; i < filas.length; i++) { // saltar encabezado
    const cols = filas[i].split(',').map(c => c.trim());
    if (cols.length < 5) { errores.push(`Fila ${i + 1}: columnas insuficientes`); continue; }

    const [codigoIn, nombre, apellido, ci, cursoNombre, generoIn] = cols;
    if (!nombre || !apellido) { errores.push(`Fila ${i + 1}: nombre o apellido vacío`); continue; }

    const curso = (cursos || []).find(c => c.nombre.toLowerCase().includes(cursoNombre.toLowerCase()));
    if (!curso) { errores.push(`Fila ${i + 1}: curso '${cursoNombre}' no encontrado`); continue; }

    const genero = ['M', 'F'].includes((generoIn || 'M').toUpperCase()[0]) ? (generoIn || 'M').toUpperCase()[0] : 'M';
    const codigo = codigoIn || ('EST-' + String(numero++).padStart(4, '0'));
    const token  = crypto.randomUUID();

    const { error } = await sb.from('estudiantes').insert({
      codigo, nombre, apellido, ci, curso_id: curso.id, genero, qr_token: token, estado: 'Activo',
    });
    if (error) errores.push(`Fila ${i + 1}: ya existe (código duplicado)`);
    else insertados++;
  }

  return { ok: true, msg: `Importación completada: ${insertados} estudiante(s) registrado(s)`, insertados, errores };
}

/* ══════════════════════════════════════════════════════════════
   EXPORTAR EXCEL PROFESIONAL (ExcelJS) — reemplaza a la exportación CSV
   Requiere que index.html cargue la librería ExcelJS por CDN:
   <script src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"></script>
═══════════════════════════════════════════════════════════════ */

// Identidad del colegio — mismos datos que ya usas en el sidebar
const _COLEGIO_NOMBRE = 'U.E. JUANA AZURDUY DE PADILLA';
const _COLEGIO_SEDE   = 'Satélite Norte · Warnes';

// Paleta institucional — alineada al sidebar navy/dorado de Codyweb
const _COLOR_NAVY      = 'FF0A2647'; // navy del sidebar
const _COLOR_NAVY_MED  = 'FF12395E'; // navy medio, encabezado de tabla
const _COLOR_DORADO    = 'FFC9A227'; // dorado institucional (línea de acento)
const _COLOR_DORADO_BG = 'FFFBF3DC'; // dorado muy claro, fondo fila de totales
const _COLOR_TEXTO_HD  = 'FFFFFFFF'; // blanco
const _COLOR_CEBRA     = 'FFF3F6FA'; // gris azulado muy claro
const _COLOR_BORDE     = 'FFD9D9D9'; // gris claro
const _COLOR_BORDE_MED = 'FFB9C2CC'; // gris medio, para separadores
const _COLOR_GRIS_TXT  = 'FF667085'; // gris para subtítulos
const _COLOR_VERDE     = 'FF1E7A34'; // Presente
const _COLOR_ROJO      = 'FFB00020'; // Ausente / Falta
const _COLOR_AMBAR     = 'FFB8860B'; // Tarde
const _COLOR_AZUL_J    = 'FF3457A6'; // Justificado

function _colorEstado(estado) {
  switch (estado) {
    case 'Presente':    return _COLOR_VERDE;
    case 'Ausente':     return _COLOR_ROJO;
    case 'Tarde':       return _COLOR_AMBAR;
    case 'Justificado': return _COLOR_AZUL_J;
    default:            return 'FF444444';
  }
}

// Traduce el estado real (guardado en la BD) a la etiqueta que se muestra en el Excel
function _etiquetaEstado(estado) {
  return estado === 'Ausente' ? 'Falta' : estado;
}

/**
 * Arma una hoja con estilo de planilla institucional:
 * membrete (colegio + sede), título del reporte con línea de acento dorada,
 * subtítulo con metadatos, columna de numeración, encabezado navy,
 * filas cebra con bordes finos, fila de totales opcional, auto-filtro
 * y encabezado congelado.
 */
function _armarHojaProfesional(ws, { titulo, subtitulo, columnas, filas, colEstado, totales, filaAlerta, firmas }) {
  // Se agrega automáticamente una columna "N°" al inicio
  const cols = [{ header: 'N°', key: '_n', width: 6, center: true }, ...columnas];
  const totalCols = cols.length;

  ws.properties.defaultRowHeight = 18;

  // ── Membrete institucional ──────────────────────────────
  ws.mergeCells(1, 1, 1, totalCols);
  const nombreColegio = ws.getCell(1, 1);
  nombreColegio.value = _COLEGIO_NOMBRE;
  nombreColegio.font = { bold: true, size: 13, color: { argb: _COLOR_NAVY }, name: 'Calibri' };
  nombreColegio.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(1).height = 22;

  ws.mergeCells(2, 1, 2, totalCols);
  const sedeCell = ws.getCell(2, 1);
  sedeCell.value = `${_COLEGIO_SEDE}  ·  Sistema de Asistencia Estudiantil — Codyweb.com`;
  sedeCell.font = { italic: true, size: 9.5, color: { argb: _COLOR_GRIS_TXT } };
  ws.getRow(2).height = 16;

  // Línea de acento dorada bajo el membrete
  for (let c = 1; c <= totalCols; c++) {
    ws.getCell(3, c).border = { bottom: { style: 'medium', color: { argb: _COLOR_DORADO } } };
  }
  ws.getRow(3).height = 4;

  // ── Título del reporte ───────────────────────────────────
  ws.mergeCells(4, 1, 4, totalCols);
  const tituloCell = ws.getCell(4, 1);
  tituloCell.value = titulo;
  tituloCell.font = { bold: true, size: 15, color: { argb: _COLOR_NAVY } };
  tituloCell.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(4).height = 26;

  // ── Subtítulo con metadatos ──────────────────────────────
  ws.mergeCells(5, 1, 5, totalCols);
  const subCell = ws.getCell(5, 1);
  subCell.value = subtitulo || '';
  subCell.font = { italic: true, size: 10, color: { argb: _COLOR_GRIS_TXT } };
  ws.getRow(5).height = 18;

  const filaEncabezado = 6;

  // ── Encabezado de columnas ───────────────────────────────
  cols.forEach((col, i) => {
    const cell = ws.getCell(filaEncabezado, i + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: _COLOR_TEXTO_HD }, size: 10.5 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: _COLOR_NAVY_MED } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { bottom: { style: 'medium', color: { argb: _COLOR_DORADO } } };
    ws.getColumn(i + 1).width = col.width || 16;
  });
  ws.getRow(filaEncabezado).height = 26;

  // ── Filas de datos ────────────────────────────────────────
  filas.forEach((fila, idxFila) => {
    const filaExcel = filaEncabezado + 1 + idxFila;
    const enAlerta = typeof filaAlerta === 'function' && filaAlerta(fila);
    cols.forEach((col, i) => {
      const cell = ws.getCell(filaExcel, i + 1);
      const esColEstado = colEstado && col.key === colEstado;
      const valor = col.key === '_n' ? idxFila + 1 : (esColEstado ? _etiquetaEstado(fila[col.key]) : (fila[col.key] ?? ''));
      cell.value = valor;
      cell.alignment = { vertical: 'middle', horizontal: col.center ? 'center' : 'left' };
      cell.border = {
        top: { style: 'thin', color: { argb: _COLOR_BORDE } },
        bottom: { style: 'thin', color: { argb: _COLOR_BORDE } },
        left: { style: 'thin', color: { argb: _COLOR_BORDE } },
        right: { style: 'thin', color: { argb: _COLOR_BORDE } },
      };
      cell.font = { size: 10.5, color: { argb: 'FF2D3748' } };
      if (enAlerta) {
        // Fila completa en rojo pálido — estudiante en riesgo (ej. 3+ faltas)
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBE3E3' } };
        cell.border.left  = { style: 'thin', color: { argb: _COLOR_ROJO } };
        cell.border.right = { style: 'thin', color: { argb: _COLOR_ROJO } };
      } else if (idxFila % 2 === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: _COLOR_CEBRA } };
      }
      if (col.key === '_n') {
        cell.font = { size: 10, color: { argb: _COLOR_GRIS_TXT } };
      }
      if (esColEstado) {
        cell.font = { bold: true, size: 10.5, color: { argb: _colorEstado(fila[col.key]) } };
      }
      if (enAlerta) {
        cell.font = { ...cell.font, bold: true, color: { argb: cell.font.color?.argb || _COLOR_ROJO } };
      }
    });
    ws.getRow(filaExcel).height = 20;
  });

  let ultimaFila = filaEncabezado + filas.length;

  // ── Fila de totales (opcional) ───────────────────────────
  if (totales && totales.length) {
    ultimaFila += 1;
    const filaTotal = ultimaFila;
    ws.mergeCells(filaTotal, 1, filaTotal, 2);
    const etiquetaTotal = ws.getCell(filaTotal, 1);
    etiquetaTotal.value = 'TOTALES';
    etiquetaTotal.font = { bold: true, size: 10.5, color: { argb: _COLOR_NAVY } };
    etiquetaTotal.alignment = { horizontal: 'left', vertical: 'middle' };

    for (let c = 1; c <= totalCols; c++) {
      const cell = ws.getCell(filaTotal, c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: _COLOR_DORADO_BG } };
      cell.border = {
        top: { style: 'medium', color: { argb: _COLOR_DORADO } },
        bottom: { style: 'thin', color: { argb: _COLOR_BORDE_MED } },
      };
    }

    totales.forEach(t => {
      const colIdx = cols.findIndex(c => c.key === t.key);
      if (colIdx === -1) return;
      const cell = ws.getCell(filaTotal, colIdx + 1);
      cell.value = t.label ? `${t.label}: ${t.value}` : t.value;
      cell.font = { bold: true, size: 10.5, color: { argb: _COLOR_NAVY } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    ws.getRow(filaTotal).height = 22;
  }

  // ── Bloque de firma y sello (validez oficial del documento) ──
  if (firmas !== false) {
    ultimaFila += 2;
    const filaLineas = ultimaFila;
    const mitad = Math.max(2, Math.floor(totalCols / 2));

    // Línea para firma del docente (mitad izquierda)
    ws.mergeCells(filaLineas, 1, filaLineas, mitad);
    ws.getCell(filaLineas, 1).border = { bottom: { style: 'thin', color: { argb: 'FF444444' } } };

    // Línea para Vº Bº Dirección (mitad derecha)
    ws.mergeCells(filaLineas, mitad + 1, filaLineas, totalCols);
    ws.getCell(filaLineas, mitad + 1).border = { bottom: { style: 'thin', color: { argb: 'FF444444' } } };

    const filaEtiquetas = filaLineas + 1;
    ws.mergeCells(filaEtiquetas, 1, filaEtiquetas, mitad);
    const etqFirma = ws.getCell(filaEtiquetas, 1);
    etqFirma.value = 'Firma y sello — Profesor(a) a cargo';
    etqFirma.font = { size: 9, color: { argb: _COLOR_GRIS_TXT } };
    etqFirma.alignment = { horizontal: 'center' };

    ws.mergeCells(filaEtiquetas, mitad + 1, filaEtiquetas, totalCols);
    const etqDir = ws.getCell(filaEtiquetas, mitad + 1);
    etqDir.value = 'Vº Bº Dirección';
    etqDir.font = { size: 9, color: { argb: _COLOR_GRIS_TXT } };
    etqDir.alignment = { horizontal: 'center' };

    ws.getRow(filaLineas).height = 34;
    ultimaFila = filaEtiquetas;
  }

  // ── Pie de página con generación y numeración de página ──
  ultimaFila += 2;
  ws.mergeCells(ultimaFila, 1, ultimaFila, totalCols);
  const pie = ws.getCell(ultimaFila, 1);
  pie.value = 'Documento generado automáticamente por Codyweb — Sistema de Asistencia Estudiantil';
  pie.font = { italic: true, size: 8.5, color: { argb: _COLOR_GRIS_TXT } };

  // ── Auto-filtro y encabezado congelado ───────────────────
  ws.autoFilter = {
    from: { row: filaEncabezado, column: 1 },
    to: { row: filaEncabezado, column: totalCols },
  };
  ws.views = [{ state: 'frozen', ySplit: filaEncabezado }];

  // ── Configuración de impresión ───────────────────────────
  ws.pageSetup.printTitlesRow = `${filaEncabezado}:${filaEncabezado}`;
  ws.headerFooter.oddFooter = '&L&8Codyweb.com&C&8Página &P de &N&R&8U.E. Juana Azurduy de Padilla';

  return ultimaFila;
}

async function _descargarXLSX(wb, nombreArchivo) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function exportarAsistenciasCSV(fecha, cursoId) {
  const params = new URLSearchParams({ accion: 'asistencias' });
  if (fecha) params.set('fecha', fecha);
  if (cursoId) params.set('curso_id', cursoId);
  const res = await get('listar.php?' + params.toString());

  const filas = (res.data || []).map(a => ({
    codigo: a.codigo, nombre: a.nombre, apellido: a.apellido, curso: a.curso_nombre,
    fecha: a.fecha, entrada: a.hora_entrada || '-', salida: a.hora_salida || '-',
    estado: a.estado, obs: a.observacion || '',
  }));

  const conteo = { Presente: 0, Tarde: 0, Ausente: 0, Justificado: 0 };
  filas.forEach(f => { if (conteo[f.estado] !== undefined) conteo[f.estado]++; });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Codyweb';
  const ws = wb.addWorksheet('Asistencias', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
  });

  _armarHojaProfesional(ws, {
    titulo: 'Reporte de Asistencias',
    subtitulo: `Fecha: ${fecha || 'todas'}${cursoId ? ' — Curso filtrado' : ''}  ·  Total de registros: ${filas.length}  ·  Generado: ${new Date().toLocaleString('es-BO')}`,
    columnas: [
      { header: 'Código',      key: 'codigo',  width: 12, center: true },
      { header: 'Nombre',      key: 'nombre',  width: 18 },
      { header: 'Apellido',    key: 'apellido',width: 18 },
      { header: 'Curso',       key: 'curso',   width: 14, center: true },
      { header: 'Fecha',       key: 'fecha',   width: 14, center: true },
      { header: 'Entrada',     key: 'entrada', width: 12, center: true },
      { header: 'Salida',      key: 'salida',  width: 12, center: true },
      { header: 'Estado',      key: 'estado',  width: 14, center: true },
      { header: 'Observación', key: 'obs',     width: 24 },
    ],
    filas,
    colEstado: 'estado',
    totales: [
      { key: 'entrada', label: 'Presentes', value: conteo.Presente },
      { key: 'salida',  label: 'Tardanzas', value: conteo.Tarde },
      { key: 'estado',  label: 'Faltas',    value: conteo.Ausente },
      { key: 'obs',     label: 'Justif.',   value: conteo.Justificado },
    ],
  });

  await _descargarXLSX(wb, `asistencias_${fecha || 'reporte'}.xlsx`);
}

async function exportarReporteCSV(mes, anio, cursoId) {
  const params = new URLSearchParams({ accion: 'reporte_mensual', mes, anio });
  if (cursoId) params.set('curso_id', cursoId);
  const res = await get('listar.php?' + params.toString());

  const nombresMes = ['', 'Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const filas = (res.data || []).map(e => {
    const pct = e.dias_registrados > 0 ? Math.round((e.presentes / e.dias_registrados) * 100) : 0;
    return {
      codigo: e.codigo, nombre: e.nombre, apellido: e.apellido, curso: e.curso,
      dias: e.dias_registrados, presentes: e.presentes, tardanzas: e.tardanzas,
      ausentes: e.ausentes, justificados: e.justificados, pct: `${pct}%`,
    };
  });

  const sum = (k) => filas.reduce((acc, f) => acc + (f[k] || 0), 0);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Codyweb';
  const ws = wb.addWorksheet('Reporte mensual', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
  });

  _armarHojaProfesional(ws, {
    titulo: 'Reporte Mensual de Asistencia',
    subtitulo: `Periodo: ${nombresMes[mes] || mes} ${anio}${cursoId ? ' — Curso filtrado' : ''}  ·  Total de estudiantes: ${filas.length}  ·  Generado: ${new Date().toLocaleString('es-BO')}  ·  🔴 Resaltado: 3+ faltas en el mes`,
    columnas: [
      { header: 'Código',       key: 'codigo',     width: 12, center: true },
      { header: 'Nombre',       key: 'nombre',     width: 18 },
      { header: 'Apellido',     key: 'apellido',   width: 18 },
      { header: 'Curso',        key: 'curso',      width: 14, center: true },
      { header: 'Días reg.',    key: 'dias',       width: 11, center: true },
      { header: 'Presentes',    key: 'presentes',  width: 11, center: true },
      { header: 'Tardanzas',    key: 'tardanzas',  width: 11, center: true },
      { header: 'Faltas',       key: 'ausentes',   width: 11, center: true },
      { header: 'Justificados', key: 'justificados', width: 12, center: true },
      { header: '% Asistencia', key: 'pct',        width: 13, center: true },
    ],
    filas,
    totales: [
      { key: 'presentes',    label: 'Total', value: sum('presentes') },
      { key: 'tardanzas',    label: 'Total', value: sum('tardanzas') },
      { key: 'ausentes',     label: 'Total', value: sum('ausentes') },
      { key: 'justificados', label: 'Total', value: sum('justificados') },
    ],
    // Resalta en rojo la fila completa del estudiante con 3 o más faltas — alerta para el director
    filaAlerta: (f) => (f.ausentes || 0) >= 3,
  });

  await _descargarXLSX(wb, `reporte_${mes}-${anio}.xlsx`);
}
