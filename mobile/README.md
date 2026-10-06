# MineBot AI — Android source

واجهة عربية RTL مستوحاة مباشرة من مرجع التصميم المرفق: Dark UI، بطاقات زجاجية، توهجات بنفسجية/زرقاء، أزرار متدرجة وتنقل سفلي ثابت. التطبيق يبدأ ببيانات فارغة ولا ينشئ Bots أو Servers أو نشاطًا تجريبيًا.

## ما يعمل في هذا الإصدار

- واجهة Dashboard وإدارة محلية للسيرفرات وملفات البوت والمهام والإعدادات والسجلات والـSkins.
- CRUD للسيرفرات والبوتات والمهام، مع تأكيد الحذف وسجل تغييرات محلي.
- **اختبار Server Status Ping حقيقي** لـMinecraft Java Edition عبر TCP: الإصدار، عدد اللاعبين والـMOTD. الاختبار لا يساوي تسجيل دخول Bot.
- Android WebView محلي، وSQLite عبر `SQLiteOpenHelper` لجداول servers/bots/tasks/task history/settings/AI config/skins/locations/logs/bot states.
- مفتاح OpenRouter يُشفّر بـAES-GCM ومفتاح محفوظ في Android Keystore. طلبات OpenRouter تُنفّذ من طبقة Android دون إعادة المفتاح إلى JavaScript. المعاينة المحلية تستخدم SQLite عبر Node، لكن مفتاحها يبقى في ذاكرة عملية الخادم فقط ولا يُكتب إلى القرص.
- جلب النماذج الفعلية من OpenRouter، ترتيب المتاح المجاني حسب السياق ودعم الأدوات/الاستدلال وسجل الاعتمادية، وخطة مهمة بصيغة منظّمة مع محاولة نماذج مجانية بديلة عند الفشل.
- حفظ وصف المهمة والخطة والسجل محليًا. من دون محرك Minecraft لا تتحول المهمة إلى Running/Completed ولا يُدّعى أنها نُفذت.
- رفع PNG Skin حقيقي بأبعاد Minecraft `64×64` أو `64×32` إلى مساحة التطبيق الخاصة، مع اختيار السكن في ملف البوت.
- نسخ احتياطي محلي واستيراد/دمج، إعدادات، فلترة Logs وقفل PIN محلي.
- سياسة `Behavior Engine` منفصلة ومختبرة؛ ترتيب الأولوية ظاهر للمستخدم، لكن لا توجد حالة عالم حيّ لتغذيتها.

## حدود يجب عدم إخفائها

**محرك تسجيل دخول وتشغيل Bots غير مدمج.** لا توجد مصادقة Microsoft ولا إرسال حزم Play للحركة أو الملاحة أو Pathfinding أو التعدين أو البناء أو المخزون/الأكل/القتال/التعافي من الموت. أزرار تشغيل Bot تشرح هذا القيد ولا تغيّر الحالة إلى Online. كذلك خطة AI اقتراح وليست Task تنفذ داخل Minecraft. لا تُدخل كلمة مرور Microsoft؛ التطبيق لا يطلبها ولا يخزّنها.

اختبار Ping متاح فقط لسيرفر Java يمكن الوصول إليه من الهاتف. لا يوجد دعم Bedrock أو SRV record أو اختبار تسجيل دخول. قائمة الـSkins تحفظ صورة Texture محليًا؛ تعيينها إلى Bot يحفظ الإعداد محليًا ولا يغيّر حسابًا على السيرفر.

## المعاينة المحلية

تتطلب Node.js 22 أو أحدث. من مجلد `mobile`:

```bash
npm ci
npm run build:web
npm test
npm start
```

افتح `http://localhost:4173` محليًا (أو منفذ المعاينة الذي تشغّله البيئة). خادم المعاينة يستمع على `0.0.0.0` ويخزن SQLite والملفات تحت `mobile/.data/`، وهو مجلد مستثنى من Git. مفتاح OpenRouter في وضع المعاينة مؤقت في ذاكرة العملية فقط؛ بعد إعادة تشغيل الخادم أعد إدخاله. لا تستخدم وضع المعاينة لتخزين مفتاح حساس على جهاز مشترك.

## بناء APK من المصدر

المشروع مضبوط على:

- **App name:** MineBot AI
- **Version:** 0.1.0 (versionCode 1)
- **Build type:** Debug
- **Target SDK:** 35
- **Minimum SDK:** 26

يلزم JDK 17، Android SDK Platform 35 وAndroid Build Tools، وGradle 8.7 متوافق مع Android Gradle Plugin 8.6.1. بعد تثبيت الأدوات واتصال Gradle بمستودعات Google/Maven:

```bash
cd mobile
npm ci
npm run build:web
cd android
gradle :app:assembleDebug
```

الناتج المتوقع: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`.

لم يُنتج APK داخل بيئة التطوير الحالية: هذه الحاوية لا تحتوي Java/Javac أو Gradle أو Android SDK/ADB، واتصالات تنزيل Android/Google Maven غير متاحة فيها. لم أضع ملف APK وهميًا أو رابط تحميل غير موجود. يلزم تشغيل الخطوات السابقة على Android Studio/CI مجهز للتحقق من حزمة APK وتثبيتها.

## الاختبارات

```bash
cd mobile
npm test
```

الاختبارات الحالية تغطي CRUD في SQLite، REST المحلي، حزمة Minecraft status ping على TCP، التحقق من العناوين، رفع PNG/النسخ المحلية، ترشيح النماذج، ترتيب Behavior Engine ومنع Task Engine من ادعاء التنفيذ من دون محرك. اختبارات OpenRouter الحية وتثبيت APK/اختبارات Android runtime تحتاج مفتاحًا يقدمه المستخدم وجهاز Android؛ لم تُنفذ في بيئة البناء هذه.
