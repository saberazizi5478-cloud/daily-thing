'use strict';

const { createClient } = window.supabase;

const db = createClient(
  APP_CONFIG.SUPABASE_URL,
  APP_CONFIG.SUPABASE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

const $ = (id) => document.getElementById(id);

const PENDING_KEY = 'dailyThingPendingAnswer';

const state = {
  user: null,
  content: null,
  selected: null,
  answered: false,
  busy: false
};

/* =========================
   Helpers
========================= */

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value ?? '';
}

function show(el, visible = true) {
  if (!el) return;
  el.classList.toggle('hidden', !visible);
}

function normalizeError(error) {
  if (!error) return 'خطایی رخ داد.';
  return error.message || String(error);
}

/* =========================
   Pending Answer
========================= */

function savePendingAnswer() {
  if (!state.content || !state.selected) return;

  sessionStorage.setItem(
    PENDING_KEY,
    JSON.stringify({
      contentId: state.content.id,
      optionId: state.selected
    })
  );
}

function getPendingAnswer() {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearPendingAnswer() {
  sessionStorage.removeItem(PENDING_KEY);
}

/* =========================
   Auth
========================= */

function openAuth() {
  const modal = $('authModal');
  if (modal) modal.classList.remove('hidden');
}

function closeAuth() {
  const modal = $('authModal');
  if (modal) modal.classList.add('hidden');
}

function setAuthMessage(message, ok = false) {
  const el = $('authMessage');

  if (!el) return;

  el.textContent = message || '';
  el.className = `auth-message ${ok ? 'ok' : ''}`;
}

async function login() {
  const email = $('authEmail')?.value.trim();
  const password = $('authPassword')?.value;

  if (!email || !password) {
    setAuthMessage('ایمیل و رمز عبور را وارد کن.');
    return;
  }

  setAuthMessage('در حال ورود...');

  const { error } = await db.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    setAuthMessage(normalizeError(error));
    return;
  }

  setAuthMessage('ورود موفق بود ✅', true);

  setTimeout(() => {
    closeAuth();
  }, 400);
}

async function signup() {
  const name = $('authName')?.value.trim();
  const email = $('authEmail')?.value.trim();
  const password = $('authPassword')?.value;

  if (!email || !password) {
    setAuthMessage('ایمیل و رمز عبور را وارد کن.');
    return;
  }

  if (password.length < 6) {
    setAuthMessage('رمز عبور باید حداقل ۶ کاراکتر باشد.');
    return;
  }

  setAuthMessage('در حال ساخت حساب...');

  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: name || 'کاربر'
      }
    }
  });

  if (error) {
    setAuthMessage(normalizeError(error));
    return;
  }

  if (data.session) {
    setAuthMessage('حساب ساخته شد و وارد شدی ✅', true);

    setTimeout(() => {
      closeAuth();
    }, 400);
  } else {
    setAuthMessage(
      'حساب ساخته شد. اگر تأیید ایمیل فعال باشد، ایمیلت را تأیید کن و بعد وارد شو. ✅',
      true
    );
  }
}

/* =========================
   Load User
========================= */

async function refreshUser() {
  const {
    data,
    error
  } = await db.auth.getUser();

  if (error || !data?.user) {
    state.user = null;
    return null;
  }

  state.user = data.user;
  return data.user;
}

/* =========================
   Daily Content
========================= */

async function loadContent() {
  const {
    data,
    error
  } = await db.rpc('get_active_daily_content');

  if (error) {
    console.error(error);

    setText(
      'contentTitle',
      'فعلاً محتوایی برای امروز پیدا نشد.'
    );

    return;
  }

  if (!data) {
    setText(
      'contentTitle',
      'فعلاً محتوایی برای امروز منتشر نشده.'
    );

    return;
  }

  state.content = data;
  state.selected = null;
  state.answered = false;

  renderContent(data);
}

function renderContent(content) {
  setText('contentTitle', content.title || '');
  setText('contentBody', content.body || '');

  const optionsEl = $('options');

  if (!optionsEl) return;

  optionsEl.innerHTML = '';

  if (
    (content.type === 'quiz' || content.type === 'poll') &&
    Array.isArray(content.options)
  ) {
    content.options.forEach((option) => {
      const button = document.createElement('button');

      button.type = 'button';
      button.className = 'option';
      button.textContent = option.text;

      button.addEventListener('click', () => {
        selectOption(option.id, button);
      });

      optionsEl.appendChild(button);
    });
  }

  const startButton = $('startBtn');

  if (startButton) {
    startButton.textContent = 'شروع کن';
    startButton.disabled = false;
  }

  const result = $('result');

  if (result) {
    result.textContent = '';
    result.className = 'result hidden';
  }
}

/* =========================
   Select Option
========================= */

function selectOption(optionId, button) {
  if (state.busy || state.answered) return;

  state.selected = optionId;

  document
    .querySelectorAll('.option')
    .forEach((item) => item.classList.remove('selected'));

  button.classList.add('selected');
}

/* =========================
   Preview Answer
========================= */

async function previewAnswer() {
  if (!state.content || !state.selected || state.busy) {
    return;
  }

  state.busy = true;

  const startButton = $('startBtn');

  if (startButton) {
    startButton.disabled = true;
    startButton.textContent = 'در حال بررسی...';
  }

  const {
    data,
    error
  } = await db.rpc('preview_content_response', {
    p_content_id: state.content.id,
    p_option_id: state.selected
  });

  state.busy = false;

  if (error) {
    console.error(error);

    if (startButton) {
      startButton.disabled = false;
      startButton.textContent = 'دوباره تلاش کن';
    }

    showResult('بررسی پاسخ انجام نشد. دوباره امتحان کن.', false);
    return;
  }

  state.answered = true;

  const type = data?.type;
  const correct = data?.correct;
  const points = Number(data?.points || 0);

  if (type === 'quiz') {
    markQuizResult(correct);

    if (correct) {
      showResult(
        `درست گفتی! 🎉 +${points} امتیاز`,
        true
      );
    } else {
      showResult(
        'این جواب درست نبود 😅',
        false
      );
    }
  } else if (type === 'poll') {
    showResult(
      'رأی تو ثبت می‌شود؛ برای گرفتن امتیاز وارد حسابت شو.',
      true
    );
  } else if (type === 'challenge') {
    showResult(
      `چالش انجام شد! برای ثبت +${points} امتیاز وارد حسابت شو.`,
      true
    );
  }

  savePendingAnswer();

  if (startButton) {
    startButton.disabled = false;
    startButton.textContent = 'ثبت امتیاز با حساب';
  }
}

function markQuizResult(correct) {
  if (!state.content?.options) return;

  document.querySelectorAll('.option').forEach((button, index) => {
    const option = state.content.options[index];

    if (!option) return;

    if (option.id === state.selected) {
      button.classList.add(correct ? 'correct' : 'wrong');
    }

    if (!correct && option.is_correct === true) {
      button.classList.add('correct');
    }
  });
}

function showResult(message, success = true) {
  const result = $('result');

  if (!result) return;

  result.textContent = message;
  result.className = `result ${success ? 'ok' : 'error'}`;
}

/* =========================
   Real Submit
========================= */

async function submitAnswer() {
  if (!state.content || state.busy) {
    return;
  }

  /*
   * Quiz / Poll require a selected option.
   */
  if (
    (state.content.type === 'quiz' ||
      state.content.type === 'poll') &&
    !state.selected
  ) {
    showResult('اول یک گزینه را انتخاب کن.', false);
    return;
  }

  /*
   * Guest:
   * first preview the answer,
   * then ask for account only when saving score.
   */
  if (!state.user) {
    if (!state.answered) {
      await previewAnswer();
      return;
    }

    savePendingAnswer();
    openAuth();

    return;
  }

  /*
   * Already answered locally.
   * User may simply need to save the pending answer.
   */
  if (state.answered) {
    await submitPendingAnswerIfNeeded();
    return;
  }

  state.busy = true;

  const startButton = $('startBtn');

  if (startButton) {
    startButton.disabled = true;
    startButton.textContent = 'در حال ثبت...';
  }

  const {
    data,
    error
  } = await db.rpc('submit_content_response', {
    p_content_id: state.content.id,
    p_option_id: state.selected || null
  });

  state.busy = false;

  if (error) {
    console.error(error);

    if (startButton) {
      startButton.disabled = false;
      startButton.textContent = 'دوباره تلاش کن';
    }

    showResult(normalizeError(error), false);
    return;
  }

  state.answered = true;

  clearPendingAnswer();

  const points = Number(data?.points_earned ?? data?.points ?? 0);
  const correct = data?.correct;

  if (state.content.type === 'quiz') {
    markQuizResult(correct);

    showResult(
      correct
        ? `درست گفتی! 🎉 +${points} امتیاز`
        : `ثبت شد. ${points > 0 ? `+${points} امتیاز` : 'امتیازی نگرفتی.'}`,
      correct
    );
  } else {
    showResult(
      `ثبت شد! 🎉 +${points} امتیاز`,
      true
    );
  }

  if (startButton) {
    startButton.disabled = true;
    startButton.textContent = 'ثبت شد ✓';
  }

  await loadStats();
}

/* =========================
   Pending Submit After Login
========================= */

async function submitPendingAnswerIfNeeded() {
  if (!state.user || !state.content) {
    return;
  }

  const pending = getPendingAnswer();

  if (!pending) {
    return;
  }

  if (pending.contentId !== state.content.id) {
    clearPendingAnswer();
    return;
  }

  state.selected = pending.optionId;

  state.busy = true;

  const startButton = $('startBtn');

  if (startButton) {
    startButton.disabled = true;
    startButton.textContent = 'در حال ثبت امتیاز...';
  }

  const {
    data,
    error
  } = await db.rpc('submit_content_response', {
    p_content_id: pending.contentId,
    p_option_id: pending.optionId
  });

  state.busy = false;

  if (error) {
    console.error(error);

    if (startButton) {
      startButton.disabled = false;
      startButton.textContent = 'ثبت امتیاز';
    }

    showResult(
      `ثبت امتیاز انجام نشد: ${normalizeError(error)}`,
      false
    );

    return;
  }

  clearPendingAnswer();

  state.answered = true;

  const points = Number(
    data?.points_earned ?? data?.points ?? 0
  );

  const correct = data?.correct;

  if (state.content.type === 'quiz') {
    markQuizResult(correct);
  }

  showResult(
    `امتیاز با موفقیت ثبت شد 🎉 +${points}`,
    true
  );

  if (startButton) {
    startButton.disabled = true;
    startButton.textContent = 'امتیاز ثبت شد ✓';
  }

  await loadStats();
}

/* =========================
   Stats
========================= */

async function loadStats() {
  if (!state.user) {
    setText('score', '۰');
    setText('streak', '۰');
    setText('rank', '—');
    return;
  }

  const scoreResult = await db.rpc('get_my_score');

  if (!scoreResult.error && scoreResult.data != null) {
    const value =
      typeof scoreResult.data === 'object'
        ? (
            scoreResult.data.total_points ??
            scoreResult.data.points ??
            scoreResult.data.score ??
            0
          )
        : scoreResult.data;

    setText(
      'score',
      Number(value || 0).toLocaleString('fa-IR')
    );
  }

  const statsResult = await db.rpc('get_my_stats');

  if (!statsResult.error && statsResult.data) {
    const stats = statsResult.data;

    setText(
      'streak',
      Number(
        stats.current_streak ??
        stats.streak ??
        0
      ).toLocaleString('fa-IR')
    );
  }

  const rankResult = await db.rpc('get_my_weekly_rank');

  if (!rankResult.error && rankResult.data != null) {
    const value =
      typeof rankResult.data === 'object'
        ? (
            rankResult.data.rank ??
            rankResult.data.weekly_rank ??
            '—'
          )
        : rankResult.data;

    setText(
      'rank',
      value === '—'
        ? '—'
        : Number(value).toLocaleString('fa-IR')
    );
  }
}

/* =========================
   Navigation
========================= */

function setupNavigation() {
  document.querySelectorAll('[data-section]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.section;

      document
        .querySelectorAll('.section')
        .forEach((section) => {
          section.classList.add('hidden');
        });

      const targetSection = $(target);

      if (targetSection) {
        targetSection.classList.remove('hidden');
      }

      document
        .querySelectorAll('[data-section]')
        .forEach((item) => {
          item.classList.toggle(
            'active',
            item.dataset.section === target
          );
        });
    });
  });
}

/* =========================
   Auth UI Events
========================= */

function setupAuth() {
  const loginButton = $('emailLogin');
  const signupButton = $('emailSignup');

  if (loginButton) {
    loginButton.addEventListener('click', login);
  }

  if (signupButton) {
    signupButton.addEventListener('click', signup);
  }

  const closeButton = $('closeAuth');

  if (closeButton) {
    closeButton.addEventListener('click', closeAuth);
  }

  const modal = $('authModal');

  if (modal) {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        closeAuth();
      }
    });
  }
}

/* =========================
   Start Button
========================= */

function setupStartButton() {
  const button = $('startBtn');

  if (!button) return;

  button.addEventListener('click', async () => {
    /*
     * Guest + not answered:
     * preview result.
     */
    if (!state.user && !state.answered) {
      await submitAnswer();
      return;
    }

    /*
     * Guest + already previewed:
     * now ask for account.
     */
    if (!state.user && state.answered) {
      savePendingAnswer();
      openAuth();
      return;
    }

    /*
     * Logged in:
     * submit normally.
     */
    await submitAnswer();
  });
}

/* =========================
   Auth State Listener
========================= */

function setupAuthListener() {
  db.auth.onAuthStateChange(async (_event, session) => {
    state.user = session?.user || null;

    await loadStats();

    if (state.user) {
      await submitPendingAnswerIfNeeded();
    }
  });
}

/* =========================
   Init
========================= */

async function init() {
  setupNavigation();
  setupAuth();
  setupStartButton();
  setupAuthListener();

  await refreshUser();
  await loadContent();
  await loadStats();

  /*
   * If user had answered before login,
   * automatically save it after session exists.
   */
  await submitPendingAnswerIfNeeded();
}

document.addEventListener('DOMContentLoaded', init);
