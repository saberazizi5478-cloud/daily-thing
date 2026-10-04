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
   Auth Modal
========================= */

function openAuth() {
  const modal = $('authModal');

  if (modal) {
    modal.classList.remove('hidden');
  }
}

function closeAuth() {
  const modal = $('authModal');

  if (modal) {
    modal.classList.add('hidden');
  }
}

function setAuthMessage(message, ok = false) {
  const el = $('authMessage');

  if (!el) return;

  el.textContent = message || '';
  el.className = `auth-message ${ok ? 'ok' : ''}`;
}


/* =========================
   Login
========================= */

async function login() {
  const email = $('authEmail')?.value.trim();
  const password = $('authPassword')?.value;

  if (!email || !password) {
    setAuthMessage('ایمیل و رمز عبور را وارد کن.');
    return;
  }

  setAuthMessage('در حال ورود...');

  const { error } =
    await db.auth.signInWithPassword({
      email,
      password
    });

  if (error) {
    setAuthMessage(normalizeError(error));
    return;
  }

  setAuthMessage('ورود موفق بود ✅', true);

  await refreshUser();
  await loadStats();

  setTimeout(() => {
    closeAuth();
  }, 500);
}


/* =========================
   Signup
========================= */

async function signup() {
  const name = $('authName')?.value.trim();
  const email = $('authEmail')?.value.trim();
  const password = $('authPassword')?.value;

  if (!email || !password) {
    setAuthMessage('ایمیل و رمز عبور را وارد کن.');
    return;
  }

  if (password.length < 6) {
    setAuthMessage(
      'رمز عبور باید حداقل ۶ کاراکتر باشد.'
    );
    return;
  }

  setAuthMessage('در حال ساخت حساب...');

  const { data, error } =
    await db.auth.signUp({
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

    state.user = data.user;

    setAuthMessage(
      'حساب ساخته شد و وارد شدی ✅',
      true
    );

    await loadStats();

    setTimeout(async () => {
      closeAuth();
      await submitPendingAnswerIfNeeded();
    }, 500);

  } else {

    setAuthMessage(
      'حساب ساخته شد. ایمیلت را تأیید کن و بعد وارد شو. ✅',
      true
    );

  }
}


/* =========================
   Current User
========================= */

async function refreshUser() {

  const {
    data,
    error
  } = await db.auth.getUser();

  if (error || !data?.user) {

    state.user = null;

    updateProfileUI();

    return null;
  }

  state.user = data.user;

  updateProfileUI();

  return data.user;
}


/* =========================
   Profile UI
========================= */

function updateProfileUI() {

  const nameEl = $('profileName');
  const emailEl = $('profileEmail');

  if (!state.user) {

    if (nameEl) {
      nameEl.textContent = 'مهمان';
    }

    if (emailEl) {
      emailEl.textContent =
        'هنوز وارد حساب نشده‌ای';
    }

    return;
  }

  const metadata =
    state.user.user_metadata || {};

  const name =
    metadata.display_name ||
    metadata.name ||
    'کاربر';

  if (nameEl) {
    nameEl.textContent = name;
  }

  if (emailEl) {
    emailEl.textContent =
      state.user.email || '';
  }
}


/* =========================
   Daily Content
========================= */

async function loadContent() {

  setText(
    'contentTitle',
    'در حال دریافت...'
  );

  setText(
    'contentBody',
    'کمی صبر کن...'
  );

  const {
    data,
    error
  } = await db.rpc(
    'get_active_daily_content'
  );

  console.log(
    'Daily content:',
    data,
    error
  );

  if (error) {

    console.error(
      'get_active_daily_content error:',
      error
    );

    setText(
      'contentTitle',
      'خطا در دریافت محتوای امروز'
    );

    setText(
      'contentBody',
      'لطفاً صفحه را دوباره باز کن.'
    );

    return;
  }

  if (!data) {

    setText(
      'contentTitle',
      'فعلاً محتوایی برای امروز منتشر نشده.'
    );

    setText(
      'contentBody',
      'به‌زودی اتفاق تازه‌ای اینجا قرار می‌گیرد.'
    );

    return;
  }

  state.content = data;
  state.selected = null;
  state.answered = false;
  state.busy = false;

  renderContent(data);
}


/* =========================
   Render Content
========================= */

function renderContent(content) {

  setText(
    'contentTitle',
    content.title || ''
  );

  setText(
    'contentBody',
    content.body || ''
  );

  const optionsEl = $('options');

  if (!optionsEl) {
    console.error(
      'Element #options not found'
    );
    return;
  }

  optionsEl.innerHTML = '';

  if (
    (
      content.type === 'quiz' ||
      content.type === 'poll'
    ) &&
    Array.isArray(content.options)
  ) {

    content.options.forEach((option) => {

      const button =
        document.createElement('button');

      button.type = 'button';

      button.className = 'option';

      button.textContent =
        option.text || '';

      button.addEventListener(
        'click',
        () => {
          selectOption(
            option.id,
            button
          );
        }
      );

      optionsEl.appendChild(button);
    });
  }


  const startButton = $('startBtn');

  if (startButton) {

    startButton.disabled = false;

    startButton.textContent =
      'شروع کن 🚀';
  }


  const result = $('result');

  if (result) {

    result.textContent = '';

    result.className =
      'result hidden';
  }
}


/* =========================
   Select Option
========================= */

function selectOption(
  optionId,
  button
) {

  if (
    state.busy ||
    state.answered
  ) {
    return;
  }

  state.selected = optionId;

  document
    .querySelectorAll('.option')
    .forEach((item) => {

      item.classList.remove(
        'selected'
      );

    });

  if (button) {
    button.classList.add(
      'selected'
    );
  }
}


/* =========================
   Preview Answer
========================= */

async function previewAnswer() {

  if (
    !state.content ||
    !state.selected ||
    state.busy
  ) {
    return;
  }

  state.busy = true;

  const startButton =
    $('startBtn');

  if (startButton) {

    startButton.disabled = true;

    startButton.textContent =
      'در حال بررسی...';
  }


  const {
    data,
    error
  } = await db.rpc(
    'preview_content_response',
    {
      p_content_id:
        state.content.id,

      p_option_id:
        state.selected
    }
  );


  state.busy = false;


  if (error) {

    console.error(
      'Preview error:',
      error
    );

    if (startButton) {

      startButton.disabled = false;

      startButton.textContent =
        'دوباره تلاش کن';
    }

    showResult(
      'بررسی پاسخ انجام نشد. دوباره امتحان کن.',
      false
    );

    return;
  }


  state.answered = true;

  const type = data?.type;

  const correct =
    data?.correct === true;

  const points =
    Number(data?.points || 0);


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

    startButton.textContent =
      state.user
        ? 'ثبت امتیاز'
        : 'ثبت امتیاز با حساب';
  }
}


/* =========================
   Quiz Result
========================= */

function markQuizResult(correct) {

  document
    .querySelectorAll('.option')
    .forEach((button) => {

      if (
        button.classList.contains(
          'selected'
        )
      ) {

        button.classList.add(
          correct
            ? 'correct'
            : 'wrong'
        );
      }

    });
}


/* =========================
   Result
========================= */

function showResult(
  message,
  success = true
) {

  const result = $('result');

  if (!result) return;

  result.textContent = message;

  result.className =
    `result ${
      success ? 'ok' : 'error'
    }`;
}


/* =========================
   Real Submit
========================= */

async function submitAnswer() {

  if (
    !state.content ||
    state.busy
  ) {
    return;
  }


  if (
    (
      state.content.type === 'quiz' ||
      state.content.type === 'poll'
    ) &&
    !state.selected
  ) {

    showResult(
      'اول یک گزینه را انتخاب کن.',
      false
    );

    return;
  }


  /*
   * Guest:
   * ابتدا پاسخ را بررسی می‌کنیم.
   * سپس برای ثبت امتیاز حساب می‌خواهیم.
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
   * اگر پاسخ قبلاً Preview شده،
   * حالا ثبت واقعی انجام می‌شود.
   */

  if (state.answered) {

    await submitPendingAnswerIfNeeded();

    return;
  }


  await performRealSubmit();
}


/* =========================
   Perform Real Submit
========================= */

async function performRealSubmit() {

  if (
    !state.content ||
    !state.user ||
    state.busy
  ) {
    return;
  }

  state.busy = true;

  const startButton =
    $('startBtn');

  if (startButton) {

    startButton.disabled = true;

    startButton.textContent =
      'در حال ثبت...';
  }


  const {
    data,
    error
  } = await db.rpc(
    'submit_content_response',
    {
      p_content_id:
        state.content.id,

      p_option_id:
        state.selected || null
    }
  );


  state.busy = false;


  if (error) {

    console.error(
      'Submit error:',
      error
    );

    if (startButton) {

      startButton.disabled = false;

      startButton.textContent =
        'دوباره تلاش کن';
    }

    showResult(
      normalizeError(error),
      false
    );

    return;
  }


  state.answered = true;

  clearPendingAnswer();


  const points =
    Number(
      data?.points_earned ??
      data?.points ??
      0
    );

  const correct =
    data?.correct === true;


  if (
    state.content.type === 'quiz'
  ) {

    markQuizResult(correct);

    showResult(
      correct
        ? `درست گفتی! 🎉 +${points} امتیاز`
        : (
            points > 0
              ? `ثبت شد. +${points} امتیاز`
              : 'ثبت شد. امتیازی نگرفتی.'
          ),
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

    startButton.textContent =
      'ثبت شد ✓';
  }


  await loadStats();
}


/* =========================
   Pending Submit
========================= */

async function submitPendingAnswerIfNeeded() {

  if (
    !state.user ||
    !state.content
  ) {
    return;
  }


  const pending =
    getPendingAnswer();


  if (!pending) {
    return;
  }


  if (
    pending.contentId !==
    state.content.id
  ) {

    clearPendingAnswer();

    return;
  }


  state.selected =
    pending.optionId;


  await performRealSubmit();
}


/* =========================
   Stats
========================= */

async function loadStats() {

  if (!state.user) {

    setText(
      'score',
      '۰'
    );

    setText(
      'streak',
      '۰ 🔥'
    );

    setText(
      'rank',
      '—'
    );

    return;
  }


  const scoreResult =
    await db.rpc(
      'get_my_score'
    );


  if (
    !scoreResult.error &&
    scoreResult.data != null
  ) {

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
      Number(
        value || 0
      ).toLocaleString(
        'fa-IR'
      )
    );
  }


  const statsResult =
    await db.rpc(
      'get_my_stats'
    );


  if (
    !statsResult.error &&
    statsResult.data
  ) {

    const stats =
      statsResult.data;


    const streak =
      Number(
        stats.current_streak ??
        stats.streak ??
        0
      );


    setText(
      'streak',
      `${streak.toLocaleString('fa-IR')} 🔥`
    );


    setText(
      'profileStreak',
      streak.toLocaleString('fa-IR')
    );


    setText(
      'longestStreak',
      Number(
        stats.longest_streak ?? 0
      ).toLocaleString('fa-IR')
    );


    setText(
      'activityCount',
      Number(
        stats.activity_count ??
        stats.total_activities ??
        0
      ).toLocaleString('fa-IR')
    );


    setText(
      'totalScore',
      Number(
        stats.total_points ??
        stats.points ??
        0
      ).toLocaleString('fa-IR')
    );
  }


  const rankResult =
    await db.rpc(
      'get_my_weekly_rank'
    );


  if (
    !rankResult.error &&
    rankResult.data != null
  ) {

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
        : Number(
            value
          ).toLocaleString(
            'fa-IR'
          )
    );
  }
}


/* =========================
   Leaderboard
========================= */

async function loadLeaderboard() {

  const leaderboard =
    $('leaderboard');

  if (!leaderboard) return;

  const {
    data,
    error
  } = await db.rpc(
    'get_weekly_leaderboard',
    {
      p_limit: 50
    }
  );


  if (error) {

    console.error(
      'Leaderboard error:',
      error
    );

    leaderboard.innerHTML =
      '<div class="empty">فعلاً رتبه‌بندی در دسترس نیست.</div>';

    return;
  }


  if (
    !Array.isArray(data) ||
    data.length === 0
  ) {

    leaderboard.innerHTML =
      '<div class="empty">هنوز رتبه‌بندی شکل نگرفته.</div>';

    return;
  }


  leaderboard.innerHTML = '';


  data.forEach((item, index) => {

    const row =
      document.createElement('div');

    row.className =
      'leaderboard-item';


    const rank =
      item.rank ??
      index + 1;


    const name =
      item.name ||
      item.display_name ||
      'کاربر';


    const points =
      Number(
        item.points ??
        item.total_points ??
        0
      );


    row.innerHTML = `
      <span class="leaderboard-rank">
        ${Number(rank).toLocaleString('fa-IR')}
      </span>

      <span class="leaderboard-name">
        ${name}
      </span>

      <strong class="leaderboard-score">
        ${points.toLocaleString('fa-IR')}
      </strong>
    `;


    leaderboard.appendChild(row);
  });
}


/* =========================
   Navigation
========================= */

function setupNavigation() {

  const buttons =
    document.querySelectorAll(
      '[data-section]'
    );


  buttons.forEach((button) => {

    button.addEventListener(
      'click',
      async () => {

        const target =
          button.dataset.section;


        document
          .querySelectorAll(
            '.page'
          )
          .forEach((page) => {

            page.classList.toggle(
              'active',
              page.id === target
            );

          });


        buttons.forEach(
          (item) => {

            item.classList.toggle(
              'active',
              item.dataset.section ===
              target
            );

          }
        );


        if (
          target ===
          'competitionPage'
        ) {

          await loadLeaderboard();
        }


        if (
          target ===
          'profilePage'
        ) {

          await refreshUser();
          await loadStats();
        }

      }
    );
  });
}


/* =========================
   Profile Button
========================= */

function setupProfileButton() {

  const button =
    $('profileBtn');

  if (!button) return;

  button.addEventListener(
    'click',
    () => {

      const profileNav =
        document.querySelector(
          '[data-section="profilePage"]'
        );

      if (profileNav) {
        profileNav.click();
      }

    }
  );
}


/* =========================
   Auth Button
========================= */

function setupAuthButton() {

  const button =
    $('authBtn');

  if (!button) return;

  button.addEventListener(
    'click',
    () => {

      if (state.user) {

        showResult(
          'حساب شما فعال است ✅',
          true
        );

        return;
      }

      openAuth();
    }
  );
}


/* =========================
   Auth UI Events
========================= */

function setupAuth() {

  const loginButton =
    $('emailLogin');

  const signupButton =
    $('emailSignup');


  if (loginButton) {

    loginButton.addEventListener(
      'click',
      login
    );
  }


  if (signupButton) {

    signupButton.addEventListener(
      'click',
      signup
    );
  }


  const closeButton =
    $('closeAuth');


  if (closeButton) {

    closeButton.addEventListener(
      'click',
      closeAuth
    );
  }


  const modal =
    $('authModal');


  if (modal) {

    modal.addEventListener(
      'click',
      (event) => {

        if (
          event.target ===
          modal
        ) {

          closeAuth();
        }

      }
    );
  }
}


/* =========================
   Start Button
========================= */

function setupStartButton() {

  const button =
    $('startBtn');

  if (!button) return;


  button.addEventListener(
    'click',
    async () => {

      if (
        !state.user &&
        !state.answered
      ) {

        await submitAnswer();

        return;
      }


      if (
        !state.user &&
        state.answered
      ) {

        savePendingAnswer();

        openAuth();

        return;
      }


      await submitAnswer();

    }
  );
}


/* =========================
   Auth State Listener
========================= */

function setupAuthListener() {

  db.auth.onAuthStateChange(
    async (_event, session) => {

      state.user =
        session?.user || null;

      updateProfileUI();

      await loadStats();


      if (state.user) {

        await submitPendingAnswerIfNeeded();
      }

    }
  );
}


/* =========================
   Init
========================= */

async function init() {

  setupNavigation();

  setupAuth();

  setupStartButton();

  setupProfileButton();

  setupAuthButton();

  setupAuthListener();


  await refreshUser();

  await loadContent();

  await loadStats();

  await submitPendingAnswerIfNeeded();

}


/* =========================
   Start
========================= */

document.addEventListener(
  'DOMContentLoaded',
  init
);
