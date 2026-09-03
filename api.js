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
    apellido: [e.apellido_paterno, e.apellido_materno].filter(Boolean).join(' '),
    curso_nombre: e.cursos ? e.cursos.nombre : '',
  };
}

function _aplanarAsistencia(a) {
  const est = a.estudiantes || {};
  const curso = est.cursos || {};
  return {
    ...a,
    nombre: est.nombre || '',
    apellido: [est.apellido_paterno, est.apellido_materno].filter(Boolean).join(' '),
    codigo: est.codigo || '',
    curso_nombre: curso.nombre || '',
    turno: curso.turno || '',
  };
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

        const { data, error } = await q.order('apellido_paterno');
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

        let q = sb.from('asistencias').select('*, estudiantes(nombre,apellido_paterno,apellido_materno,codigo,curso_id,cursos(nombre,turno))');

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

      case 'trimestres': {
        const gestion = params.get('gestion');
        let q = sb.from('trimestres').select('*').order('fecha_inicio');
        if (gestion) q = q.eq('gestion', gestion);
        const { data, error } = await q;
        if (error) throw error;
        return { ok: true, data: data || [] };
      }

      case 'reporte_trimestral': {
        const trimestreId = params.get('trimestre_id');
        const cursoId = params.get('curso_id');

        const { data: trimestre, error: eT } = await sb.from('trimestres')
          .select('*').eq('id', trimestreId).maybeSingle();
        if (eT) throw eT;
        if (!trimestre) return { ok: false, msg: 'Trimestre no encontrado' };

        let qEst = sb.from('estudiantes').select('*, cursos(nombre)').eq('estado', 'Activo');
        if (cursoId) qEst = qEst.eq('curso_id', cursoId);
        const { data: estudiantes, error: e1 } = await qEst;
        if (e1) throw e1;

        const { data: asist, error: e2 } = await sb.from('asistencias')
          .select('estudiante_id, estado')
          .gte('fecha', trimestre.fecha_inicio)
          .lte('fecha', trimestre.fecha_fin);
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

        return { ok: true, data, trimestre };
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
        const { nombre, apellido_paterno, apellido_materno, ci, curso_id, sexo, telefono, email, estado, repitente } = data;

        if (!nombre || !apellido_paterno || !curso_id) {
          return { ok: false, msg: 'Nombres, apellido paterno y curso son obligatorios' };
        }

        if (id > 0) {
          const { error } = await sb.from('estudiantes').update({
            nombre, apellido_paterno, apellido_materno: apellido_materno || null,
            ci, curso_id: parseInt(curso_id), sexo,
            telefono_tutor: telefono, email, estado: estado || 'Activo',
            repitente: !!repitente,
          }).eq('id', id);
          if (error) throw error;
          return { ok: true, msg: 'Estudiante actualizado', id };
        } else {
          // El código (EST-0001, EST-0002...) ahora lo genera Supabase automáticamente
          // (ver función generar_codigo_estudiante en la base de datos), así nunca choca
          // aunque haya estudiantes creados por otros profesores que no se puedan ver.
          const token = crypto.randomUUID();

          const { data: nuevo, error } = await sb.from('estudiantes').insert({
            nombre, apellido_paterno, apellido_materno: apellido_materno || null,
            ci, curso_id: parseInt(curso_id), sexo,
            telefono_tutor: telefono, email, qr_token: token, estado: 'Activo',
            repitente: !!repitente,
          }).select().single();

          if (error) throw error;
          return { ok: true, msg: 'Estudiante registrado', id: nuevo.id, codigo: nuevo.codigo };
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

      case 'guardar_trimestre': {
        const { nombre, gestion, fecha_inicio, fecha_fin } = data;
        const id = parseInt(data.id) || 0;

        if (!nombre || !gestion || !fecha_inicio || !fecha_fin) {
          return { ok: false, msg: 'Nombre, gestión y ambas fechas son obligatorios' };
        }

        if (id > 0) {
          const { error } = await sb.from('trimestres')
            .update({ nombre, gestion, fecha_inicio, fecha_fin }).eq('id', id);
          if (error) throw error;
        } else {
          const { error } = await sb.from('trimestres')
            .insert({ nombre, gestion, fecha_inicio, fecha_fin });
          if (error) throw error;
        }
        return { ok: true, msg: 'Trimestre guardado' };
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
   BRANDING DEL COLEGIO (escudo configurable, para que cualquier
   colegio pueda usar Codyweb con su propia identidad)
═══════════════════════════════════════════════════════════════ */
async function subirEscudoSupabase(archivo) {
  try {
    const ext = archivo.name.split('.').pop();
    const nombreArchivo = `escudo_${Date.now()}.${ext}`;

    const { error } = await sb.storage.from('branding').upload(nombreArchivo, archivo);
    if (error) throw error;

    const { data: urlData } = sb.storage.from('branding').getPublicUrl(nombreArchivo);
    return { ok: true, url: urlData.publicUrl };
  } catch (err) {
    console.error(err);
    return { ok: false, msg: err.message || 'Error al subir el escudo' };
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

  let insertados = 0;
  const errores = [];

  for (let i = 1; i < filas.length; i++) { // saltar encabezado
    const cols = filas[i].split(',').map(c => c.trim());
    if (cols.length < 6) { errores.push(`Fila ${i + 1}: columnas insuficientes`); continue; }

    const [codigoIn, apellidoPaterno, apellidoMaterno, nombre, ci, cursoNombre, sexoIn] = cols;
    if (!nombre || !apellidoPaterno) { errores.push(`Fila ${i + 1}: nombre o apellido paterno vacío`); continue; }

    const curso = (cursos || []).find(c => c.nombre.toLowerCase().includes(cursoNombre.toLowerCase()));
    if (!curso) { errores.push(`Fila ${i + 1}: curso '${cursoNombre}' no encontrado`); continue; }

    const sexo  = ['V', 'M'].includes((sexoIn || 'V').toUpperCase()[0]) ? (sexoIn || 'V').toUpperCase()[0] : 'V';
    const token = crypto.randomUUID();

    // Si el CSV trae un código, se usa ese; si no, Supabase genera uno automáticamente
    const registro = {
      nombre, apellido_paterno: apellidoPaterno, apellido_materno: apellidoMaterno || null,
      ci, curso_id: curso.id, sexo, qr_token: token, estado: 'Activo',
    };
    if (codigoIn) registro.codigo = codigoIn;

    const { error } = await sb.from('estudiantes').insert(registro);
    if (error) errores.push(`Fila ${i + 1}: ya existe (código duplicado)`);
    else insertados++;
  }

  return { ok: true, msg: `Importación completada: ${insertados} estudiante(s) registrado(s)`, insertados, errores };
}

/* ══════════════════════════════════════════════════════════════
   EXPORTAR CSV (del lado del navegador, ya no en el servidor)
═══════════════════════════════════════════════════════════════ */
function _descargarCSV(nombreArchivo, encabezados, filas) {
  const BOM = '\uFEFF';
  const csv = BOM + [encabezados, ...filas]
    .map(fila => fila.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
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
  const filas = (res.data || []).map(a => [
    a.codigo, a.nombre, a.apellido, a.curso_nombre, a.fecha, a.hora_entrada, a.hora_salida, a.estado, a.observacion,
  ]);
  _descargarCSV(`asistencias_${fecha || 'reporte'}.csv`,
    ['Código', 'Nombre', 'Apellido', 'Curso', 'Fecha', 'Entrada', 'Salida', 'Estado', 'Observación'], filas);
}

async function exportarReporteCSV(mes, anio, cursoId) {
  const params = new URLSearchParams({ accion: 'reporte_mensual', mes, anio });
  if (cursoId) params.set('curso_id', cursoId);
  const res = await get('listar.php?' + params.toString());
  const filas = (res.data || []).map(e => [
    e.codigo, e.nombre, e.apellido, e.curso, e.dias_registrados, e.presentes, e.tardanzas, e.ausentes, e.justificados,
  ]);
  _descargarCSV(`reporte_${mes}-${anio}.csv`,
    ['Código', 'Nombre', 'Apellido', 'Curso', 'Días reg.', 'Presentes', 'Tardanzas', 'Ausentes', 'Justificados'], filas);
}

async function exportarReporteTrimestralCSV(trimestreId, cursoId) {
  const params = new URLSearchParams({ accion: 'reporte_trimestral', trimestre_id: trimestreId });
  if (cursoId) params.set('curso_id', cursoId);
  const res = await get('listar.php?' + params.toString());
  const filas = (res.data || []).map(e => [
    e.codigo, e.nombre, e.apellido, e.curso, e.dias_registrados, e.presentes, e.tardanzas, e.ausentes, e.justificados,
  ]);
  const nombreTrim = (res.trimestre?.nombre || 'trimestre').replace(/\s+/g, '_');
  _descargarCSV(`reporte_${nombreTrim}.csv`,
    ['Código', 'Nombre', 'Apellido', 'Curso', 'Días reg.', 'Presentes', 'Tardanzas', 'Ausentes', 'Justificados'], filas);
}
/* ══════════════════════════════════════════════════════════════
   EXPORTAR EXCEL DETALLADO (días en columnas agrupados por mes)
   Requiere ExcelJS cargado en el HTML (ver index.html)
═══════════════════════════════════════════════════════════════ */

const _NOMBRES_MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
  'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];

// Colores por estado (fondo, letra)
const _COLORES_ESTADO = {
  Presente    : { fill: 'FFDCFCE7', font: 'FF166534', letra: 'P' },
  Tarde       : { fill: 'FFFEF3C7', font: 'FF92400E', letra: 'T' },
  Ausente     : { fill: 'FFFEE2E2', font: 'FF991B1B', letra: 'F' },
  Justificado : { fill: 'FFDBEAFE', font: 'FF1E40AF', letra: 'J' },
};

async function exportarReporteExcelDetallado({ tipo, mes, anio, trimestreId, cursoId }) {
  try {
    let fechaInicio, fechaFin, tituloPeriodo, nombreCursoTxt = 'Todos los cursos';

    // 1. Determinar rango de fechas según tipo de reporte
    if (tipo === 'trimestre') {
      const { data: trim, error } = await sb.from('trimestres').select('*').eq('id', trimestreId).maybeSingle();
      if (error) throw error;
      if (!trim) { toast('Error', 'Trimestre no encontrado', 'error'); return; }
      fechaInicio = trim.fecha_inicio;
      fechaFin    = trim.fecha_fin;
      tituloPeriodo = trim.nombre.toUpperCase();
    } else {
      const { inicio, fin } = _rangoMes(mes, anio);
      fechaInicio = inicio;
      fechaFin    = fin;
      tituloPeriodo = `${_NOMBRES_MESES[parseInt(mes) - 1]} ${anio}`;
    }

    // 2. Estudiantes (filtrados por curso si aplica)
    let qEst = sb.from('estudiantes').select('*, cursos(nombre)').eq('estado', 'Activo');
    if (cursoId) qEst = qEst.eq('curso_id', cursoId);
    const { data: estudiantesRaw, error: eEst } = await qEst;
    if (eEst) throw eEst;

    const estudiantes = (estudiantesRaw || []).map(_aplanarEstudiante)
      .sort((a, b) => (a.apellido || '').localeCompare(b.apellido || ''));

    if (!estudiantes.length) { toast('Sin datos', 'No hay estudiantes para exportar', 'warn'); return; }

    if (cursoId) nombreCursoTxt = estudiantes[0]?.curso_nombre || nombreCursoTxt;

    // 3. Asistencias del rango completo
    const { data: asistRaw, error: eAsist } = await sb.from('asistencias')
      .select('estudiante_id, fecha, estado')
      .gte('fecha', fechaInicio).lte('fecha', fechaFin);
    if (eAsist) throw eAsist;

    const mapaAsist = {};
    (asistRaw || []).forEach(a => { mapaAsist[`${a.estudiante_id}_${a.fecha}`] = a.estado; });

    // 4. Lista de días del período, agrupados por mes
    const dias = [];
    let cursor = new Date(fechaInicio + 'T00:00:00');
    const finD = new Date(fechaFin + 'T00:00:00');
    while (cursor <= finD) { dias.push(new Date(cursor)); cursor.setDate(cursor.getDate() + 1); }

    const gruposMes = [];
    dias.forEach(d => {
      const clave = `${d.getFullYear()}-${d.getMonth()}`;
      let grupo = gruposMes.find(g => g.clave === clave);
      if (!grupo) { grupo = { clave, nombre: _NOMBRES_MESES[d.getMonth()], dias: [] }; gruposMes.push(grupo); }
      grupo.dias.push(d);
    });

    // 5. Armar el workbook
    const wb = new ExcelJS.Workbook();
    wb.creator = App.branding?.nombre_colegio || 'Codyweb';
    const ws = wb.addWorksheet('Asistencia', {
      views: [{ state: 'frozen', xSplit: 3, ySplit: 5 }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    });

    const COL_NUM = 1, COL_COD = 2, COL_NOM = 3, COL_DIAS_INICIO = 4;
    const totalDias  = dias.length;
    const colFinDias = COL_DIAS_INICIO + totalDias - 1;
    // 4 columnas de totales al final: P, T, F, J, %
    const colTotales = [colFinDias + 1, colFinDias + 2, colFinDias + 3, colFinDias + 4, colFinDias + 5];
    const colFinal   = colTotales[colTotales.length - 1];

    // Fila 1: nombre del colegio
    ws.mergeCells(1, 1, 1, colFinal);
    const cTitulo1 = ws.getCell(1, 1);
    cTitulo1.value = (App.branding?.nombre_colegio || 'U.E. JUANA AZURDUY DE PADILLA').toUpperCase();
    cTitulo1.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
    cTitulo1.alignment = { horizontal: 'center', vertical: 'middle' };
    cTitulo1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A1628' } };
    ws.getRow(1).height = 24;

    // Fila 2: título del reporte
    ws.mergeCells(2, 1, 2, colFinal);
    const cTitulo2 = ws.getCell(2, 1);
    cTitulo2.value = `CONTROL DE ASISTENCIA — ${tituloPeriodo} — ${nombreCursoTxt}`;
    cTitulo2.font = { bold: true, size: 11, color: { argb: 'FF0A1628' } };
    cTitulo2.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 20;

    // Fila 3: fecha de generación
    ws.mergeCells(3, 1, 3, colFinal);
    const cSub = ws.getCell(3, 1);
    cSub.value = `Generado el ${new Date().toLocaleDateString('es-BO')} — Codyweb`;
    cSub.font = { italic: true, size: 9, color: { argb: 'FF5A7BA0' } };
    cSub.alignment = { horizontal: 'center' };

    // Fila 4: encabezados fijos + meses agrupados
    ws.mergeCells(4, COL_NUM, 5, COL_NUM);
    ws.mergeCells(4, COL_COD, 5, COL_COD);
    ws.mergeCells(4, COL_NOM, 5, COL_NOM);
    ws.getCell(4, COL_NUM).value = 'Nº';
    ws.getCell(4, COL_COD).value = 'CÓDIGO';
    ws.getCell(4, COL_NOM).value = 'APELLIDOS Y NOMBRES';

    let colCursor = COL_DIAS_INICIO;
    gruposMes.forEach(grupo => {
      const inicio = colCursor;
      const fin    = colCursor + grupo.dias.length - 1;
      ws.mergeCells(4, inicio, 4, fin);
      const cMes = ws.getCell(4, inicio);
      cMes.value = grupo.nombre;
      cMes.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
      cMes.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
      cMes.alignment = { horizontal: 'center', vertical: 'middle' };

      grupo.dias.forEach((d, i) => {
        const c = ws.getCell(5, inicio + i);
        c.value = d.getDate();
        c.font = { bold: true, size: 8 };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        const esFinde = d.getDay() === 0 || d.getDay() === 6;
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: esFinde ? 'FFE2E8F0' : 'FFEFF6FF' } };
      });
      colCursor = fin + 1;
    });

    // Encabezados de totales
    ws.mergeCells(4, colTotales[0], 4, colTotales[4]);
    const cTotHead = ws.getCell(4, colTotales[0]);
    cTotHead.value = 'TOTALES';
    cTotHead.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
    cTotHead.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A1628' } };
    cTotHead.alignment = { horizontal: 'center', vertical: 'middle' };

    const etiquetasTotal = ['P', 'T', 'F', 'J', '%'];
    etiquetasTotal.forEach((et, i) => {
      const c = ws.getCell(5, colTotales[i]);
      c.value = et;
      c.font = { bold: true, size: 9 };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EAF4' } };
    });

    // Anchos de columna
    ws.getColumn(COL_NUM).width = 4;
    ws.getColumn(COL_COD).width = 10;
    ws.getColumn(COL_NOM).width = 32;
    for (let c = COL_DIAS_INICIO; c <= colFinDias; c++) ws.getColumn(c).width = 3.2;
    colTotales.forEach(c => ws.getColumn(c).width = 5.5);

    // Bordes en encabezados
    for (let r = 4; r <= 5; r++) {
      for (let c = 1; c <= colFinal; c++) {
        ws.getCell(r, c).border = { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };
      }
    }

    // 6. Filas de estudiantes
    estudiantes.forEach((est, idx) => {
      const fila = 6 + idx;
      ws.getCell(fila, COL_NUM).value = idx + 1;
      ws.getCell(fila, COL_COD).value = est.codigo;
      ws.getCell(fila, COL_NOM).value = `${est.apellido}, ${est.nombre}`;
      ws.getCell(fila, COL_NOM).alignment = { horizontal: 'left' };
      ws.getCell(fila, COL_NUM).alignment = { horizontal: 'center' };
      ws.getCell(fila, COL_COD).alignment = { horizontal: 'center' };
      ws.getCell(fila, COL_COD).font = { size: 8 };
      ws.getCell(fila, COL_NOM).font = { size: 9 };

      let cont = { P: 0, T: 0, F: 0, J: 0 };
      colCursor = COL_DIAS_INICIO;

      gruposMes.forEach(grupo => {
        grupo.dias.forEach((d, i) => {
          const fechaStr = d.toISOString().slice(0, 10);
          const estado   = mapaAsist[`${est.id}_${fechaStr}`];
          const c = ws.getCell(fila, colCursor + i);
          const esFinde  = d.getDay() === 0 || d.getDay() === 6;

          if (estado && _COLORES_ESTADO[estado]) {
            const cfg = _COLORES_ESTADO[estado];
            c.value = cfg.letra;
            c.font  = { bold: true, size: 8, color: { argb: cfg.font } };
            c.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: cfg.fill } };
            const letraCorta = cfg.letra === 'F' ? 'F' : cfg.letra;
            cont[letraCorta] = (cont[letraCorta] || 0) + 1;
          } else if (esFinde) {
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
          }
          c.alignment = { horizontal: 'center', vertical: 'middle' };
          c.border = { top:{style:'hair'}, bottom:{style:'hair'}, left:{style:'hair'}, right:{style:'hair'} };
        });
        colCursor += grupo.dias.length;
      });

      const totalRegistrado = cont.P + cont.T + cont.F + cont.J;
      const pct = totalRegistrado > 0 ? Math.round((cont.P / totalRegistrado) * 100) : 0;

      ws.getCell(fila, colTotales[0]).value = cont.P;
      ws.getCell(fila, colTotales[1]).value = cont.T;
      ws.getCell(fila, colTotales[2]).value = cont.F;
      ws.getCell(fila, colTotales[3]).value = cont.J;
      ws.getCell(fila, colTotales[4]).value = `${pct}%`;
      colTotales.forEach(c => {
        ws.getCell(fila, c).alignment = { horizontal: 'center' };
        ws.getCell(fila, c).font = { size: 8, bold: c === colTotales[4] };
      });

      ws.getCell(fila, COL_NUM).border = ws.getCell(fila, COL_COD).border = ws.getCell(fila, COL_NOM).border =
        { top:{style:'hair'}, bottom:{style:'hair'}, left:{style:'hair'}, right:{style:'hair'} };
    });

    // 7. Descargar
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    const nombreArchivo = `Asistencia_${nombreCursoTxt.replace(/\s+/g, '_')}_${tituloPeriodo.replace(/\s+/g, '_')}.xlsx`;
    a.href = URL.createObjectURL(blob);
    a.download = nombreArchivo;
    a.click();
    URL.revokeObjectURL(a.href);

  } catch (err) {
    console.error(err);
    toast('Error', err.message || 'No se pudo generar el Excel', 'error');
  }
}
