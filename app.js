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

const state = {
  user: null,
  content: null,
  selected: null,
  answered: false,
  busy: false
};

const $ = (id) => document.getElementById(id);

const esc = (value = '') =>
  String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));

const setText = (id, value) => {
  const el = $(id);
  if (el) el.textContent = value ?? '';
};

const showAuthMessage = (text, success = false) => {
  const el = $('authMsg');
  if (!el) return;
  el.textContent = text;
  el.className = `msg ${success ? 'ok' : ''}`;
};

const openAuth = () => {
  $('authModal')?.classList.remove('hidden');
};

const closeAuth = () => {
  $('authModal')?.classList.add('hidden');
};

const showResult = (text, success = false) => {
  const el = $('result');
  if (!el) return;
  el.textContent = text;
  el.className = `result ${success ? 'success' : 'fail'}`;
};

function getDisplayName(user) {
  const meta = user?.user_metadata || {};

  return (
    meta.full_name ||
    meta.name ||
    meta.user_name ||
    user?.email?.split('@')[0] ||
    'کاربر'
  );
}

function getAvatarUrl(user) {
  const meta = user?.user_metadata || {};
  return meta.avatar_url || meta.picture || '';
}

async function refreshUser() {
  const { data, error } = await db.auth.getUser();

  if (error) {
    console.warn('getUser:', error.message);
  }

  state.user = data?.user || null;

  setText(
    'authBtn',
    state.user ? 'حساب من' : 'ورود با Google'
  );

  setText(
    'profileName',
    getDisplayName(state.user)
  );

  setText(
    'profileEmail',
    state.user?.email || ''
  );

  const avatar = $('avatar');

  if (avatar) {
    const url = getAvatarUrl(state.user);

    if (url) {
      avatar.innerHTML = `
        <img
          src="${esc(url)}"
          alt=""
          loading="lazy"
          referrerpolicy="no-referrer"
        >
      `;
    } else {
      avatar.textContent = '🙂';
    }
  }
}

async function loadStats() {
  if (!state.user) {
    setText('score', 0);
    setText('streak', 0);
    setText('rank', '—');
    setText('pScore', 0);
    setText('pStreak', 0);
    setText('pLongest', 0);
    setText('pAnswers', 0);
    return;
  }

  const [statsResult, rankResult] = await Promise.all([
    db.rpc('get_my_stats'),
    db.rpc('get_my_weekly_rank')
  ]);

  if (statsResult.error) {
    console.warn('stats:', statsResult.error.message);
  }

  if (rankResult.error) {
    console.warn('rank:', rankResult.error.message);
  }

  const stats = statsResult.data || {};

  setText('score', stats.score || 0);
  setText('streak', stats.streak || 0);

  setText('pScore', stats.score || 0);
  setText('pStreak', stats.streak || 0);
  setText('pLongest', stats.longest_streak || 0);
  setText('pAnswers', stats.answers || 0);

  let rank = '—';

  if (Array.isArray(rankResult.data)) {
    rank = rankResult.data[0]?.rank ?? '—';
  } else if (rankResult.data != null) {
    rank = rankResult.data;
  }

  setText('rank', rank);
}

function getButtonLabel(type) {
  switch (type) {
    case 'quiz':
      return 'ثبت جواب';
    case 'poll':
      return 'ثبت رأی';
    case 'challenge':
      return 'انجام دادم 🎯';
    default:
      return 'ثبت';
  }
}

function renderOptions(options = []) {
  const container = $('options');

  if (!container) return;

  if (!options.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = options
    .map(
      (option) => `
        <button
          class="option"
          type="button"
          data-id="${esc(option.id)}"
        >
          ${esc(option.text)}
        </button>
      `
    )
    .join('');

  container.querySelectorAll('.option').forEach((button) => {
    button.addEventListener('click', () => {
      if (state.answered || state.busy) return;

      container
        .querySelectorAll('.option')
        .forEach((item) => {
          item.classList.remove('selected');
        });

      button.classList.add('selected');
      state.selected = button.dataset.id;
    });
  });
}

function setOptionsDisabled(disabled) {
  document
    .querySelectorAll('.option')
    .forEach((button) => {
      button.disabled = disabled;
    });
}

async function loadContent() {
  state.content = null;
  state.selected = null;
  state.answered = false;
  state.busy = false;

  const startBtn = $('startBtn');

  if (startBtn) {
    startBtn.disabled = true;
    startBtn.textContent = 'در حال آماده‌سازی...';
  }

  setText('contentTitle', 'در حال آماده‌سازی...');
  setText('contentBody', 'یک لحظه صبر کن.');
  setText('result', '');

  if ($('options')) {
    $('options').innerHTML = '';
  }

  const { data, error } = await db.rpc(
    'get_active_daily_content'
  );

  if (error) {
    console.error('content:', error);

    setText(
      'contentTitle',
      'خطا در دریافت محتوای امروز'
    );

    setText(
      'contentBody',
      'اتصال را بررسی کن و دوباره تلاش کن.'
    );

    if (startBtn) {
      startBtn.textContent = 'تلاش دوباره';
      startBtn.disabled = false;
      startBtn.onclick = async () => {
        startBtn.onclick = null;
        await loadContent();
      };
    }

    return;
  }

  if (!data) {
    setText(
      'contentTitle',
      'هنوز اتفاق امروز منتشر نشده'
    );

    setText(
      'contentBody',
      'به‌زودی اولین محتوای روز اینجا میاد.'
    );

    if (startBtn) {
      startBtn.textContent = 'منتظر بمون 😉';
      startBtn.disabled = true;
    }

    return;
  }

  state.content = data;

  setText(
    'contentTitle',
    data.title || 'اتفاق امروز'
  );

  setText(
    'contentBody',
    data.body || ''
  );

  const options = Array.isArray(data.options)
    ? [...data.options].sort(
        (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
      )
    : [];

  renderOptions(options);

  if (startBtn) {
    startBtn.onclick = submitAnswer;
    startBtn.textContent = getButtonLabel(data.type);

    startBtn.disabled =
      data.type !== 'challenge' && options.length === 0;
  }
}

async function submitAnswer() {
  if (!state.user) {
    openAuth();
    return;
  }

  if (!state.content || state.busy || state.answered) {
    return;
  }

  const type = state.content.type;

  if (
    (type === 'quiz' || type === 'poll') &&
    !state.selected
  ) {
    showResult(
      type === 'quiz'
        ? 'اول یک گزینه رو انتخاب کن 🙂'
        : 'اول گزینه موردنظرت رو انتخاب کن 🙂',
      false
    );
    return;
  }

  state.busy = true;

  const startBtn = $('startBtn');

  if (startBtn) {
    startBtn.disabled = true;
    startBtn.textContent = 'در حال ثبت...';
  }

  const { data, error } = await db.rpc(
    'submit_content_response',
    {
      p_content_id: state.content.id,
      p_option_id: state.selected || null
    }
  );

  state.busy = false;

  if (error) {
    console.error('submit:', error);

    const message = error.message || '';

    if (message.includes('already_answered')) {
      state.answered = true;
      setOptionsDisabled(true);

      showResult(
        'امروز قبلاً این کار رو انجام دادی 😉',
        false
      );

      if (startBtn) {
        startBtn.disabled = true;
        startBtn.textContent = 'انجام شد ✓';
      }

      return;
    }

    if (message.includes('content_not_active')) {
      await loadContent();
      return;
    }

    if (message.includes('not_authenticated')) {
      openAuth();
    } else if (message.includes('option_required')) {
      showResult(
        'اول یک گزینه رو انتخاب کن 🙂',
        false
      );
    } else {
      showResult(
        'ثبت پاسخ انجام نشد؛ دوباره امتحان کن.',
        false
      );
    }

    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = getButtonLabel(type);
    }

    return;
  }

  state.answered = true;
  setOptionsDisabled(true);

  const points = Number(data?.points || 0);
  const correct = Boolean(data?.correct);

  if (type === 'quiz') {
    if (correct) {
      showResult(
        `آفرین! جواب درست بود 🎉 +${points} امتیاز`,
        true
      );
    } else {
      showResult(
        'این یکی درست نبود 😄 فردا دوباره بیا',
        false
      );
    }
  } else if (type === 'poll') {
    showResult(
      `رأی تو ثبت شد 🗳️ +${points} امتیاز`,
      true
    );
  } else if (type === 'challenge') {
    showResult(
      `چالش ثبت شد 🎯 +${points} امتیاز`,
      true
    );
  } else {
    showResult(
      `ثبت شد! +${points} امتیاز`,
      true
    );
  }

  const selectedButton = document.querySelector(
    '.option.selected'
  );

  if (type === 'quiz' && selectedButton) {
    selectedButton.classList.add(
      correct ? 'correct' : 'wrong'
    );
  }

  if (startBtn) {
    startBtn.disabled = true;
    startBtn.textContent = 'انجام شد ✓';
  }

  await loadStats();
}

async function signInWithGoogle() {
  showAuthMessage('در حال انتقال به Google...');

  const redirectTo =
    `${window.location.origin}${window.location.pathname}`;

  const { error } = await db.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo
    }
  });

  if (error) {
    console.error('Google login:', error);
    showAuthMessage(
      'ورود با Google انجام نشد. تنظیمات Google و Supabase را بررسی کن.'
    );
  }
}

async function logout() {
  const { error } = await db.auth.signOut();

  if (error) {
    console.error('logout:', error);
    return;
  }

  state.user = null;
  state.selected = null;
  state.answered = false;

  closeAuth();

  await refreshUser();
  await loadStats();

  showPage('home');
}

function showPage(id) {
  document.querySelectorAll('.page').forEach((page) => {
    page.classList.toggle(
      'active',
      page.id === id
    );
  });

  document.querySelectorAll('.nav').forEach((button) => {
    button.classList.toggle(
      'active',
      button.dataset.page === id
    );
  });

  if (id === 'competition') {
    loadLeaderboard();
  }

  if (id === 'profile') {
    loadStats();
  }
}

async function loadLeaderboard() {
  const box = $('leaderboard');

  if (!box) return;

  if (!state.user) {
    box.innerHTML =
      '<div class="empty">برای دیدن رتبه‌بندی وارد شو.</div>';
    return;
  }

  box.innerHTML =
    '<div class="empty">در حال دریافت رتبه‌بندی...</div>';

  const { data, error } = await db.rpc(
    'get_weekly_leaderboard',
    {
      p_limit: 50
    }
  );

  if (error) {
    console.warn('leaderboard:', error.message);

    box.innerHTML =
      '<div class="empty">رتبه‌بندی فعلاً در دسترس نیست.</div>';

    return;
  }

  if (!data?.length) {
    box.innerHTML =
      '<div class="empty">هنوز امتیازی ثبت نشده.</div>';
    return;
  }

  box.innerHTML = data
    .map((item) => {
      const rank = Number(item.rank || 0);
      const points = Number(item.points || 0);

      return `
        <div class="item">
          <div>
            <b>#${esc(rank)} ${esc(item.name || 'کاربر')}</b>
            <br>
            <small>${esc(points)} امتیاز</small>
          </div>
          <span>${rank <= 3 ? '🏆' : '⭐'}</span>
        </div>
      `;
    })
    .join('');
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register('./sw.js');
    console.log('Service Worker registered.');
  } catch (error) {
    console.warn(
      'Service Worker registration failed:',
      error
    );
  }
}

document.querySelectorAll('.nav').forEach((button) => {
  button.addEventListener('click', () => {
    showPage(button.dataset.page);
  });
});

$('authBtn')?.addEventListener('click', () => {
  if (state.user) {
    showPage('profile');
  } else {
    openAuth();
  }
});

$('closeAuth')?.addEventListener(
  'click',
  closeAuth
);

$('googleLogin')?.addEventListener(
  'click',
  signInWithGoogle
);

$('startBtn')?.addEventListener(
  'click',
  submitAnswer
);

$('logoutBtn')?.addEventListener(
  'click',
  logout
);

$('authModal')?.addEventListener(
  'click',
  (event) => {
    if (event.target === $('authModal')) {
      closeAuth();
    }
  }
);

document.addEventListener(
  'keydown',
  (event) => {
    if (event.key === 'Escape') {
      closeAuth();
    }
  }
);

db.auth.onAuthStateChange(
  (_event, session) => {
    state.user = session?.user || null;

    setTimeout(async () => {
      await refreshUser();
      await loadStats();
    }, 0);
  }
);

(async function init() {
  await refreshUser();

  if (state.user) {
    const { error } =
      await db.rpc('record_daily_login');

    if (error) {
      console.warn(
        'daily login:',
        error.message
      );
    }
  }

  await loadStats();
  await loadContent();
  await registerServiceWorker();
})();
