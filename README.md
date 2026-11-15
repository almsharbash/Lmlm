# LMLM — منصة تواصل ومراسلة

منصة مراسلة عربية خفيفة، مبنية بـ HTML/JS نقي + Supabase، وقابلة للتثبيت كتطبيق PWA.

## 📁 محتويات المشروع

| الملف | الوظيفة |
|-------|---------|
| `index.html` | الصفحة الحالية: تسجيل الدخول/الحساب + الملف الشخصي |
| `index-old.html` | النسخة الكاملة السابقة (محادثات ورسائل وجهات اتصال) |
| `legal.html` | الشروط والخصوصية |
| `manifest.json` | بيانات PWA (الاسم، الأيقونات، الألوان) |
| `sw.js` | Service Worker للعمل دون اتصال |
| `icon-192.png` / `icon-512.png` | أيقونات التطبيق |
| `sql/auth.sql` | فهرس أسماء المستخدمين الفريدة + دالة `username_available` |
| `supabase/functions/clever-processor/index.ts` | مصدر دالة الحساب الفوري |

> ملف `sql/setup.sql` القديم (الجداول وسياسات RLS) غير موجود في المستودع. صدّر المخطط من Supabase
> (`supabase db dump --schema public` أو من SQL Editor) وأضِفه هنا حتى لا يضيع.

## 🚀 خطوات النشر

### 1. GitHub Pages
- ارفع جميع الملفات إلى مستودع GitHub.
- من Settings → Pages، اختر الفرع `main` والمجلد `root`.
- سيصبح التطبيق متاحاً على `https://USERNAME.github.io/REPO/`.

### 2. Supabase — قاعدة البيانات
- **SQL Editor → New Query**، الصق `sql/auth.sql` واضغط **Run**.
- تأكد من وجود جداول `profiles` و`profile_private` وbucket اسمه `media`.

### 3. Supabase — الحساب الفوري (Edge Function)
الحساب الفوري يعتمد على دالة `clever-processor`:

```bash
supabase functions deploy clever-processor --no-verify-jwt
```

**مهم:** مفتاح `sb_publishable_…` ليس JWT، فإن بقي خيار *Verify JWT* مفعّلاً تُرفض الطلبات بخطأ 401.
يمكنك تعطيله أيضاً من لوحة التحكم: Edge Functions → clever-processor → Details → *Verify JWT* = off.

### 4. Supabase — التسجيل بالبريد ورمز التحقق
من **Authentication**:
- **Providers → Email**: فعّل Email، واختر *Confirm email* حسب رغبتك
  (إن عطّلته يدخل المستخدم مباشرة دون رمز، والتطبيق يتعامل مع الحالتين).
- **Email Templates → Confirm signup**: يجب أن يحتوي القالب على الرمز `{{ .Token }}`
  وليس رابط التأكيد فقط، وإلا يصل المستخدم رابطاً ولا يجد رمزاً ليكتبه.
- **SMTP**: خدمة البريد الافتراضية في Supabase محدودة جداً (بضع رسائل في الساعة للمشروع كله)،
  فيفشل التسجيل بالبريد عند أي ازدحام. اربط مزوّد SMTP مجانياً (Resend أو Brevo مثلاً)
  من Project Settings → Authentication → SMTP Settings.

## 🩺 تشخيص مشاكل التسجيل

التطبيق يعرض سبب الفشل بالعربية ويكتب التفاصيل في Console المتصفح (`[instant-account]` و`[auth]`).

| العرَض | السبب المحتمل | الحل |
|--------|---------------|------|
| الحساب الفوري يعطي «الخدمة رفضت الطلب (401)» | Verify JWT مفعّل للدالة | انشرها بـ `--no-verify-jwt` |
| «خدمة الحساب الفوري غير متاحة» (404) | الدالة غير منشورة أو اسمها مختلف | انشر `clever-processor` |
| التسجيل بالبريد لا يصل منه رمز | SMTP الافتراضي أو القالب بلا `{{ .Token }}` | اربط SMTP وعدّل القالب |
| «محاولات كثيرة» | حدود Supabase للمعدّل | انتظر دقيقة أو اربط SMTP خاصاً |
| الصفحة تعرض «تعذّر تحميل التطبيق» | تعذّر تحميل مكتبة supabase-js من CDN | أعد المحاولة (يوجد مصدر احتياطي، والكاش يعمل بعد أول تحميل) |

## 🔐 الأمان
- جميع الجداول يجب أن تبقى محمية بـ **Row Level Security**.
- لا يمكن قراءة الرسائل إلا لأعضاء المحادثة.
- الوسائط (صور/صوت) مخزنة في bucket `media` مع سياسات وصول مناسبة.
- دالة الحساب الفوري مفتوحة للعامة بطبيعتها؛ فكّر بإضافة حدّ للمعدّل (Rate limit) أو Captcha
  (Authentication → Attack Protection) إن لاحظت حسابات مزعجة.

## 📱 التثبيت كتطبيق
- **Android/Chrome**: من القائمة ⋮ → "تثبيت التطبيق".
- **iPhone/Safari**: زر المشاركة → "إضافة إلى الشاشة الرئيسية".
