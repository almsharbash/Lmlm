/* LMLM v4 — التطبيق الكامل
 * - اسم عرض حرّ (عربي/مكرر) + معرّف فريد تلقائي، والبريد هو هوية الحساب
 * - عمل دون اتصال: كاش IndexedDB + صندوق إرسال مؤجّل
 * - يتطلب تنفيذ sql/setup.sql على Supabase
 */

/* ================= الإعدادات ================= */
const SUPA_URL = 'https://srvjzrrlkdyrywkhbzdi.supabase.co';
const SUPA_KEY = 'sb_publishable_1iTsxT3RzrKNY04jzxKNvQ_mGvIPxDo';
const FN = 'clever-processor';
const RIM = 'lmlm.local';
const HANDLE_RE = /^[A-Za-z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIB_URLS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm',
  'https://esm.sh/@supabase/supabase-js@2.45.4',
];
const PCOLS = 'id, username, name, photo, bio, city, link, last_seen';
const PAGE = 60;

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
let sb = null;

/* ================= أدوات عامة ================= */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BIDI = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const cleanName = (s) => String(s || '').replace(BIDI, '').replace(/\s+/g, ' ').trim().slice(0, 40);
const arDigits = (s) => (s || '').replace(/[\u0660-\u0669]/g, (d) => d.charCodeAt(0) - 0x660).replace(/[\u06F0-\u06F9]/g, (d) => d.charCodeAt(0) - 0x6F0);
const cleanHandle = (s) => arDigits(s).trim().replace(/^@/, '').toLowerCase();
const normPhone = (s) => arDigits(s).replace(/[^\d+]/g, '');
const timeOf = (iso) => new Date(iso).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
const dayLabel = (iso) => {
  const d = new Date(iso), now = new Date();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'اليوم';
  if (d.toDateString() === y.toDateString()) return 'أمس';
  return d.toLocaleDateString('ar', { day: 'numeric', month: 'long', year: 'numeric' });
};
const initial = (p) => Array.from((p && (p.name || p.username)) || '?')[0] || '?';
const nameOf = (id) => (people[id] ? (people[id].name || people[id].username) : '…');
const isOnline = () => navigator.onLine !== false;
const isNetErr = (e) => !isOnline() || /failed to fetch|networkerror|network request|load failed|fetch|timeout/i.test(String((e && (e.message || e.name)) || e || ''));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const pickFrom = (n, set) => { const a = new Uint32Array(n); crypto.getRandomValues(a); return Array.from(a, (x) => set[x % set.length]).join(''); };
function genPassword() {
  const arr = (pickFrom(7, 'abcdefghjkmnpqrstuvwxyz') + pickFrom(2, 'ABCDEFGHJKMNPQRSTUVWXYZ') + pickFrom(2, '23456789') + pickFrom(1, '!@#$%&*')).split('');
  const r = new Uint32Array(arr.length); crypto.getRandomValues(r);
  for (let i = arr.length - 1; i > 0; i--) { const j = r[i] % (i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return 'lm' + arr.join('');
}
const genHandle = () => 'u' + pickFrom(8, '0123456789');

function setAv(el, photo, letter) {
  el.style.backgroundImage = photo ? `url("${String(photo).replace(/["\\()\s]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'))}")` : '';
  el.textContent = photo ? '' : letter;
}
function setBusy(btn, on, label = 'جارٍ…') {
  if (!btn) return;
  if (on) { if (!btn.dataset.o) btn.dataset.o = btn.innerHTML; btn.textContent = label; btn.disabled = true; }
  else { if (btn.dataset.o) btn.innerHTML = btn.dataset.o; delete btn.dataset.o; btn.disabled = false; }
}
function shake(el) { if (!el) return; el.classList.add('error'); el.focus(); setTimeout(() => el.classList.remove('error'), 900); }
function showErr(el, text) { el.textContent = text || ''; el.hidden = !text; }
function toast(msg, type = '', ms = 2800) {
  const el = document.createElement('div');
  el.className = 'toast ' + type; el.textContent = msg;
  $('toasts').append(el);
  setTimeout(() => el.remove(), ms);
}
function busy(msg) {
  const el = document.createElement('div');
  el.className = 'busy';
  el.innerHTML = '<div class="spin"></div><span></span>';
  el.querySelector('span').textContent = msg;
  document.body.append(el);
  return () => el.remove();
}
const needNet = () => (isOnline() ? true : (toast('هذه العملية تحتاج اتصالاً بالإنترنت', 'error'), false));

/* ================= الإعدادات المحلية ================= */
const DEF = { theme: 'system', accent: '#1E9BF0', fs: '15', wall: true, notif: false };
const load = (k, d) => { try { return { ...d, ...JSON.parse(localStorage.getItem(k) || 'null') }; } catch { return { ...d }; } };
let st = load('lmlm-settings', DEF);
let cs = {};
try { cs = JSON.parse(localStorage.getItem('lmlm-chats') || '{}'); } catch {}
const saveSt = () => { try { localStorage.setItem('lmlm-settings', JSON.stringify(st)); } catch {} };
const saveCs = () => { try { localStorage.setItem('lmlm-chats', JSON.stringify(cs)); } catch {} };
const cOf = (id) => cs[id] || (cs[id] = {});

/* ================= كاش IndexedDB ================= */
const store = {
  db: null, p: null,
  open() {
    if (this.p) return this.p;
    this.p = new Promise((res) => {
      try {
        const r = indexedDB.open('lmlm-cache', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => { this.db = r.result; res(true); };
        r.onerror = r.onblocked = () => res(false);
      } catch { res(false); }
    });
    return this.p;
  },
  async get(k) {
    if (!(await this.open())) return undefined;
    return new Promise((res) => {
      try { const r = this.db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); } catch { res(undefined); }
    });
  },
  async set(k, v) {
    if (!(await this.open())) return;
    return new Promise((res) => {
      try { const t = this.db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = t.onabort = () => res(); } catch { res(); }
    });
  },
  async clear() {
    if (!(await this.open())) return;
    return new Promise((res) => {
      try { const t = this.db.transaction('kv', 'readwrite'); t.objectStore('kv').clear(); t.oncomplete = () => res(); t.onerror = t.onabort = () => res(); } catch { res(); }
    });
  },
};

/* ================= الحالة ================= */
let me = null, profile = {}, chats = [], people = {}, msgs = [], active = null, hasMore = false;
let replyTo = null, editing = null, selId = null, filter = 'all', query = '', chatQ = '';
let channel = null, typingCh = null, presenceCh = null, typingTimer = null, lastTypingSent = 0;
let rec = null, chunks = [];
let reactMap = {}, readMap = {};
let outbox = [], flushing = false;
let contactIds = [], blocked = new Set(), addFound = null;
let pending = null, rcdTimer = null, entering = false;
const blobUrls = new Map();

/* ================= المظهر ================= */
function applyLook() {
  const dark = st.theme === 'dark' || (st.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.style.setProperty('--acc', st.accent);
  root.style.setProperty('--deep', st.accent);
  root.style.setProperty('--fs', st.fs + 'px');
  $('msgs').style.background = st.wall ? '' : 'var(--bg)';
  document.querySelectorAll('#themeSeg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.theme === st.theme));
  document.querySelectorAll('#fontSeg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.fs === st.fs));
  document.querySelectorAll('.swatch').forEach((b) => b.setAttribute('aria-pressed', b.dataset.c === st.accent));
  $('wallToggle').checked = st.wall;
  $('notifToggle').checked = !!st.notif && 'Notification' in window && Notification.permission === 'granted';
  $('chat').querySelector('.bgdots').hidden = !st.wall;
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = st.accent;
}
['#1E9BF0', '#7C5CFF', '#0E3A8C', '#00B894', '#FF7A59', '#E84393', '#2D3436'].forEach((c) => {
  const b = document.createElement('button');
  b.className = 'swatch'; b.dataset.c = c; b.style.background = c; b.setAttribute('aria-label', 'لون ' + c);
  b.onclick = () => { st.accent = c; saveSt(); applyLook(); };
  $('swatches').append(b);
});
document.querySelectorAll('#themeSeg button').forEach((b) => b.onclick = () => { st.theme = b.dataset.theme; saveSt(); applyLook(); });
document.querySelectorAll('#fontSeg button').forEach((b) => b.onclick = () => { st.fs = b.dataset.fs; saveSt(); applyLook(); });
$('wallToggle').onchange = (e) => { st.wall = e.target.checked; saveSt(); applyLook(); };
$('notifToggle').onchange = async (e) => {
  if (!e.target.checked) { st.notif = false; saveSt(); return; }
  if (!('Notification' in window)) { e.target.checked = false; return toast('المتصفح لا يدعم الإشعارات', 'error'); }
  const p = await Notification.requestPermission();
  st.notif = p === 'granted'; saveSt(); e.target.checked = st.notif;
  if (!st.notif) toast('لم يُسمح بالإشعارات', 'error');
};
$('resetSet').onclick = () => { st = { ...DEF }; saveSt(); applyLook(); toast('تمت إعادة الضبط', 'success'); };
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyLook);

/* ================= النوافذ والتبديلات ================= */
const openSheet = (id) => { $(id).hidden = false; };
const closeAll = () => document.querySelectorAll('.overlay').forEach((o) => (o.hidden = true));
document.querySelectorAll('[data-close]').forEach((b) => b.onclick = closeAll);
document.querySelectorAll('.overlay').forEach((o) => o.addEventListener('click', (e) => { if (e.target === o) closeAll(); }));
document.querySelectorAll('[data-toggle]').forEach((b) => b.onclick = () => {
  const i = $(b.dataset.toggle); i.type = i.type === 'password' ? 'text' : 'password';
});

/* ================= حالة الشبكة ================= */
function paintNet() {
  const b = $('netbar');
  const n = outbox.filter((o) => !o.failed).length;
  if (!isOnline()) {
    b.textContent = 'أنت غير متصل' + (n ? ` · ${n} رسالة بانتظار الإرسال` : ' · تُعرض البيانات المحفوظة');
    b.hidden = false;
  } else if (flushing && n) {
    b.textContent = 'جارٍ إرسال الرسائل المعلّقة…';
    b.hidden = false;
  } else b.hidden = true;
  document.body.classList.toggle('offline', !isOnline());
}
window.addEventListener('offline', () => { paintNet(); });
window.addEventListener('online', () => { paintNet(); toast('عاد الاتصال', 'success', 1800); resync(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && me) resync(); });

let lastSync = 0;
async function resync() {
  if (!me || !isOnline()) return;
  if (Date.now() - lastSync < 3000) return;
  lastSync = Date.now();
  // تأكد أن الجلسة ما زالت صالحة بعد انقطاع طويل
  try {
    const { data, error } = await sb.auth.getSession();
    if (!data.session && !(error && isNetErr(error))) return forceLogout('انتهت الجلسة، سجّل الدخول من جديد');
  } catch {}
  await flushOutbox();
  await loadChats();
  if (active) await loadMessages();
  if (!channel) subscribe();
}

/* ================= المصادقة: الواجهة ================= */
const AUTH_VIEWS = ['loginForm', 'chooseForm', 'rimForm', 'regForm', 'verifyBox', 'genBox'];
function showView(id) {
  $('boot').hidden = true;
  $('app').hidden = true;
  $('auth').hidden = false;
  AUTH_VIEWS.forEach((x) => ($(x).hidden = x !== id));
  window.onbeforeunload = id === 'genBox' ? (e) => { e.preventDefault(); e.returnValue = ''; } : null;
  const first = $(id).querySelector('input:not([type=checkbox])');
  if (first && matchMedia('(pointer:fine)').matches) first.focus();
}
document.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => {
  ['lErr', 'rimErr', 'rErr', 'vErr'].forEach((id) => showErr($(id), ''));
  showView(b.dataset.go);
});

function authMsg(error) {
  const m = String((error && error.message) || '').toLowerCase();
  const stt = error && error.status;
  if (isNetErr(error) || (error && error.name === 'AuthRetryableFetchError')) return 'تعذّر الاتصال بالخادم. تحقق من الإنترنت وأعد المحاولة';
  if (/invalid login|invalid credentials/.test(m)) return 'البريد/المعرّف أو كلمة المرور غير صحيحة';
  if (stt === 429 || /rate limit|too many|security purposes/.test(m)) return 'محاولات كثيرة. انتظر دقيقة ثم أعد المحاولة';
  if (/already registered|already been registered|already exists/.test(m)) return 'هذا البريد مسجّل مسبقاً. سجّل الدخول بدلاً من ذلك';
  if (/same password|different from the old/.test(m)) return 'كلمة المرور الجديدة يجب أن تختلف عن الحالية';
  if (/password/.test(m) && /(least|short|weak|characters)/.test(m)) return 'كلمة المرور ضعيفة أو قصيرة';
  if (/email/.test(m) && /(invalid|valid)/.test(m)) return 'بريد إلكتروني غير صالح';
  if (/signups? not allowed|signup.*disabled/.test(m)) return 'إنشاء الحسابات متوقف حالياً';
  if (/token.*(expired|invalid)|otp/.test(m)) return 'الرمز غير صحيح أو منتهٍ. اضغط إعادة الإرسال';
  if (/sending|smtp|confirmation email|error sending/.test(m)) return 'تعذّر إرسال البريد حالياً. حاول لاحقاً';
  console.error('[auth]', error);
  return 'حدث خطأ غير متوقع' + (error && error.message ? ' (' + error.message + ')' : '');
}

async function fnMsg(error, data) {
  let body = data && typeof data === 'object' ? data : null;
  const status = error && error.context && error.context.status;
  if (error && error.context && typeof error.context.text === 'function') {
    try { const t = await error.context.text(); try { body = JSON.parse(t); } catch { body = { error: t }; } } catch {}
  }
  const raw = String((body && (body.error || body.message)) || (error && error.message) || '');
  console.error('[instant-account]', status, raw, error);
  if (!isOnline()) return 'تعذّر الاتصال بالإنترنت';
  if (status === 409 || /taken|already|exists/i.test(raw)) return 'المعرّف محجوز، اختر معرّفاً آخر أو اتركه فارغاً';
  if (status === 400 && /invalid username/i.test(raw)) return 'المعرّف غير صالح';
  if (status === 429) return 'محاولات كثيرة، انتظر قليلاً ثم أعد المحاولة';
  if (status === 401 || status === 403) return `الخدمة رفضت الطلب (${status}). يلزم تعطيل Verify JWT للدالة. جرّب التسجيل بالبريد`;
  if (status === 404 || /failed to send a request|relay error|not found/i.test(raw)) return 'خدمة الحساب الفوري غير متاحة حالياً. جرّب التسجيل بالبريد';
  return 'تعذّر إنشاء الحساب' + (status ? ` (${status})` : '') + '. حاول مجدداً أو سجّل بالبريد';
}

async function handleFree(h) {
  try {
    const { data, error } = await sb.rpc('username_available', { u: h });
    if (!error && typeof data === 'boolean') return data;
  } catch {}
  return null;
}

$('rPass').addEventListener('input', () => {
  const v = $('rPass').value;
  let s = 0;
  if (v.length >= 8) s++; if (v.length >= 12) s++; if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++; if (/\d/.test(v)) s++; if (/[^A-Za-z0-9]/.test(v)) s++;
  const bar = $('rStr');
  bar.style.width = (v ? Math.max(12, s * 20) : 0) + '%';
  bar.style.background = s <= 2 ? 'var(--danger)' : s <= 3 ? '#F59E0B' : 'var(--ok)';
});
$('vCode').oninput = (e) => { e.target.value = arDigits(e.target.value).replace(/\D/g, ''); };

/* ---- تسجيل الدخول ---- */
$('loginForm').onsubmit = async (e) => {
  e.preventDefault();
  showErr($('lErr'), '');
  const raw = $('lId').value.trim();
  const pw = $('lPass').value;
  if (!raw) return shake($('lId'));
  if (!pw) return shake($('lPass'));
  const id = raw.includes('@') ? raw.toLowerCase() : cleanHandle(raw);
  const email = id.includes('@') ? id : `${id}@${RIM}`;
  setBusy($('lBtn'), true, 'جارٍ الدخول…');
  let res;
  try { res = await sb.auth.signInWithPassword({ email, password: pw }); } catch (x) { res = { error: x }; }
  setBusy($('lBtn'), false);
  if (res.error) {
    if (/not confirmed/i.test(res.error.message || '')) {
      pending = { kind: 'mail', email, name: '', handle: '' };
      $('vTo').textContent = email; $('vCode').value = '';
      showView('verifyBox');
      try { await sb.auth.resend({ type: 'signup', email }); toast('أرسلنا رمز تحقق جديداً', 'success'); } catch {}
      startCountdown();
      return;
    }
    showErr($('lErr'), authMsg(res.error));
    return shake($('lPass'));
  }
  $('lPass').value = '';
  await enterApp(res.data.session && res.data.session.user);
};

/* ---- حساب فوري: اسم حرّ + معرّف اختياري ---- */
$('rimForm').onsubmit = async (e) => {
  e.preventDefault();
  showErr($('rimErr'), '');
  const name = cleanName($('rimName').value);
  let handle = cleanHandle($('rimUser').value);
  if (!name) { showErr($('rimErr'), 'اكتب اسمك (يمكن أن يكون بالعربية ويتكرر مع غيرك)'); return shake($('rimName')); }
  if (handle && !HANDLE_RE.test(handle)) { showErr($('rimErr'), 'المعرّف من 3 إلى 20 حرفاً إنجليزياً أو أرقاماً أو _'); return shake($('rimUser')); }
  setBusy($('rimBtn'), true, 'جارٍ الإنشاء…');
  try {
    if (handle) {
      if ((await handleFree(handle)) === false) { showErr($('rimErr'), 'المعرّف محجوز، اختر معرّفاً آخر أو اتركه فارغاً'); return; }
    } else {
      for (let i = 0; i < 5; i++) { handle = genHandle(); if ((await handleFree(handle)) !== false) break; }
    }
    const pw = genPassword();
    let res;
    try { res = await sb.functions.invoke(FN, { body: { username: handle, password: pw, name } }); } catch (x) { res = { error: x }; }
    if (res.error || (res.data && res.data.error)) { showErr($('rimErr'), await fnMsg(res.error, res.data)); return; }
    pending = { kind: 'rim', handle, pw, name };
    $('genUser').textContent = handle;
    $('genPass').textContent = pw;
    $('genSaved').checked = false; $('genDone').disabled = true;
    showView('genBox');
  } finally { setBusy($('rimBtn'), false); }
};
$('genSaved').onchange = (e) => ($('genDone').disabled = !e.target.checked);
$('genCopy').onclick = async () => {
  if (!pending || pending.kind !== 'rim') return;
  try { await navigator.clipboard.writeText(`${pending.handle}\n${pending.pw}`); toast('تم نسخ المعرّف وكلمة المرور', 'success'); }
  catch { toast('تعذّر النسخ، انسخها يدوياً', 'error'); }
};
$('genDl').onclick = () => {
  if (!pending || pending.kind !== 'rim') return;
  const blob = new Blob([`LMLM\nusername: ${pending.handle}\npassword: ${pending.pw}\n`], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `lmlm-${pending.handle}.txt`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
$('genDone').onclick = async () => {
  if (!pending || pending.kind !== 'rim') return showView('loginForm');
  const p = pending;
  setBusy($('genDone'), true, 'جارٍ الدخول…');
  let res;
  try { res = await sb.auth.signInWithPassword({ email: `${p.handle}@${RIM}`, password: p.pw }); } catch (x) { res = { error: x }; }
  setBusy($('genDone'), false);
  pending = null; $('genPass').textContent = ''; $('genUser').textContent = '';
  if (res.error) { $('lId').value = p.handle; toast('تعذّر الدخول تلقائياً، سجّل الدخول بكلمة المرور', 'error', 4500); return showView('loginForm'); }
  await enterApp(res.data.session && res.data.session.user, { name: p.name });
};

/* ---- تسجيل بالبريد ---- */
$('regForm').onsubmit = async (e) => {
  e.preventDefault();
  showErr($('rErr'), '');
  const name = cleanName($('rName').value);
  const email = $('rEmail').value.trim().toLowerCase();
  const pw = $('rPass').value;
  const handle = cleanHandle($('rUser').value);
  if (!name) { showErr($('rErr'), 'اكتب اسمك (يمكن أن يكون بالعربية ويتكرر مع غيرك)'); return shake($('rName')); }
  if (!EMAIL_RE.test(email)) { showErr($('rErr'), 'بريد إلكتروني غير صحيح'); return shake($('rEmail')); }
  if (pw.length < 8) { showErr($('rErr'), 'كلمة المرور 8 أحرف على الأقل'); return shake($('rPass')); }
  if (handle && !HANDLE_RE.test(handle)) { showErr($('rErr'), 'المعرّف من 3 إلى 20 حرفاً إنجليزياً أو أرقاماً أو _'); return shake($('rUser')); }
  setBusy($('rBtn'), true, 'جارٍ الإرسال…');
  try {
    if (handle && (await handleFree(handle)) === false) { showErr($('rErr'), 'المعرّف محجوز، اختر معرّفاً آخر أو اتركه فارغاً'); return; }
    const { data, error } = await sb.auth.signUp({ email, password: pw, options: { data: { name, username: handle } } });
    if (error) { showErr($('rErr'), authMsg(error)); return; }
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      showErr($('rErr'), 'هذا البريد مسجّل مسبقاً. سجّل الدخول أو استخدم بريداً آخر'); return;
    }
    if (data.session) { // تأكيد البريد معطّل في Supabase: دخول مباشر
      $('rPass').value = '';
      return enterApp(data.session.user, { name, handle });
    }
    pending = { kind: 'mail', email, name, handle };
    $('vTo').textContent = email; $('vCode').value = ''; $('rPass').value = '';
    showView('verifyBox'); startCountdown();
    toast('أرسلنا الرمز إلى بريدك', 'success');
  } finally { setBusy($('rBtn'), false); }
};

function startCountdown() {
  let s = 60; const b = $('resendBtn');
  const paint = () => { b.textContent = s > 0 ? `إعادة الإرسال (${s})` : 'إعادة إرسال الرمز'; };
  b.disabled = true; paint();
  clearInterval(rcdTimer);
  rcdTimer = setInterval(() => { s--; paint(); if (s <= 0) { clearInterval(rcdTimer); b.disabled = false; } }, 1000);
}
$('resendBtn').onclick = async () => {
  if (!pending || pending.kind !== 'mail') return;
  $('resendBtn').disabled = true;
  const { error } = await sb.auth.resend({ type: 'signup', email: pending.email });
  if (error) { $('resendBtn').disabled = false; return toast(authMsg(error), 'error', 4000); }
  toast('أُعيد إرسال الرمز', 'success'); startCountdown();
};
$('verifyBox').onsubmit = async (e) => {
  e.preventDefault();
  showErr($('vErr'), '');
  if (!pending || pending.kind !== 'mail') return showView('loginForm');
  const code = $('vCode').value.trim();
  if (!code) return shake($('vCode'));
  setBusy($('verifyBtn'), true, 'جارٍ التحقق…');
  let res;
  try { res = await sb.auth.verifyOtp({ email: pending.email, token: code, type: 'signup' }); } catch (x) { res = { error: x }; }
  setBusy($('verifyBtn'), false);
  if (res.error) { showErr($('vErr'), authMsg(res.error)); return shake($('vCode')); }
  const p = pending; pending = null; clearInterval(rcdTimer);
  await enterApp(res.data && res.data.session ? res.data.session.user : undefined, { name: p.name, handle: p.handle });
};

/* ================= الملف الشخصي والجلسة ================= */
/* احتياطي إن لم يُثبَّت الـ Trigger: ينشئ الملف ويعيد المحاولة بمعرّف آخر عند التكرار */
async function ensureProfile(user, name, handle) {
  const nm = cleanName(name) || cleanName((user.user_metadata && user.user_metadata.name) || '') || (user.email || 'user').split('@')[0].slice(0, 40);
  let uname = HANDLE_RE.test(handle || '') ? handle.toLowerCase() : '';
  if (!uname && user.email && user.email.toLowerCase().endsWith('@' + RIM)) uname = user.email.split('@')[0].toLowerCase();
  if (!HANDLE_RE.test(uname)) uname = genHandle();
  for (let i = 0; i < 6; i++) {
    const { error } = await sb.from('profiles').insert({ id: user.id, username: uname, name: nm });
    if (!error) return;
    if (error.code === '23505') {
      const { data } = await sb.from('profiles').select('id').eq('id', user.id).maybeSingle();
      if (data) return;
      uname = genHandle(); continue;
    }
    throw error;
  }
  throw new Error('تعذّر إيجاد معرّف متاح');
}

async function loadProfile(user, hint) {
  if (isOnline()) {
    try {
      let { data, error } = await sb.from('profiles').select(PCOLS).eq('id', user.id).maybeSingle();
      if (error) throw error;
      if (!data) {
        await ensureProfile(user, hint && hint.name, hint && hint.handle);
        ({ data, error } = await sb.from('profiles').select(PCOLS).eq('id', user.id).maybeSingle());
        if (error) throw error;
      } else if (hint && hint.name && cleanName(hint.name) && data.name !== cleanName(hint.name) && hint.force) {
        await sb.from('profiles').update({ name: cleanName(hint.name) }).eq('id', user.id);
        data.name = cleanName(hint.name);
      }
      if (data) { store.set('profile', data); return data; }
    } catch (e) { if (!isNetErr(e)) throw e; }
  }
  const cached = await store.get('profile');
  return cached && cached.id === user.id ? cached : null;
}

async function enterApp(user, hint) {
  if (entering) return;
  entering = true;
  try {
    if (!user) {
      const r = await sb.auth.getSession();
      user = r.data && r.data.session && r.data.session.user;
    }
    if (!user) return showView('loginForm');
    const snap = await store.get('me');
    if (snap && snap.id !== user.id) await store.clear();
    me = user;
    store.set('me', { id: user.id, email: user.email, user_metadata: user.user_metadata || {} });
    // حساب فوري: الاسم الذي اختاره المستخدم يغلب أي اسم افتراضي من الدالة القديمة
    const h = hint && hint.name && user.email && user.email.toLowerCase().endsWith('@' + RIM) ? { ...hint, force: true } : hint;
    const prof = await loadProfile(user, h);
    if (!prof) { toast(isOnline() ? 'تعذّر تحميل حسابك' : 'لا توجد بيانات محفوظة للعمل دون اتصال', 'error', 4000); me = null; return showView('loginForm'); }
    profile = prof; people[me.id] = profile;
    const cachedPeople = (await store.get('people')) || {};
    people = { ...cachedPeople, ...people };
    outbox = ((await store.get('outbox')) || []).filter((o) => o.uid === me.id);
    chats = (await store.get('chats')) || [];
    contactIds = (await store.get('contacts')) || [];
    $('boot').hidden = true; $('auth').hidden = true; $('app').hidden = false;
    window.onbeforeunload = null;
    switchTab('chats'); paintSettingsProfile(); renderList(); paintNet();
    if (isOnline()) {
      await loadChats();
      subscribe(); subscribeTyping(); subscribePresence();
      loadContacts();
      flushOutbox();
    }
    const shared = sessionStorage.getItem('lmlm-share');
    if (shared) { sessionStorage.removeItem('lmlm-share'); openAddSheet(); $('aQ').value = shared; $('aFind').click(); }
  } catch (x) {
    console.error('[enterApp]', x);
    toast(authMsg(x), 'error', 5000);
    showView('loginForm');
  } finally { entering = false; }
}

async function loadPeople(ids) {
  const need = [...new Set(ids)].filter((id) => id && !people[id]);
  if (!need.length || !isOnline()) return;
  const { data } = await sb.from('profiles').select(PCOLS).in('id', need);
  (data || []).forEach((p) => (people[p.id] = p));
  store.set('people', people);
}

function resetState() {
  me = null; profile = {}; chats = []; msgs = []; active = null; outbox = []; contactIds = []; blocked = new Set();
  reactMap = {}; readMap = {}; pending = null;
  if (channel) { try { sb.removeChannel(channel); } catch {} channel = null; }
  if (typingCh) { try { sb.removeChannel(typingCh); } catch {} typingCh = null; }
  if (presenceCh) { try { sb.removeChannel(presenceCh); } catch {} presenceCh = null; }
  ['lId', 'lPass', 'rimName', 'rimUser', 'rName', 'rEmail', 'rPass', 'rUser', 'vCode', 'pPass'].forEach((i) => { if ($(i)) $(i).value = ''; });
  $('chat').classList.add('off');
  blobUrls.forEach((u) => URL.revokeObjectURL(u)); blobUrls.clear();
}
async function forceLogout(msg) {
  resetState();
  await store.clear();
  showView('loginForm');
  if (msg) toast(msg, '', 4000);
}

/* ================= التبويبات ================= */
const SOON = {
  updates: ['التحديثات', 'الحالات والقنوات قريباً', 'ستظهر هنا حالاتك وقنواتك المفضلة.'],
  communities: ['المجتمعات', 'المجتمعات قريباً', 'ستتمكن من تجميع مجموعاتك في مجتمع واحد.'],
  calls: ['المكالمات', 'المكالمات قريباً', 'المكالمات الصوتية والمرئية ستأتي في تحديث لاحق.'],
};
function switchTab(t) {
  $('tabChats').hidden = t !== 'chats';
  $('tabSettings').hidden = t !== 'settings';
  $('tabSoon').hidden = !SOON[t];
  $('tabNew').hidden = true; $('tabs').hidden = false;
  if (SOON[t]) { $('soonTitle').textContent = SOON[t][0]; $('soonH').textContent = SOON[t][1]; $('soonP').textContent = SOON[t][2]; }
  document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === t));
  if (t === 'settings') { applyLook(); paintSettingsProfile(); }
}
document.querySelectorAll('.tab').forEach((b) => b.onclick = () => switchTab(b.dataset.tab));
document.querySelectorAll('.chip').forEach((b) => b.onclick = () => {
  filter = b.dataset.filter;
  document.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-selected', c === b));
  renderList();
});
$('search').oninput = (e) => { query = e.target.value.trim(); renderList(); };
function paintSettingsProfile() {
  setAv($('setAv'), profile.photo, initial(profile));
  $('setName').textContent = profile.name || profile.username || '';
  $('setUser').textContent = profile.username ? '@' + profile.username : '';
}

/* ================= قائمة المحادثات ================= */
async function loadChats() {
  if (!me || !isOnline()) return;
  try {
    const { data: mine, error } = await sb.from('chat_members').select('chat_id, chats(id, kind, name, created_at)').eq('user_id', me.id);
    if (error) throw error;
    const rows = (mine || []).filter((r) => r.chats);
    const ids = rows.map((r) => r.chat_id);
    if (!ids.length) { chats = []; store.set('chats', chats); return renderList(); }
    const { data: mem, error: e2 } = await sb.from('chat_members').select('chat_id, user_id').in('chat_id', ids);
    if (e2) throw e2;
    await loadPeople((mem || []).map((m) => m.user_id));

    // ملخص المحادثات: آخر رسالة وغير المقروء (RPC) مع احتياطي إن لم تُنفَّذ setup.sql
    const lastBy = {}, unreadBy = {};
    const ov = await sb.rpc('chat_overview');
    if (!ov.error && Array.isArray(ov.data)) {
      ov.data.forEach((o) => {
        unreadBy[o.chat_id] = Number(o.unread) || 0;
        if (o.last_id) lastBy[o.chat_id] = { id: o.last_id, chat_id: o.chat_id, kind: o.last_kind, body: o.last_body, media_url: o.last_media_url, sender_id: o.last_sender, created_at: o.last_at };
      });
    } else {
      if (ov.error && isNetErr(ov.error)) throw ov.error;
      const { data: lastRows } = await sb.from('messages').select('id, chat_id, body, kind, created_at, sender_id, media_url')
        .in('chat_id', ids).order('created_at', { ascending: false }).limit(500);
      const { data: rd } = await sb.from('chat_reads').select('chat_id, last_read_at').eq('user_id', me.id).in('chat_id', ids);
      const readAt = {}; (rd || []).forEach((r) => (readAt[r.chat_id] = Date.parse(r.last_read_at)));
      (lastRows || []).forEach((m) => {
        if (!lastBy[m.chat_id]) lastBy[m.chat_id] = m;
        const since = Math.max(readAt[m.chat_id] || 0, cOf(m.chat_id).read || 0);
        if (m.sender_id !== me.id && Date.parse(m.created_at) > since) unreadBy[m.chat_id] = (unreadBy[m.chat_id] || 0) + 1;
      });
    }

    chats = rows.map((r) => {
      const c = r.chats;
      const members = (mem || []).filter((m) => m.chat_id === c.id).map((m) => m.user_id);
      const others = members.filter((id) => id !== me.id).map((id) => people[id]).filter(Boolean);
      const last = lastBy[c.id] || null;
      const peer = c.kind === 'direct' ? others[0] : null;
      return {
        id: c.id, kind: c.kind, members, count: members.length, last, unread: unreadBy[c.id] || 0,
        title: c.kind === 'group' ? (c.name || 'مجموعة') : (peer ? (peer.name || peer.username) : 'محادثة'),
        handle: peer ? peer.username : '',
        photo: peer ? peer.photo : null,
        at: last ? last.created_at : c.created_at,
      };
    });
    // أسماء متشابهة: نُلحق المعرّف للتمييز
    const seen = {};
    chats.filter((c) => c.kind === 'direct').forEach((c) => { seen[c.title] = (seen[c.title] || 0) + 1; });
    chats.forEach((c) => { c.label = c.kind === 'direct' && seen[c.title] > 1 && c.handle ? `${c.title} (@${c.handle})` : c.title; });
    if (active) { const a = chats.find((c) => c.id === active.id); if (a) { a.unread = 0; active = a; } }
    store.set('chats', chats);
    renderList();
  } catch (e) {
    if (!isNetErr(e)) { console.error('[loadChats]', e); toast('تعذّر تحميل المحادثات', 'error'); }
  }
}

function preview(last) {
  if (!last) return '';
  const pre = last.sender_id === (me && me.id) ? 'أنت: ' : '';
  const k = { voice: '🎤 رسالة صوتية', image: '🖼️ صورة', video: '🎬 فيديو' }[last.kind];
  return pre + (k || last.body || '');
}

function renderList() {
  const box = $('chatList');
  box.innerHTML = '';
  const label = (c) => c.label || c.title;
  let list = chats.filter((c) => !query || label(c).toLowerCase().includes(query.toLowerCase()) || (c.handle || '').includes(query.toLowerCase()));
  const archived = list.filter((c) => cOf(c.id).arch);
  list = list.filter((c) => !cOf(c.id).arch);
  if (filter === 'unread') list = list.filter((c) => c.unread && !cOf(c.id).mute);
  if (filter === 'groups') list = list.filter((c) => c.kind === 'group');
  list.sort((a, b) => (!!cOf(b.id).pin - !!cOf(a.id).pin) || (a.at < b.at ? 1 : -1));
  if (archived.length && filter === 'all' && !query) {
    const a = document.createElement('button');
    a.className = 'archived';
    a.innerHTML = `<span>🗄️</span><span>المؤرشفة (${archived.length})</span>`;
    a.onclick = () => { filter = 'all'; box.innerHTML = ''; archived.forEach((c) => box.append(row(c))); };
    box.append(a);
  }
  list.forEach((c) => box.append(row(c)));
  if (!list.length) {
    box.insertAdjacentHTML('beforeend', `<div class="empty"><b>${query ? 'لا توجد نتائج' : 'لا توجد محادثات هنا'}</b><span>${query ? 'جرّب اسماً آخر' : 'ابدأ محادثة جديدة من زر ✏️ بالأعلى'}</span></div>`);
  }
}

function row(c) {
  const s = cOf(c.id);
  const b = document.createElement('button');
  b.className = 'row';
  b.innerHTML = `
    <div class="av" data-av></div>
    <div class="grow">
      <div class="nm">${esc(c.label || c.title)}</div>
      <div class="pv">${esc(preview(c.last)) || (c.kind === 'group' ? c.count + ' أعضاء' : 'ابدأ المحادثة')}</div>
    </div>
    <div class="side">
      <span>${c.last ? timeOf(c.last.created_at) : ''}</span>
      <span style="display:flex;gap:4px;align-items:center">${s.pin ? '📌' : ''}${s.mute ? '<span class="muted-ic">🔕</span>' : ''}${c.unread && !s.mute ? `<span class="badge">${c.unread}</span>` : ''}</span>
    </div>`;
  setAv(b.querySelector('[data-av]'), c.photo, Array.from(c.title)[0] || '?');
  b.onclick = () => openChat(c);
  let t;
  b.addEventListener('pointerdown', () => { t = setTimeout(() => { t = null; openOpts(c); }, 500); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, () => clearTimeout(t)));
  b.oncontextmenu = (e) => { e.preventDefault(); openOpts(c); };
  return b;
}

$('fabNew').onclick = () => openNewScreen();
$('newChatBtn').onclick = $('fabNew').onclick;
$('newGroupBtn').onclick = openGroupSheet;

/* ================= خيارات المحادثة ================= */
let optChat = null;
function openOpts(c) {
  optChat = c;
  const s = cOf(c.id);
  const peer = c.kind === 'direct' ? c.members.find((id) => id !== me.id) : null;
  $('optTitle').textContent = c.label || c.title;
  $('optPin').textContent = s.pin ? '📌 إلغاء التثبيت' : '📌 تثبيت في الأعلى';
  $('optMute').textContent = s.mute ? '🔔 إلغاء كتم الإشعارات' : '🔕 كتم الإشعارات';
  $('optArch').textContent = s.arch ? '📤 إلغاء الأرشفة' : '🗄️ أرشفة المحادثة';
  $('optInfo').textContent = 'ℹ️ معلومات المحادثة';
  $('optBlock').hidden = !peer;
  $('optReport').hidden = !peer;
  $('optBlock').textContent = (peer && blocked.has(peer) ? '✅ إلغاء حظر ' : '🚫 حظر ') + c.title;
  openSheet('optSheet');
}
$('optPin').onclick = () => { const s = cOf(optChat.id); s.pin = !s.pin; saveCs(); closeAll(); renderList(); };
$('optMute').onclick = () => { const s = cOf(optChat.id); s.mute = !s.mute; saveCs(); closeAll(); renderList(); };
$('optArch').onclick = () => { const s = cOf(optChat.id); s.arch = !s.arch; saveCs(); closeAll(); renderList(); };
$('optInfo').onclick = () => {
  closeAll();
  const extra = optChat.kind === 'direct' && optChat.handle ? ` · @${optChat.handle}` : '';
  toast(`${optChat.kind === 'group' ? 'مجموعة' : 'محادثة خاصة'} · ${optChat.count} ${optChat.count > 2 ? 'أعضاء' : 'عضو'}${extra}`, 'success', 3500);
};
$('chatMenu').onclick = () => { if (active) openOpts(active); };
$('optBlock').onclick = async () => {
  if (!needNet()) return;
  const peer = optChat.members.find((id) => id !== me.id);
  if (blocked.has(peer)) {
    const { error } = await sb.from('user_blocks').delete().match({ blocker: me.id, blocked: peer });
    closeAll();
    if (error) return toast('تعذّر إلغاء الحظر', 'error');
    blocked.delete(peer); return toast('تم إلغاء الحظر', 'success');
  }
  if (!confirm('حظر هذا المستخدم؟ لن يتمكن من مراسلتك.')) return;
  const { error } = await sb.from('user_blocks').insert({ blocker: me.id, blocked: peer });
  closeAll();
  if (error && error.code !== '23505') return toast('تعذّر الحظر', 'error');
  blocked.add(peer); toast('تم الحظر', 'success');
};
$('optReport').onclick = async () => {
  if (!needNet()) return;
  const reason = prompt('سبب البلاغ');
  if (!reason || !reason.trim()) return;
  const peer = optChat.members.find((id) => id !== me.id);
  const { error } = await sb.from('reports').insert({ reported_user: peer, reason: reason.trim().slice(0, 500) });
  closeAll();
  toast(error ? 'تعذّر إرسال البلاغ' : 'تم إرسال البلاغ', error ? 'error' : 'success');
};
$('chatSearch').onclick = () => {
  const bar = $('cbar');
  bar.hidden = !bar.hidden;
  if (!bar.hidden) return $('cq').focus();
  chatQ = ''; $('cq').value = ''; renderMessages();
};
$('cbarClose').onclick = () => $('chatSearch').click();
$('cq').oninput = (e) => { chatQ = e.target.value.trim().toLowerCase(); renderMessages(); };

/* ================= فتح محادثة ================= */
async function openChat(c) {
  active = c; selId = null; replyTo = null; editing = null; chatQ = ''; $('cq').value = ''; $('cbar').hidden = true;
  const draft = cOf(c.id).draft || '';
  $('input').value = draft; $('act').textContent = draft ? '➤' : '🎙️';
  $('rbar').hidden = true; $('emojis').hidden = true; $('typing').hidden = true;
  $('chat').classList.remove('off');
  $('hTitle').textContent = c.label || c.title;
  setAv($('hAv'), c.photo, Array.from(c.title)[0] || '?');
  $('hAv').classList.toggle('online', false);
  setStatus(c.kind === 'group' ? c.count + ' أعضاء' : (c.handle ? '@' + c.handle : 'محادثة خاصة'));
  history.pushState({ chat: c.id }, '');
  // عرض فوري من الكاش ثم تحديث من الشبكة
  const cached = await store.get('msgs:' + c.id);
  if (active !== c) return;
  msgs = (cached && cached.msgs) || []; reactMap = (cached && cached.react) || {}; readMap = (cached && cached.reads) || {}; hasMore = !!(cached && cached.more);
  renderMessages({ stick: true });
  await loadMessages();
  if (active !== c) return;
  markRead();
  updatePresence();
}

function markRead() {
  if (!active || !me) return;
  const latest = msgs[msgs.length - 1];
  cOf(active.id).read = latest ? Date.parse(latest.created_at) : Date.now();
  saveCs();
  active.unread = 0;
  const hit = chats.find((c) => c.id === active.id); if (hit) hit.unread = 0;
  renderList();
  if (isOnline()) sb.from('chat_reads').upsert({ chat_id: active.id, user_id: me.id, last_read_at: new Date().toISOString() }).then(() => {});
}

function setStatus(t, on = false) {
  const el = $('hStatus');
  el.textContent = t; el.className = on ? 'on' : '';
}
function closeChat() {
  $('chat').classList.add('off');
  active = null;
  renderList();
}
$('back').onclick = () => { if (history.state && history.state.chat) history.back(); else closeChat(); };
window.addEventListener('popstate', () => { if (active) closeChat(); });

/* ================= الرسائل ================= */
async function loadMessages({ older = false } = {}) {
  if (!active || !isOnline()) return;
  const cid = active.id;
  let q = sb.from('messages').select('*').eq('chat_id', cid).order('created_at', { ascending: false }).limit(PAGE);
  if (older && msgs.length) q = q.lt('created_at', msgs[0].created_at);
  const { data, error } = await q;
  if (error) { if (!isNetErr(error)) toast('تعذّر تحميل الرسائل', 'error'); return; }
  if (!active || active.id !== cid) return;
  const rows = (data || []).slice().reverse();
  if (older) {
    const have = new Set(msgs.map((m) => m.id));
    msgs = [...rows.filter((r) => !have.has(r.id)), ...msgs];
    hasMore = (data || []).length === PAGE;
  } else {
    const first = rows[0];
    const keep = first ? msgs.filter((m) => m.created_at < first.created_at && !m.pending) : [];
    msgs = [...keep, ...rows];
    hasMore = keep.length ? hasMore : (data || []).length === PAGE;
  }
  await loadPeople(rows.map((m) => m.sender_id));
  if (!active || active.id !== cid) return;
  await loadAux(older ? rows.map((m) => m.id) : msgs.slice(-100).map((m) => m.id));
  if (!active || active.id !== cid) return;
  renderMessages(older ? { prepend: true } : {});
  persistMsgs();
}

async function loadAux(ids) {
  if (!active) return;
  const cid = active.id;
  const [rx, rd] = await Promise.all([
    ids.length ? sb.from('message_reactions').select('message_id, user_id, emoji').in('message_id', ids) : { data: [] },
    sb.from('chat_reads').select('user_id, last_read_at').eq('chat_id', cid),
  ]);
  if (!active || active.id !== cid) return;
  ids.forEach((id) => delete reactMap[id]);
  (rx.data || []).forEach((r) => { (reactMap[r.message_id] ||= []).push(r); });
  readMap = {};
  (rd.data || []).forEach((r) => { readMap[r.user_id] = Date.parse(r.last_read_at); });
}

function persistMsgs() {
  if (!active) return;
  store.set('msgs:' + active.id, { msgs: msgs.slice(-200), react: reactMap, reads: readMap, more: hasMore });
}

function pendingFor(cid) {
  return outbox.filter((o) => o.chat_id === cid).map((o) => {
    let url = null;
    if (o.blob) { if (!blobUrls.has(o.id)) blobUrls.set(o.id, URL.createObjectURL(o.blob)); url = blobUrls.get(o.id); }
    return { id: o.id, chat_id: o.chat_id, sender_id: me.id, kind: o.kind, body: o.body, media_url: url || o.media_url, reply_to: o.reply_to, created_at: o.created_at, pending: true, failed: !!o.failed };
  });
}

function renderMessages(o = {}) {
  const box = $('msgs');
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
  const prevH = box.scrollHeight, prevTop = box.scrollTop;
  box.innerHTML = '';
  if (hasMore && !chatQ && isOnline()) {
    const more = document.createElement('button');
    more.className = 'older'; more.textContent = 'تحميل رسائل أقدم';
    more.onclick = async () => { more.disabled = true; more.textContent = 'جارٍ التحميل…'; await loadMessages({ older: true }); };
    box.append(more);
  }
  let lastDay = '';
  const all = [...msgs, ...(active ? pendingFor(active.id) : [])];
  const view = chatQ ? all.filter((m) => (m.body || '').toLowerCase().includes(chatQ)) : all;
  view.forEach((m) => {
    const d = new Date(m.created_at).toDateString();
    if (d !== lastDay) {
      lastDay = d;
      const sep = document.createElement('div');
      sep.className = 'day'; sep.textContent = dayLabel(m.created_at);
      box.append(sep);
    }
    box.append(buildBubble(m));
  });
  if (o.prepend) box.scrollTop = box.scrollHeight - prevH + prevTop;
  else if (o.stick || near) box.scrollTop = box.scrollHeight;
  else box.scrollTop = prevTop;
}

function buildBubble(m) {
  const mine = m.sender_id === me.id;
  const row = document.createElement('div');
  row.className = 'mrow ' + (mine ? 'me' : 'them');
  row.dataset.id = m.id;
  const bub = document.createElement('div');
  bub.className = 'bub' + (selId === m.id ? ' sel' : '') + (m.pending ? ' pending' : '');

  if (!mine && active && active.kind === 'group') {
    const f = document.createElement('div'); f.className = 'from'; f.textContent = nameOf(m.sender_id); bub.append(f);
  }
  if (m.reply_to) {
    const q = msgs.find((x) => x.id === m.reply_to);
    if (q) {
      const d = document.createElement('div'); d.className = 'quote';
      const b = document.createElement('b'); b.textContent = nameOf(q.sender_id); d.append(b);
      d.append(document.createTextNode(q.body || { voice: 'رسالة صوتية', image: 'صورة', video: 'فيديو' }[q.kind] || ''));
      d.onclick = (e) => { e.stopPropagation(); jumpTo(q.id); };
      bub.append(d);
    }
  }
  if (m.kind === 'image' && m.media_url) {
    const im = document.createElement('img'); im.className = 'media'; im.loading = 'lazy'; im.alt = '';
    // طلب CORS ليتمكّن Service Worker من تخزين الصورة وعرضها دون اتصال؛ وإن فشل نعيد التحميل بالطريقة العادية
    if (/^https?:/.test(m.media_url)) {
      im.crossOrigin = 'anonymous';
      im.onerror = () => { if (im.crossOrigin) { im.onerror = null; im.removeAttribute('crossorigin'); im.src = m.media_url; } };
    }
    im.src = m.media_url;
    im.onclick = (e) => { e.stopPropagation(); openLightbox(m.media_url); };
    bub.append(im);
  }
  if (m.kind === 'video' && m.media_url) {
    const v = document.createElement('video'); v.className = 'media'; v.src = m.media_url; v.controls = true; v.preload = 'metadata';
    v.onclick = (e) => e.stopPropagation();
    bub.append(v);
  }
  if (m.kind === 'voice' && m.media_url) {
    const au = document.createElement('audio'); au.controls = true; au.src = m.media_url;
    au.onclick = (e) => e.stopPropagation();
    bub.append(au);
  }
  if (m.body) { const t = document.createElement('div'); t.textContent = m.body; bub.append(t); }

  const info = document.createElement('div');
  info.className = 'info';
  let tick = '';
  if (mine) {
    if (m.failed) tick = ' ⚠️';
    else if (m.pending) tick = ' 🕓';
    else {
      const others = active ? active.members.filter((id) => id !== me.id) : [];
      const seen = others.length && others.every((id) => (readMap[id] || 0) >= Date.parse(m.created_at));
      tick = seen ? ' ✓✓' : ' ✓';
    }
  }
  info.textContent = (m.edited_at ? 'معدّلة · ' : '') + timeOf(m.created_at) + tick;
  const rxs = reactMap[m.id] || [];
  if (rxs.length) {
    const box = document.createElement('div');
    box.className = 'rx';
    const counts = {};
    rxs.forEach((r) => {
      counts[r.emoji] = counts[r.emoji] || { n: 0, mine: false };
      counts[r.emoji].n++;
      if (r.user_id === me.id) counts[r.emoji].mine = true;
    });
    Object.entries(counts).forEach(([e, v]) => {
      const s = document.createElement('span');
      s.textContent = `${e} ${v.n}`;
      if (v.mine) s.className = 'mine';
      s.onclick = (ev) => { ev.stopPropagation(); toggleReact(m.id, e, v.mine); };
      box.append(s);
    });
    bub.append(box);
  }
  bub.append(info);
  if (selId === m.id) actionsFor(m, bub);
  bub.onclick = () => { selId = selId === m.id ? null : m.id; renderMessages(); };
  row.append(bub);
  return row;
}

function actionsFor(m, bub) {
  const acts = document.createElement('div');
  acts.className = 'acts';
  const add = (label, fn) => {
    const b = document.createElement('button'); b.textContent = label;
    b.onclick = (e) => { e.stopPropagation(); fn(); };
    acts.append(b);
  };
  if (m.pending) {
    if (m.failed) add('🔁 إعادة المحاولة', () => { const o = outbox.find((x) => x.id === m.id); if (o) { o.failed = false; persistOutbox(); renderMessages(); flushOutbox(); } });
    add('🗑️ إلغاء الإرسال', () => { removeOutbox(m.id); selId = null; renderMessages(); paintNet(); });
    bub.append(acts); return;
  }
  add('↩️ رد', () => {
    replyTo = m; editing = null;
    setReply('الرد على ' + nameOf(m.sender_id), m.body || 'مرفق');
    $('input').focus();
  });
  ['❤️', '👍', '😂'].forEach((e) => add(e, () => toggleReact(m.id, e, (reactMap[m.id] || []).some((r) => r.emoji === e && r.user_id === me.id))));
  add('↪️ توجيه', () => openForward(m));
  if (m.body) add('📋 نسخ', async () => {
    try { await navigator.clipboard.writeText(m.body); toast('تم النسخ', 'success'); } catch { toast('تعذّر النسخ', 'error'); }
  });
  if (m.sender_id === me.id) {
    if (m.kind === 'text') add('✏️ تعديل', () => {
      if (!needNet()) return;
      editing = m; replyTo = null;
      setReply('تعديل الرسالة', m.body);
      $('input').value = m.body; $('input').focus();
    });
    add('🗑️ حذف', async () => {
      if (!needNet()) return;
      if (!confirm('حذف هذه الرسالة للجميع؟')) return;
      const { error } = await sb.from('messages').delete().eq('id', m.id);
      if (error) return toast('تعذّر الحذف', 'error');
      msgs = msgs.filter((x) => x.id !== m.id);
      selId = null; renderMessages(); persistMsgs(); toast('تم الحذف', 'success');
    });
  }
  bub.append(acts);
}

async function toggleReact(mid, emoji, mine) {
  if (!needNet()) return;
  if (mine) {
    await sb.from('message_reactions').delete().match({ message_id: mid, user_id: me.id, emoji });
  } else {
    const { error } = await sb.from('message_reactions').insert({ message_id: mid, user_id: me.id, emoji });
    if (error && error.code !== '23505') return toast('تعذّر التفاعل', 'error');
  }
  await loadAux(msgs.slice(-100).map((m) => m.id));
  renderMessages(); persistMsgs();
}

function jumpTo(id) {
  if (chatQ) { chatQ = ''; $('cq').value = ''; renderMessages(); }
  const el = document.querySelector(`#msgs [data-id="${CSS.escape(id)}"]`);
  if (!el) return;
  el.scrollIntoView({ block: 'center' });
  const b = el.querySelector('.bub');
  b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 1500);
}

let fwdMsg = null;
function openForward(m) {
  fwdMsg = m;
  const list = $('fwdList');
  list.innerHTML = '';
  chats.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'opt';
    b.textContent = c.label || c.title;
    b.onclick = async () => {
      closeAll();
      // التوجيه عبر صندوق الإرسال: يعمل حتى لو انقطع الاتصال الآن
      queueMessage({ chat_id: c.id, kind: fwdMsg.kind, body: fwdMsg.body, media_url: fwdMsg.media_url });
      toast(isOnline() ? 'تم التوجيه' : 'سيُوجَّه عند عودة الاتصال', 'success');
    };
    list.append(b);
  });
  if (!chats.length) list.innerHTML = '<p class="hint">لا توجد محادثات</p>';
  openSheet('fwdSheet');
}

function setReply(label, text) {
  if (!label) { $('rbar').hidden = true; return; }
  const t = $('rtext');
  t.textContent = '';
  const b = document.createElement('b'); b.textContent = label;
  t.append(b, document.createTextNode(text || ''));
  $('rbar').hidden = false;
}
function clearComposer() {
  $('input').value = ''; editing = null; replyTo = null;
  setReply(null); $('act').textContent = '🎙️';
  if (active) { cOf(active.id).draft = ''; saveCs(); }
}
$('rcancel').onclick = clearComposer;

/* ================= الإرسال (صندوق الإرسال المؤجّل) ================= */
const persistOutbox = () => store.set('outbox', outbox);
function removeOutbox(id) {
  outbox = outbox.filter((o) => o.id !== id);
  const u = blobUrls.get(id); if (u) { URL.revokeObjectURL(u); blobUrls.delete(id); }
  persistOutbox();
}
function queueMessage(extra) {
  const item = { id: uuid(), uid: me.id, kind: 'text', body: null, media_url: null, reply_to: null, created_at: new Date().toISOString(), ...extra };
  outbox.push(item);
  persistOutbox();
  if (active && active.id === item.chat_id) renderMessages({ stick: true });
  paintNet();
  flushOutbox();
}
function sendMsg(extra) {
  if (!active) return;
  queueMessage({ chat_id: active.id, reply_to: replyTo ? replyTo.id : null, ...extra });
  replyTo = null; setReply(null);
}

async function uploadMedia(blob, ext) {
  const path = `${me.id}/${uuid()}.${ext}`;
  const { error } = await sb.storage.from('media').upload(path, blob, { upsert: false, contentType: blob.type || undefined });
  if (error) throw error;
  return sb.storage.from('media').getPublicUrl(path).data.publicUrl;
}

async function flushOutbox() {
  if (flushing || !me || !isOnline() || !outbox.some((o) => !o.failed)) return;
  flushing = true; paintNet();
  let sent = false;
  try {
    for (const o of outbox.filter((x) => !x.failed)) {
      try {
        let url = o.media_url || null;
        if (o.blob && !url) { url = await uploadMedia(o.blob, o.ext || 'bin'); o.media_url = url; }
        const row = { id: o.id, chat_id: o.chat_id, kind: o.kind, body: o.body || null, media_url: url, reply_to: o.reply_to || null };
        const { data, error } = await sb.from('messages').insert(row).select().single();
        if (error && error.code !== '23505') {
          if (isNetErr(error)) break;                 // الشبكة: نتوقف ونعيد لاحقاً
          console.error('[outbox]', error);
          o.failed = true; continue;                  // رفض دائم (حظر/عضوية): نعلّمها فاشلة
        }
        removeOutbox(o.id);
        sent = true;
        if (data && active && active.id === data.chat_id && !msgs.find((x) => x.id === data.id)) msgs.push(data);
      } catch (x) {
        if (isNetErr(x)) break;
        console.error('[outbox]', x); o.failed = true;
      }
    }
  } finally {
    flushing = false; persistOutbox(); paintNet();
    if (active) { renderMessages({ stick: true }); persistMsgs(); }
    if (sent) loadChats();
  }
}

function handleAct() {
  const t = $('input').value.trim();
  if (t) return sendText(t);
  toggleRec();
}
async function sendText(t) {
  if (editing) {
    if (!needNet()) return;
    const when = new Date().toISOString();
    const { error } = await sb.from('messages').update({ body: t, edited_at: when }).eq('id', editing.id);
    if (error) return toast('تعذّر التعديل', 'error');
    const m = msgs.find((x) => x.id === editing.id);
    if (m) Object.assign(m, { body: t, edited_at: when });
    clearComposer(); renderMessages(); persistMsgs(); return;
  }
  $('input').value = ''; $('act').textContent = '🎙️';
  cOf(active.id).draft = ''; saveCs();
  sendMsg({ body: t.slice(0, 4000) });
}
$('act').onclick = handleAct;
$('input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && $('input').value.trim()) { e.preventDefault(); handleAct(); } });
$('input').addEventListener('input', () => {
  $('act').textContent = $('input').value.trim() ? '➤' : '🎙️';
  if (active) { cOf(active.id).draft = $('input').value; saveCs(); }
  if (!active || !typingCh || !isOnline() || Date.now() - lastTypingSent < 2000) return;
  lastTypingSent = Date.now();
  typingCh.send({ type: 'broadcast', event: 'typing', payload: { uid: me.id, chat_id: active.id } });
});

['😀', '😂', '😍', '😊', '🔥', '🎉', '❤️', '👍', '🙏', '😢', '😡', '💯', '🥰', '😎', '🤔', '👏', '✨', '💪', '🌹', '🎈'].forEach((em) => {
  const b = document.createElement('button'); b.textContent = em;
  b.onclick = () => { $('input').value += em; $('input').dispatchEvent(new Event('input')); $('input').focus(); };
  $('emojis').append(b);
});
$('emojiBtn').onclick = () => { $('emojis').hidden = !$('emojis').hidden; };

/* الوسائط: تُضغط وتُوضع في الصندوق، فتعمل حتى دون اتصال */
$('mediaFile').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f || !active) return;
  const isVideo = f.type.startsWith('video/'), isImage = f.type.startsWith('image/');
  if (!isVideo && !isImage) return toast('نوع الملف غير مدعوم', 'error');
  if (isVideo && f.size > 25 * 1024 * 1024) return toast('الفيديو يجب أن يكون أقل من 25 ميجا', 'error');
  if (isImage && f.size > 15 * 1024 * 1024) return toast('الصورة يجب أن تكون أقل من 15 ميجا', 'error');
  try {
    if (isVideo) {
      const ext = /quicktime/.test(f.type) ? 'mov' : /webm/.test(f.type) ? 'webm' : 'mp4';
      sendMsg({ kind: 'video', blob: f, ext });
    } else {
      const src = await new Promise((r, j) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = j; fr.readAsDataURL(f); });
      const im = new Image();
      await new Promise((r, j) => { im.onload = r; im.onerror = j; im.src = src; });
      const k = Math.min(1, 1600 / Math.max(im.width, im.height));
      const c = document.createElement('canvas');
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
      if (!blob) throw new Error('canvas');
      sendMsg({ kind: 'image', blob, ext: 'jpg' });
    }
  } catch { toast('تعذّرت معالجة الملف', 'error'); }
};

async function toggleRec() {
  if (!active) return;
  if (rec) return rec.stop();
  if (!navigator.mediaDevices || !window.MediaRecorder) return toast('التسجيل الصوتي غير مدعوم', 'error');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const type = rec.mimeType || 'audio/webm';
      const blob = new Blob(chunks, { type });
      rec = null; $('act').classList.remove('rec'); $('act').textContent = '🎙️';
      if (!blob.size) return;
      if (blob.size > 25 * 1024 * 1024) return toast('التسجيل كبير جداً', 'error');
      const ext = /mp4|aac/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : 'webm';
      sendMsg({ kind: 'voice', blob, ext });
    };
    rec.start();
    $('act').classList.add('rec'); $('act').textContent = '⏹';
    toast('جارٍ التسجيل… اضغط ⏹ للإرسال', '', 3500);
  } catch { toast('لم نتمكن من الوصول إلى الميكروفون', 'error'); }
}

/* ================= اللحظي (Realtime) ================= */
let chanWasDown = false;
function subscribe() {
  if (channel) sb.removeChannel(channel);
  channel = sb.channel('lmlm-msgs').on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, async (p) => {
    if (p.eventType === 'INSERT') {
      const n = p.new;
      if (n.sender_id !== me.id && st.notif && document.hidden && 'Notification' in window && Notification.permission === 'granted' && !cOf(n.chat_id).mute) {
        new Notification(nameOf(n.sender_id) || 'LMLM', { body: n.body || 'رسالة جديدة', tag: n.chat_id });
      }
      if (active && n.chat_id === active.id) {
        if (!msgs.find((x) => x.id === n.id)) {
          await loadPeople([n.sender_id]);
          msgs.push(n); removeOutboxQuiet(n.id); renderMessages(); persistMsgs();
          if (n.sender_id !== me.id) markRead();
        }
      } else if (n.sender_id !== me.id && !cOf(n.chat_id).mute) {
        toast('رسالة جديدة', '', 2000);
      }
    } else if (p.eventType === 'UPDATE') {
      const m = msgs.find((x) => x.id === p.new.id);
      if (m) { Object.assign(m, p.new); renderMessages(); persistMsgs(); }
    } else if (p.eventType === 'DELETE') {
      msgs = msgs.filter((x) => x.id !== (p.old && p.old.id));
      if (active) { renderMessages(); persistMsgs(); }
    }
    loadChats();
  })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, async () => { if (active) { await loadAux(msgs.slice(-100).map((m) => m.id)); renderMessages(); } })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reads' }, async () => { if (active) { await loadAux([]); renderMessages(); } })
    .subscribe((s) => {
      if (s === 'SUBSCRIBED') { if (chanWasDown) { chanWasDown = false; lastSync = 0; resync(); } }
      else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(s)) chanWasDown = true;
    });
}
function removeOutboxQuiet(id) { if (outbox.some((o) => o.id === id)) removeOutbox(id); }

function subscribeTyping() {
  if (typingCh) sb.removeChannel(typingCh);
  typingCh = sb.channel('typing', { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'typing' }, (p) => {
      if (!active || p.payload.chat_id !== active.id || p.payload.uid === me.id) return;
      setStatus(`${nameOf(p.payload.uid)} يكتب…`, true);
      clearTimeout(typingTimer);
      typingTimer = setTimeout(updatePresence, 2500);
    }).subscribe();
}

let onlineIds = new Set();
const beat = () => { if (me && isOnline() && !document.hidden) sb.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', me.id).then(() => {}); };
setInterval(beat, 60000);
function subscribePresence() {
  if (presenceCh) sb.removeChannel(presenceCh);
  presenceCh = sb.channel('presence:global', { config: { presence: { key: me.id } } })
    .on('presence', { event: 'sync' }, () => {
      onlineIds = new Set(Object.keys(presenceCh.presenceState()));
      updatePresence();
    })
    .subscribe(async (s) => { if (s === 'SUBSCRIBED') { await presenceCh.track({ online_at: new Date().toISOString() }); beat(); } });
}
function updatePresence() {
  if (!active) return;
  if (active.kind === 'direct') {
    const other = active.members.find((id) => id !== me.id);
    const on = !!other && onlineIds.has(other);
    const ls = people[other] && people[other].last_seen;
    const lsText = ls ? 'آخر ظهور ' + (new Date(ls).toDateString() === new Date().toDateString() ? timeOf(ls) : dayLabel(ls)) : (active.handle ? '@' + active.handle : 'محادثة خاصة');
    setStatus(on ? 'متصل الآن' : lsText, on);
    $('hAv').classList.toggle('online', on);
  }
}

/* ================= جهات الاتصال والبحث ================= */
async function loadContacts() {
  if (!me || !isOnline()) return;
  const [c, b] = await Promise.all([
    sb.from('contacts').select('contact_id').eq('owner_id', me.id),
    sb.from('user_blocks').select('blocked').eq('blocker', me.id),
  ]);
  if (!c.error) { contactIds = (c.data || []).map((r) => r.contact_id); store.set('contacts', contactIds); await loadPeople(contactIds); }
  if (!b.error) blocked = new Set((b.data || []).map((r) => r.blocked));
}

function openNewScreen() {
  ['tabChats', 'tabSettings', 'tabSoon'].forEach((id) => ($(id).hidden = true));
  $('tabs').hidden = true;
  $('tabNew').hidden = false;
  $('nSearch').value = '';
  renderNew();
  loadContacts().then(renderNew);
}
function closeNew() { $('tabNew').hidden = true; $('tabs').hidden = false; switchTab('chats'); }
$('newBack').onclick = closeNew;
let searchTok = 0, searchTimer = null;
$('nSearch').oninput = () => {
  clearTimeout(searchTimer);
  const q = $('nSearch').value.trim();
  if (!q) return renderNew();
  searchTimer = setTimeout(() => searchPeople(q), 300);
};
$('shareMe').onclick = () => shareMe();

function personRow(p, onOpen, actionEl) {
  const b = document.createElement('button');
  b.className = 'row';
  b.innerHTML = `<div class="av" data-av></div><div class="grow"><div class="nm">${esc(p.name || p.username)}</div><div class="pv">@${esc(p.username)}${p.city ? ' · ' + esc(p.city) : ''}</div></div>`;
  setAv(b.querySelector('[data-av]'), p.photo, initial(p));
  if (actionEl) b.append(actionEl);
  b.onclick = () => onOpen(p);
  return b;
}
function addBtn(p) {
  const isContact = contactIds.includes(p.id);
  const s = document.createElement('span');
  s.className = 'pv'; s.style.padding = '6px 4px';
  s.textContent = isContact ? '✓ في جهات الاتصال' : '➕';
  if (!isContact) s.onclick = (e) => { e.stopPropagation(); addContact(p); };
  return s;
}
function renderNew() {
  const box = $('nList');
  box.innerHTML = '';
  const addRow = (icon, title, sub, fn) => {
    const b = document.createElement('button');
    b.className = 'row';
    b.innerHTML = `<div class="av" style="background:var(--acc)">${icon}</div><div class="grow"><div class="nm">${title}</div><div class="pv">${sub}</div></div>`;
    b.onclick = fn; box.append(b);
  };
  addRow('➕', 'جهة اتصال جديدة', 'أضف شخصاً بمعرّفه أو بريده أو رقم هاتفه', openAddSheet);
  addRow('🔗', 'دعوة الأصدقاء', 'شارك رابط ملفك الشخصي', shareMe);
  box.insertAdjacentHTML('beforeend', '<div class="sec">جهات الاتصال</div>');
  const list = contactIds.map((id) => people[id]).filter(Boolean);
  if (!list.length) box.insertAdjacentHTML('beforeend', '<div class="empty"><b>لا توجد جهات اتصال بعد</b><span>أضف شخصاً بمعرّفه أو بريده أو رقم هاتفه، أو ابحث عنه بالاسم</span></div>');
  list.forEach((p) => box.append(personRow(p, startWith)));
}

async function findMany(q) {
  q = q.trim();
  if (EMAIL_RE.test(q)) { const { data } = await sb.rpc('find_by_email', { p_email: q }); return data || []; }
  const digits = normPhone(q);
  if (/^\+?\d{6,}$/.test(digits)) { const { data } = await sb.rpc('find_by_phone', { p_phone: digits }); return data || []; }
  const safe = q.replace(/^@/, '').replace(/[%,()*\\"':]/g, '');
  if (!safe) return [];
  const { data } = await sb.from('profiles').select('id, username, name, photo, city')
    .or(`username.ilike.%${safe}%,name.ilike.%${safe}%`).neq('id', me.id).limit(30);
  return data || [];
}
async function searchPeople(q) {
  const tok = ++searchTok;
  const box = $('nList');
  if (!isOnline()) { box.innerHTML = '<div class="empty"><b>أنت غير متصل</b><span>البحث عن أشخاص يحتاج إنترنت</span></div>'; return; }
  box.innerHTML = '<div class="empty"><span>جارٍ البحث…</span></div>';
  let found = [];
  try { found = await findMany(q); } catch { found = []; }
  if (tok !== searchTok) return;
  found.forEach((p) => { people[p.id] = { ...(people[p.id] || {}), ...p }; });
  box.innerHTML = '';
  if (!found.length) { box.innerHTML = '<div class="empty"><b>لا توجد نتائج</b><span>تأكد من الاسم أو المعرّف أو البريد أو الرقم</span></div>'; return; }
  found.forEach((p) => box.append(personRow(p, startWith, addBtn(p))));
}

function openAddSheet() {
  $('aQ').value = ''; $('aRes').textContent = ''; $('aAdd').hidden = true; addFound = null;
  openSheet('addSheet');
}
$('aFind').onclick = async () => {
  const q = $('aQ').value.trim();
  if (!q) return shake($('aQ'));
  if (!needNet()) return;
  setBusy($('aFind'), true, 'جارٍ البحث…');
  let list = [];
  try { list = await findMany(/^@?[A-Za-z0-9_]{3,20}$/.test(q) ? '@' + q : q); } catch {}
  // المعرّف الدقيق يُفضَّل على التطابق الجزئي
  const exact = list.find((p) => p.username === cleanHandle(q));
  addFound = exact || (list.length === 1 ? list[0] : null);
  setBusy($('aFind'), false);
  const res = $('aRes');
  if (addFound) {
    people[addFound.id] = { ...(people[addFound.id] || {}), ...addFound };
    res.textContent = `${addFound.name || addFound.username} (@${addFound.username})`;
  } else if (list.length > 1) {
    res.textContent = `وجدنا ${list.length} نتيجة. اكتب المعرّف الدقيق (@…) أو استخدم البحث في شاشة المحادثة الجديدة`;
  } else res.textContent = 'لم نجد أي مستخدم. جرّب المعرّف أو البريد أو الرقم';
  $('aAdd').hidden = !addFound;
};
$('aAdd').onclick = () => addFound && addContact(addFound, true);

async function addContact(p, fromSheet = false) {
  if (!needNet()) return;
  const { error } = await sb.from('contacts').insert({ owner_id: me.id, contact_id: p.id });
  if (error && error.code !== '23505') return toast('تعذّرت الإضافة', 'error');
  await loadContacts();
  if (fromSheet) closeAll();
  renderNew();
  toast('تمت الإضافة إلى جهات الاتصال', 'success');
}

async function startWith(p) {
  if (p.id === me.id) return toast('لا يمكنك مراسلة نفسك', 'error');
  closeNew();
  const existing = chats.find((c) => c.kind === 'direct' && c.members.includes(p.id));
  if (existing) return openChat(existing);
  if (!needNet()) return;
  const { data: cid, error } = await sb.rpc('create_chat', { p_kind: 'direct', p_name: null, p_members: [p.id] });
  if (error) return toast('تعذّر فتح المحادثة', 'error');
  await loadChats();
  const c = chats.find((x) => x.id === cid);
  if (c) openChat(c);
}

async function shareMe() {
  const url = `${location.origin}${location.pathname}?u=${encodeURIComponent(profile.username)}`;
  const data = { title: 'LMLM', text: `تواصل معي على LMLM: @${profile.username}`, url };
  if (navigator.share) { try { await navigator.share(data); } catch {} return; }
  try { await navigator.clipboard.writeText(url); toast('تم نسخ رابط ملفك', 'success'); }
  catch { toast(url, '', 6000); }
}

/* محادثة جديدة بمعرّف/بريد/هاتف */
$('ncGo').onclick = async () => {
  const q = $('ncUser').value.trim();
  if (!q) return shake($('ncUser'));
  if (!needNet()) return;
  setBusy($('ncGo'), true, 'جارٍ البحث…');
  let list = [];
  try { list = await findMany(/^@?[A-Za-z0-9_]{3,20}$/.test(q) ? '@' + q : q); } catch {}
  setBusy($('ncGo'), false);
  const p = list.find((x) => x.username === cleanHandle(q)) || (list.length === 1 ? list[0] : null);
  if (!p) { toast(list.length > 1 ? 'نتائج كثيرة، اكتب المعرّف الدقيق' : 'لم نجد هذا المستخدم', 'error'); return shake($('ncUser')); }
  closeAll();
  people[p.id] = { ...(people[p.id] || {}), ...p };
  startWith(p);
};

/* مجموعة جديدة: اختيار من جهات الاتصال + معرّفات يدوية */
function openGroupSheet() {
  $('gName').value = ''; $('gUsers').value = '';
  const box = $('gPick'); box.innerHTML = '';
  contactIds.map((id) => people[id]).filter(Boolean).forEach((p) => {
    const l = document.createElement('label');
    l.className = 'pickrow';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = p.id;
    const s = document.createElement('span'); s.textContent = `${p.name || p.username} (@${p.username})`;
    l.append(cb, s); box.append(l);
  });
  $('gPickWrap').hidden = !box.children.length;
  openSheet('groupSheet');
  loadContacts().then(() => { if (!$('groupSheet').hidden && !box.children.length) openGroupSheetFill(); });
}
function openGroupSheetFill() {
  const box = $('gPick');
  contactIds.map((id) => people[id]).filter(Boolean).forEach((p) => {
    const l = document.createElement('label'); l.className = 'pickrow';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = p.id;
    const s = document.createElement('span'); s.textContent = `${p.name || p.username} (@${p.username})`;
    l.append(cb, s); box.append(l);
  });
  $('gPickWrap').hidden = !box.children.length;
}
$('gGo').onclick = async () => {
  const name = cleanName($('gName').value);
  if (!name) return shake($('gName'));
  if (!needNet()) return;
  const picked = [...document.querySelectorAll('#gPick input:checked')].map((i) => i.value);
  const handles = $('gUsers').value.split(/[,\s،]+/).map(cleanHandle).filter(Boolean);
  setBusy($('gGo'), true, 'جارٍ الإنشاء…');
  let ids = new Set(picked);
  if (handles.length) {
    const { data: ps } = await sb.from('profiles').select('id, username').in('username', handles.slice(0, 50));
    (ps || []).forEach((p) => ids.add(p.id));
  }
  ids.delete(me.id);
  if (!ids.size) { setBusy($('gGo'), false); return toast('اختر عضواً واحداً على الأقل', 'error'); }
  const { data: cid, error } = await sb.rpc('create_chat', { p_kind: 'group', p_name: name, p_members: [...ids] });
  setBusy($('gGo'), false);
  if (error) return toast('تعذّر الإنشاء', 'error');
  closeAll();
  await loadChats();
  const c = chats.find((x) => x.id === cid);
  if (c) openChat(c);
  toast('تم إنشاء المجموعة', 'success');
};

/* ================= الملف الشخصي ================= */
async function openProfile() {
  $('pName').value = profile.name || '';
  $('pUser').value = profile.username ? '@' + profile.username : '';
  $('pBio').value = profile.bio || '';
  $('pCity').value = profile.city || '';
  $('pLink').value = profile.link || '';
  $('pBirth').value = ''; $('pBirth').max = new Date().toISOString().slice(0, 10);
  $('pEmail').value = ''; $('pPhone').value = ''; $('pFind').checked = true; $('pPass').value = '';
  setAv($('picImg'), profile.photo, initial(profile));
  openSheet('profileSheet');
  const cached = await store.get('private');
  const apply = (d) => { if (!d) return; $('pEmail').value = d.email || ''; $('pPhone').value = d.phone || ''; $('pBirth').value = d.birth || ''; $('pFind').checked = d.discoverable !== false; };
  if (cached && cached.id === me.id) apply(cached);
  if (isOnline()) {
    const { data } = await sb.from('profile_private').select('id, email, phone, birth, discoverable').eq('id', me.id).maybeSingle();
    if (data) { store.set('private', data); apply(data); }
  }
}
$('openProfile').onclick = openProfile;
$('copyHandle').onclick = async () => {
  try { await navigator.clipboard.writeText(profile.username || ''); toast('تم نسخ المعرّف', 'success'); } catch { toast('@' + profile.username, '', 4000); }
};

$('picFile').onchange = (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f || !needNet()) return;
  if (!f.type.startsWith('image/')) return toast('اختر ملف صورة', 'error');
  if (f.size > 20 * 1024 * 1024) return toast('الصورة كبيرة جداً', 'error');
  const fr = new FileReader();
  fr.onerror = () => toast('تعذّرت قراءة الصورة', 'error');
  fr.onload = () => {
    const im = new Image();
    im.onerror = () => toast('ملف الصورة غير مدعوم أو تالف', 'error');
    im.onload = async () => {
      const done = busy('جارٍ رفع الصورة…');
      try {
        const side = Math.min(im.width, im.height);
        const c = document.createElement('canvas'); c.width = c.height = 320;
        c.getContext('2d').drawImage(im, (im.width - side) / 2, (im.height - side) / 2, side, side, 0, 0, 320, 320);
        const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
        if (!blob) throw new Error('canvas');
        const photo = await uploadMedia(blob, 'jpg');
        const { error } = await sb.from('profiles').update({ photo }).eq('id', me.id);
        if (error) throw error;
        profile.photo = photo; people[me.id] = profile; store.set('profile', profile);
        setAv($('picImg'), photo, initial(profile)); paintSettingsProfile(); renderList();
        toast('تم تحديث الصورة', 'success');
      } catch (x) { console.error('[avatar]', x); toast('تعذّر الرفع', 'error'); }
      finally { done(); }
    };
    im.src = fr.result;
  };
  fr.readAsDataURL(f);
};

$('pSave').onclick = async () => {
  if (!needNet()) return;
  const name = cleanName($('pName').value);
  const bio = $('pBio').value.trim().slice(0, 160);
  const city = $('pCity').value.trim().slice(0, 40);
  let link = $('pLink').value.trim();
  const birth = $('pBirth').value || null;
  const email = $('pEmail').value.trim().toLowerCase() || null;
  const phone = normPhone($('pPhone').value) || null;
  const np = $('pPass').value;
  if (!name) return shake($('pName'));
  if (birth && (birth < '1900-01-01' || birth > new Date().toISOString().slice(0, 10))) { toast('تاريخ الميلاد غير صحيح', 'error'); return shake($('pBirth')); }
  if (link) {
    if (!/^[a-z][a-z0-9+.-]*:/i.test(link)) link = 'https://' + link;
    try { const u = new URL(link); if (!/^https?:$/.test(u.protocol)) throw 0; link = u.href; }
    catch { toast('الرابط غير صحيح (يجب أن يبدأ بـ https://)', 'error'); return shake($('pLink')); }
  }
  if (email && !EMAIL_RE.test(email)) { toast('البريد غير صحيح', 'error'); return shake($('pEmail')); }
  if (phone && !/^\+?\d{6,15}$/.test(phone)) { toast('رقم الهاتف غير صحيح', 'error'); return shake($('pPhone')); }
  if (np && np.length < 8) { toast('كلمة المرور 8 أحرف على الأقل', 'error'); return shake($('pPass')); }

  setBusy($('pSave'), true, 'جارٍ الحفظ…');
  try {
    const patch = { name, bio, city, link };
    const { error } = await sb.from('profiles').update(patch).eq('id', me.id);
    if (error) return toast('تعذّر حفظ الملف', 'error');
    Object.assign(profile, patch); people[me.id] = profile; store.set('profile', profile);
    const priv = { id: me.id, email, phone, birth, discoverable: $('pFind').checked, updated_at: new Date().toISOString() };
    const { error: pe } = await sb.from('profile_private').upsert(priv, { onConflict: 'id' });
    if (pe) toast('تعذّر حفظ البيانات الخاصة', 'error'); else store.set('private', priv);
    if (np) {
      const { error: e2 } = await sb.auth.updateUser({ password: np });
      if (e2) return toast(authMsg(e2), 'error');
      $('pPass').value = '';
    }
    paintSettingsProfile(); renderList();
    toast('تم الحفظ', 'success');
    closeAll();
  } finally { setBusy($('pSave'), false); }
};

$('openAbout').onclick = () => openSheet('aboutSheet');
$('logoutBtn').onclick = async () => {
  if (!confirm('هل تريد تسجيل الخروج؟')) return;
  if (outbox.length && !confirm(`لديك ${outbox.length} رسالة لم تُرسل بعد وستُفقد. متابعة؟`)) return;
  try { await sb.auth.signOut(); } catch (x) { console.error('[signOut]', x); }
  await forceLogout();
};
$('deleteAcc').onclick = async () => {
  if (!needNet()) return;
  if (!confirm('حذف حسابك نهائياً مع رسائلك وبياناتك؟ لا يمكن التراجع.')) return;
  if (prompt('للتأكيد اكتب كلمة: حذف') !== 'حذف') return;
  const { error } = await sb.rpc('delete_my_account');
  if (error) { console.error('[delete]', error); return toast('تعذّر الحذف. تواصل مع الدعم من «حول LMLM»', 'error', 5000); }
  try { await sb.auth.signOut(); } catch {}
  await forceLogout('تم حذف حسابك');
};

/* ================= متفرقات ================= */
function openLightbox(src) {
  const lb = document.createElement('div');
  lb.className = 'lb';
  const img = document.createElement('img'); img.src = src; img.alt = '';
  const x = document.createElement('button'); x.textContent = '✕'; x.setAttribute('aria-label', 'إغلاق');
  lb.append(img, x);
  lb.onclick = (e) => { if (e.target !== img) lb.remove(); };
  document.body.append(lb);
}
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });
window.addEventListener('appinstalled', () => { deferredPrompt = null; toast('تم التثبيت', 'success'); });
document.querySelectorAll('[data-install]').forEach((b) => b.onclick = async () => {
  if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) return toast('التطبيق مثبّت بالفعل');
  if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; return; }
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return toast('اضغط زر المشاركة ثم "إضافة إلى الشاشة الرئيسية"', '', 5000);
  toast('من قائمة المتصفح اختر "تثبيت التطبيق"', '', 4000);
});
document.querySelectorAll('[data-share]').forEach((b) => b.onclick = async () => {
  const url = location.origin + location.pathname;
  if (navigator.share) { try { await navigator.share({ title: 'LMLM', text: 'انضم إلى LMLM', url }); } catch {} return; }
  try { await navigator.clipboard.writeText(url); toast('تم نسخ الرابط', 'success'); } catch { toast(url, '', 5000); }
});

$('msgs').addEventListener('scroll', () => {
  const m = $('msgs');
  $('jump').hidden = m.scrollHeight - m.scrollTop - m.clientHeight < 120;
});
$('jump').onclick = () => { const m = $('msgs'); m.scrollTop = m.scrollHeight; };

let errToastAt = 0;
window.addEventListener('error', (e) => {
  console.error('[window.error]', e.message);
  if (/ResizeObserver/.test(e.message || '') || Date.now() - errToastAt < 10000) return;
  errToastAt = Date.now(); toast('حدث خطأ غير متوقع', 'error', 3000);
});

/* ================= الإقلاع ================= */
async function loadLib() {
  let last;
  for (const u of LIB_URLS) {
    try { return await import(u); } catch (x) { last = x; console.warn('[lib] failed', u, x); }
  }
  throw last || new Error('lib');
}
function bootFail(msg) {
  $('bootSpin').hidden = true;
  $('bootMsg').textContent = msg; $('bootMsg').className = 'err';
  $('bootRetry').hidden = false; $('boot').hidden = false;
}
$('bootRetry').onclick = () => location.reload();

async function boot() {
  applyLook(); paintNet();
  const u = new URLSearchParams(location.search).get('u');
  if (u) { try { sessionStorage.setItem('lmlm-share', u); } catch {} history.replaceState(null, '', location.pathname); }
  let lib;
  try { lib = await loadLib(); } catch (x) {
    console.error('[boot]', x);
    return bootFail('تعذّر تحميل التطبيق. تحقق من الإنترنت ثم أعد المحاولة.');
  }
  sb = lib.createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT' && me) setTimeout(() => forceLogout('انتهت الجلسة، سجّل الدخول من جديد'), 0);
  });
  try {
    const r = await sb.auth.getSession();
    if (r.data && r.data.session) return void (await enterApp(r.data.session.user));
    if ((r.error && isNetErr(r.error)) || !isOnline()) {
      const snap = await store.get('me');
      if (snap) return void (await enterApp(snap));
    }
    showView('loginForm');
  } catch (x) {
    console.error('[boot session]', x);
    const snap = await store.get('me');
    if (snap && !isOnline()) return void (await enterApp(snap));
    showView('loginForm');
  }
}
boot();
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
