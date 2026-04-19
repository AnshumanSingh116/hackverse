
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function showAlert(container, type, msg) {
  const el = document.createElement('div');
  el.className = `alert alert-${type}`;
  el.innerHTML = `<span>${type === 'error' ? '✕' : type === 'success' ? '✓' : 'ℹ'}</span><span>${msg}</span>`;
  container.prepend(el);
  setTimeout(() => el.remove(), 5000);
}

function genPassword(len = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// Generate team ID: school initials + student initials e.g. DPS + Apple Mango Orange → "dps-amo"
function genTeamId(schoolName, students) {
  const schoolInitials = schoolName
    .split(/\s+/).filter(Boolean).map(w => w[0]).join('').toLowerCase().replace(/[^a-z0-9]/g, '');
  const studentInitials = students
    .filter(Boolean).map(s => s.trim()[0]).join('').toLowerCase().replace(/[^a-z0-9]/g, '');
  return (schoolInitials || 'team') + (studentInitials ? '-' + studentInitials : '');
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function isAdminEmail(email) {
  return email && email.endsWith('@admin.com');
}

// ── Auth Guards ───────────────────────────────────────────────
async function requireAuth(redirectIfNot = 'index.html') {
  const { data: { session } } = await window.db.auth.getSession();
  if (!session) { window.location.href = redirectIfNot; return null; }
  return session;
}

async function requireAdmin() {
  const session = await requireAuth();
  if (!session) return null;
  if (!isAdminEmail(session.user.email)) {
    window.location.href = 'test.html';
    return null;
  }
  return session;
}

// ── Hide loading screen ────────────────────────────────────────
function hideLoading() {
  const ls = document.getElementById('loading-screen');
  if (ls) { ls.classList.add('hidden'); }
}

// ============================================================
// PAGE: index.html (Login)
// ============================================================
async function initLoginPage() {
  const { data: { session } } = await window.db.auth.getSession();
  if (session) {
    window.location.href = isAdminEmail(session.user.email) ? 'admin.html' : 'test.html';
    return;
  }
  hideLoading();

  const form = document.getElementById('login-form');
  const alertBox = document.getElementById('alert-box');
  const btnText = document.getElementById('btn-text');
  const btnSpinner = document.getElementById('btn-spinner');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    btnText.textContent = 'Signing in…';
    btnSpinner.classList.remove('hidden');

    const { data, error } = await window.db.auth.signInWithPassword({ email, password });

    btnText.textContent = 'Sign In';
    btnSpinner.classList.add('hidden');

    if (error) {
      showAlert(alertBox, 'error', error.message);
      return;
    }

    window.location.href = isAdminEmail(data.session.user.email) ? 'admin.html' : 'test.html';
  });
}

let testState = {
  session: null,
  teamId: null,
  questions: [],
  submission: null,
  answers: {},
  currentQ: 0,
  timerInterval: null,
  violationCountdown: null,
  violationActive: false,
  totalSeconds: 2700,
};

async function initTestPage() {
  const session = await requireAuth();
  if (!session) return;

  if (isAdminEmail(session.user.email)) {
    window.location.href = 'admin.html';
    return;
  }

  testState.session = session;
  testState.teamId = session.user.email.split('@')[0];

  // Check if already submitted
  const { data: sub } = await window.db
    .from('submissions')
    .select('id, submitted, answers, start_time')
    .eq('team_id', testState.teamId)
    .maybeSingle();

  if (sub?.submitted) {
    document.getElementById('submitted-screen').classList.remove('hidden');
    document.getElementById('loading-screen').classList.add('hidden');
    hideLoading();
    return;
  }

  testState.submission = sub;
  if (sub?.answers) testState.answers = sub.answers;

  hideLoading();
  showRulesScreen();
  setupSignOut();
}

function showRulesScreen() {
  document.getElementById('rules-screen').classList.remove('hidden');
  document.getElementById('test-screen').classList.add('hidden');

  document.getElementById('start-test-btn')?.addEventListener('click', async () => {
    document.getElementById('rules-screen').classList.add('hidden');
    // FIX: setup anti-cheat only when test actually starts
    setupAntiCheat();
    await startTest();
  });
}

async function startTest() {
  // Load questions (without correct_answer)
  const { data: questions, error } = await window.db
    .from('questions')
    .select('id, question, type, options')
    .order('id');

  if (error || !questions?.length) {
    alert('Failed to load questions. Please refresh.');
    return;
  }

  testState.questions = questions;

  // Create or load submission
  if (!testState.submission) {
    const { data: newSub, error: subErr } = await window.db
      .from('submissions')
      .insert({ team_id: testState.teamId, answers: {}, submitted: false })
      .select('id, start_time, answers, submitted')
      .single();

    if (subErr) { alert('Failed to create submission: ' + subErr.message); return; }
    testState.submission = newSub;
  }

  document.getElementById('test-screen').classList.remove('hidden');
  renderQuestion(testState.currentQ);
  // Enter fullscreen AFTER the test screen is visible (browser requires a
  // visible element + user-gesture context; calling it before show() is a no-op)
  setTimeout(() => enterFullscreen(), 100);
  if (testState.submission) {
    startTimer();
  } else {
    alert('Submission error: could not start timer. Please refresh.');
  }
}

function startTimer() {
  const startTime = new Date(testState.submission.start_time).getTime();

  function tick() {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const remaining = testState.totalSeconds - elapsed;

    if (remaining <= 0) {
      clearInterval(testState.timerInterval);
      autoSubmit();
      return;
    }

    const timerEl = document.getElementById('timer-display');
    if (timerEl) {
      timerEl.textContent = formatTime(remaining);
      timerEl.className = 'timer-box';
      if (remaining < 600) timerEl.classList.add('warning');
      if (remaining < 120) { timerEl.classList.remove('warning'); timerEl.classList.add('critical'); }
    }
  }

  tick();
  testState.timerInterval = setInterval(tick, 1000);
}

function renderQuestion(index) {
  const q = testState.questions[index];
  if (!q) return;

  testState.currentQ = index;
  const total = testState.questions.length;

  // Update counter and progress
  const counterEl = document.getElementById('q-counter');
  if (counterEl) counterEl.textContent = `${index + 1} / ${total}`;

  const progressFill = document.getElementById('progress-fill');
  if (progressFill) progressFill.style.width = `${((index + 1) / total) * 100}%`;

  // Build question HTML
  const area = document.getElementById('question-area');
  const tagClass = q.type === 'mcq' ? '' : 'short';
  const tagLabel = q.type === 'mcq' ? '⬡ Multiple Choice' : '✎ Short Answer';

  let answerHtml = '';
  const savedAnswer = testState.answers[q.id] || '';

  if (q.type === 'mcq') {
    const opts = Array.isArray(q.options) ? q.options : JSON.parse(q.options || '[]');
    const letters = ['A','B','C','D'];
    answerHtml = `<div class="options-grid">` +
      opts.map((opt, i) => `
        <button class="option-btn ${savedAnswer === opt ? 'selected' : ''}"
                data-value="${escHtml(opt)}"
                onclick="selectOption(this)">
          <span class="option-letter">${letters[i] || i+1}</span>
          <span>${escHtml(opt)}</span>
        </button>`).join('') +
      `</div>`;
  } else {
    answerHtml = `
      <div class="short-answer-area">
        <textarea id="short-answer-input" placeholder="Type your answer here…"
          oninput="handleShortInput(this)"
          maxlength="2000">${escHtml(savedAnswer)}</textarea>
        <div class="char-count"><span id="char-count-val">${savedAnswer.length}</span>/2000</div>
      </div>`;
  }

  area.innerHTML = `
    <div class="q-tag ${tagClass}">${tagLabel}</div>
    <div class="q-text">Q${index + 1}. ${formatQuestion(q.question)}</div>
    ${answerHtml}
  `;

  // Navigation dots
  renderNavDots();

  // Nav buttons
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const submitBtn = document.getElementById('submit-btn');

  if (prevBtn) prevBtn.disabled = index === 0;
  if (nextBtn) nextBtn.classList.toggle('hidden', index === total - 1);
  if (submitBtn) submitBtn.classList.toggle('hidden', index !== total - 1);
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function formatQuestion(text) {
  if (!text) return '';
  // Triple backtick code blocks → <pre><code>
  text = text.replace(/```([\s\S]*?)```/g, (_, code) => {
    return `<pre class="q-code-block"><code>${escHtml(code.trim())}</code></pre>`;
  });
  // Inline backtick → <code>
  text = text.replace(/`([^`]+)`/g, (_, code) => {
    return `<code class="q-code-inline">${escHtml(code)}</code>`;
  });
  // Escape remaining plain text (non-code parts already escaped inside)
  return text;
}

function renderNavDots() {
  const dots = document.getElementById('q-dots');
  if (!dots) return;
  dots.innerHTML = testState.questions.map((q, i) => {
    let cls = '';
    if (i === testState.currentQ) cls = 'current';
    else if (testState.answers[q.id]) cls = 'answered';
    return `<button class="q-dot ${cls}" onclick="goToQuestion(${i})" title="Question ${i+1}"></button>`;
  }).join('');
}

window.goToQuestion = (i) => renderQuestion(i);

// FIX: read value from data-value attribute instead of inline onclick string
window.selectOption = (btn) => {
  $$('.option-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  const value = btn.getAttribute('data-value');
  const q = testState.questions[testState.currentQ];
  testState.answers[q.id] = value;
  saveAnswers();
  renderNavDots();
};

window.handleShortInput = (el) => {
  const q = testState.questions[testState.currentQ];
  testState.answers[q.id] = el.value;
  const cc = document.getElementById('char-count-val');
  if (cc) cc.textContent = el.value.length;
  debouncedSave();
};

let saveTimeout;
function debouncedSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveAnswers, 800);
}

async function saveAnswers() {
  if (!testState.submission?.id) return;
  setSaveIndicator('saving');
  const { error } = await window.db
    .from('submissions')
    .update({ answers: testState.answers })
    .eq('id', testState.submission.id);
  setSaveIndicator(error ? null : 'saved');
}

function setSaveIndicator(state) {
  const el = document.getElementById('save-indicator');
  if (!el) return;
  el.className = 'mono';
  if (state === 'saving') { el.textContent = '● saving…'; el.className += ' saving'; }
  else if (state === 'saved') { el.textContent = '✓ saved'; el.className += ' saved'; }
  else { el.textContent = ''; }
}

window.prevQuestion = () => {
  if (testState.currentQ > 0) renderQuestion(testState.currentQ - 1);
};

window.nextQuestion = () => {
  const next = testState.currentQ + 1;
  if (next < testState.questions.length) renderQuestion(next);
};

window.confirmSubmit = () => {
  // Use a custom in-page modal instead of native confirm() — the native dialog
  // exits fullscreen on some browsers, giving students a loophole to cheat.
  const overlay = document.getElementById('submit-confirm-overlay');
  if (overlay) overlay.style.display = 'flex';
};

window.cancelSubmitConfirm = () => {
  // Simply close the modal — anti-cheat stays armed, fullscreen stays intact
  const overlay = document.getElementById('submit-confirm-overlay');
  if (overlay) overlay.style.display = 'none';
};

window.doSubmit = () => {
  const overlay = document.getElementById('submit-confirm-overlay');
  if (overlay) overlay.style.display = 'none';
  autoSubmit();
};

async function autoSubmit() {
  // Disable anti-cheat so no more violations fire during or after submit
  _antiCheatReady = false;
  testState.violationActive = false;

  clearInterval(testState.timerInterval);
  clearInterval(testState.violationCountdown);
  document.getElementById('violation-overlay')?.classList.remove('active');
  document.getElementById('fullscreen-warning')?.classList.remove('visible');

  if (!testState.submission?.id) { window.location.href = 'index.html'; return; }

  // Mark locally first so any stray events don't re-trigger
  if (testState.submission) testState.submission.submitted = true;

  await window.db.from('submissions').update({
    answers: testState.answers,
    submitted: true,
  }).eq('id', testState.submission.id);

  document.getElementById('test-screen').classList.add('hidden');
  document.getElementById('rules-screen')?.classList.add('hidden');
  document.getElementById('submitted-screen').classList.remove('hidden');
}

// ── Anti-Cheat ────────────────────────────────────────────────
// Simple rule: in fullscreen = safe, out of fullscreen = violation countdown.
// Re-entering fullscreen dismisses the overlay immediately.
let _antiCheatReady = false;

function isFullscreen() {
  return !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  );
}

// ── Fullscreen ────────────────────────────────────────────────
function enterFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
  if (req) {
    req.call(el).catch(() => {});
  }
  // If we're already in fullscreen (e.g. after Win key minimize), fullscreenchange
  // won't fire when re-requesting, so dismiss the overlay directly.
  // A short delay lets the browser settle before we check.
  setTimeout(() => {
    if (isFullscreen()) dismissViolationOverlay();
  }, 300);
}

function exitFullscreen() {
  const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
  if (exit) exit.call(document).catch(() => {});
}

function setupAntiCheat() {
  // ── Fullscreen detection (cross-browser) ──────────────────────
  // Chrome/Edge: fullscreenchange + document.fullscreenElement
  // Safari:      webkitfullscreenchange + document.webkitFullscreenElement
  // Firefox:     mozfullscreenchange   + document.mozFullScreenElement

  function handleFullscreenChange() {
    if (!_antiCheatReady) return;
    if (isFullscreen()) {
      dismissViolationOverlay();
    } else {
      triggerViolation('fullscreen_exit');
    }
  }

  document.addEventListener('fullscreenchange',       handleFullscreenChange);
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
  document.addEventListener('mozfullscreenchange',    handleFullscreenChange);
  document.addEventListener('MSFullscreenChange',     handleFullscreenChange);

  // ── Tab / window visibility (catches Alt+Tab, Win key, tab switching) ──
  document.addEventListener('visibilitychange', () => {
    if (!_antiCheatReady) return;
    if (document.visibilityState === 'hidden') {
      triggerViolation('tab_switch');
    } else {
      // They came back — if we're still in fullscreen (e.g. Win key minimize,
      // Alt+Tab) fullscreenchange never fires, so we must dismiss here.
      // If fullscreen was also exited, fullscreenchange fires separately and
      // triggerViolation('fullscreen_exit') will re-show the overlay, so it's
      // safe to dismiss optimistically here first.
      if (isFullscreen()) {
        dismissViolationOverlay();
      }
      // If NOT in fullscreen when they return, fullscreenchange already fired
      // (or will fire) and the overlay stays up — don't dismiss.
    }
  });

  // ── Block & detect Ctrl+C / Ctrl+X / Ctrl+V and F6/Ctrl+L (address bar) ──
  document.addEventListener('keydown', (e) => {
    if (!_antiCheatReady) return;
    const key = e.key.toUpperCase();
    const ctrl = e.ctrlKey || e.metaKey;

    // Block Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+A
    if (ctrl && ['C','X','V','A'].includes(key)) {
      e.preventDefault();
      if (key === 'V') triggerViolation('paste');
      else if (key === 'C' || key === 'X') triggerViolation('copy');
      else if (key === 'A') triggerViolation('select_all');
      return;
    }

    // Block F6 and Ctrl+L (focus address bar) and Ctrl+T (new tab) and Ctrl+W
    if (e.key === 'F6' || (ctrl && ['L','T','W','N'].includes(key))) {
      e.preventDefault();
      triggerViolation('address_bar');
      return;
    }

    // Block F12 (DevTools)
    if (e.key === 'F12' || (ctrl && e.shiftKey && ['I','J','C'].includes(key))) {
      e.preventDefault();
      triggerViolation('devtools');
      return;
    }
  });

  // Fallback copy/paste via mouse (right-click already blocked, but belt-and-suspenders)
  document.addEventListener('copy',  (e) => { if (_antiCheatReady) { e.preventDefault(); triggerViolation('copy'); } });
  document.addEventListener('cut',   (e) => { if (_antiCheatReady) { e.preventDefault(); triggerViolation('copy'); } });
  document.addEventListener('paste', (e) => { if (_antiCheatReady) { e.preventDefault(); triggerViolation('paste'); } });

  // ── Block right-click silently ────────────────────────────────
  document.addEventListener('contextmenu', (e) => { e.preventDefault(); });

  // ── Window blur/focus fallback ─────────────────────────────────
  // Catches cases where visibilitychange doesn't fire (some OS/browser combos).
  // blur = window lost focus (Win key, OS notification, etc.)
  // focus = window regained focus
  window.addEventListener('blur', () => {
    if (!_antiCheatReady) return;
    // Only trigger if visibilitychange didn't already handle it
    // (avoid double-violation — visibilitychange fires first on tab switch,
    // blur fires after, so we check: if already in violation state, skip)
    if (!testState.violationActive) {
      triggerViolation('window_blur');
    }
  });

  window.addEventListener('focus', () => {
    if (!_antiCheatReady) return;
    // Return from blur — dismiss if we're back in fullscreen
    if (isFullscreen()) {
      dismissViolationOverlay();
    }
  });

  // Give 2 seconds to settle after test starts before arming
  setTimeout(() => { _antiCheatReady = true; }, 2000);
}

function triggerViolation(type) {
  if (!testState.teamId || !testState.submission || testState.submission?.submitted) return;

  // Log to DB in background
  window.db.from('violations').insert({
    team_id: testState.teamId,
    type,
    timestamp: new Date().toISOString(),
  }).then(() => {}).catch(() => {});

  // Beep
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch {}

  // "soft" violations (copy/paste/devtools/address bar): show overlay but
  // let user dismiss it with a button — don't force them to re-enter fullscreen.
  // "hard" violations (fullscreen exit, tab switch): must re-enter fullscreen to dismiss.
  const softViolations = ['copy', 'paste', 'select_all', 'devtools', 'address_bar'];
  const isSoft = softViolations.includes(type);
  showViolationOverlay(isSoft);
}

function dismissViolationOverlay() {
  clearInterval(testState.violationCountdown);
  testState.violationCountdown = null;
  testState.violationActive = false;
  const overlay = document.getElementById('violation-overlay');
  if (overlay) overlay.classList.remove('active');
  const banner = document.getElementById('fullscreen-warning');
  if (banner) banner.classList.remove('visible');
}

function showViolationOverlay(isSoft = false) {
  // Always restart the countdown fresh
  clearInterval(testState.violationCountdown);
  testState.violationActive = true;

  const overlay = document.getElementById('violation-overlay');
  const banner = document.getElementById('fullscreen-warning');
  const subEl = document.getElementById('violation-sub');
  const hintEl = document.getElementById('violation-hint');
  const dismissBtn = document.getElementById('violation-dismiss-btn');
  const returnBtn = document.getElementById('violation-return-btn');

  overlay.classList.add('active');
  if (banner) banner.classList.add('visible');

  if (isSoft) {
    // Copy/paste/devtools/address-bar warning — user can acknowledge and continue
    if (subEl) subEl.textContent = 'This action is not allowed during the test. This violation has been logged.';
    if (hintEl) hintEl.textContent = 'Click "I Understand" to continue. Further violations may auto-submit your test.';
    if (dismissBtn) dismissBtn.style.display = 'inline-block';
    if (returnBtn) returnBtn.style.display = 'none';
  } else {
    // Fullscreen exit / tab switch — must return to fullscreen to dismiss
    if (subEl) subEl.textContent = 'You exited the test environment. Return to fullscreen immediately or your test will be auto-submitted.';
    if (hintEl) hintEl.textContent = 'Re-entering fullscreen will cancel the countdown';
    if (dismissBtn) dismissBtn.style.display = 'none';
    if (returnBtn) returnBtn.style.display = 'inline-block';
  }

  let secs = 10;
  const countEl = document.getElementById('violation-countdown');
  countEl.textContent = secs;

  testState.violationCountdown = setInterval(() => {
    secs--;
    countEl.textContent = secs;
    if (secs <= 0) {
      clearInterval(testState.violationCountdown);
      autoSubmit();
    }
  }, 1000);
}
function setupSignOut() {
  $$('#signout-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await window.db.auth.signOut();
      window.location.href = 'index.html';
    });
  });
}

// ============================================================
// PAGE: admin.html
// ============================================================
let adminState = {
  session: null,
  teams: [],
  submissions: [],
  grades: [],
  violations: [],
  questions: [],
};

async function initAdminPage() {
  const session = await requireAdmin();
  if (!session) return;
  adminState.session = session;

  hideLoading();
  document.getElementById('admin-shell')?.classList.remove('hidden');
  setupAdminNav();
  await loadAdminData();
  renderDashboard();

  document.getElementById('create-team-btn')?.addEventListener('click', () => openCreateTeamModal());
  document.getElementById('modal-close-btn')?.addEventListener('click', closeModal);
  document.getElementById('admin-signout')?.addEventListener('click', async () => {
    await window.db.auth.signOut();
    window.location.href = 'index.html';
  });
  document.getElementById('team-form')?.addEventListener('submit', handleCreateTeam);
  document.getElementById('refresh-btn')?.addEventListener('click', async () => {
    await loadAdminData();
    renderCurrentTab();
  });
}

function setupAdminNav() {
  $$('.nav-item[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $$('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('tab-' + btn.dataset.tab)?.classList.add('active');
      renderCurrentTab();
    });
  });
}

function renderCurrentTab() {
  const active = $('.nav-item.active')?.dataset.tab;
  if (active === 'dashboard') renderDashboard();
  else if (active === 'teams') renderTeams();
  else if (active === 'submissions') renderSubmissions();
  else if (active === 'grades') renderGrades();
  else if (active === 'violations') renderViolations();
}

async function loadAdminData() {
  const [teams, submissions, grades, violations, questions] = await Promise.all([
    window.db.from('teams').select('*').order('created_at', { ascending: false }),
    window.db.from('submissions').select('*').order('created_at', { ascending: false }),
    window.db.from('grades').select('*').order('graded_at', { ascending: false }),
    window.db.from('violations').select('*').order('timestamp', { ascending: false }),
    window.db.from('questions').select('id, question, type, options').order('id'),
  ]);

  adminState.teams = teams.data || [];
  adminState.submissions = submissions.data || [];
  adminState.grades = grades.data || [];
  adminState.violations = violations.data || [];
  adminState.questions = questions.data || [];
}

function renderDashboard() {
  const submitted = adminState.submissions.filter(s => s.submitted).length;
  document.getElementById('stat-teams').textContent = adminState.teams.length;
  document.getElementById('stat-submitted').textContent = submitted;
  document.getElementById('stat-violations').textContent = adminState.violations.length;
  document.getElementById('stat-graded').textContent = adminState.grades.length;
}

function renderTeams() {
  const tbody = document.getElementById('teams-tbody');
  if (!tbody) return;
  if (!adminState.teams.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center muted" style="padding:2rem">No teams yet.</td></tr>';
    return;
  }
  tbody.innerHTML = adminState.teams.map(t => {
    const sub = adminState.submissions.find(s => s.team_id === t.team_id);
    const grade = adminState.grades.find(g => g.team_id === t.team_id);
    const violationCount = adminState.violations.filter(v => v.team_id === t.team_id).length;
    const status = sub?.submitted ? `<span class="badge badge-success">✓ Submitted</span>`
                 : sub ? `<span class="badge badge-warning">⏳ In Progress</span>`
                 : `<span class="badge badge-info">– Not Started</span>`;
    return `<tr>
      <td><strong>${escHtml(t.school_name)}</strong></td>
      <td class="mono">${escHtml(t.team_id)}</td>
      <td>${escHtml([t.student1,t.student2,t.student3].filter(Boolean).join(', '))}</td>
      <td class="mono" style="color:var(--text3)">${escHtml(t.password)}</td>
      <td>${status}</td>
      <td>${grade ? `<span class="badge badge-info">${grade.score}</span>` : '—'}</td>
      <td>${violationCount > 0 ? `<span class="badge badge-danger">${violationCount}</span>` : '<span style="color:var(--text3)">0</span>'}</td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="deleteTeam('${t.id}', '${t.team_id}')">Delete</button>
        ${sub?.submitted ? `<button class="btn btn-sm btn-success" style="margin-left:4px" onclick="openGradeModal('${t.team_id}')">Grade</button>` : ''}
      </td>
    </tr>`;
  }).join('');
}

function renderSubmissions() {
  const tbody = document.getElementById('submissions-tbody');
  if (!tbody) return;
  if (!adminState.submissions.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center muted" style="padding:2rem">No submissions yet.</td></tr>';
    return;
  }
  tbody.innerHTML = adminState.submissions.map(s => {
    const answered = s.answers ? Object.keys(s.answers).length : 0;
    return `<tr>
      <td class="mono">${escHtml(s.team_id)}</td>
      <td>${s.submitted ? '<span class="badge badge-success">✓ Submitted</span>' : '<span class="badge badge-warning">In Progress</span>'}</td>
      <td class="mono">${s.start_time ? new Date(s.start_time).toLocaleString() : '—'}</td>
      <td>${answered} / 12</td>
      <td><button class="btn btn-sm btn-ghost" onclick="viewAnswers('${s.id}')">View Answers</button></td>
    </tr>`;
  }).join('');
}

function renderGrades() {
  const tbody = document.getElementById('grades-tbody');
  if (!tbody) return;
  if (!adminState.grades.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center muted" style="padding:2rem">No grades yet.</td></tr>';
    return;
  }
  tbody.innerHTML = adminState.grades.map(g => {
    const team = adminState.teams.find(t => t.team_id === g.team_id);
    return `<tr>
      <td class="mono">${escHtml(g.team_id)}</td>
      <td>${escHtml(team?.school_name || '—')}</td>
      <td><strong style="color:var(--accent);font-size:1.1rem">${g.score}</strong></td>
      <td class="mono muted">${new Date(g.graded_at).toLocaleString()}</td>
    </tr>`;
  }).join('');
}

function renderViolations() {
  const tbody = document.getElementById('violations-tbody');
  if (!tbody) return;
  if (!adminState.violations.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center muted" style="padding:2rem">No violations recorded.</td></tr>';
    return;
  }
  tbody.innerHTML = adminState.violations.map(v => `<tr>
    <td class="mono">${escHtml(v.team_id)}</td>
    <td><span class="badge badge-danger">${escHtml(v.type)}</span></td>
    <td class="mono muted">${new Date(v.timestamp).toLocaleString()}</td>
  </tr>`).join('');
}

// ── Create Team ────────────────────────────────────────────────
function openCreateTeamModal() {
  document.getElementById('modal-new-team').classList.add('open');
  document.getElementById('generated-creds').classList.add('hidden');
  // Reset steps
  [1,2,3].forEach(n => {
    document.getElementById(`step-${n}-icon`).textContent = '○';
    document.getElementById(`step-${n}-icon`).style.color = 'var(--text3)';
    document.getElementById(`step-${n}-txt`).style.color = 'var(--text3)';
  });
  document.getElementById('create-progress').classList.add('hidden');
}

function closeModal() {
  document.getElementById('modal-new-team').classList.remove('open');
}

async function handleCreateTeam(e) {
  e.preventDefault();
  const school  = document.getElementById('school-name').value.trim();
  const s1      = document.getElementById('student1').value.trim();
  const s2      = document.getElementById('student2').value.trim();
  const s3      = document.getElementById('student3').value.trim();

  if (!school) return;

  const baseId   = genTeamId(school, [s1, s2, s3]);  // e.g. dps-amo
  // Resolve collisions: if baseId exists, try baseId-2, baseId-3, …
  let teamId = baseId;
  {
    const existingIds = adminState.teams.map(t => t.team_id);
    let suffix = 2;
    while (existingIds.includes(teamId)) {
      teamId = `${baseId}-${suffix++}`;
    }
  }
  const password = genPassword();
  const email    = `${teamId}@decagon.com`;

  const submitBtn = document.getElementById('create-team-submit');
  const progress = document.getElementById('create-progress');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating…';
  progress.classList.remove('hidden');

  function setStep(n, state) {
    const icon = document.getElementById(`step-${n}-icon`);
    const txt  = document.getElementById(`step-${n}-txt`);
    if (!icon) return;
    if (state === 'active')  { icon.textContent = '●'; icon.style.color = 'var(--warning)'; txt.style.color = 'var(--text)'; }
    if (state === 'done')    { icon.textContent = '✓'; icon.style.color = 'var(--success)'; txt.style.color = 'var(--success)'; }
    if (state === 'error')   { icon.textContent = '✕'; icon.style.color = 'var(--danger)';  txt.style.color = 'var(--danger)'; }
  }

  try {
    setStep(1, 'active');
    const { data: { session } } = await window.db.auth.getSession();
    setStep(1, 'done');
    setStep(2, 'active');

    const fnUrl = window.db.supabaseUrl + '/functions/v1/create-team';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let res;
    try {
      res = await fetch(fnUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          school_name: school,
          student1: s1 || null,
          student2: s2 || null,
          student3: s3 || null,
          team_id: teamId,
          password,
        }),
      });
    } finally {
      clearTimeout(timeout);
    }

    setStep(2, 'done');
    setStep(3, 'active');

    const result = await res.json();

    if (!res.ok || result.error) {
      throw new Error(result.error || 'Failed to create team');
    }

    setStep(3, 'done');

    // Show credentials
    document.getElementById('cred-email').textContent    = email;
    document.getElementById('cred-password').textContent = password;
    document.getElementById('cred-teamid').textContent   = teamId;
    document.getElementById('generated-creds').classList.remove('hidden');
    document.getElementById('manual-warning').classList.add('hidden');

    // Reload data
    await loadAdminData();
    renderTeams();
    renderDashboard();

  } catch (err) {
    setStep(1, 'error'); setStep(2, 'error'); setStep(3, 'error');
    const msg = err.name === 'AbortError' ? 'Request timed out (15s). Is the Edge Function deployed?' : err.message;
    showAlert(document.getElementById('modal-alert'), 'error', msg);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Team';
  }
}

window.deleteTeam = async (id, teamId) => {
  if (!confirm(`Delete team ${teamId}? This also deletes their submission and auth account.`)) return;

  // Delete DB rows first
  await window.db.from('submissions').delete().eq('team_id', teamId);
  await window.db.from('grades').delete().eq('team_id', teamId);
  await window.db.from('violations').delete().eq('team_id', teamId);
  await window.db.from('teams').delete().eq('id', id);

  // Delete the Supabase Auth user via edge function
  try {
    const { data: { session } } = await window.db.auth.getSession();
    const fnUrl = window.db.supabaseUrl + '/functions/v1/delete-team-user';
    await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ team_id: teamId }),
    });
  } catch (err) {
    console.warn('Auth user deletion failed (DB rows already deleted):', err.message);
  }

  await loadAdminData();
  renderTeams();
  renderDashboard();
};

window.viewAnswers = (subId) => {
  const sub = adminState.submissions.find(s => s.id === subId);
  if (!sub) return;
  let html = `<h3 style="margin-bottom:1rem">Answers: ${sub.team_id}</h3>`;
  const answers = sub.answers || {};
  adminState.questions.forEach((q, i) => {
    const ans = answers[q.id] || '<em style="color:var(--text3)">No answer</em>';
    html += `<div style="margin-bottom:1rem;padding:0.75rem;background:var(--bg3);border-radius:8px;border:1px solid var(--border)">
      <div style="font-size:0.78rem;color:var(--text3);margin-bottom:0.3rem">Q${i+1} · ${q.type.toUpperCase()}</div>
      <div style="margin-bottom:0.5rem;color:var(--text)">${escHtml(q.question)}</div>
      <div style="font-family:var(--font-mono);font-size:0.88rem;color:var(--accent)">${typeof ans === 'string' ? escHtml(ans) : ans}</div>
    </div>`;
  });
  document.getElementById('answers-modal-body').innerHTML = html;
  document.getElementById('modal-answers').classList.add('open');
};

window.openGradeModal = (teamId) => {
  const existing = adminState.grades.find(g => g.team_id === teamId);
  document.getElementById('grade-team-id').value = teamId;
  document.getElementById('grade-score').value = existing?.score || '';
  document.getElementById('modal-grade').classList.add('open');
};

// FIX: single grade form listener using window.db (removed duplicate from admin.html)
document.getElementById?.('grade-form')?.addEventListener?.('submit', async (e) => {
  e.preventDefault();
  const teamId = document.getElementById('grade-team-id').value;
  const score  = parseFloat(document.getElementById('grade-score').value);
  const existing = adminState.grades.find(g => g.team_id === teamId);
  if (existing) {
    await window.db.from('grades').update({ score, graded_at: new Date().toISOString() }).eq('id', existing.id);
  } else {
    await window.db.from('grades').insert({ team_id: teamId, score });
  }
  document.getElementById('modal-grade').classList.remove('open');
  await loadAdminData();
  renderGrades();
  renderTeams();
});

// Close any modal clicking backdrop
$$('.modal-backdrop').forEach(el => {
  el.addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('open');
  });
});

// ── Route to correct init ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page === 'login')  initLoginPage();
  if (page === 'test')   initTestPage();
  if (page === 'admin')  initAdminPage();
});
