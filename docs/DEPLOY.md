# نشر راصد على سيرفر (VPS)

الطريقة دي بتشغّل كل حاجة على سيرفر واحد بـ Docker: قاعدة البيانات، والموقع، وCaddy اللي بيعمل HTTPS تلقائي، ونسخة احتياطية يومية.

## المتطلبات
- VPS بـ Ubuntu 22.04 أو أحدث، 2GB RAM على الأقل (Hetzner / DigitalOcean / Contabo ~ 5–12$ شهريًا).
- دومين أو ساب دومين (مثلاً `rased.company.com`) عامل **A record** على IP السيرفر.
- المساحة: اللقطات بتاخد حوالي 6–7 GB لـ 50 موظف مع حذف بعد 30 يوم.

## الخطوات

```bash
# 1) سطّب Docker
curl -fsSL https://get.docker.com | sh

# 2) نزّل المشروع
git clone https://github.com/HuseinGhazala/frelans-system.git rased
cd rased/deploy

# 3) الإعدادات
cp .env.example .env
nano .env        # اكتب الدومين وكلمة سر طويلة لقاعدة البيانات

# 4) التشغيل
docker compose up -d --build
```

بعد دقيقتين افتح `https://الدومين` — هيطلب منك تعمل حساب المدير.

## بعد التشغيل
1. **الإعدادات ← البريد الإلكتروني:** حط بيانات Gmail (smtp.gmail.com، بورت 587، الإيميل، و**App Password** من إعدادات أمان جوجل) واضغط "إرسال بريد تجريبي".
2. **الإعدادات ← عام:** اسم الشركة، والإجازة الأسبوعية، والإجازات الرسمية.
3. **الإعدادات ← Trello:** لو هتستخدمه.
4. **الموظفين:** ضيف الموظفين — كل واحد هيوصله رابط الدعوة.
5. **برنامج الديسكتوب:** من GitHub ← Actions ← "Build Windows agent" (بعد ما تحط متغير `RASED_SERVER_URL` = `https://الدومين` في إعدادات المستودع ← Variables). ارفع الملف في GitHub Releases وحط رابطه في `AGENT_DOWNLOAD_URL` في `.env` وشغّل `docker compose up -d` تاني.

## التحديث لنسخة جديدة
```bash
cd rased && git pull && cd deploy && docker compose up -d --build
```
التحديثات على قاعدة البيانات بتتطبق تلقائي وقت التشغيل.

## النسخ الاحتياطي
- قاعدة البيانات بتتحفظ يوميًا في `deploy/backups/` (آخر 14 يوم). انسخ المجلد ده لمكان تاني بشكل دوري.
- الاسترجاع: `gunzip -c backups/rased-YYYY-MM-DD.sql.gz | docker compose exec -T db psql -U rased rased`

## المهام الدورية
السيرفر بيشغّل كل دقيقة: التنبيهات (غياب، ساعات ناقصة، خمول طويل، إنتاجية منخفضة)، الملخص اليومي بالإيميل، حذف اللقطات القديمة، ومزامنة Trello كل 15 دقيقة. مفيش حاجة محتاجة تتظبط.

---

## بديل: استضافة سحابية (Vercel + Neon + Cloudflare R2)
- قاعدة البيانات: Neon أو Supabase → `DATABASE_URL`.
- اللقطات: Cloudflare R2 → `STORAGE_DRIVER=s3` و`S3_ENDPOINT` و`S3_BUCKET` و`S3_ACCESS_KEY_ID` و`S3_SECRET_ACCESS_KEY` و`S3_REGION=auto`.
- المهام الدورية: حط `DISABLE_INTERNAL_CRON=1` و`CRON_SECRET=<قيمة عشوائية>`، واعمل Cron يستدعي `GET /api/cron` بالهيدر `Authorization: Bearer <CRON_SECRET>` كل 5 دقايق (Vercel Cron في الخطة المدفوعة، أو cron-job.org مجانًا).
- `APP_URL` = رابط الموقع، و`AGENT_DOWNLOAD_URL` = رابط تحميل البرنامج.
- التطبيق للتحديثات على قاعدة البيانات: `pnpm --filter web db:deploy`.
