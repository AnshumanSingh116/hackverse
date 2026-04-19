

(async function () {

  const PORTAL_OPEN  = new Date('2026-04-20T03:30:00Z');  
  const PORTAL_CLOSE = new Date('2026-04-20T15:30:00Z');  

  const PAGE = document.body.dataset.page; 
  if (PAGE === 'admin') return;
  if (PAGE === 'login' && sessionStorage.getItem('tg-admin-bypass') === '1') return;

  async function getServerTime() {
    try {
      const res = await fetch(window.SUPABASE_URL + '/rest/v1/', {
        method: 'GET',
        headers: { 'apikey': window.SUPABASE_ANON_KEY },
        signal: AbortSignal.timeout(5000),
      });
      const dateHeader = res.headers.get('date');
      if (dateHeader) return new Date(dateHeader);
    } catch (_) { /* fall through */ }
    console.warn('[timegate] Could not fetch server time — using client clock.');
    return new Date();
  }

  const now = await getServerTime();

  if (now >= PORTAL_OPEN && now < PORTAL_CLOSE) return;

  const ls = document.getElementById('loading-screen');
  if (ls) ls.classList.add('hidden');

  if (now < PORTAL_OPEN) {
    showCountdown(now);
  } else {
    showClosed();
  }

  function adminBypassBtn() {
    if (PAGE !== 'login') return '';
    return `
      <button onclick="
        sessionStorage.setItem('tg-admin-bypass','1');
        document.getElementById('tg-screen').remove();
        document.getElementById('loading-screen').classList.remove('hidden');
        initLoginPage();
      " style="
        background:none;border:none;
        color:var(--text-muted,#4a5568);
        font-family:var(--font-mono,'JetBrains Mono',monospace);
        font-size:0.68rem;letter-spacing:0.1em;
        cursor:pointer;text-decoration:underline;
        margin-top:1.75rem;display:inline-block;
        padding:0;
      ">Admin login →</button>`;
  }

  // ── COUNTDOWN SCREEN ──────────────────────────────────────────
  function showCountdown(serverNow) {
    injectStyles();
    const el = document.createElement('div');
    el.id = 'tg-screen';
    el.innerHTML = `
      <div class="tg-card">
        <div class="brand" style="justify-content:center;margin-bottom:1.5rem">
          <img src="logo.png" alt="Decagon Logo" class="nav-logo" style="height:38px">
          <div>
            <div class="brand-name" style="font-size:1rem">Hackverse</div>
            <div class="brand-tag" style="margin-left:0">DECAGON '26</div>
          </div>
        </div>
        <div class="tg-icon">🔒</div>
        <div class="tg-title">Portal opens in</div>
        <div class="tg-countdown" id="tg-countdown">--:--:--</div>
        <div class="tg-date">
          <span style="color:var(--text-muted);font-size:0.72rem;font-family:var(--font-mono);letter-spacing:0.12em">
            OPENS · 20 APR 2026 · 9:00 AM IST
          </span>
        </div>
        <div class="tg-sub">Check back at the scheduled time.<br>The portal will unlock automatically.</div>
        ${adminBypassBtn()}
      </div>`;
    document.body.appendChild(el);

    // Live countdown using server-time offset so client can't spoof it
    const offset = serverNow.getTime() - Date.now();
    function tick() {
      const trueNow = new Date(Date.now() + offset);
      const diff = Math.max(0, Math.floor((PORTAL_OPEN - trueNow) / 1000));
      if (diff <= 0) { window.location.reload(); return; }
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      const cd = document.getElementById('tg-countdown');
      if (cd) cd.textContent =
        `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
    tick();
    setInterval(tick, 1000);
  }

  // ── CLOSED SCREEN ─────────────────────────────────────────────
  function showClosed() {
    injectStyles();
    const el = document.createElement('div');
    el.id = 'tg-screen';
    el.innerHTML = `
      <div class="tg-card">
        <div class="brand" style="justify-content:center;margin-bottom:1.5rem">
          <img src="logo.png" alt="Decagon Logo" class="nav-logo" style="height:38px">
          <div>
            <div class="brand-name" style="font-size:1rem">Hackverse</div>
            <div class="brand-tag" style="margin-left:0">DECAGON '26</div>
          </div>
        </div>
        <div class="tg-icon">🏁</div>
        <div class="tg-title" style="color:var(--danger)">Portal Closed</div>
        <div class="tg-sub" style="margin-top:1rem">
          The Hackverse '26 test portal has closed.<br>
          Results will be announced by your examiner.
        </div>
        <div class="tg-date" style="margin-top:1.5rem">
          <span style="color:var(--text-muted);font-size:0.72rem;font-family:var(--font-mono);letter-spacing:0.12em">
            CLOSED · 20 APR 2026 · 9:00 PM IST
          </span>
        </div>
        ${adminBypassBtn()}
      </div>`;
    document.body.appendChild(el);
  }

  // ── STYLES ────────────────────────────────────────────────────
  function injectStyles() {
    const s = document.createElement('style');
    s.textContent = `
      #tg-screen {
        position: fixed; inset: 0; z-index: 9999;
        display: flex; align-items: center; justify-content: center;
        background: var(--bg, #03040a); padding: 2rem 1rem;
      }
      .tg-card {
        background: var(--bg-card, rgba(255,255,255,0.035));
        border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
        border-radius: 20px; backdrop-filter: blur(16px);
        padding: 3rem 3.5rem; width: 100%; max-width: 480px;
        text-align: center;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 60px rgba(124,58,237,0.1);
        position: relative; overflow: hidden;
      }
      .tg-card::before {
        content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
        background: linear-gradient(135deg, #7c3aed, #06b6d4); opacity: 0.6;
      }
      .tg-icon  { font-size: 3rem; margin-bottom: 1rem; line-height: 1; }
      .tg-title {
        font-family: var(--font-display, 'Orbitron', sans-serif);
        font-size: 0.85rem; font-weight: 700; letter-spacing: 0.2em;
        text-transform: uppercase; color: var(--text-muted, #4a5568); margin-bottom: 1rem;
      }
      .tg-countdown {
        font-family: var(--font-display, 'Orbitron', sans-serif);
        font-size: 3.5rem; font-weight: 900;
        background: linear-gradient(90deg, #a78bfa, #67e8f9);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        background-clip: text; letter-spacing: 0.05em; line-height: 1; margin-bottom: 1.25rem;
      }
      .tg-date  { margin-bottom: 1rem; }
      .tg-sub   { font-size: 0.85rem; color: var(--text-secondary, #94a3b8); line-height: 1.7; }
      @media (max-width: 480px) {
        .tg-card { padding: 2rem 1.5rem; }
        .tg-countdown { font-size: 2.5rem; }
      }
    `;
    document.head.appendChild(s);
  }

})();
