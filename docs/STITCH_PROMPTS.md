# Stitch Prompts — منصة متابعة الموظفين عن بُعد

طريقة الاستخدام:
1. ابدأ بـ **البروبت 0 (الأساس)** في مشروع Stitch — ده بيحدد الستايل لكل الشاشات.
2. بعده ابعت بروبتات الشاشات **واحد ورا التاني** (كل بروبت = شاشة أو مجموعة شاشات صغيرة) في نفس المشروع عشان يفضل الستايل واحد.
3. اختار **Web** لشاشات الويب، و**Desktop / App** لشاشات برنامج الديسكتوب (قسم ج).

---

## 0) الأساس — Design System (ابعته الأول)

```
Design a complete web dashboard design system for "راصد" (Rased) — an internal remote-employee time tracking & monitoring platform for a small Egyptian company (under 50 employees).

LANGUAGE & DIRECTION (critical):
- The entire UI is in ARABIC ONLY, right-to-left (RTL). Sidebar on the RIGHT, text right-aligned, icons mirrored where directional, numbers in Western digits (0-9), currency "ج.م" (Egyptian Pound), dates like "الثلاثاء 29 سبتمبر 2026", time 12h with "ص / م".
- Font: "IBM Plex Sans Arabic" for everything (weights 400/500/600/700). Numbers/stats use tabular figures.

BRAND FEEL: calm, trustworthy, transparent — NOT a surveillance/spy look. Clean, spacious, modern SaaS (like Linear / Hubstaff / Notion), soft rounded corners (12px cards, 8px inputs/buttons), subtle 1px borders, very light shadows.

COLORS (light mode primary):
- Primary: #0F766E (teal) — buttons, active nav, links. Primary soft bg: #CCFBF1.
- Background: #F8FAFC, Surface/cards: #FFFFFF, Border: #E2E8F0, Text: #0F172A, Muted text: #64748B.
- Status colors: Working/active #16A34A (green), On break #F59E0B (amber), Idle #F97316 (orange), Offline/absent #94A3B8 (gray), Danger/deduction #DC2626 (red), Info #2563EB (blue).
- Productivity: productive = green, neutral = gray, unproductive = red.
- Also provide a dark-mode variant of the tokens (bg #0B1220, surface #111827).

LAYOUT:
- Right sidebar (240px) with logo "راصد", nav items with icons, collapsed icon-only mode on tablet; top bar with page title, date-range picker, notifications bell with badge, user avatar menu.
- Content max width 1280px, 24px padding, 8px spacing grid.
- Responsive: works on mobile (sidebar becomes bottom sheet / hamburger), no horizontal scroll.

COMPONENTS to define: primary/secondary/ghost/danger buttons, inputs, selects, date-range picker, tabs, status badges (يعمل الآن / في استراحة / خامل / غير متصل / غائب / في إجازة), avatar with live status dot, KPI stat cards, data tables with sorting and pagination, empty states with friendly illustration, toasts, modals, confirmation dialog, progress bars (hours done vs required), activity percentage bars (10 small segments), charts (bar, donut, stacked timeline).
```

---

## أ) لوحة الأدمن (Web)

### 1) تسجيل الدخول
```
Login screen for "راصد" (Arabic RTL, same design system). Split layout: right side = form, left side = soft teal illustration of a calm home-office with the tagline "تابع شغل فريقك عن بُعد بشفافية ووضوح".
Form: title "تسجيل الدخول", fields "البريد الإلكتروني" and "كلمة المرور" (with show/hide), checkbox "تذكرني", link "نسيت كلمة المرور؟", primary button "دخول". Also show the "نسيت كلمة المرور" state (email field + "إرسال رابط الاستعادة") and "تعيين كلمة مرور جديدة" state for first-time employee invite.
```

### 2) الرئيسية — المتابعة المباشرة (Admin Dashboard)
```
Admin home dashboard "الرئيسية" (Arabic RTL). 
Top KPI row (4 cards): "يعملون الآن 12", "في استراحة 2", "لم يسجلوا حضور اليوم 3", "متوسط الإنتاجية اليوم 78%".
Main section "الفريق الآن": grid of employee cards — each card: avatar with status dot, name, job title, status badge (يعمل الآن / في استراحة / خامل منذ 12 د / غير متصل / في إجازة), current app + current Trello task name, today's hours "5:20 من 8:00" with progress bar, today's activity %, latest screenshot thumbnail (small, blurred style), and a small tag "جلسة من الموقع" for web-only sessions.
Filters above grid: search by name, status filter chips.
Right/side column: "آخر التنبيهات" list (غياب، ساعات ناقصة، خمول طويل، إنتاجية منخفضة) with time and "عرض الكل", and "طلبات الإجازة المعلقة" with approve/reject quick buttons.
Bottom: bar chart "ساعات العمل هذا الأسبوع" per day (Saturday→Thursday, Friday marked as إجازة).
```

### 3) الموظفين — القائمة
```
Employees list page "الموظفين" (Arabic RTL). Header with button "إضافة موظف". Table columns: الموظف (avatar+name+personal email), المسمى الوظيفي, المرتب الشهري (ج.م), الساعات اليومية المطلوبة, حالة الجهاز (متصل / آخر ظهور منذ...), ربط Trello (مربوط / غير مربوط), الحالة (نشط / موقوف), actions menu (عرض، تعديل، إيقاف، إعادة إرسال الدعوة).
Search, filter by status, pagination. Include empty state.
Also design the "إضافة موظف" side drawer/modal with sections: البيانات الأساسية (الاسم، البريد الإلكتروني الشخصي، رقم الموبايل، المسمى الوظيفي، تاريخ التعيين)، العمل والمرتب (المرتب الشهري ج.م، عدد الساعات اليومية المطلوبة default 8)، إعدادات المراقبة (فترة السكرين شوت: كل 10 دقائق، تشويش السكرين شوت toggle، حد الخمول 5 دقائق)، رصيد الإجازات (سنوية 21، عارضة 6)، ربط Trello (select member). Buttons "حفظ وإرسال دعوة" / "إلغاء".
```

### 4) صفحة الموظف — اليوم (Timeline + سكرين شوت)
```
Employee detail page (Arabic RTL) for "أحمد محمود — مصمم UI". Header: avatar, name, status badge, date picker (day navigation arrows), tabs: "اليوم" (active) / "النشاط والبرامج" / "المهام" / "الحضور الشهري" / "الإجازات" / "المرتب".
KPI row: "ساعات العمل 6:45 من 8:00", "نسبة النشاط 72%", "الإنتاجية 81%", "وقت الخمول 0:35 (غير محسوب)", "الاستراحات 0:45".
Horizontal day timeline (8 ص → 12 م) showing colored segments: working (green), break (amber), idle (orange, hatched, labeled "غير محسوب"), web-only session (blue striped), with check-in/out markers and hover tooltip.
Screenshots grid grouped by hour ("10:00 ص – 11:00 ص"): 6 thumbnails per hour row, each with time, app icon + app name, a 10-segment activity bar and %, and a badge for "مشوّشة" if blurred; "لا يوجد نشاط" tile for idle periods.
```

### 5) عارض السكرين شوت
```
Full-screen screenshot viewer modal (Arabic RTL, dark overlay). Large screenshot center, left/right arrows to navigate (RTL order), bottom filmstrip of the day's screenshots. Info panel: الموظف، الوقت، البرنامج النشط، عنوان النافذة/الدومين، نسبة النشاط لهذه الفترة (10 segments)، المهمة (كارت Trello)، ضغطات الكيبورد وحركات الماوس (counts only). Buttons: "تحميل", "إغلاق". Small note: "يتم حذف اللقطات تلقائياً بعد 30 يوم".
```

### 6) النشاط والبرامج (تبويب في صفحة الموظف + تقرير عام)
```
Tab "النشاط والبرامج" (Arabic RTL): donut chart of time split "منتج / محايد / غير منتج" with percentages, and a ranked table of apps & websites: icon, name (e.g. Figma, VS Code, github.com, youtube.com), category badge (منتج green / محايد gray / غير منتج red) with inline dropdown to reclassify, time spent, % of day, small horizontal bar. Hourly activity bar chart below (activity % per hour).
```

### 7) المهام (Trello)
```
Tasks page "المهام" (Arabic RTL), data synced from Trello. Top: board selector, date range, "آخر مزامنة منذ 5 دقائق" + "تحديث الآن" button. KPI: total tracked hours on tasks, number of cards worked on, "وقت بدون مهمة".
Table: كارت Trello (title + board + list label + Trello icon link), الموظفين (avatar stack), الوقت المسجّل, آخر نشاط. Expandable row showing time per employee per day. Bar chart "الوقت لكل بورد".
```

### 8) التقارير
```
Reports page "التقارير" (Arabic RTL). Report type tabs: "الساعات" / "الحضور والغياب" / "الإنتاجية" / "البرامج والمواقع" / "المهام". Filters: date range, employees multi-select. Export buttons "تصدير Excel" and "تصدير PDF".
Show the "الساعات" report: stacked bar chart per employee (worked hours vs required), and a table per employee: أيام العمل، الساعات المطلوبة، الساعات الفعلية، الفرق (+ green / − red)، وقت الخمول، متوسط النشاط، الإنتاجية. Also show the "الحضور والغياب" report as a monthly calendar heatmap (rows = employees, columns = days; cells colored: أكمل ساعاته / ناقص / غائب / إجازة / الجمعة عطلة / إجازة رسمية).
```

### 9) الإجازات
```
Leave management page "الإجازات" (Arabic RTL). Tabs: "الطلبات المعلقة (3)" / "كل الطلبات" / "الأرصدة" / "الإجازات الرسمية".
Pending requests as cards: employee, leave type badge (سنوية / عارضة / مرضية / بدون مرتب), from–to dates, number of days, reason, remaining balance after approval, buttons "موافقة" (green) / "رفض" (with reason modal).
"الأرصدة" tab: table of employees with used/remaining for each leave type.
"الإجازات الرسمية" tab: list of official holidays with "إضافة إجازة رسمية" button and a year calendar view.
```

### 10) المرتبات — مراجعة الشهر واعتماد الإضافي
```
Payroll page "المرتبات" (Arabic RTL). Month selector "سبتمبر 2026", status badge "مسودة" / "معتمد". Summary cards: إجمالي المرتبات، إجمالي الخصومات، إجمالي الإضافي، الصافي (all in ج.م).
Table per employee: المرتب الأساسي، سعر الساعة، الساعات المطلوبة (شهري)، الساعات الفعلية، الساعات الناقصة → الخصم (red)، "إضافي مقترح" hours with an inline approval control (approve all / approve partial hours input / reject) — only approved hours × 1.5 become الإضافي (green)، إجازة بدون مرتب، تعديلات يدوية، الصافي.
Info note: "الحساب شهري: الأيام الناقصة تتعوض بالأيام الزيادة. الساعات الزيادة لا تُحسب إضافي إلا بعد موافقتك".
Row click opens a drawer "كشف مرتب — أحمد محمود" with a day-by-day breakdown and "إضافة تعديل يدوي" (مكافأة/خصم + المبلغ + السبب).
Footer buttons: "اعتماد مرتبات الشهر" (primary, with confirmation dialog), "تصدير Excel", "تصدير PDF".
```

### 11) التنبيهات
```
Notifications page "التنبيهات" (Arabic RTL) + the dropdown panel from the bell icon. Filter chips: الكل / غياب / ساعات ناقصة / خمول طويل / إنتاجية منخفضة / طلبات إجازة. Each alert: colored icon by type, text like "محمد علي لم يسجل حضور يوم الأربعاء 28 سبتمبر — غياب", "سارة أحمد خاملة منذ 25 دقيقة", "إنتاجية منى خالد اليوم 42%", time ago, unread dot, action link "عرض". "تحديد الكل كمقروء".
```

### 12) الإعدادات
```
Settings page "الإعدادات" (Arabic RTL) with vertical tabs:
1) "عام": اسم الشركة، الشعار، المنطقة الزمنية (القاهرة)، العملة (ج.م)، أيام الإجازة الأسبوعية (checkbox per day, الجمعة checked).
2) "الحضور والمراقبة": الساعات اليومية الافتراضية 8، حد الخمول 5 دقائق، فترة السكرين شوت كل 10 دقائق (عشوائي)، تشويش السكرين شوت (toggle)، مدة الاحتفاظ باللقطات 30 يوم، السماح بتسجيل الحضور من الموقع (toggle).
3) "المرتبات": معامل الإضافي 1.5، طريقة الحساب "شهري صافي".
4) "الإجازات": أنواع الإجازات وأرصدتها الافتراضية (editable list).
5) "تصنيف البرامج والمواقع": searchable list with category dropdowns + "إضافة".
6) "التنبيهات": toggles + thresholds for each alert type, daily summary email time (11:00 م) and recipient emails.
7) "البريد الإلكتروني": SMTP settings (Gmail + App Password) with "إرسال بريد تجريبي".
8) "Trello": connect card with API Key/Token, selected boards checklist, member ↔ employee mapping table, "مزامنة الآن".
9) "سجل العمليات": audit log table (المستخدم، العملية، التفاصيل، الوقت).
```

---

## ب) لوحة الموظف (Web)

### 13) الرئيسية للموظف
```
Employee self-service home (Arabic RTL, same design system, simpler sidebar: الرئيسية، نشاطي، الإجازات، كشف المرتب، تحميل البرنامج). 
Greeting "صباح الخير يا أحمد 👋". Big card: today's status + large button "تسجيل حضور" / "تسجيل انصراف" / "استراحة" (web check-in note: "الحضور من الموقع يسجل الوقت فقط بدون تتبع النشاط"). Progress ring "اليوم 5:20 من 8:00". Month card: "ساعات الشهر 120 من 176 — فاضل 56 ساعة" with a note that short days are compensated by longer days. Weekly bar chart. Leave balance chips (سنوية 15 متبقي، عارضة 4). Transparency banner: "كل البيانات اللي بتتسجل عنك موجودة هنا — شوف نشاطك".
```

### 14) نشاطي وسكرين شوتاتي
```
Employee "نشاطي" page (Arabic RTL): same day timeline and screenshots grid as the admin view but for self, view-only (no delete). Also show apps/websites summary and idle periods marked "غير محسوب".
```

### 15) إجازاتي + كشف المرتب
```
Two employee screens (Arabic RTL):
A) "إجازاتي": balance cards per leave type, button "طلب إجازة" opening a form (النوع، من، إلى، عدد الأيام auto، السبب)، and history table with status badges (قيد المراجعة / مقبولة / مرفوضة + reason).
B) "كشف المرتب": month selector, payslip card: المرتب الأساسي، الساعات المطلوبة، الساعات الفعلية، الخصم، الإضافي المعتمد، التعديلات، الصافي (big number, ج.م), status "معتمد", button "تحميل PDF". Show "لم يتم اعتماد مرتب هذا الشهر بعد" empty state.
```

---

## ج) برنامج الديسكتوب (Windows) — اختار App/Desktop في Stitch

### 16) تسجيل الدخول + الموافقة
```
Small desktop app window (400×600) for "راصد" Windows tracking agent, Arabic RTL, same design system (teal, IBM Plex Sans Arabic).
Screen 1 "تسجيل الدخول": logo, email, password, "دخول".
Screen 2 "الموافقة على المراقبة" (first run): clear friendly list with icons of what is tracked ONLY while checked in: "وقت الحضور والانصراف"، "لقطة شاشة عشوائية كل 10 دقائق (هيظهرلك إشعار كل مرة)"، "عدد ضغطات الكيبورد والماوس فقط — بدون تسجيل ما تكتبه"، "البرامج والمواقع المستخدمة"، and what is NOT tracked: "لا شيء خارج وقت العمل أو أثناء الاستراحة". Checkbox "قرأت وأوافق", button "موافق وابدأ".
```

### 17) الشاشة الرئيسية للبرنامج (3 حالات)
```
Desktop agent main window (400×600, Arabic RTL) in 3 states side by side:
State A "غير مسجل حضور": greeting, today's hours "0:00 من 8:00", big teal button "تسجيل حضور".
State B "يعمل الآن": green status pill "يعمل الآن • التتبع شغال", large running timer "03:42:15", progress bar to daily target, Trello task selector showing current card "تصميم صفحة الدفع — بورد المتجر" with "تغيير", buttons "استراحة" (amber) and "تسجيل انصراف" (outline red), small line "آخر لقطة شاشة: 10:24 ص".
State C "في استراحة": amber state, break timer "00:12:30", note "التتبع متوقف أثناء الاستراحة", button "استئناف العمل".
Footer: user avatar/name, link "فتح لوحتي على الموقع".
```

### 18) اختيار مهمة Trello
```
Desktop agent modal "اختر المهمة" (Arabic RTL): search box, cards grouped by Trello board → list, each card shows title, labels colors, due date; option at top "بدون مهمة"; button "تحديث من Trello"; selecting a card switches the timer.
```

### 19) الإشعارات والـ Tray
```
Windows desktop notifications and tray for the "راصد" agent (Arabic RTL):
1) Small toast bottom corner: camera icon "تم أخذ لقطة شاشة — 10:24 ص" (auto-dismiss).
2) Idle return toast: "مرحباً بعودتك — 14 دقيقة خمول لم تُحسب من ساعات العمل".
3) Reminder toast: "لسه مسجل حضور؟ مفيش نشاط من 30 دقيقة — هيتم تسجيل انصراف تلقائي بعد 5 دقائق" with buttons "أنا موجود" / "تسجيل انصراف".
4) System tray icon (teal dot = tracking, amber = break, gray = off) with right-click menu: الحالة، تسجيل حضور/انصراف، استراحة، فتح البرنامج، فتح الموقع، خروج.
```
