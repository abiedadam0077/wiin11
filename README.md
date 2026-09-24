# wiin11 — Windows 11 Pro على GitHub Actions (مع حفظ البيانات)

هاد الريبو فيه GitHub Action (`.github/workflows/windows11.yml`) كيشغّل **Windows 11 Pro حقيقي**
(عن طريق Docker [`dockur/windows`](https://github.com/dockur/windows) + KVM) على سيرفر ديال GitHub.

- كتشعلو من تاب **Actions** وقتما بغيتي.
- كيبقى خدام حتى **~5 ساعات** (GitHub كيسمح بـ 6 ساعات ماكس للجوب، كنخليو الوقت الباقي للحفظ).
- ملي كيسالي الوقت (ولا ملي تطفي Windows بيدك) كيطفا **بشكل نقي** و كيتحفظ **الديسك كامل**
  (الملفات، الخلفية، البرامج، الإعدادات… كلشي) كـ backup **مشفّر** فـ **Releases** ديال الريبو.
- المرة الجاية ملي تشعلو، كيرجع آخر backup → Windows كيبان **بحال ما خليتيه بالضبط**.

---

## 1) الإعداد (مرة وحدة)

1. **Merge** هاد الكود لـ `main` (زر *Run workflow* ما كيبانش حتى يكون الملف فـ الـ branch الرئيسي).
2. سير لـ **Settings → Secrets and variables → Actions → New repository secret** وزيد:

| Secret | شنو هو |
|---|---|
| `BACKUP_PASSWORD` | كلمة سر لتشفير الـ backup. **ما تنساهاش** — بلا بيها البيانات ما كترجعش. |
| `ACCESS_PASSWORD` | كلمة السر ديال الدخول للـ web viewer **و** ديال المستخدم فـ Windows. |
| `TAILSCALE_AUTHKEY` *(اختياري)* | إلا بغيتي تدخل بـ **RDP** (Remote Desktop) عبر [Tailscale](https://tailscale.com). |

> ⚠️ الريبو **public** → logs و Releases كيشوفوهم الناس. داكشي علاش الـ backup مشفّر (AES-256)
> والـ web viewer محمي بكلمة سر. ما تحطش كلمات السر فـ الكود، غير فـ Secrets.

## 2) التشغيل

1. **Actions → Windows 11 Pro → Run workflow**.
   - `hours`: شحال من ساعة بغيتي (ماكس ~5).
   - `fresh_install`: خليه **مطفي** (إلا شعلتيه كيتجاهل الـ backup وكيدير Windows جديد).
2. دخل للجوب اللي خدام، فـ الـ step **"Start web access"** غادي تلقى رابط بحال:
   `https://xxxx-xxxx.trycloudflare.com`
3. حلّو فـ المتصفح → دخل:
   - user: `Docker` (ولا اللي حطيتي فـ `WIN_USER`)
   - password: `ACCESS_PASSWORD` ديالك
4. **أول مرة** كيتنصّب Windows أوتوماتيكيا (~20-40 دقيقة). من بعد كيقلع مباشرة من الـ backup.

الرابط كيتعاود يطبع كل 10 دقايق فـ الـ step **"Windows is running"** مع الوقت الباقي.

### RDP من الهاتف بـ Tailscale (اختياري)
1. دير حساب فـ https://tailscale.com ← **Settings ← Keys ← Generate auth key**
   وشعل **Reusable** و **Ephemeral** ← كوبي المفتاح (`tskey-auth-...`).
2. حطو فـ Secret سميتو `TAILSCALE_AUTHKEY`.
3. فـ الهاتف: نزّل **Tailscale** ودخل بنفس الحساب وشعلو (Connect).
4. نزّل **Windows App** (Microsoft Remote Desktop سابقا).
5. شعل الـ workflow، وتسنى حتى يبان فـ الـ log ديال **"Connect Tailscale"** الـ IP (`100.x.x.x`).
6. فـ Windows App: **+ ← Add PC** ← PC name = `100.x.x.x` (ولا `win11-github`)
   ← User account: `Docker` + `ACCESS_PASSWORD` ← Save ← Connect.

## 3) الإطفاء والحفظ

- **الأحسن:** طفي Windows من **Start → Power → Shut down** → الجوب كيحس بيه وكيحفظ فـ الحين.
- ولا خليه حتى يسالي الوقت → كيطفا بوحدو وكيحفظ.
- ❌ ما تديرش **Cancel** للجوب إلا للضرورة (ممكن الحفظ ما يكملش وتضيع التغييرات ديال هاد الجلسة).

الـ backup كيتقسم لأجزاء (< 2GB) ويترفع لـ Release سميتو `win11-backup-<التاريخ>`.
كيتخلاو آخر **2** backups (القديم كيتمسح أوتوماتيكيا). الـ restore كياخد غير backup كامل (فيه ملف `COMPLETE`).

## 4) الإعدادات (فـ أعلى ملف الـ workflow → `env:`)

| متغير | الافتراضي | ملاحظة |
|---|---|---|
| `WIN_VERSION` | `11` | Windows 11 Pro |
| `WIN_USER` | `Docker` | اسم المستخدم (كيتطبق غير فـ أول تنصيب) |
| `LANGUAGE` / `REGION` / `KEYBOARD` | English / en-US | مثلا `French` / `fr-FR` / `fr-FR` (أول تنصيب فقط) |
| `RAM_SIZE` | `12G` | الـ runner فيه 16GB |
| `CPU_CORES` | `4` | |
| `DISK_SIZE` | `64G` | sparse: غير المساحة المستعملة اللي كتتحفظ |
| `KEEP_BACKUPS` | `2` | |

## ملاحظات

- الحفظ والاسترجاع كياخدو شي وقت حسب حجم البيانات (مثلا ~15GB ≈ 10-20 دقيقة). كل ما خليتي Windows خفيف كل ما كان أسرع.
- كل جلسة كتبدا وكتسالى فـ سيرفر جديد، ولكن الديسك ديال Windows كيرجع كيف ما هو.
- ما تستعملش هادشي لحوايج كتخالف [شروط GitHub Actions](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features#actions).
