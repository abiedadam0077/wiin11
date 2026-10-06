# MineBot AI — Native Android

التطبيق الأصلي يستخدم Android Views/Activities وواجهات Android النظامية فقط. لا يحتوي APK على WebView أو صفحة HTML أو واجهة JavaScript. واجهة عربية RTL داكنة ببطاقات بنفسجية/زرقاء، وتُنشئ بياناتها محليًا بدل إظهار Bots أو اتصال أو Telemetry تجريبية.

## البنية الحالية

- **التطبيق:** Java Native Android، `com.minebot.ai`، version `0.1.0` / versionCode `1`، `minSdk 26`، `targetSdk 35`، `compileSdk 35`.
- **محرك Minecraft:** Node.js Mobile Android `24.20.0-0` عبر JNI، Mineflayer `4.39.0`، `mineflayer-pathfinder 2.4.5`، `mineflayer-auto-eat 5.0.3`. يعتمد الاتصال الحقيقي على Minecraft Java protocol عبر Mineflayer.
- **الإصدارات:** يقبل حقل الاتصال `auto` أو `1.8` حتى `1.21.x` (بصيغة patch حتى رقمين). هذا حدّ التحقق في الواجهة، وليس ضمانًا بأن كل إصدار/Proxy/Plugin يعمل؛ لم تُجرَ بعد مصادقة حيّة على مصفوفة الإصدارات.
- **التخزين:** SQLite عبر `SQLiteOpenHelper` لجداول servers/bots/tasks/task history/settings/AI config/skins/locations/logs/bot states. المفتاح OpenRouter مشفّر AES-GCM ومفتاح التشفير محفوظ في Android Keystore. ملفات Microsoft auth المؤقتة تبقى داخل app-private cache وتُحذف عند إيقاف المحرك؛ لا تُكتب في المستودع أو السجلات.
- **الخلفية:** خدمة foreground من نوع `connectedDevice` مع إشعار، `WAKE_LOCK` محدود بست ساعات، وإعادة اتصال بتأخير متزايد. Android/OEM ما يزال قادرًا على قتل الخدمة أو تقييد الشبكة؛ راقب إشعار النظام وسياسات البطارية.
- **الذكاء الاصطناعي:** اتصال مباشر إلى OpenRouter عبر HTTPS بعد أن يضيف المستخدم مفتاحه. يجلب التطبيق النماذج المجانية، يتيح اختيارها، ويحاول حتى أربعة بدائل إذا فشل النموذج المحدد. مخرجات AI محصورة في اقتراح `collect` واحد أو `unsupported`. لا يملك AI واجهة أو قناة لإرسال أوامر Minecraft؛ موافقة المستخدم تحفظ المهمة `pending`، ثم يتحقق Task Engine ومحرك Mineflayer من الاتصال والكتلة ومخزون العالم.

## الوظائف الموصولة فعليًا

- إضافة وتعديل وحذف سجل سيرفر Java وبوت محلي، واختيار Offline أو تدفق Microsoft device-code (لا تُطلب كلمة مرور Microsoft).
- Minecraft Server List Status Ping عبر TCP؛ يعرض نسخة/لاعبين/وصفًا عند نجاحه، لكنه **ليس تسجيل دخول**.
- إنشاء جلسة Mineflayer، أحداث تسجيل الدخول وSpawn والحالة الحقيقية، ومخزون/صحة/طعام/موقع مرصود. واجهة ONLINE تتطلب لقطة Spawn حديثة؛ السجل القديم يظهر غير متحقق.
- أوامر حركة قصيرة، Chat، إيقاف الحركة، Disconnect، وإعادة الاتصال؛ تُرسل إلى جلسة Mineflayer فقط.
- مهمة جمع كتل محدودة: الحركة عبر Pathfinder ثم dig وانتظار فرق حقيقي في المخزون قبل التقدم. حالات المهمة تُحفظ في SQLite، مع Pause/Resume/Cancel. Behavior Engine يوقف المهمة عند انقطاع الاتصال أو أولوية الطعام/الصحة.
- إدارة PNG Skins محليًا والتحقق من الأبعاد `64×64` أو `64×32`. **لا يرفع التطبيق Skin إلى حساب Microsoft أو يغيّر Skin السيرفر.**
- إشعار خدمة أمامية، سجل أحداث، نسخة احتياطية JSON محلية، وإعدادات AI.

## حدود معروفة — لا تُخفَ

- لا يوجد تحقق حي حتى الآن من بناء/تشغيل Node داخل APK أو اتصال Minecraft خارجي أو Microsoft OAuth؛ الاختبارات الحالية تختبر منطق المحرك مع Mineflayer mock وبروتوكول Status Ping محلي فقط.
- لم يُنتج APK في هذه البيئة بعد. لا يوجد هنا JDK/Gradle/Android SDK/NDK مثبت، لذلك لم تُشغّل اختبارات Robolectric أو `assembleDebug`/`assembleRelease`.
- المهام المدعومة حاليًا جمع كتلة لها عنصر مطابق في المخزون ضمن العالم المحمّل. التخزين بالصناديق، Crafting، البناء، القتال، follow/goto من الواجهة، وAI لتنفيذ خطة عامة متعددة الخطوات غير جاهزة.
- تسجيل Microsoft يعتمد SDK/المكتبات التابعة لـMineflayer، ويتطلب خادم Java يسمح بحساب Online؛ Offline لا يعمل إلا على سيرفر يسمح بذلك. لا يوجد دعم Bedrock/SRV أو تسجيل دخول غير رسمي.
- ملفات auth المؤقتة في دليل التطبيق الخاص، لكنها ليست تشفيرًا مخصصًا بـKeystore أثناء تشغيل Mineflayer. مفتاح OpenRouter وحده يُخزن بتشفير Keystore.
- لا تتضمن النسخة إعداد توقيع Play Store. نسخة Release في CI تستخدم debug certificate لغرض الاختبار فقط وليست إصدار إنتاج.

## اختبارات المحرك

```bash
npm ci --prefix mobile/engine
npm --prefix mobile/engine test
node --check mobile/engine/main.js
```

الاختبارات تغطي التحقق من إعداد الاتصال وتنقيح الأسرار، أحداث CONNECTING/JOINING/Spawn، لقطة الحالة، أوامر التحكم، زيادة المخزون قبل التقدم، Pause/Resume/Cancel، Behavior للأكل، وعزل أحداث الجلسات القديمة. لا تساوي هذه الاختبارات خادم Minecraft حيًا.

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
