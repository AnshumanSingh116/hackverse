const SUPABASE_URL = "https://eahxtydczykrzzeyozjp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhaHh0eWRjenlrcnp6ZXlvempwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MDkyMTQsImV4cCI6MjA5MjA4NTIxNH0.JnaQneuwEf5nzt61_5an5MTUzBTVhrW2iT_Eyx8BCnM";

// Expose for timegate.js (must be set before timegate.js runs)
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
if (!SUPABASE_URL || SUPABASE_URL === "YOUR_URL") {
  document.body.innerHTML = `
    <div style="font-family:monospace;color:#f74f6a;background:#0a0b0e;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;text-align:center">
      <div>
        <div style="font-size:2rem;margin-bottom:1rem">⚠</div>
        <div style="font-size:1.2rem;margin-bottom:0.5rem">Supabase not configured</div>
        <div style="color:#8b91a8;font-size:0.9rem">Open <strong style="color:#4f8ef7">supabase.js</strong> and replace<br>
        <strong>YOUR_URL</strong> and <strong>YOUR_ANON_KEY</strong><br>with your real Supabase project credentials.</div>
      </div>
    </div>`;
  throw new Error("Supabase credentials not set in supabase.js");
}

window.db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.db.supabaseUrl = SUPABASE_URL; // expose for Edge Function calls
