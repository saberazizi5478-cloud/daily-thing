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

const esc = (value) =>
  String(value ?? '').replace(
    /[&<>'"]/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      })[char]
  );

function msg(text, ok = false) {
  const el = $('adminMsg');

  if (!el) return;

  el.textContent = text;
  el.className = `msg ${ok ? 'ok' : ''}`;
}

function showPanel() {
  $('gate')?.classList.add('hidden');
  $('panel')?.classList.remove('hidden');
}

function showGate(title, text, buttonText = 'ورود / ثبت‌نام') {
  const gate = $('gate');

  if (!gate) return;

  gate.innerHTML = `
    <h2>${esc(title)}</h2>
    <p>${esc(text)}</p>
    <a class="primary link" href="./index.html">
      ${esc(buttonText)}
    </a>
  `;
}

/* =========================
   Admin Access
========================= */

async function checkAccess() {
  const {
    data: { user },
    error
  } = await db.auth.getUser();

  if (error || !user) {
    showGate(
      'ورود لازم است',
      'ابتدا با ایمیل / Gmail و رمز عبور وارد اپ شو.'
    );
    return;
  }

  const {
    data: isAdmin,
    error: adminError
  } = await db.rpc('is_admin');

  if (adminError || isAdmin !== true) {
    showGate(
      'دسترسی غیرمجاز',
      'این حساب هنوز نقش مدیر ندارد.'
    );
    return;
  }

  showPanel();

  await loadList();
}

/* =========================
   Load Content
========================= */

async function loadList() {
  const list = $('contentList');

  if (!list) return;

  list.innerHTML =
    '<div class="empty">در حال دریافت محتوا...</div>';

  const {
    data,
    error
  } = await db
    .from('daily_content')
    .select(
      'id,type,title,points,status,publish_at,expires_at,created_at'
    )
    .order('created_at', {
      ascending: false
    })
    .limit(30);

  if (error) {
    console.error(error);

    list.innerHTML =
      '<div class="empty">دریافت محتوا ناموفق بود.</div>';

    return;
  }

  if (!data?.length) {
    list.innerHTML =
      '<div class="empty">هنوز محتوایی ساخته نشده.</div>';

    return;
  }

  list.innerHTML = data
    .map((item) => {
      const publishDate = item.publish_at
        ? new Date(item.publish_at).toLocaleDateString(
            'fa-IR'
          )
        : '—';

      return `
        <div class="item">
          <div>
            <b>${esc(item.title)}</b>
            <br>
            <small>
              ${esc(item.type)}
              ·
              ${esc(item.points)}
              امتیاز
              ·
              ${esc(item.status)}
            </small>
          </div>

          <span>${publishDate}</span>
        </div>
      `;
    })
    .join('');
}

/* =========================
   Date Helpers
========================= */

function isoFromInput(id) {
  const input = $(id);

  if (!input?.value) {
    return null;
  }

  return new Date(input.value).toISOString();
}

/* =========================
   Create Content
========================= */

async function createContent(event) {
  event.preventDefault();

  msg('در حال انتشار...');

  const type = $('type')?.value;

  const title =
    $('title')?.value.trim() || '';

  const body =
    $('body')?.value.trim() || '';

  const points = Math.max(
    1,
    Math.min(
      1000,
      Number($('points')?.value) || 10
    )
  );

  const publish_at =
    isoFromInput('publishAt') ||
    new Date().toISOString();

  const expires_at =
    isoFromInput('expiresAt');

  if (!title) {
    msg('عنوان محتوا را وارد کن.');
    return;
  }

  if (!body) {
    msg('متن محتوا را وارد کن.');
    return;
  }

  if (
    expires_at &&
    new Date(expires_at) <=
      new Date(publish_at)
  ) {
    msg(
      'زمان پایان باید بعد از زمان انتشار باشد.'
    );
    return;
  }

  const options = [
    ...document.querySelectorAll('.opt')
  ]
    .map((input) => input.value.trim())
    .filter(Boolean);

  if (
    type === 'quiz' &&
    options.length < 2
  ) {
    msg(
      'برای Quiz حداقل دو گزینه لازم است.'
    );
    return;
  }

  if (options.length > 4) {
    msg(
      'حداکثر چهار گزینه مجاز است.'
    );
    return;
  }

  const correctIndex = Math.max(
    1,
    Math.min(
      options.length || 1,
      Number($('correct')?.value) || 1
    )
  );

  /* =========================
     Insert Content
  ========================= */

  const {
    data,
    error
  } = await db
    .from('daily_content')
    .insert({
      type,
      title,
      body,
      points,
      publish_at,
      expires_at,
      status: 'published'
    })
    .select('id')
    .single();

  if (error) {
    console.error(error);

    msg(
      'انتشار انجام نشد: ' +
        (error.message || '')
    );

    return;
  }

  /* =========================
     Insert Options
  ========================= */

  if (options.length) {
    const rows = options.map(
      (text, index) => ({
        content_id: data.id,
        text,
        is_correct:
          type === 'quiz' &&
          index === correctIndex - 1,
        sort_order: index + 1
      })
    );

    const {
      error: optionsError
    } = await db
      .from('content_options')
      .insert(rows);

    if (optionsError) {
      console.error(optionsError);

      /*
       * Rollback content if options fail.
       */
      await db
        .from('daily_content')
        .delete()
        .eq('id', data.id);

      msg(
        'ثبت گزینه‌ها ناموفق بود.'
      );

      return;
    }
  }

  /* =========================
     Success
  ========================= */

  msg(
    'محتوا با موفقیت منتشر شد ✅',
    true
  );

  event.target.reset();

  if ($('points')) {
    $('points').value = 10;
  }

  if ($('correct')) {
    $('correct').value = 1;
  }

  await loadList();
}

/* =========================
   Form
========================= */

const contentForm = $('contentForm');

if (contentForm) {
  contentForm.addEventListener(
    'submit',
    createContent
  );
}

/* =========================
   Auth Listener
========================= */

db.auth.onAuthStateChange(() => {
  setTimeout(() => {
    checkAccess();
  }, 0);
});

/* =========================
   Start
========================= */

checkAccess();
