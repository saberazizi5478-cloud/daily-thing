# هر روز یه چیز — MVP V3

## معماری
- Frontend: HTML + CSS + Vanilla JavaScript
- Hosting: GitHub Pages
- Backend/Database/Auth: Supabase
- Authentication: Google/Gmail OAuth
- Security: Supabase RLS + app_metadata admin role

## فایل‌ها
- index.html: اپ کاربر
- admin.html: پنل مدیریت
- app.js: منطق کاربر
- admin.js: منطق مدیریت
- style.css: ظاهر
- manifest.json / sw.js: PWA

## راه‌اندازی Google
1. در Supabase بخش Authentication > Providers > Google را فعال کن.
2. در Google Cloud یک OAuth Client از نوع Web بساز.
3. Origin سایت GitHub Pages را در Authorized JavaScript origins قرار بده.
4. Callback URL خود Supabase را در Authorized redirect URIs قرار بده.
5. Site URL و Redirect URLs را در Supabase روی آدرس GitHub Pages تنظیم کن.

طبق مستندات فعلی Supabase، برای Web می‌توان از `signInWithOAuth({ provider: 'google' })` استفاده کرد و redirect URL باید در Redirect URLs مجاز باشد.

## مدیر
حساب مدیر باید در `app_metadata` نقش `admin` داشته باشد. این نقش نباید در `user_metadata` قرار بگیرد.

## نکته امنیتی
کلید داخل HTML فقط Publishable Key است. هرگز Service Role Key را داخل GitHub یا JavaScript مرورگر قرار نده.
