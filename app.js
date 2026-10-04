'use strict';

const { createClient } = window.supabase;
const db = createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const state = { user: null, content: null, selected: null, answered: false, busy: false };
const $ = (id) => document.getElementById(id);
const esc = (v = '') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const setText = (id, v) => { const el = $(id); if (el) el.textContent = v ?? ''; };
const showAuthMessage = (t, ok = false) => { setText('authMsg', t); $('authMsg').className = `msg ${ok ? 'ok' : ''}`; };
const openAuth = () => $('authModal').classList.remove('hidden');
const closeAuth = () => $('authModal').classList.add('hidden');

async function refreshUser() {
  const { data, error } = await db.auth.getUser();
  if (error) console.warn('getUser:', error.message);
  state.user = data?.user || null;
  setText('authBtn', state.user ? 'حساب من' : 'ورود با Google');
  const meta = state.user?.user_metadata || {};
  setText('profileName', meta.full_name || meta.name || state.user?.email?.split('@')[0] || 'مهمان');
  setText('profileEmail', state.user?.email || '');
  const avatar = meta.avatar_url || meta.picture;
  $('avatar').innerHTML = avatar ? `<img src="${esc(avatar)}" alt="">` : '🙂';
}

async function loadStats() {
  if (!state.user) {
    ['score','streak','pScore','pStreak','pLongest','pAnswers'].forEach(id => setText(id, '0'));
    setText('rank', '—'); return;
  }
  const [{ data: stats, error: statsError }, { data: rank, error: rankError }] = await Promise.all([
    db.rpc('get_my_stats'), db.rpc('get_my_weekly_rank')
  ]);
  if (statsError) console.warn('stats:', statsError.message);
  if (rankError) console.warn('rank:', rankError.message);
  const s = stats || {};
  setText('score', s.score || 0); setText('streak', s.streak || 0);
  setText('pScore', s.score || 0); setText('pStreak', s.streak || 0);
  setText('pLongest', s.longest_streak || 0); setText('pAnswers', s.answers || 0);
  setText('rank', rank?.[0]?.rank ?? rank ?? '—');
}

function renderOptions(options) {
  $('options').innerHTML = options.map(o => `<button class="option" type="button" data-id="${esc(o.id)}">${esc(o.text)}</button>`).join('');
  document.querySelectorAll('.option').forEach(btn => btn.addEventListener('click', () => {
    if (state.answered || state.busy) return;
    document.querySelectorAll('.option').forEach(x => x.classList.remove('selected'));
    btn.classList.add('selected'); state.selected = btn.dataset.id;
  }));
}

async function loadContent() {
  state.content = null; state.selected = null; state.answered = false;
  $('startBtn').disabled = true; $('result').textContent = '';
  const now = new Date().toISOString();
  const { data, error } = await db.from('daily_content')
    .select('id,type,title,body,points,content_options(id,text,is_correct,sort_order)')
    .eq('status','published').lte('publish_at', now)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('publish_at', { ascending: false }).limit(1).maybeSingle();
  if (error) {
    console.error('content:', error); setText('contentTitle','خطا در دریافت محتوای امروز');
    setText('contentBody','اتصال را بررسی کن و دوباره تلاش کن.'); return;
  }
  if (!data) { setText('contentTitle','هنوز اتفاق امروز منتشر نشده'); setText('contentBody','به‌زودی اولین محتوای روز اینجا میاد.'); return; }
  state.content = data; setText('contentTitle', data.title); setText('contentBody', data.body || '');
  const opts = (data.content_options || []).sort((a,b) => a.sort_order - b.sort_order);
  renderOptions(opts); $('startBtn').disabled = false;
}

async function submitAnswer() {
  if (!state.user) return openAuth();
  if (!state.content || state.busy || state.answered) return;
  if (state.content.type === 'quiz' && !state.selected) return showResult('اول یک گزینه رو انتخاب کن 🙂', false);
  state.busy = true; $('startBtn').disabled = true;
  const { data, error } = await db.rpc('submit_content_response', { p_content_id: state.content.id, p_option_id: state.selected || null });
  state.busy = false;
  if (error) {
    console.error('submit:', error);
    showResult(error.message.includes('already_answered') ? 'امروز قبلاً جواب دادی 😉' : 'ثبت پاسخ انجام نشد؛ دوباره امتحان کن.', false);
    $('startBtn').disabled = false; return;
  }
  state.answered = true;
  showResult(data?.correct ? `آفرین! +${data.points} امتیاز 🎉` : 'این یکی نشد 😄 فردا دوباره بیا', !!data?.correct);
  document.querySelectorAll('.option').forEach(btn => {
    const opt = state.content.content_options.find(x => x.id === btn.dataset.id);
    if (opt?.is_correct) btn.classList.add('correct'); else if (btn.dataset.id === state.selected) btn.classList.add('wrong');
  });
  await loadStats();
}
function showResult(text, success) { setText('result', text); $('result').className = `result ${success ? 'success' : 'fail'}`; }

async function signInWithGoogle() {
  showAuthMessage('در حال انتقال به Google...');
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) showAuthMessage(error.message || 'ورود با Google انجام نشد.');
}
async function logout() { await db.auth.signOut(); state.user = null; closeAuth(); await refreshUser(); await loadStats(); showPage('home'); }
function showPage(id) {
  document.querySelectorAll('.page').forEach(x => x.classList.toggle('active', x.id === id));
  document.querySelectorAll('.nav').forEach(x => x.classList.toggle('active', x.dataset.page === id));
  if (id === 'competition') loadLeaderboard();
  if (id === 'profile') loadStats();
}
async function loadLeaderboard() {
  const box = $('leaderboard');
  if (!state.user) { box.innerHTML = '<div class="empty">برای دیدن رتبه‌بندی وارد شو.</div>'; return; }
  const { data, error } = await db.rpc('get_weekly_leaderboard', { p_limit: 50 });
  if (error) { console.warn('leaderboard:', error.message); box.innerHTML = '<div class="empty">رتبه‌بندی فعلاً در دسترس نیست.</div>'; return; }
  box.innerHTML = data?.length ? data.map(x => `<div class="item"><div><b>#${esc(x.rank)} ${esc(x.name || 'کاربر')}</b><br><small>${esc(x.points)} امتیاز</small></div><span>${Number(x.rank) <= 3 ? '🏆' : '⭐'}</span></div>`).join('') : '<div class="empty">هنوز امتیازی ثبت نشده.</div>';
}

for (const btn of document.querySelectorAll('.nav')) btn.addEventListener('click', () => showPage(btn.dataset.page));
$('authBtn').addEventListener('click', () => state.user ? showPage('profile') : openAuth());
$('closeAuth').addEventListener('click', closeAuth); $('googleLogin').addEventListener('click', signInWithGoogle);
$('startBtn').addEventListener('click', submitAnswer); $('logoutBtn').addEventListener('click', logout);
$('authModal').addEventListener('click', e => { if (e.target === $('authModal')) closeAuth(); });

db.auth.onAuthStateChange((_event, session) => {
  state.user = session?.user || null;
  setTimeout(async () => { await refreshUser(); await loadStats(); }, 0);
});

(async function init() {
  await refreshUser();
  if (state.user) { const { error } = await db.rpc('record_daily_login'); if (error) console.warn('daily login:', error.message); }
  await loadStats(); await loadContent();
})();
