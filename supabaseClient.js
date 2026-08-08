// ============================================================
//  CODYWEB.COM — supabaseClient.js
//  Conexión al proyecto de Supabase
// ============================================================

const SUPABASE_URL = 'https://buolqsrjqhuabbzdhppp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1b2xxc3JqcWh1YWJiemRocHBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMjI2NDUsImV4cCI6MjEwMTY5ODY0NX0.0WToArrsxUFOTn6uL1kQd5q5QBaheAbFsaHTXieasek';

// 'supabase' aquí es la librería cargada desde el CDN (ver index.html/login.html)
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
