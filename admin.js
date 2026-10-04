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
  String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));

function showMessage(text, success = false) {
  const el = $('adminMsg');

  if (!el) return;

  el.textContent = text;
  el.className = `msg ${success ? 'ok' : ''}`;
}

function setGate(title, text) {
  $('gate').innerHTML = `
    <h2>${esc(title)}</h2>
    <p>${esc(text)}</p>
  `;
}

function formatDate(value) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleString('fa-IR', {
    dateStyle: 'short',
    timeStyle: 'short'
  });
}

function getPublishDate() {
  const value = $('publishAt').value;

  if (!value) {
    return new Date().toISOString();
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error('زمان انتشار نامعتبر است.');
  }

  return date.toISOString();
}

function getExpireDate() {
  const value = $('expiresAt').value;

  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error('زمان پایان نامعتبر است.');
  }

  return date.toISOString();
}

async function getCurrentUser() {
  const { data, error } = await db.auth.getUser();

  if (error) {
    console.error('getUser error:', error);
    return null;
  }

  return data?.user ?? null;
}

async function checkAccess() {
  $('gate').classList.remove('hidden');
  $('panel').classList.add('hidden');

  $('gate').innerHTML = `
    <h2>در حال بررسی دسترسی...</h2>
    <p>لطفاً چند لحظه صبر کن.</p>
  `;

  const user = await getCurrentUser();

  if (!user) {
    setGate(
      'ورود لازم است',
      'ابتدا با Google وارد اپ شو.'
    );

    $('gate').innerHTML += `
      <br>
      <a class="primary link" href="./index.html">
        ورود با Google
      </a>
    `;

    return;
  }

  const { data: isAdmin, error } = await db.rpc('is_admin');

  if (error) {
    console.error('is_admin error:', error);

    setGate(
      'خطا در بررسی دسترسی',
      'بررسی نقش مدیر انجام نشد. دوباره تلاش کن.'
    );

    return;
  }

  if (isAdmin !== true) {
    setGate(
      'دسترسی غیرمجاز',
      'این حساب هنوز نقش مدیر ندارد.'
    );

    return;
  }

  $('gate').classList.add('hidden');
  $('panel').classList.remove('hidden');

  await loadContentList();
}

async function loadContentList() {
  const container = $('contentList');

  container.innerHTML = `
    <div class="empty">
      در حال دریافت محتوا...
    </div>
  `;

  const { data, error } = await db
    .from('daily_content')
    .select(
      'id,type,title,body,points,status,publish_at,expires_at,created_at'
    )
    .order('created_at', {
      ascending: false
    })
    .limit(30);

  if (error) {
    console.error('loadContentList error:', error);

    container.innerHTML = `
      <div class="empty">
        دریافت محتوا ناموفق بود.
      </div>
    `;

    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = `
      <div class="empty">
        هنوز محتوایی ساخته نشده.
      </div>
    `;

    return;
  }

  container.innerHTML = data.map((item) => {
    const typeLabel = {
      quiz: '🧠 Quiz',
      poll: '😂 Poll',
      challenge: '🎯 Challenge'
    }[item.type] || item.type;

    const statusLabel = {
      draft: 'پیش‌نویس',
      published: 'منتشر شده',
      archived: 'آرشیو'
    }[item.status] || item.status;

    return `
      <div class="item">

        <div>
          <b>${esc(item.title)}</b>

          <br>

          <small>
            ${esc(typeLabel)}
            ·
            ${esc(item.points)} امتیاز
            ·
            ${esc(statusLabel)}
          </small>

          ${
            item.body
              ? `
                <br>
                <small>
                  ${esc(item.body)}
                </small>
              `
              : ''
          }

        </div>

        <span>
          ${esc(formatDate(item.publish_at))}
        </span>

      </div>
    `;
  }).join('');
}

function collectOptions() {
  return [...document.querySelectorAll('.opt')]
    .map((input) => input.value.trim())
    .filter(Boolean);
}

function validateForm() {
  const type = $('type').value;
  const title = $('title').value.trim();
  const points = Number($('points').value);

  if (!title) {
    return 'عنوان را وارد کن.';
  }

  if (title.length > 150) {
    return 'عنوان نباید بیشتر از ۱۵۰ کاراکتر باشد.';
  }

  if (!Number.isFinite(points) || points < 1 || points > 1000) {
    return 'امتیاز باید بین ۱ تا ۱۰۰۰ باشد.';
  }

  const options = collectOptions();

  if (options.length > 4) {
    return 'حداکثر چهار گزینه مجاز است.';
  }

  if (type === 'quiz' && options.length < 2) {
    return 'برای Quiz حداقل دو گزینه لازم است.';
  }

  if (type === 'quiz') {
    const correct = Number($('correct').value);

    if (
      !Number.isInteger(correct) ||
      correct < 1 ||
      correct > options.length
    ) {
      return 'شماره گزینه درست معتبر نیست.';
    }
  }

  return null;
}

async function createContent() {
  const type = $('type').value;
  const title = $('title').value.trim();
  const body = $('body').value.trim();
  const points = Math.max(
    1,
    Math.min(
      1000,
      Number($('points').value) || 10
    )
  );

  const publishAt = getPublishDate();
  const expiresAt = getExpireDate();

  if (
    expiresAt &&
    new Date(expiresAt) <= new Date(publishAt)
  ) {
    throw new Error(
      'زمان پایان باید بعد از زمان انتشار باشد.'
    );
  }

  const options = collectOptions();

  const { data: content, error: contentError } =
    await db
      .from('daily_content')
      .insert({
        type,
        title,
        body,
        points,
        publish_at: publishAt,
        expires_at: expiresAt,
        status: 'published'
      })
      .select('id')
      .single();

  if (contentError) {
    console.error(
      'create content error:',
      contentError
    );

    throw new Error(
      contentError.message ||
      'ثبت محتوای روزانه انجام نشد.'
    );
  }

  if (options.length > 0) {
    const correctIndex =
      type === 'quiz'
        ? Number($('correct').value) - 1
        : -1;

    const rows = options.map((text, index) => ({
      content_id: content.id,
      text,
      is_correct:
        type === 'quiz' &&
        index === correctIndex,
      sort_order: index + 1
    }));

    const { error: optionError } =
      await db
        .from('content_options')
        .insert(rows);

    if (optionError) {
      console.error(
        'create options error:',
        optionError
      );

      await db
        .from('daily_content')
        .delete()
        .eq('id', content.id);

      throw new Error(
        optionError.message ||
        'ثبت گزینه‌ها انجام نشد.'
      );
    }
  }

  return content.id;
}

function resetForm() {
  $('contentForm').reset();

  $('points').value = 10;
  $('correct').value = 1;
}

$('contentForm').addEventListener(
  'submit',
  async (event) => {
    event.preventDefault();

    if (event.submitter) {
      event.submitter.disabled = true;
    }

    showMessage('در حال انتشار...');

    try {
      const validationError = validateForm();

      if (validationError) {
        showMessage(validationError);
        return;
      }

      await createContent();

      showMessage(
        'محتوا با موفقیت منتشر شد ✅',
        true
      );

      resetForm();

      await loadContentList();

    } catch (error) {
      console.error('submit error:', error);

      showMessage(
        error?.message ||
        'عملیات انجام نشد. دوباره تلاش کن.'
      );

    } finally {
      if (event.submitter) {
        event.submitter.disabled = false;
      }
    }
  }
);

$('type').addEventListener(
  'change',
  () => {
    const type = $('type').value;
    const options = $('optionsForm');
    const correct = $('correct');

    if (type === 'challenge') {
      options.style.opacity = '0.55';
      correct.disabled = true;
    } else {
      options.style.opacity = '1';
      correct.disabled = false;
    }
  }
);

db.auth.onAuthStateChange(() => {
  setTimeout(() => {
    checkAccess();
  }, 0);
});

checkAccess();
