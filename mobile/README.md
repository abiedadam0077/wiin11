# MineBot AI — Flutter/Dart + محرك Minecraft لـ Android

تطبيق Flutter أصلي بواجهة Dart؛ يمر الاتصال بميزات النظام عبر Android Method/Event Channels محدودة. لا يوجد WebView أو واجهة HTML. Android يحتضن محرك Node.js/Mineflayer في خدمة محلية، بينما تعرض Flutter البيانات المرصودة من SQLite ومحرك اللعبة. غياب snapshot أو خانة لا يُفسر على أنه حالة متصلة أو مخزون فارغ.

## المكونات والإصدارات

- **Flutter/Dart:** Flutter `>=3.35.0`، Dart `>=3.6.0`، Riverpod وGoRouter، ترجمات العربية RTL والإنجليزية والفرنسية.
- **Android:** Java 17، `minSdk 26`، `targetSdk 35`، `compileSdk 36`؛ Native bridge، SQLite، Android Keystore للمفتاح المحلي، خدمة foreground، JNI/CMake.
- **محرك اللعبة:** Node.js Mobile Android `24.20.0-0` (تُنزّل الحزمة المثبّتة وتُتحقق SHA-256 داخل CI)، Mineflayer `4.39.0`، Pathfinder `2.4.5`، collectblock `1.6.0`، و`minecraft-data 3.117.0`.
- **المتوافق:** Minecraft Java Edition فقط. خانة الإصدار لا تضمن تشغيل كل خادم أو Proxy/Plugin؛ بيانات Minecraft تُحل بحسب نسخة جلسة البوت الفعلية، وقد يرفض الخادم البروتوكول أو المصادقة.
- **التخزين:** SQLite للـservers/bots/tasks/task history/settings/AI config/skins/locations/logs/bot states. السجلات القديمة غير المتحققة لا تتحول إلى Bot online. مفتاح OpenRouter مخزن عبر Android Keystore؛ بيانات مصادقة Microsoft المؤقتة في app-private cache، وليست مضمونة بتشفير Keystore أثناء تشغيل Mineflayer.

## واجهة ومزايا متصلة بالبيانات الفعلية

- Dashboard يفرق بين ping السيرفر عبر Java Status protocol وبين جلسة البوت بعد `Spawn`، ويعرض القياسات فقط من snapshot حديث. `LOGIN` وحده لا يعني أن البوت دخل العالم.
- Bot Details يعرض الصحة/الطعام/الموقع/البعد/المخزون وحالة الجلسة المرصودة. توجد إشارة صريحة إلى أن Live View المرئية غير متاحة؛ Mineflayer يقدّم بيانات العالم لا فيديو. لا تُنشأ صور أو بث تخيلي.
- Inventory يعرض فقط slot snapshots التي أرسلها Minecraft: الخانات الرئيسية وhotbar والتجهيزات وعدد/تفاصيل الرزمة؛ إذا لم تتوفر خانات لا يعرض شبكة توحي أن المخزون فارغ. أيقونات العناصر رسومات أصلية مبسطة، وليست خامات Minecraft الرسمية.
- Skin Manager يقبل ملف PNG محليًا بأبعاد Minecraft المسموحة، ويعرض قصّة وجه الرأس والطبقة الخارجية إن أمكن. هذا معاينة محلية فقط، **ولا يغيّر Skin حساب Minecraft**.
- Task Builder يوفّر بحثًا وتصنيفات وIDs من كتالوج اقتراحات ثابت لمورّدو البيانات Minecraft `1.21.4`، مع إدخال ID متقدم. القائمة مساعدة وليست ضمان توافق؛ يعيد المحرك التحقق من block/drop وفق إصدار جلسة الخادم الفعلي. تظهر شاشة مراجعة الهدف والكمية والبوت والسيرفر والإسقاط المتوقع.
- Task Center/Details يعرضان الحالة والمرحلة والإسقاط والكمية المؤكدة والمدة والفعل المرصود والسبب وسجل الأحداث. لا يُخفى `INVENTORY_FULL` أو الفشل خلف نجاح شكلي.
- الاتصال يدعم Offline للسيرفرات التي تسمح به، أو Microsoft device-code flow؛ لا يطلب التطبيق كلمة مرور Microsoft. Ping السيرفر ليس تسجيل دخول أو دليلًا على أن البوت داخل العالم.
- أمر جمع واحد موصول حاليًا (`collect_block`): يقبل `dirt` أو `minecraft:dirt` ونظائرها، ويحل الإسقاط من بيانات نسخة الخادم. لا ينفذ الجمع إلا إذا كان للكتلة **إسقاط واحد ثابت مسجل**. مثال: `stone` يُثبت عبر `cobblestone`، و`grass_block` عبر `dirt`. لا تُعرض الإسقاطات العشوائية أو متعددة الاحتمالات كهدف دقيق.
- يظل التقدم محصورًا في فرق عنصر الإسقاط الفعلي في مخزون Mineflayer؛ تغيير الكتلة أو استجابة Pathfinder أو ظهور كيان item وحده لا يكفي. الإنهاء يعاد التحقق منه في مخزون Minecraft. مهمة `Dirt ×20` في الاختبارات محاكاة بمحرك/Mock، وليست اختبارًا على عالم أو خادم Minecraft فعلي.
- السلوك يوقف المهمة عند خطر الصحة/الطعام أو انقطاع الاتصال، ويدعم pause/resume/cancel مع انتظار إيقاف Mineflayer. إعادة الاتصال لها backoff متزايد، وتُرفض محاولات إعادة الاتصال مع kicks دائمة تتطلب تدخل المستخدم.
- خدمة Android الأمامية تبدأ عند تشغيل جلسة، وتعرض إشعارًا مع إجراء Stop all، وطلب إذن الإشعارات وفتح صفحة إعداد البطارية الرسمية متاحان. تُستخدم wake lock محدودة بدل إبقائها بلا حد.

## حدود التنفيذ الواجب معرفتها

- **لا يوجد Live View حقيقي الآن.** مسار Prismarine Viewer المنشور عارض WebGL يعمل كخادم ويب/واجهة متصفح، وليس surface Flutter أصليًا. بديل أصلي يتطلب تنفيذ رندر عالم 3D وجسر chunks وentities وtextures؛ لم نركّب بثًا أو عارضًا غير مدعوم، ولم نعد توزيع خامات لعبة رسمية.
- Chest/storage وCrafting والبناء والقتال وأتمتة متعددة الخطوات غير مدعومة حاليًا؛ لا تظهر كأدوات تعمل. مجموعة الـAI لا تملك قناة تنفيذ مباشرة إلى اللعبة.
- Foreground service وإشعار Android يحسّنان الاستمرار لكنهما لا يضمنانه: سياسات البطارية/OEM، force-stop، فقد الشبكة أو قتل العملية قد تقطع الجلسة. **لا تستأنف الجلسات تلقائيًا بعد إعادة تشغيل الهاتف**؛ راجع إشعار/حالة المحرك وأعد الاتصال يدويًا. إعداد الإعفاء من تحسين البطارية لا يُطلب تلقائيًا.
- لا يوجد جهاز Android أو خادم Minecraft حي متاح في بيئة التطوير. لذلك لا يوجد إثبات هنا لنجاح دخول Microsoft، أو spawn على خادم خارجي، أو `Dirt ×20` فعلي، أو background/reconnect على جهاز، ولا لتطبيق Skin على حساب. اختبارات المحرك تستخدم mocks محلية.
- نسخة APK التي ينتجها CI موقّعة بشهادة debug للاختبار، وليست توقيع Play Store. لا يُضاف APK إلى Git؛ انظر صفحة Releases / Actions للملف الذي يطابق commit المبني.

## اختبارات وتشغيل محلي

```bash
# من جذر المستودع
npm ci --prefix mobile/engine
npm --prefix mobile/engine test
node --check mobile/engine/task-engine.js

# يتطلب Flutter stable وAndroid SDK وJava 17
cd mobile
flutter pub get
flutter gen-l10n
dart format lib test
flutter analyze --no-fatal-infos
flutter test --reporter expanded --concurrency=1
```

بناء واختبار Android يتطلب `NDK 27.2.12479018` وCMake `3.22.1` وAndroid platform 36، إضافةً إلى إعداد `mobile/android/local.properties` بمساري Flutter وAndroid SDK. الـworkflow في `.github/workflows/build-minebot-android.yml` يثبت هذه الاعتماديات، يشغل Flutter وNode وRobolectric tests، ويبني debug وrelease APK.

```bash
gradle --no-daemon -p mobile/android :app:testDebugUnitTest :app:assembleDebug :app:assembleRelease
```

الاختبارات تختبر منطق المحرك/استجابة Status protocol المحلية/تخزين SQLite والعرض عبر Flutter؛ نجاحها لا يثبت اتصال Minecraft حيًا أو تشغيل Node JNI على هاتف فعلي.
