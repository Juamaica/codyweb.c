// ============================================================
//  CODYWEB.COM — supabaseClient.js
//  Conexión al proyecto de Supabase
// ============================================================
const SUPABASE_URL = 'https://ovpruwjtlvphrxvgbavm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92cHJ1d2p0bHZwaHJ4dmdiYXZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczMzQwNjQsImV4cCI6MjEwMjkxMDA2NH0.0xPF7gl9j1Ivm4RRCGf2Se4HTJ_peVDlu3XKDBnVmJY';
// 'supabase' aquí es la librería cargada desde el CDN (ver index.html/login.html)
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
