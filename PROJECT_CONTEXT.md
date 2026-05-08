# PROJECT_CONTEXT.md — SkillUp CRM

> هذا الملف مرجع شامل للمشروع. يُقرأ من GitHub مباشرة عند بداية كل جلسة AI.
> آخر تحديث: مايو 2026 (جلسة 08/05/2026)

---

## 1. فكرة النظام

SkillUp CRM نظام إدارة علاقات زبائن (CRM) موجّه للمتاجر والشركات الصغيرة في عُمان والخليج.
يعمل كتطبيق ويب كامل (SPA) بدون framework — HTML/CSS/JS خالص — متصل بـ Supabase كـ backend.

**الجمهور المستهدف:** أصحاب المتاجر، محلات الملابس والحقائب، العيادات، أي نشاط تجاري يحتاج تتبع زبائن.

**العملة:** ريال عُماني (OMR) — بوابة الدفع: Thawani (عُمانية).

**اللغات:** عربية (RTL) + إنجليزية — مفتاح تبديل في الواجهة.

---

## 2. المكدس التقني (Tech Stack)

| الطبقة | التقنية |
|--------|--------|
| Frontend | HTML + CSS + Vanilla JavaScript (بدون framework) |
| Backend / DB | Supabase (PostgreSQL + REST API + Auth + Edge Functions) |
| تخزين الصور | Cloudinary (unsigned upload preset) |
| بوابة الدفع | Thawani (عُمانية) — sandbox حالياً |
| الذكاء الاصطناعي | Google Gemini 2.0 Flash (مسح الوصولات) — عبر Supabase Edge Function |
| إرسال الرسائل | WhatsApp Web deep links (wa.me/) — يدوي |
| Excel | مكتبة XLSX.js (استيراد/تصدير) |
| الخطوط | Tajawal (عربي) + Playfair Display (إنجليزي) |

---

## 3. إعدادات Supabase

```javascript
SUPA_URL = 'https://kgqmbegbmefftgstkizp.supabase.co'
SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'  // anon key (public)
يستخدم Supabase REST API مباشرة (بدون supabase-js CDN) في ملف CRM
ملف Auth يستخدم fetch مباشرة لـ /auth/v1/token و /auth/v1/signup
4. هيكل الملفات (Structure)
skillup-crm/
├── index.html                  # = skillup_landing.html (نسخة مطابقة)
├── skillup_landing.html        # الصفحة التسويقية الرئيسية
├── skillup_auth.html           # تسجيل دخول / إنشاء حساب / استعادة كلمة مرور
├── skillup_payment.html        # اختيار خطة الاشتراك + إعادة توجيه لـ Thawani
├── skillup_crm.html            # التطبيق الرئيسي (CRM) — 3MB
├── skillup_admin.html          # لوحة إدارة المشرف
├── edge_create_charge.ts       # Supabase Edge Function: إنشاء جلسة دفع Thawani
├── edge_payment_webhook.ts     # Supabase Edge Function: استقبال نتيجة الدفع
├── payments_table.sql          # SQL لإنشاء جدول payments في Supabase
└── PROJECT_CONTEXT.md          # هذا الملف
5. مسار المستخدم (User Flow)
[skillup_landing.html]
        ↓
[skillup_auth.html]
    ├── مستخدم موجود → تسجيل دخول → skillup_crm.html
    └── مستخدم جديد → إنشاء حساب → تأكيد البريد → تسجيل دخول
                                                        ↓
                                           [skillup_payment.html]
                                                        ↓
                                          Thawani Checkout (دفع)
                                                        ↓
                                           [skillup_crm.html] ← payment=success
6. Auth Flow — تفاصيل المصادقة
تسجيل الدخول
// POST /auth/v1/token?grant_type=password
body: { email, password }
// الاستجابة تُخزن في:
localStorage.setItem('sku_sess', JSON.stringify(response))
// response: { access_token, expires_at, expires_in, user: { id, email } }
إنشاء حساب
// POST /auth/v1/signup
body: {
  email, password,
  data: { business_name, plan, trial_start: new Date().toISOString() }
}
// يُرسل بريد تأكيد — المستخدم يؤكد ثم يسجل دخوله
استعادة كلمة المرور
// POST /auth/v1/recover
body: { email }
فحص الجلسة عند التحميل
// في skillup_auth.html — يُعاد التوجيه إذا الجلسة صالحة
var sd = JSON.parse(localStorage.getItem('sku_sess'))
if (sd.access_token && now < expires_at) → redirect to skillup_crm.html

// في skillup_payment.html — يُعاد للـ auth إذا لا توجد جلسة
var sess = JSON.parse(localStorage.getItem('sku_sess'))
if (!sess || !sess.access_token) → redirect to skillup_auth.html
تسجيل الخروج
حذف sku_sess من localStorage
history.replaceState لمنع الرجوع للـ CRM بالـ back button
7. جداول قاعدة البيانات (Supabase Tables)
جدول customers
id          uuid (PK)
name        text NOT NULL
phone       text           -- رقم واتساب
country     text
province    text
color       text           -- 'green'=منتظم | 'yellow'=متوسط | 'red'=نادر
last_buy    date
notes       text
created_at  timestamptz
جدول purchases (سجل المشتريات)
id          uuid (PK)
customer_id uuid → customers(id)
date        date
amount      text           -- مثال: '25 ريال'
جدول gallery (معرض الصور)
id          uuid (PK)
src         text           -- Cloudinary URL
name        text
public_id   text           -- Cloudinary public_id للحذف
created_at  timestamptz
جدول products (المخزون)
id          uuid (PK)
name        text NOT NULL
category    text
icon        text
sku         text
barcode     text
unit        text
supplier    text
cost        numeric
price       numeric
qty         integer
min_qty     integer        -- حد التنبيه للكمية المنخفضة
notes       text
جدول inventory_movements (حركات المخزون)
id          uuid (PK)
product_id  uuid → products(id)
type        text           -- 'in'=وارد | 'out'=صادر
qty         integer
date        date
supplier    text
note        text
جدول payments (المدفوعات)
id          uuid PK default uuid_generate_v4()
user_id     uuid → auth.users(id) ON DELETE CASCADE
plan        text CHECK IN ('basic','pro','enterprise')
amount      numeric
currency    text DEFAULT 'OMR'
session_id  text UNIQUE    -- Thawani session ID
status      text DEFAULT 'pending' CHECK IN ('pending','paid','failed')
paid_at     timestamptz
created_at  timestamptz
-- RLS: مُفعَّل | Policy: Users يرون فقط مدفوعاتهم
جدول profiles (ملفات المستخدمين)
id          uuid → auth.users(id)
plan        text           -- 'basic' | 'pro' | 'enterprise'
is_active   boolean
trial_end   timestamptz    -- تاريخ انتهاء الاشتراك/التجربة
-- يُحدَّث بواسطة edge_payment_webhook.ts بعد الدفع
ملاحظة: جداول products، inventory_movements، gallery، customers، purchases، profiles
غير موجودة في ملف SQL المرفوع — يجب إنشاؤها يدوياً في Supabase.

8. العلاقات بين الجداول
auth.users
    │
    ├──→ profiles        (1:1)  — خطة المستخدم وحالة الاشتراك
    └──→ payments        (1:N)  — مدفوعاته
customers
    └──→ purchases       (1:N)  — سجل مشترياته
products
    └──→ inventory_movements (1:N) — وارد/صادر
9. خطط الاشتراك
الخطة	السعر	Baisas	الميزات
basic	15 ر.ع/شهر	1500	حتى 500 زبون، استيراد/تصدير Excel، معرض صور، واتساب يدوي
pro	35 ر.ع/شهر	3500	زبائن غير محدودين، واتساب API، تقارير، دعم أولوية
enterprise	80 ر.ع/شهر	8000	متعدد المستخدمين، API للتكامل، مدير حساب مخصص
تجربة مجانية: 14 يوماً — بدون بطاقة ائتمان
بعد الدفع: profiles.is_active = true و trial_end = now + 1 month
10. وحدات التطبيق (CRM Modules)
لوحة التحكم (Dashboard)
إحصائيات: إجمالي الزبائن، المنتظمون، المتوسطون، النادرون
قائمة آخر الزبائن المضافين
إدارة الزبائن (Customers)
إضافة / تعديل / حذف زبون
تصنيف: منتظم (أخضر) / متوسط (أصفر) / نادر (أحمر)
بحث بالاسم أو الهاتف
تصفية بالبلد / المحافظة / التصنيف
تحديد متعدد + إرسال واتساب جماعي
سجل مشتريات لكل زبون (تاريخ + مبلغ)
المخزون (Inventory)
إضافة / تعديل / حذف منتجات
وارد (Stock In) / صادر (Stock Out) مع سجل الحركات
تنبيه عند وصول الكمية للحد الأدنى
مسح الوصولات بالذكاء الاصطناعي: رفع صورة وصل → Gemini يستخرج المنتجات تلقائياً
مسح عبر كاميرا الجهاز أو رفع ملف
الإرسال (Send WhatsApp)
إرسال جماعي (Tab A): نفس الرسالة + الصور لمجموعة كاملة
إرسال مخصص (Tab B): رسالة + صور خاصة لزبون محدد
يفتح wa.me/ مع الرسالة — الصور تُحمَّل يدوياً
معرض الصور (Gallery)
رفع صور إلى Cloudinary (drag & drop)
تحديد صور لإرفاقها في الإرسال
حذف صور من Cloudinary
نقاط الولاء (Loyalty)
4 مستويات: برونز / فضة / ذهب / بلاتين
كسب نقاط عند الشراء (قابل للإعداد: X نقطة لكل ريال)
استبدال نقاط بخصومات (قابل للإعداد: قيمة النقطة بالريال)
أنواع الإضافة: شراء / ترحيب / إحالة / يدوي
سجل كامل للمعاملات لكل زبون
ملاحظة: البيانات مخزنة في localStorage حالياً (غير مزامنة مع Supabase)
الإعدادات (Settings)
إعداد Cloudinary (Cloud Name + Upload Preset)
تصدير Excel (XLSX)
استيراد Excel
حذف كل البيانات
إعدادات نظام النقاط
11. localStorage Keys
المفتاح	المحتوى
sku_sess	جلسة Supabase {access_token, expires_at, user:{id,email}}
sku_lang	اللغة 'ar' أو 'en'
sku6_c	نسخة احتياطية من الزبائن (JSON)
sku6_g	نسخة احتياطية من الصور (JSON)
sku6_cfg	إعدادات Cloudinary {cloud_name, upload_preset}
sku6_inv_p	نسخة احتياطية من المنتجات (JSON)
sku6_inv_m	نسخة احتياطية من حركات المخزون (JSON)
sku6_inv_s	إعدادات المخزون
sku6_loyalty	بيانات نقاط الولاء {customerId: {points, tier, transactions[]}}
sku6_loyalty_cfg	إعدادات نظام النقاط
12. APIs والتكاملات الخارجية
Supabase REST API
GET    /rest/v1/{table}?select=*
POST   /rest/v1/{table}
PATCH  /rest/v1/{table}?id=eq.{id}
DELETE /rest/v1/{table}?id=eq.{id}
Headers: apikey, Authorization: Bearer {access_token}
Supabase Auth API
POST /auth/v1/token?grant_type=password  → تسجيل دخول
POST /auth/v1/signup                     → إنشاء حساب
POST /auth/v1/recover                    → استعادة كلمة مرور
Supabase Edge Functions
POST /functions/v1/create-charge
  Body: { plan, user_id, email, success_url, cancel_url }
  Response: { payment_url, session_id }
POST /functions/v1/payment-webhook
  Body: { session_id, payment_status }
  (يُرسل من Thawani تلقائياً)
Cloudinary
POST https://api.cloudinary.com/v1_1/{cloud_name}/image/upload
  Body: { file: base64, upload_preset: 'unsigned_preset' }
  Response: { secure_url, public_id }
Thawani (بوابة الدفع)
Sandbox: https://uatcheckout.thawani.om/api/v1
Prod:    https://checkout.thawani.om/api/v1  ← لم يُفعَّل بعد
POST /checkout/session        → إنشاء جلسة دفع
GET  /checkout/session/{id}   → التحقق من حالة الجلسة
Checkout URL: {base}/pay/{session_id}?key={api_key}
Gemini AI (مسح الوصولات) ✅ محمي عبر Edge Function
// الاستدعاء من Frontend (skillup_crm.html):
POST /functions/v1/gemini-proxy
  Headers: { Authorization: Bearer {access_token} }
  Body: { imageBase64: string, imageMime: string }

// Edge Function تتصل بـ Gemini داخلياً:
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_KEY}
  // GEMINI_KEY مخزن في Supabase Secrets — غير مكشوف في الكود
WhatsApp
https://wa.me/{phone}?text={encoded_message}
// يفتح في نافذة جديدة
// الصور تُرفق يدوياً بعد التحميل
13. Edge Functions — التفاصيل
edge_create_charge.ts
يستقبل: { plan, user_id, email, success_url, cancel_url }
ينشئ جلسة Thawani checkout
يحفظ في payments بحالة pending
يُعيد { payment_url, session_id }
gemini-proxy ✅ مُنشأة مايو 2026
يستقبل: { imageBase64, imageMime }
يتحقق من Authorization header (مستخدم مسجل فقط)
يتصل بـ Gemini 2.0 Flash باستخدام GEMINI_KEY من Supabase Secrets
يُعيد: استجابة Gemini الكاملة (JSON بالمنتجات المستخرجة)

edge_payment_webhook.ts
يستقبل Webhook من Thawani: { session_id, payment_status }
يتحقق من الجلسة مباشرة مع Thawani API
يُحدِّث payments.status → 'paid' أو 'failed'
عند النجاح: يُحدِّث profiles → { plan, is_active: true, trial_end: now+1month }
14. لوحة الإدارة (Admin Panel)
ملف skillup_admin.html — مستقل بكلمة مرور خاصة.

الميزات:

عرض إحصائيات جميع المستخدمين (إجمالي، نشط، تجريبي، غير نشط)
جدول المستخدمين مع الخطة والحالة
تفعيل / تعطيل حسابات
تغيير خطة مستخدم
بحث وتصفية
15. المشاكل الحالية (Known Issues)
Thawani على Sandbox: edge_create_charge.ts يستخدم uatcheckout.thawani.om — يجب التبديل لـ production قبل الإطلاق.
~~Gemini API Key مكشوف~~ ✅ تم الحل (08/05/2026): نُقل الـ key إلى Supabase Secret (GEMINI_KEY) وأُنشئت Edge Function gemini-proxy — الـ key لم يعد مكشوفاً في الكود.
نقاط الولاء غير مزامنة: بيانات sku6_loyalty مخزنة في localStorage فقط — تضيع عند تغيير الجهاز أو المتصفح.
جداول Supabase غير موثقة بـ SQL: فقط payments_table.sql موجود — باقي الجداول (customers, purchases, gallery, products, inventory_movements, profiles) غير موثقة بملفات SQL.
index.html = skillup_landing.html: نفس الملف بالضبط (SHA متطابق) — ازدواجية غير ضرورية.
~~Google OAuth غير مربوط~~ ✅ تم الحل (08/05/2026): أُضيفت دالة loginWithGoogle() في skillup_auth.html مع معالجة OAuth callback. Redirect URL: https://nian2215.github.io/skillup-crm/skillup_auth.html
لا يوجد حماية من انتهاء الاشتراك في CRM: skillup_crm.html لا يتحقق من profiles.is_active — أي مستخدم دخل يصل للنظام.
حذف صور Cloudinary: يحتاج Edge Function — الحذف المباشر من المتصفح غير مدعوم.
16. TODO List
أولوية عالية
not done
تبديل Thawani للـ production في edge_create_charge.ts
done ✅
نقل Gemini API Key من HTML إلى Supabase Edge Function
not done
إضافة فحص profiles.is_active عند تحميل skillup_crm.html
not done
كتابة SQL الكامل لجميع الجداول وحفظه في all_tables.sql
أولوية متوسطة
not done
مزامنة نقاط الولاء مع Supabase (جدول loyalty_points + loyalty_transactions)
done ✅
إعداد Google OAuth في Supabase Dashboard
not done
Edge Function لحذف صور Cloudinary بشكل آمن
not done
دمج أو حذف الازدواجية بين index.html و skillup_landing.html
not done
تفعيل RLS على جداول customers, purchases, gallery, products
أولوية منخفضة
not done
إضافة user_id لجداول customers, gallery, products لدعم multi-tenancy
not done
صفحة نجاح الدفع مستقلة بدلاً من query param
not done
إشعارات push للمنتجات التي نفذت من المخزون
not done
تقارير متقدمة للخطة Pro (رسوم بيانية، مقارنة أشهر)
not done
PWA / Service Worker للعمل offline
17. ملاحظات للـ AI
الكود كله في ملفات HTML واحدة (CSS + JS + HTML في نفس الملف)
لا يوجد build system أو bundler — ملفات تُرفع مباشرة
_sb هو كائن Supabase المبسط في skillup_crm.html — يستخدم REST API مباشرة
البيانات تُحفظ في Supabase أولاً ثم localStorage كـ fallback
عند كتابة كود جديد: اتبع نفس النمط (Vanilla JS، var بدلاً من let/const في بعض الأماكن القديمة)
جميع العمليات المالية بـ Baisas (1 OMR = 100 Baisas) في Thawani، بـ OMR في قاعدة البيانات
عند قراءة ملفات HTML بـ WebFetch: الملفات تحتوي على صور base64 ضخمة — استخدم Bash + Python لاستخراج JS
---
انسخ كل النص أعلاه وافتح محرر نصوص (Notepad أو VS Code) واحفظه باسم `PROJECT_CONTEXT.md`.

