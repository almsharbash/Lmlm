# LMLM — منصة تواصل ومراسلة

منصة مراسلة عربية خفيفة، مبنية بـ HTML/JS نقي + Supabase، وقابلة للتثبيت كتطبيق PWA.

## 📁 محتويات المشروع

| الملف | الوظيفة |
|-------|---------|
| `index.html` | التطبيق الكامل (واجهة + منطق) |
| `manifest.json` | بيانات PWA (الاسم، الأيقونات، الألوان) |
| `sw.js` | Service Worker للعمل دون اتصال |
| `icon-192.png` | أيقونة التطبيق الصغيرة |
| `icon-512.png` | أيقونة التطبيق الكبيرة |
| `sql/setup.sql` | إعداد قاعدة بيانات Supabase (يُنفَّذ مرة واحدة) |

## 🚀 خطوات النشر

### 1. GitHub Pages
- ارفع جميع الملفات إلى مستودع GitHub.
- من Settings → Pages، اختر الفرع `main` والمجلد `root`.
- سيصبح التطبيق متاحاً على `https://USERNAME.github.io/REPO/`.

### 2. Supabase
- افتح مشروعك في [supabase.com/dashboard](https://supabase.com/dashboard).
- اذهب إلى **SQL Editor** → **New Query**.
- الصق محتوى `sql/setup.sql` كاملاً واضغط **Run**.
- تحقق من ظهور الجداول في **Table Editor**.

### 3. Edge Function
- التطبيق يحتاج دالة `clever-processor` لإنشاء الحسابات بدون بريد.
- تأكد من نشرها في Supabase Functions.

## 🔐 الأمان
- جميع الجداول محمية بـ **Row Level Security**.
- لا يمكن قراءة الرسائل إلا لأعضاء المحادثة.
- الوسائط (صور/صوت) مخزنة في bucket `media` مع سياسات وصول مناسبة.

## 📱 التثبيت كتطبيق
- **Android/Chrome**: من القائمة ⋮ → "تثبيت التطبيق".
- **iPhone/Safari**: زر المشاركة → "إضافة إلى الشاشة الرئيسية".
