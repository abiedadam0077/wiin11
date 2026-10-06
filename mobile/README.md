# MineBot AI — Native Android

التطبيق الأصلي يستخدم Android Views/Activities وواجهات Android النظامية فقط. لا يحتوي APK على WebView أو صفحة HTML أو واجهة JavaScript. واجهة عربية RTL داكنة ببطاقات بنفسجية/زرقاء، وتُنشئ بياناتها محليًا بدل إظهار Bots أو اتصال أو Telemetry تجريبية.

## البنية الحالية

- **التطبيق:** Java Native Android، `com.minebot.ai`، version `0.1.0` / versionCode `1`، `minSdk 26`، `targetSdk 35`، `compileSdk 35`.
- **محرك Minecraft:** Node.js Mobile Android `24.20.0-0` عبر JNI، Mineflayer `4.39.0`، `mineflayer-pathfinder 2.4.5`، `mineflayer-auto-eat 5.0.3`، و`mineflayer-collectblock 1.6.0` مع `mineflayer-tool`. يعتمد الاتصال الحقيقي على Minecraft Java protocol عبر Mineflayer.
- **الإصدارات:** يقبل حقل الاتصال `auto` أو `1.8` حتى `1.21.x` (بصيغة patch حتى رقمين). هذا حدّ التحقق في الواجهة، وليس ضمانًا بأن كل إصدار/Proxy/Plugin يعمل؛ لم تُجرَ بعد مصادقة حيّة على مصفوفة الإصدارات.
- **التخزين:** SQLite عبر `SQLiteOpenHelper` لجداول servers/bots/tasks/task history/settings/AI config/skins/locations/logs/bot states. المفتاح OpenRouter مشفّر AES-GCM ومفتاح التشفير محفوظ في Android Keystore. ملفات Microsoft auth المؤقتة تبقى داخل app-private cache وتُحذف عند إيقاف المحرك؛ لا تُكتب في المستودع أو السجلات.
- **الخلفية:** خدمة foreground من نوع `connectedDevice` مع إشعار، `WAKE_LOCK` محدود بست ساعات، وإعادة اتصال بتأخير متزايد. Android/OEM ما يزال قادرًا على قتل الخدمة أو تقييد الشبكة؛ راقب إشعار النظام وسياسات البطارية.
- **الذكاء الاصطناعي:** اتصال مباشر إلى OpenRouter عبر HTTPS بعد أن يضيف المستخدم مفتاحه. يجلب التطبيق النماذج المجانية، يتيح اختيارها، ويحاول حتى أربعة بدائل إذا فشل النموذج المحدد. مخرجات AI محصورة في اقتراح `collect` واحد أو `unsupported`؛ لا يرسل النموذج tool calls ولا يملك قناة تنفيذ. موافقة المستخدم تحفظ المهمة `pending`، وتشغيلها لاحقًا يمر حصريًا عبر Registry ثابتة لأداة `collect_block`، ثم يتحقق Task Engine من بيانات Minecraft واتصال Spawn والتغير الفعلي في المخزون.

## الوظائف الموصولة فعليًا

- إضافة وتعديل وحذف سجل سيرفر Java وبوت محلي، واختيار Offline أو تدفق Microsoft device-code (لا تُطلب كلمة مرور Microsoft).
- Minecraft Server List Status Ping عبر TCP؛ يعرض نسخة/لاعبين/وصفًا عند نجاحه، لكنه **ليس تسجيل دخول**.
- إنشاء جلسة Mineflayer، أحداث تسجيل الدخول وSpawn والحالة الحقيقية، ومخزون 36 خانة وتجهيز/صحة/طعام/موقع وقياسات عالم مرصودة. `JOINING` بعد Login، و`ONLINE` فقط بعد Spawn حقيقي؛ Server Status Ping وقياس جلسة البوت منفصلان. السجل القديم يظهر غير متحقق.
- أوامر حركة قصيرة، Chat، إيقاف الحركة، Disconnect، وإعادة الاتصال؛ تُرسل إلى جلسة Mineflayer فقط.
- مهمة جمع محدودة عبر `mineflayer-collectblock` (Pathfinder + اختيار الأداة الحقيقي): يقبل المحرك حاليًا فقط الكتل التي تُظهر بيانات Minecraft إسقاط عنصر بالاسم نفسه. يحدّث التقدم عند رصد فرق حقيقي بالمخزون، ويحفظ خط الأساس والتقدم، ويتحقق منهما عند إعادة تشغيل المهمة. Pause/Resume/Cancel يطلب إيقاف collectblock ويحتفظ بالمهمة متوقفة إذا لم يتأكد الإلغاء. Behavior Engine يوقف المهمة عند انقطاع الاتصال أو أولوية الطعام/الصحة، ولا يسمح لـResume بتجاوزها.
- إدارة PNG Skins محليًا والتحقق من الأبعاد `64×64` أو `64×32`. **لا يرفع التطبيق Skin إلى حساب Microsoft أو يغيّر Skin السيرفر.**
- إشعار خدمة أمامية، سجل أحداث، نسخة احتياطية JSON محلية، وإعدادات AI.

## حدود معروفة — لا تُخفَ

- نجح CI في 2026-10-06 في تشغيل Node tests وRobolectric ثم بناء APK debug وrelease مع JNI/CMake (run [37541446115](https://github.com/abiedadam0077/wiin11/actions/runs/37541446115)); ونُشرت الملفات في [الإصدار native #12](https://github.com/abiedadam0077/wiin11/releases/tag/minebot-ai-native-build-12). هذا يثبت البناء فقط، لا تشغيل `libnode` على جهاز حقيقي ولا اتصال Minecraft خارجي أو Microsoft OAuth.
- لم يُختبر APK بعد على جهاز أو محاكي Android، ولم تُجرَ مصادقة/Join/Spawn حية لخادم Minecraft. اختبارات Mineflayer محاكاة بروتوكول/جلسة؛ واختبار Status Ping يستخدم خادمًا محليًا ولا يساوي تسجيل الدخول.
- المهام المدعومة حاليًا جمع كتلة ضمن 48 كتلة محمّلة بشرط أن تؤكد بيانات Minecraft إسقاط عنصر بالاسم نفسه. لذلك لا تُعامل خامات مثل `diamond_ore` أو الكتل ذات إسقاط مختلف كمهام مدعومة. التخزين بالصناديق، Crafting، البناء، القتال، وخطط AI متعددة الخطوات غير جاهزة. أدوات الحركة الداخلية لا تُعرض للـAI.
- تسجيل Microsoft يعتمد SDK/المكتبات التابعة لـMineflayer، ويتطلب خادم Java يسمح بحساب Online؛ Offline لا يعمل إلا على سيرفر يسمح بذلك. لا يوجد دعم Bedrock/SRV أو تسجيل دخول غير رسمي.
- ملفات auth المؤقتة في دليل التطبيق الخاص، لكنها ليست تشفيرًا مخصصًا بـKeystore أثناء تشغيل Mineflayer. مفتاح OpenRouter وحده يُخزن بتشفير Keystore.
- لا تتضمن النسخة إعداد توقيع Play Store. نسخة Release في CI تستخدم debug certificate لغرض الاختبار فقط وليست إصدار إنتاج.

## اختبارات المحرك

```bash
npm ci --prefix mobile/engine
npm --prefix mobile/engine test
node --check mobile/engine/main.js
```

اختبارات Node الحالية شغّلت 16/16 بنجاح؛ تغطي إعداد الاتصال وتنقيح الأسرار، LOGIN مقابل Spawn، لقطات المخزون، Registry أدوات مغلقة، منع التقدم دون فرق مخزون، خط أساس استئناف المهام، Pause/Resume/Cancel وإيقاف kick نهائي، أولوية البقاء، وعزل أحداث الجلسات القديمة. جرى أيضًا `node --check` لملفات المحرك و`npm audit` دون ثغرات. لم تُشغّل Android/Robolectric أو Gradle في هذه البيئة الحالية (لا يوجد JDK/Gradle)، كما أن نجاح اختبارات Node لا يثبت تشغيل JNI أو جلسة Minecraft حية. سجلات CI السابقة لستة اختبارات Android تخص إصدارًا أقدم ولا تُعد اختبارًا لهذه التعديلات.

## بناء APK

يحتاج JDK 17 وAndroid SDK Platform/Build Tools 35 وNDK `27.2.12479018` وCMake `3.22.1` وGradle `8.7` (AGP `8.6.1`). يحمّل workflow حزمة Node.js Mobile مثبتة الإصدار، ويتحقق من SHA-256، ثم ينسخ المكتبة للرابط JNI ويبني Native APK.

```bash
npm ci --prefix mobile/engine
cd mobile/android
gradle :app:testDebugUnitTest
gradle :app:assembleDebug :app:assembleRelease
```

المخرجات المتوقعة:

- `mobile/android/app/build/outputs/apk/debug/app-debug.apk`
- `mobile/android/app/build/outputs/apk/release/app-release.apk` (موقّع بمفتاح debug في CI للاختبار فقط)

Build metadata: application ID `com.minebot.ai`; version `0.1.0` (`versionCode 1`); target/compile SDK `35`; minimum SDK `26`; ABIs `arm64-v8a` و`x86_64`.

آخر APK منشور قبل دمج Task Engine/Tool Registry الحالية: [app-release.apk من build #12](https://github.com/abiedadam0077/wiin11/releases/download/minebot-ai-native-build-12/app-release.apk) (167,412,208 بايت، SHA-256 `8bc6411084bffe5ae4e4ac633e31f5fd254785a5f4affa481c8bbf6dbf749d4e`). هذا APK أقدم ولا يحتوي تغييرات هذه المرحلة. لم يتوفر في بيئة التطوير الحالية JDK أو Gradle لبناء APK محدّث محليًا؛ لذلك لا ينبغي تنزيله باعتباره build لهذه الشيفرة. أي APK جديد يجب ربطه برقم CI وcommit المطابق بعد نجاح Android tests والبناء.
