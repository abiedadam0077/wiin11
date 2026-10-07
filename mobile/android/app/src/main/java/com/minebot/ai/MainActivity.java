package com.minebot.ai;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.GridLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Entire Android UI is native Android Views; the Minecraft worker is a separate embedded Node service. */
public final class MainActivity extends Activity {
    private static final int PICK_SKIN = 7301;
    private static final int NOTIFICATION_REQUEST = 7302;
    private static final int PICK_BACKUP = 7303;

    private static final int BG = Color.rgb(4, 6, 20);
    private static final int SURFACE = Color.argb(204, 14, 20, 46);
    private static final int SURFACE_RAISED = Color.argb(222, 22, 28, 62);
    private static final int TEXT = Color.rgb(244, 248, 255);
    private static final int MUTED = Color.rgb(163, 179, 217);
    private static final int PURPLE = Color.rgb(174, 91, 255);
    private static final int BLUE = Color.rgb(61, 148, 255);
    private static final int CYAN = Color.rgb(78, 224, 255);
    private static final int GREEN = Color.rgb(72, 222, 163);
    private static final int RED = Color.rgb(255, 103, 129);
    private static final int AMBER = Color.rgb(255, 194, 93);
    private static final String[][] TASK_CATEGORIES = {
            {"collect", "جمع الموارد", "متاح · collect_block"},
            {"mining", "التعدين", "غير موصول"},
            {"building", "البناء", "غير موصول"},
            {"protection", "الحماية", "غير موصول"},
            {"farming", "الزراعة", "غير موصول"},
            {"exploration", "الاستكشاف", "غير موصول"},
            {"follow", "اتباع لاعب", "غير موصول كمهام"},
            {"storage", "التخزين", "غير موصول"},
            {"combat", "القتال", "غير موصول"},
            {"crafting", "الصناعة", "غير موصول"},
            {"transport", "نقل الموارد", "غير موصول"},
            {"survival", "البقاء / AFK", "غير موصول كمهمة"},
            {"ai", "مهمة AI مخصصة", "خطة جمع محدودة فقط"}
    };
    private static final String[][] COMMON_COLLECTABLES = {
            {"oak_log", "خشب البلوط"}, {"spruce_log", "خشب التنوب"}, {"birch_log", "خشب البتولا"},
            {"jungle_log", "خشب الأدغال"}, {"acacia_log", "خشب الأكاسيا"}, {"dark_oak_log", "خشب البلوط الداكن"},
            {"mangrove_log", "خشب المانغروف"}, {"cherry_log", "خشب الكرز"}, {"dirt", "تراب"},
            {"sand", "رمل"}, {"gravel", "حصى"}, {"cobblestone", "حجر مرصوف"}
    };

    private final ExecutorService io = Executors.newFixedThreadPool(2);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private DatabaseStore database;
    private SecureStore secureStore;
    private LinearLayout pageContent;
    private LinearLayout root;
    private ScrollView contentScroll;
    private long lastSnapshotRenderAt;
    private String tab = "home";
    private String lastRenderedTab = "";
    private String selectedBotId = "";
    private String selectedServerId = "";
    private String selectedBotSection = "overview";
    private String botStatusFilter = "all";
    private String botSearchQuery = "";
    private String serverSearchQuery = "";
    private String taskStatusFilter = "all";
    private String taskWizardCategory = "collect";
    private String taskBlockName = "oak_log";
    private String taskSelectedBotId = "";
    private String engineState = "STOPPED";
    private String engineReason = "";
    private String nodeVersion = "";
    private String plannerPrompt = "";
    private String plannerBotId = "";
    private EditText plannerInput;
    private JSONObject latestAiPlan;
    private String pendingBackupJson = "";
    private boolean plannerRequestRunning;
    private boolean receiverRegistered;
    private boolean deferredRenderAfterInput;

    private final BroadcastReceiver engineReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (!BotEngineService.EVENT_ACTION.equals(intent.getAction())) return;
            String eventName = intent.getStringExtra("eventName");
            String payload = intent.getStringExtra("payload");
            try {
                JSONObject event = new JSONObject(payload == null ? "{}" : payload);
                boolean shouldRender = true;
                if ("engine_state".equals(eventName)) {
                    String nextStatus = event.optString("status", engineState);
                    String nextReason = event.optString("reason", engineReason);
                    String nextRuntime = event.optString("runtime", nodeVersion);
                    shouldRender = !nextStatus.equals(engineState) || !nextReason.equals(engineReason) || !nextRuntime.equals(nodeVersion);
                    engineState = nextStatus;
                    engineReason = nextReason;
                    nodeVersion = nextRuntime;
                    if ("FAILED".equals(engineState) && shouldRender) toast(engineReason.isEmpty() ? "تعذر تشغيل المحرك." : engineReason);
                }
                if ("auth_code".equals(eventName)) showMicrosoftCode(event);
                if ("service_error".equals(event.optString("type"))) toast(event.optString("reason", "تعذر تنفيذ العملية."));
                if ("command_result".equals(eventName) && !event.optBoolean("ok", true)) toast(event.optString("error", "رفض محرك Minecraft الأمر."));
                boolean snapshotEvent = "bot_snapshot".equals(eventName);
                boolean refreshSnapshotView = snapshotEvent && (tab.equals("home") || tab.equals("bots") || tab.equals("bot-details") || tab.equals("inventory"))
                        && System.currentTimeMillis() - lastSnapshotRenderAt >= 2500L;
                if ((!snapshotEvent && shouldRender) || refreshSnapshotView) {
                    if (snapshotEvent) lastSnapshotRenderAt = System.currentTimeMillis();
                    if (getCurrentFocus() instanceof EditText) {
                        deferredRenderAfterInput = true;
                        return;
                    }
                    deferredRenderAfterInput = false;
                    render();
                }
            } catch (JSONException ignored) { toast("استقبل التطبيق حدثًا غير صالح من خدمة البوت."); }
        }
    };

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        database = new DatabaseStore(getApplicationContext());
        secureStore = new SecureStore(getApplicationContext());
        restoreEngineState();
        Window window = getWindow();
        window.setStatusBarColor(BG);
        window.setNavigationBarColor(BG);
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        if (Build.VERSION.SDK_INT >= 30) window.setDecorFitsSystemWindows(true);
        registerEngineReceiver();
        requestNotificationPermission();
        if (!getPreferences(MODE_PRIVATE).getBoolean("welcome_seen", false)) tab = "welcome";
        render();
    }

    private void restoreEngineState() {
        android.content.SharedPreferences state = getSharedPreferences("minebot_engine_state_v1", MODE_PRIVATE);
        String savedStatus = state.getString("status", "STOPPED");
        long lastSeen = state.getLong("observedAt", 0);
        if ("FAILED".equals(savedStatus)) engineState = "FAILED";
        else if ("READY".equals(savedStatus) && System.currentTimeMillis() - lastSeen <= 10_000L) engineState = "READY";
        else engineState = "STOPPED";
        engineReason = state.getString("reason", "");
        nodeVersion = state.getString("runtime", "");
    }

    private void registerEngineReceiver() {
        if (receiverRegistered) return;
        IntentFilter filter = new IntentFilter(BotEngineService.EVENT_ACTION);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(engineReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(engineReceiver, filter);
        receiverRegistered = true;
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_REQUEST);
        }
    }

    private void render() {
        if (plannerInput != null) plannerPrompt = plannerInput.getText().toString();
        deferredRenderAfterInput = false;
        final int restoreScroll = contentScroll == null ? 0 : contentScroll.getScrollY();
        final boolean welcome = "welcome".equals(tab);
        final boolean tabChanged = !tab.equals(lastRenderedTab);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        root.setBackground(new NeonBackdrop());
        root.setClipChildren(false);
        root.setClipToPadding(false);

        if (!welcome) {
            LinearLayout header = new LinearLayout(this);
            header.setGravity(Gravity.CENTER_VERTICAL);
            header.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
            header.setPadding(dp(12), dp(9), dp(12), dp(9));
            header.setBackground(glassDrawable(CYAN, 23));
            header.setElevation(dp(8));
            ImageView brandMark = new ImageView(this);
            brandMark.setImageResource(R.drawable.ic_minebot);
            brandMark.setScaleType(ImageView.ScaleType.FIT_CENTER);
            header.addView(brandMark, new LinearLayout.LayoutParams(dp(42), dp(42)));
            LinearLayout brandText = new LinearLayout(this);
            brandText.setOrientation(LinearLayout.VERTICAL);
            brandText.setPadding(dp(10), 0, dp(10), 0);
            TextView brand = text("MINEBOT AI", 13, TEXT, true);
            brand.setLetterSpacing(0.075f);
            brandText.addView(brand, margin(0, 0, 0, 1));
            addText(brandText, "VOXEL CONTROL SYSTEM", 8, CYAN, true, 0, 0);
            header.addView(brandText, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
            String engineLabel = engineState.equals("READY") ? "ENGINE READY" : engineState.equals("FAILED") ? "ENGINE ERROR" : "ENGINE IDLE";
            header.addView(pill(engineLabel, engineState.equals("READY") ? GREEN : engineState.equals("FAILED") ? RED : MUTED));
            TextView settingsButton = text("⚙", 19, CYAN, true);
            settingsButton.setGravity(Gravity.CENTER);
            settingsButton.setBackground(glassDrawable(PURPLE, 15));
            LinearLayout.LayoutParams gearParams = new LinearLayout.LayoutParams(dp(42), dp(42));
            gearParams.setMargins(dp(7), 0, 0, 0);
            header.addView(settingsButton, gearParams);
            settingsButton.setContentDescription("الإعدادات");
            settingsButton.setOnClickListener(view -> { tab = "settings"; render(); });
            LinearLayout.LayoutParams headerParams = margin(15, 8, 15, 2);
            headerParams.height = dp(62);
            root.addView(header, headerParams);
        }

        ScrollView scroll = new ScrollView(this);
        contentScroll = scroll;
        scroll.setFillViewport(true);
        scroll.setClipToPadding(false);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        scroll.setBackgroundColor(Color.TRANSPARENT);
        pageContent = new LinearLayout(this);
        pageContent.setOrientation(LinearLayout.VERTICAL);
        pageContent.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        pageContent.setClipChildren(false);
        pageContent.setClipToPadding(false);
        pageContent.setPadding(welcome ? 0 : dp(17), welcome ? 0 : dp(12), welcome ? 0 : dp(17), welcome ? 0 : dp(30));
        scroll.addView(pageContent, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        renderContent();
        if (!welcome) root.addView(bottomNav());
        setContentView(root);
        if (restoreScroll > 0 && !tabChanged) scroll.post(() -> scroll.scrollTo(0, restoreScroll));
        if (tabChanged) {
            root.setAlpha(0.72f);
            root.setTranslationY(dp(8));
            root.animate().alpha(1f).translationY(0f).setDuration(190).start();
        }
        lastRenderedTab = tab;
    }

    private void renderContent() {
        switch (tab) {
            case "welcome": renderWelcome(); break;
            case "servers": renderServers(); break;
            case "server-details": renderServerDetails(); break;
            case "bots": renderBots(); break;
            case "tasks": renderTasks(); break;
            case "task-types": renderTaskTypes(); break;
            case "task-create": renderTaskCreate(); break;
            case "logs": renderLogs(); break;
            case "settings": renderSettings(); break;
            case "skins": renderSkins(); break;
            case "planner": renderPlanner(); break;
            case "bot-details": renderBotDetails(); break;
            case "inventory": renderInventoryScreen(); break;
            default: renderHome(); break;
        }
    }

    private void renderWelcome() {
        FrameLayout splash = new FrameLayout(this);
        splash.setMinimumHeight(dp(700));
        splash.setBackground(rounded(BG, PURPLE, dp(30)));
        splash.setClipToOutline(true);
        ImageView art = new ImageView(this);
        art.setImageResource(R.drawable.voxel_hero);
        art.setScaleType(ImageView.ScaleType.CENTER_CROP);
        splash.addView(art, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        View shade = new View(this);
        shade.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{Color.argb(22, 3, 5, 21), Color.argb(26, 3, 5, 21), Color.argb(118, 4, 6, 20), Color.argb(246, 4, 6, 20)}));
        splash.addView(shade, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout brand = new LinearLayout(this);
        brand.setGravity(Gravity.CENTER_VERTICAL);
        brand.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        brand.setPadding(dp(13), dp(9), dp(13), dp(9));
        brand.setBackground(glassDrawable(CYAN, 20));
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.ic_minebot);
        brand.addView(logo, new LinearLayout.LayoutParams(dp(36), dp(36)));
        LinearLayout brandCopy = new LinearLayout(this);
        brandCopy.setOrientation(LinearLayout.VERTICAL);
        brandCopy.setPadding(dp(8), 0, dp(8), 0);
        addText(brandCopy, "MINEBOT AI", 11, TEXT, true, 0, 1);
        addText(brandCopy, "NEON VOXEL SYSTEM", 7, CYAN, true, 0, 0);
        brand.addView(brandCopy, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        brand.addView(pill("JAVA EDITION", PURPLE));
        FrameLayout.LayoutParams brandParams = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP);
        brandParams.setMargins(dp(16), dp(18), dp(16), 0);
        splash.addView(brand, brandParams);

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        content.setGravity(Gravity.BOTTOM);
        content.setPadding(dp(19), dp(18), dp(19), dp(21));
        content.setBackground(glassDrawable(PURPLE, 27));
        TextView overline = text("AUTOMATION  /  REAL MINECRAFT DATA", 8, CYAN, true);
        overline.setLetterSpacing(0.11f);
        content.addView(overline, margin(0, 0, 0, 5));
        addText(content, "عالمك بين\nيديك.", 34, TEXT, true, 0, 6);
        addText(content, "تحكّم بجلسات Minecraft Java من واجهة أصلية. الاتصال والـInventory والتقدم لا يظهرون إلا من بيانات حقيقية.", 11, Color.rgb(211, 225, 255), false, 0, 13);
        button(content, "ابدأ المغامرة", true, () -> {
            getPreferences(MODE_PRIVATE).edit().putBoolean("welcome_seen", true).apply();
            tab = "home";
            render();
        });
        LinearLayout trust = new LinearLayout(this);
        trust.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        trust.addView(pill("محرك أصلي", CYAN), weightMargin());
        trust.addView(pill("RTL عربي", PURPLE), weightMargin());
        trust.addView(pill("بدون بيانات وهمية", GREEN), weightMargin());
        content.addView(trust, margin(0, 4, 0, 0));
        FrameLayout.LayoutParams contentParams = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        contentParams.setMargins(dp(13), 0, dp(13), dp(14));
        splash.addView(content, contentParams);
        pageContent.addView(splash, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(720)));
    }

    private FrameLayout heroBanner(String eyebrow, String headline, String subtitle, String buttonLabel, Runnable action, int height) {
        FrameLayout banner = new FrameLayout(this);
        banner.setBackground(glassDrawable(PURPLE, 27));
        banner.setClipToOutline(true);
        banner.setElevation(dp(12));
        ImageView art = new ImageView(this);
        art.setImageResource(R.drawable.voxel_hero);
        art.setScaleType(ImageView.ScaleType.CENTER_CROP);
        banner.addView(art, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        View shade = new View(this);
        shade.setBackground(new GradientDrawable(GradientDrawable.Orientation.RIGHT_LEFT,
                new int[]{Color.argb(240, 6, 8, 28), Color.argb(188, 8, 13, 40), Color.argb(42, 8, 13, 37)}));
        banner.addView(shade, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        View glow = new View(this);
        glow.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{Color.argb(84, 76, 105, 255), Color.TRANSPARENT}));
        banner.addView(glow, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(72), Gravity.TOP));
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        content.setPadding(dp(18), dp(17), dp(18), dp(17));
        content.setGravity(Gravity.CENTER_VERTICAL);
        banner.addView(content, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        LinearLayout statusLine = new LinearLayout(this);
        statusLine.setGravity(Gravity.CENTER_VERTICAL);
        statusLine.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        statusLine.addView(pill(eyebrow, CYAN));
        View pulse = new View(this);
        pulse.setBackground(rounded(GREEN, GREEN, dp(6)));
        LinearLayout.LayoutParams pulseParams = new LinearLayout.LayoutParams(dp(7), dp(7));
        pulseParams.setMargins(dp(7), 0, 0, 0);
        statusLine.addView(pulse, pulseParams);
        content.addView(statusLine, margin(0, 0, 0, 8));
        addText(content, headline, 25, TEXT, true, 0, 5);
        addText(content, subtitle, 10, Color.rgb(222, 229, 255), false, 0, 9);
        TextView cta = text(buttonLabel + "   ›", 10, TEXT, true);
        cta.setGravity(Gravity.CENTER);
        cta.setPadding(dp(14), dp(10), dp(14), dp(10));
        cta.setBackground(new RippleDrawable(ColorStateList.valueOf(Color.argb(75, 88, 221, 255)),
                gradientDrawable(new int[]{Color.rgb(123, 56, 235), Color.rgb(35, 105, 226), Color.rgb(18, 149, 206)}, CYAN), null));
        cta.setOnClickListener(view -> action.run());
        cta.setFocusable(true);
        animatePress(cta);
        content.addView(cta, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        banner.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(height)));
        return banner;
    }

    private void renderHome() {
        title("لوحة التحكم", "إدارة جلسات Minecraft Java من مكان واحد");
        pageContent.addView(heroBanner("COMMAND DECK  /  NATIVE CONTROL", "مغامرتك تبدأ هنا", "الاتصال والقياسات والمهام تأتي من المحرك الحقيقي فقط.", "إضافة بوت", () -> showBotDialog(), 206), margin(0, 2, 0, 14));

        int serverCount = records("servers").length();
        int botCount = records("bots").length();
        int onlineCount = 0;
        JSONArray botStates = records("bot_states");
        for (int i = 0; i < botStates.length(); i++) {
            JSONObject state = botStates.optJSONObject(i);
            if (isLiveBot(state)) onlineCount++;
        }
        LinearLayout stats = new LinearLayout(this);
        stats.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        stats.addView(statCard("السيرفرات", String.valueOf(serverCount), BLUE), weightMargin());
        stats.addView(statCard("ملفات البوت", String.valueOf(botCount), PURPLE), weightMargin());
        stats.addView(statCard("اتصال حي", String.valueOf(onlineCount), onlineCount > 0 ? GREEN : MUTED), weightMargin());
        pageContent.addView(stats, margin(0, 0, 0, 18));

        section("بوابة التحكم السريع");
        GridLayout actions = new GridLayout(this);
        actions.setColumnCount(2);
        actions.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        addQuickAction(actions, "servers", "01", "السيرفرات", "إضافة أو فحص Java", () -> { tab = "servers"; render(); }, BLUE);
        addQuickAction(actions, "bots", "02", "ملفات البوت", "إعداد جلسة حقيقية", () -> { tab = "bots"; render(); }, PURPLE);
        addQuickAction(actions, "tasks", "03", "المهام", "تقدم مؤكد من اللعبة", () -> { tab = "tasks"; render(); }, GREEN);
        addQuickAction(actions, "ai", "AI", "مخطط ذكي", "اقتراح محدود بموافقتك", () -> { tab = "planner"; render(); }, CYAN);
        pageContent.addView(actions, margin(0, 0, 0, 8));

        section("حالة المحرك");
        LinearLayout status = card(SURFACE, engineState.equals("READY") ? GREEN : engineState.equals("FAILED") ? RED : Color.rgb(72, 85, 126));
        String detail = engineState.equals("READY") ? "محرك Mineflayer الأصلي جاهز" + (nodeVersion.isEmpty() ? "" : " · Node " + nodeVersion)
                : engineState.equals("FAILED") ? (engineReason.isEmpty() ? "فشل تهيئة المحرك." : engineReason)
                : "المحرك غير مبدوء حتى تطلب اتصال بوت؛ لا توجد جلسة وهمية.";
        addText(status, detail, 14, TEXT, true, 0, 5);
        addText(status, "Server Status Reachable لا يعني دخول لاعب. IN WORLD لا يظهر إلا بعد Spawn حقيقي.", 11, MUTED, false, 0, 0);
        pageContent.addView(status, margin(0, 0, 0, 14));

        section("جلسات البوت");
        List<JSONObject> bots = sorted(records("bots"));
        if (bots.isEmpty()) empty("لا توجد بوتات بعد", "أنشئ ملف اتصال محليًا؛ لن تظهر جلسة قبل تشغيلها.");
        else for (int i = 0; i < Math.min(2, bots.size()); i++) botCard(bots.get(i));
        if (bots.size() > 2) button(pageContent, "عرض كل البوتات  ·  " + bots.size(), false, () -> { tab = "bots"; render(); });

        section("آخر المهام المسجلة");
        List<JSONObject> recentTasks = sorted(records("tasks"));
        if (recentTasks.isEmpty()) empty("لا توجد مهام", "المهمة الأولى المدعومة حاليًا هي جمع كتلة ذات إسقاط مباشر مطابق.");
        else for (int i = 0; i < Math.min(2, recentTasks.size()); i++) taskCard(recentTasks.get(i));
        button(pageContent, "فتح مدير المهام", false, () -> { tab = "tasks"; render(); });
    }

    private void renderServers() {
        title("السيرفرات", "Java Edition · Status Ping منفصل عن دخول البوت");
        pageContent.addView(heroBanner("SERVER GRID  /  JAVA EDITION", "بوابة السيرفرات", "افحص Status Ping أو اربط جلسة بوت. الوصول لا يعني دخول لاعب.", "إضافة سيرفر", () -> showServerDialog(null), 160), margin(0, 0, 0, 11));
        JSONArray rows = records("servers");
        int reachable = 0;
        for (JSONObject server : toList(rows)) if ("status_reachable".equals(server.optString("status"))) reachable++;
        LinearLayout overview = new LinearLayout(this);
        overview.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        overview.addView(statCard("SAVED SERVERS", String.valueOf(rows.length()), BLUE), weightMargin());
        overview.addView(statCard("LAST PING OK", String.valueOf(reachable), CYAN), weightMargin());
        pageContent.addView(overview, margin(0, 0, 0, 9));
        EditText search = field("ابحث باسم السيرفر أو العنوان…");
        search.setText(serverSearchQuery);
        search.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_SEARCH);
        search.setOnEditorActionListener((view, actionId, event) -> {
            serverSearchQuery = search.getText().toString().trim();
            hideKeyboard(search);
            render();
            return true;
        });
        pageContent.addView(search, margin(0, 0, 0, 8));
        int visible = 0;
        for (JSONObject server : sorted(rows)) {
            String query = serverSearchQuery.toLowerCase(java.util.Locale.ROOT);
            if (!query.isEmpty() && !(server.optString("name", "").toLowerCase(java.util.Locale.ROOT).contains(query)
                    || server.optString("host", "").toLowerCase(java.util.Locale.ROOT).contains(query))) continue;
            serverCard(server);
            visible++;
        }
        if (rows.length() == 0) empty("لا توجد سيرفرات", "أضف عنوان سيرفر تملكه أو لديك إذن الاتصال به.");
        else if (visible == 0) empty("لا توجد نتائج", "جرّب اسمًا أو عنوانًا آخر.");
        note("اختبار الحالة يرسل Minecraft Server List Status Ping حقيقيًا فقط؛ لا يسجّل دخول لاعبًا ولا يجعل البوت ONLINE.");
    }

    private void serverCard(JSONObject server) {
        String id = server.optString("id", "");
        LinearLayout card = card(SURFACE, server.optString("status", "").equals("status_reachable") ? CYAN : Color.rgb(55, 66, 105));
        card.setOnClickListener(view -> { selectedServerId = id; tab = "server-details"; render(); });
        LinearLayout heading = new LinearLayout(this);
        heading.setGravity(Gravity.CENTER_VERTICAL);
        heading.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        FrameLayout glyph = new FrameLayout(this);
        glyph.setBackground(glassDrawable(BLUE, 15));
        glyph.addView(new NavGlyph(this, "servers", CYAN), new FrameLayout.LayoutParams(dp(27), dp(27), Gravity.CENTER));
        heading.addView(glyph, new LinearLayout.LayoutParams(dp(48), dp(48)));
        LinearLayout name = new LinearLayout(this);
        name.setOrientation(LinearLayout.VERTICAL);
        name.setPadding(dp(10), 0, dp(10), 0);
        addText(name, server.optString("name", "Minecraft server"), 14, TEXT, true, 0, 2);
        addText(name, server.optString("host", "") + ":" + server.optInt("port", 25565), 10, MUTED, false, 0, 0);
        heading.addView(name, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        heading.addView(pill(serverStatusLabel(server.optString("status", "untested")), statusColor(serverStatusLabel(server.optString("status", "untested")))));
        card.addView(heading, margin(0, 0, 0, 9));
        String pingVersion = server.optString("pingVersion", "");
        if (!pingVersion.isEmpty()) {
            LinearLayout metrics = new LinearLayout(this);
            metrics.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
            metrics.addView(statCard("الإصدار", pingVersion, BLUE), weightMargin());
            metrics.addView(statCard("اللاعبون", server.optInt("playersOnline", 0) + "/" + server.optInt("playersMax", 0), CYAN), weightMargin());
            metrics.addView(statCard("Ping", server.has("latencyMs") ? server.optLong("latencyMs") + " ms" : "غير متاح", PURPLE), weightMargin());
            card.addView(metrics, margin(0, 0, 0, 10));
        } else addText(card, "لم يُجرَ Server Status Ping بعد؛ لا توجد معلومات للاعبين أو الإصدار.", 11, MUTED, false, 0, 8);
        LinearLayout actions = new LinearLayout(this);
        actions.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        actions.addView(smallButton("تفاصيل", () -> { selectedServerId = id; tab = "server-details"; render(); }, true), weightMargin());
        actions.addView(smallButton("اختبر الحالة", () -> pingServer(id), false), weightMargin());
        actions.addView(smallButton("⋯", () -> showServerActions(server), false), weightMargin());
        card.addView(actions);
        pageContent.addView(card, margin(0, 0, 0, 12));
    }

    private void showServerActions(JSONObject server) {
        String[] actions = {"تعديل", "حذف"};
        new AlertDialog.Builder(this).setTitle(server.optString("name", "السيرفر"))
                .setItems(actions, (dialog, which) -> { if (which == 0) showServerDialog(server); else confirmDeleteServer(server); }).show();
    }

    private void renderServerDetails() {
        JSONObject server = find("servers", selectedServerId);
        if (server == null) { tab = "servers"; render(); return; }
        title(server.optString("name", "السيرفر"), "Minecraft Java · معلومات من آخر Status Ping فقط");
        pageContent.addView(heroBanner("SERVER GRID  /  SERVER PROFILE", server.optString("name", "Minecraft Java"),
                server.optString("host", "") + ":" + server.optInt("port", 25565), "اختبر الاتصال", () -> pingServer(selectedServerId), 164), margin(0, 0, 0, 14));
        String status = server.optString("status", "untested");
        int accent = status.equals("status_reachable") ? GREEN : status.equals("status_failed") ? RED : MUTED;
        LinearLayout connection = card(SURFACE, accent);
        rowTitle(connection, "Server Status", serverStatusLabel(status));
        addText(connection, status.equals("status_reachable") ? "Server Reachable · هذا لا يعني دخول بوت." : status.equals("status_failed") ? server.optString("lastPingReason", "فشل آخر Ping.") : "غير متاح · لم يُسجّل Ping بعد.", 12, MUTED, false, 0, 0);
        pageContent.addView(connection, margin(0, 0, 0, 12));

        section("معلومات السيرفر");
        LinearLayout info = card(SURFACE_RAISED, BLUE);
        addKeyValue(info, "العنوان", server.optString("host", "غير متاح") + ":" + server.optInt("port", 25565));
        addKeyValue(info, "Minecraft Version", server.optString("pingVersion", "غير متاح"));
        addKeyValue(info, "Server Software", "غير متاح من Server List Ping");
        addKeyValue(info, "Latency", server.has("latencyMs") ? server.optLong("latencyMs") + " ms" : "غير متاح");
        addKeyValue(info, "Players", server.has("playersOnline") ? server.optInt("playersOnline") + "/" + server.optInt("playersMax") : "غير متاح");
        addKeyValue(info, "Difficulty / Gamemode / World", "غير متاح من Status Ping");
        addKeyValue(info, "MOTD", server.optString("description", "غير متاح"));
        addKeyValue(info, "آخر فحص", server.has("lastPingAt") ? dateLabel(server.optLong("lastPingAt")) : "لم يُفحص بعد");
        pageContent.addView(info, margin(0, 0, 0, 12));

        section("البوتات المرتبطة");
        int linked = 0;
        for (JSONObject bot : toList(records("bots"))) {
            if (!selectedServerId.equals(bot.optString("serverId", ""))) continue;
            linked++;
            JSONObject live = find("bot_states", bot.optString("id", ""));
            String botStatus = live == null ? "DISCONNECTED" : live.optString("status", "DISCONNECTED");
            if ("ONLINE".equals(botStatus) && !isLiveBot(live)) botStatus = "STALE";
            LinearLayout linkedCard = card(SURFACE, statusColor(botStatus));
            rowTitle(linkedCard, bot.optString("name", bot.optString("username", "Bot")), statusLabel(botStatus));
            if (isLiveBot(live)) {
                JSONObject currentTask = live.optJSONObject("currentTask");
                addText(linkedCard, "داخل العالم الآن · المهمة: " + (currentTask == null ? "لا توجد" : currentTask.optString("blockName", "غير متاح")), 11, MUTED, false, 0, 8);
            } else addText(linkedCard, "غير متصل داخل العالم حسب آخر حالة محفوظة.", 11, MUTED, false, 0, 8);
            button(linkedCard, "فتح تفاصيل البوت", false, () -> { selectedBotId = bot.optString("id", ""); tab = "bot-details"; render(); });
            pageContent.addView(linkedCard, margin(0, 0, 0, 10));
        }
        if (linked == 0) empty("لا توجد ملفات بوت مرتبطة", "أنشئ ملف بوت واختر هذا السيرفر لإظهاره هنا.");
        button(pageContent, "تعديل بيانات السيرفر", false, () -> showServerDialog(server));
        button(pageContent, "العودة إلى السيرفرات", false, () -> { tab = "servers"; render(); });
    }

    private void pingServer(String serverId) {
        JSONObject server = find("servers", serverId);
        if (server == null) { toast("السيرفر غير موجود."); return; }
        toast("جارٍ فحص Minecraft Server Status عبر TCP…");
        io.execute(() -> {
            try {
                JSONObject result = MinecraftStatus.ping(server.optString("host", ""), server.optInt("port", 25565), 7000);
                server.put("status", "status_reachable");
                server.put("pingVersion", result.optString("version", ""));
                server.put("playersOnline", result.optInt("playersOnline", 0));
                server.put("playersMax", result.optInt("playersMax", 0));
                server.put("latencyMs", result.optLong("latencyMs", -1));
                server.put("description", result.optString("description", ""));
                if (result.has("protocol")) server.put("protocol", result.opt("protocol"));
                server.put("lastPingAt", result.optLong("checkedAt", System.currentTimeMillis()));
                database.upsert("servers", server.toString());
                mainHandler.post(() -> { toast("نجح Status Ping · ليس تسجيل دخول بوت."); render(); });
            } catch (Exception error) {
                try { server.put("status", "status_failed").put("lastPingReason", safe(error)); database.upsert("servers", server.toString()); } catch (Exception ignored) { }
                mainHandler.post(() -> { toast("فشل فحص الحالة: " + safe(error)); render(); });
            }
        });
    }

    private void showServerDialog(JSONObject existing) {
        EditText name = field("اسم السيرفر");
        EditText host = field("عنوان IP أو نطاق");
        EditText port = field("المنفذ (افتراضي 25565)");
        port.setInputType(2);
        if (existing != null) {
            name.setText(existing.optString("name", ""));
            host.setText(existing.optString("host", ""));
            port.setText(String.valueOf(existing.optInt("port", 25565)));
        }
        LinearLayout form = form(name, host, port);
        form.addView(label("سيتم استخدام العنوان للاتصال الفعلي فقط عند تشغيل بوت.", 12, MUTED, false), margin(0, 4, 0, 0));
        new AlertDialog.Builder(this).setTitle(existing == null ? "إضافة سيرفر" : "تعديل السيرفر")
                .setView(form)
                .setNegativeButton("إلغاء", null)
                .setPositiveButton("حفظ محليًا", (dialog, which) -> {
                    String cleanName = name.getText().toString().trim();
                    String cleanHost = host.getText().toString().trim();
                    int cleanPort;
                    try { cleanPort = port.getText().toString().trim().isEmpty() ? 25565 : Integer.parseInt(port.getText().toString().trim()); }
                    catch (NumberFormatException error) { toast("المنفذ غير صالح."); return; }
                    if (cleanName.isEmpty() || cleanHost.isEmpty() || cleanPort < 1 || cleanPort > 65535 || cleanHost.matches(".*[\\s/\\\\?#@].*")) { toast("أدخل اسمًا وعنوانًا ومنفذًا صالحًا."); return; }
                    try {
                        JSONObject row = existing == null ? new JSONObject() : new JSONObject(existing.toString());
                        row.put("id", existing == null ? UUID.randomUUID().toString() : existing.optString("id"));
                        row.put("name", cleanName).put("host", cleanHost).put("port", cleanPort).put("status", "untested").put("createdAt", existing == null ? System.currentTimeMillis() : existing.optLong("createdAt", System.currentTimeMillis()));
                        database.upsert("servers", row.toString());
                    } catch (JSONException ignored) { toast("تعذر حفظ السيرفر."); }
                    render();
                }).show();
    }

    private void confirmDeleteServer(JSONObject server) {
        new AlertDialog.Builder(this).setTitle("حذف السيرفر؟")
                .setMessage("سيُحذف السجل المحلي. أوقف أي بوت مرتبط قبل المتابعة.")
                .setNegativeButton("إلغاء", null)
                .setPositiveButton("حذف", (dialog, which) -> {
                    String id = server.optString("id", "");
                    for (JSONObject bot : toList(records("bots"))) if (id.equals(bot.optString("serverId", ""))) { toast("احذف أو أعد تعيين ملفات البوت المرتبطة أولًا."); return; }
                    database.remove("servers", id);
                    render();
                }).show();
    }

    private void renderBots() {
        title("إدارة البوتات", "كل حالة اتصال مصدرها Mineflayer وSpawn الفعلي");
        pageContent.addView(heroBanner("BOT NETWORK  /  MINECRAFT FLEET", "ملفات الاتصال", "راقب الجلسات الحقيقية، واختر السيرفر والحساب قبل تشغيل أي بوت.", "إنشاء ملف بوت", this::showBotDialog, 160), margin(0, 0, 0, 11));
        JSONArray rows = records("bots");
        int inWorld = 0;
        for (JSONObject bot : toList(rows)) if (isLiveBot(find("bot_states", bot.optString("id", "")))) inWorld++;
        LinearLayout overview = new LinearLayout(this);
        overview.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        overview.addView(statCard("BOT PROFILES", String.valueOf(rows.length()), PURPLE), weightMargin());
        overview.addView(statCard("IN WORLD", String.valueOf(inWorld), inWorld > 0 ? GREEN : MUTED), weightMargin());
        pageContent.addView(overview, margin(0, 0, 0, 9));
        EditText search = field("ابحث باسم البوت أو الحساب…");
        search.setText(botSearchQuery);
        search.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_SEARCH);
        search.setOnEditorActionListener((view, actionId, event) -> {
            botSearchQuery = search.getText().toString().trim();
            hideKeyboard(search);
            render();
            return true;
        });
        pageContent.addView(search, margin(0, 0, 0, 8));
        horizontalChips(new String[][]{{"all", "الكل"}, {"online", "داخل العالم"}, {"offline", "غير متصل"}, {"attention", "حالة انتقالية"}}, botStatusFilter, value -> {
            botStatusFilter = value;
            render();
        });
        int visible = 0;
        for (JSONObject bot : sorted(rows)) {
            JSONObject live = find("bot_states", bot.optString("id", ""));
            String rawStatus = live == null ? "DISCONNECTED" : live.optString("status", "DISCONNECTED");
            String status = "ONLINE".equals(rawStatus) && !isLiveBot(live) ? "STALE" : rawStatus;
            if (!botMatchesFilter(bot, status, botSearchQuery, botStatusFilter)) continue;
            botCard(bot);
            visible++;
        }
        if (rows.length() == 0) empty("لا توجد ملفات بوت", "أنشئ إعدادًا محليًا ثم ابدأ الاتصال يدويًا.");
        else if (visible == 0) empty("لا توجد بوتات في هذا العرض", "غيّر البحث أو عامل التصفية؛ لن نُنشئ سجلات توضيحية تلقائيًا.");
        note("ONLINE / IN WORLD لا يظهر إلا بعد حزمة Spawn حديثة من جلسة Minecraft. صور البطاقات اختيار محلي وليست Skin الخادم.");
    }

    private boolean botMatchesFilter(JSONObject bot, String status, String query, String filter) {
        if (filter.equals("online") && !"ONLINE".equals(status)) return false;
        if (filter.equals("offline") && !("DISCONNECTED".equals(status) || "FAILED".equals(status) || "STALE".equals(status))) return false;
        if (filter.equals("attention") && !("CONNECTING".equals(status) || "AUTHENTICATING".equals(status) || "JOINING".equals(status) || "RECONNECTING".equals(status) || "DEAD".equals(status))) return false;
        String needle = query == null ? "" : query.trim().toLowerCase(java.util.Locale.ROOT);
        return needle.isEmpty() || bot.optString("name", "").toLowerCase(java.util.Locale.ROOT).contains(needle)
                || bot.optString("username", "").toLowerCase(java.util.Locale.ROOT).contains(needle);
    }

    private void botCard(JSONObject bot) {
        String id = bot.optString("id", "");
        JSONObject live = find("bot_states", id);
        String status = live == null ? "DISCONNECTED" : live.optString("status", "DISCONNECTED");
        if ("ONLINE".equals(status) && !isLiveBot(live)) status = "STALE";
        else if (isTransientStatus(status) && !isRecentBotTransition(live)) status = "STALE";
        JSONObject server = find("servers", bot.optString("serverId", ""));
        LinearLayout card = card(SURFACE, statusColor(status));
        LinearLayout heading = new LinearLayout(this);
        heading.setGravity(Gravity.CENTER_VERTICAL);
        heading.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        heading.addView(botAvatar(bot, 54), new LinearLayout.LayoutParams(dp(54), dp(54)));
        LinearLayout name = new LinearLayout(this);
        name.setOrientation(LinearLayout.VERTICAL);
        name.setPadding(dp(10), 0, dp(10), 0);
        addText(name, bot.optString("name", bot.optString("username", "Bot")), 14, TEXT, true, 0, 2);
        addText(name, bot.optString("username", "غير محدد"), 10, MUTED, false, 0, 0);
        heading.addView(name, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        heading.addView(pill(statusLabel(status), statusColor(status)));
        card.addView(heading, margin(0, 0, 0, 6));
        addText(card, server == null ? "السيرفر: غير معيّن" : "السيرفر: " + server.optString("name", "Minecraft") + " · " + server.optString("host", "") + ":" + server.optInt("port", 25565), 10, MUTED, false, 0, 7);
        if (live != null && "bot_snapshot".equals(live.optString("type"))) {
            if (isLiveBot(live)) {
                addObservedSnapshot(card, live);
                JSONObject currentTask = live.optJSONObject("currentTask");
                if (currentTask != null) {
                    addText(card, "المهمة الحالية: " + currentTask.optString("blockName", "غير متاح") + " · " + currentTask.optInt("progress") + "%", 11, CYAN, true, 0, 7);
                    View progress = progressBar(currentTask.optInt("progress", 0), PURPLE);
                    card.addView(progress, margin(0, 0, 0, 8));
                } else addText(card, "المهمة الحالية: لا توجد", 10, MUTED, false, 0, 7);
                addText(card, "AI: " + (aiConfigured() ? "النموذج مهيأ · التخطيط يحتاج موافقة" : "غير مهيأ"), 9, aiConfigured() ? PURPLE : MUTED, false, 0, 8);
            } else addText(card, "لقطة سابقة فقط · لا تُعرض كحالة حية", 10, MUTED, false, 0, 8);
        }
        LinearLayout actions = new LinearLayout(this);
        actions.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        String storedStatus = live == null ? "DISCONNECTED" : live.optString("status", "DISCONNECTED");
        boolean mayHaveSession = "ONLINE".equals(storedStatus) || isTransientStatus(storedStatus);
        if ("DEAD".equals(status)) {
            actions.addView(smallButton("إعادة الظهور", () -> sendEngineCommand(command("respawn", id)), true), weightMargin());
            actions.addView(smallButton("إيقاف", () -> confirmDisconnectBot(id), false), weightMargin());
        } else if ("ONLINE".equals(status) || "CONNECTING".equals(status) || "AUTHENTICATING".equals(status) || "JOINING".equals(status) || "RECONNECTING".equals(status))
            actions.addView(smallButton("إيقاف", () -> confirmDisconnectBot(id), false), weightMargin());
        else if (status.equals("STALE") && mayHaveSession)
            actions.addView(smallButton("إيقاف غير متحقق", () -> confirmDisconnectBot(id), false), weightMargin());
        else actions.addView(smallButton(status.equals("FAILED") ? "إعادة المحاولة" : "تشغيل", () -> connectBot(id), true), weightMargin());
        actions.addView(smallButton("تفاصيل", () -> { selectedBotId = id; selectedBotSection = "overview"; tab = "bot-details"; render(); }, false), weightMargin());
        actions.addView(smallButton("⋯", () -> showBotActions(bot), false), weightMargin());
        card.addView(actions);
        pageContent.addView(card, margin(0, 0, 0, 12));
    }

    private void showBotActions(JSONObject bot) {
        String[] actions = {"إعدادات البوت", "إدارة السكن المحلي", "حذف ملف البوت"};
        new AlertDialog.Builder(this).setTitle(bot.optString("name", "البوت"))
                .setItems(actions, (dialog, which) -> {
                    if (which == 0) { selectedBotId = bot.optString("id", ""); selectedBotSection = "settings"; tab = "bot-details"; render(); }
                    else if (which == 1) { tab = "skins"; render(); }
                    else confirmDeleteBot(bot);
                }).show();
    }

    private View botAvatar(JSONObject bot, int sizeDp) {
        FrameLayout frame = new FrameLayout(this);
        frame.setBackground(rounded(Color.rgb(11, 18, 43), CYAN, dp(14)));
        frame.setClipToOutline(true);
        ImageView image = new ImageView(this);
        image.setScaleType(ImageView.ScaleType.FIT_XY);
        boolean loaded = false;
        JSONObject skin = find("skins", bot.optString("skinId", ""));
        String path = skin == null ? "" : skin.optString("filePath", "");
        if (!path.isEmpty()) {
            Bitmap source = BitmapFactory.decodeFile(path);
            if (source != null && source.getWidth() >= 16 && source.getHeight() >= 16) {
                int faceSize = Math.min(8, Math.min(source.getWidth() - 8, source.getHeight() - 8));
                Bitmap face = Bitmap.createBitmap(source, 8, 8, faceSize, faceSize);
                image.setImageBitmap(face);
                loaded = true;
            }
        }
        if (!loaded) image.setImageResource(R.drawable.ic_minebot);
        frame.addView(image, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        return frame;
    }

    private boolean aiConfigured() {
        JSONObject config = find("ai_config", "openrouter_models");
        return secureStore != null && secureStore.hasApiKey() && config != null && config.optJSONArray("freeModels") != null && config.optJSONArray("freeModels").length() > 0;
    }

    private void addObservedSnapshot(LinearLayout parent, JSONObject snapshot) {
        String health = nullableNumber(snapshot, "health");
        String food = nullableNumber(snapshot, "food");
        JSONObject position = snapshot.optJSONObject("position");
        String pos = position == null ? "غير متاح" : formatPosition(position);
        String ping = nullableNumber(snapshot, "pingMs");
        long uptime = snapshot.optLong("uptimeMs", -1);
        String uptimeLabel = uptime < 0 ? "غير متاح" : formatDuration(uptime);
        String dimension = nullableText(snapshot, "dimension");
        String gameMode = nullableText(snapshot, "gameMode");
        String difficulty = nullableText(snapshot, "difficulty");
        LinearLayout metrics = new LinearLayout(this);
        metrics.setOrientation(LinearLayout.VERTICAL);
        metrics.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        addMetricPair(metrics, "الصحة", health, GREEN, "الطعام", food, AMBER);
        addMetricPair(metrics, "الموقع المرصود", pos, CYAN, "Ping الجلسة", ping.equals("غير متاح") ? ping : ping + " ms", BLUE);
        addMetricPair(metrics, "مدة الجلسة", uptimeLabel, PURPLE, "العالم / النمط", dimension + " · " + gameMode, MUTED);
        addText(metrics, "الصعوبة: " + difficulty + " · هذه قياسات جلسة البوت وليست Server Status Ping.", 9, MUTED, false, 2, 0);
        parent.addView(metrics, margin(0, 6, 0, 8));
    }

    private void addMetricPair(LinearLayout parent, String firstName, String firstValue, int firstColor, String secondName, String secondValue, int secondColor) {
        LinearLayout row = new LinearLayout(this);
        row.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        row.addView(metricTile(firstName, firstValue, firstColor), weightMargin());
        row.addView(metricTile(secondName, secondValue, secondColor), weightMargin());
        parent.addView(row, margin(0, 0, 0, 6));
    }

    private LinearLayout metricTile(String label, String value, int accent) {
        LinearLayout tile = card(Color.argb(210, 20, 27, 56), Color.argb(170, Color.red(accent), Color.green(accent), Color.blue(accent)));
        addText(tile, label, 9, MUTED, false, 0, 3);
        addText(tile, value, 11, TEXT, true, 0, 0);
        return tile;
    }

    private String nullableNumber(JSONObject value, String key) {
        if (value == null || !value.has(key) || value.isNull(key)) return "غير متاح";
        Object raw = value.opt(key);
        if (!(raw instanceof Number)) return "غير متاح";
        double number = ((Number) raw).doubleValue();
        if (!Double.isFinite(number)) return "غير متاح";
        return number == Math.rint(number) ? String.valueOf((long) number) : String.format(java.util.Locale.US, "%.1f", number);
    }

    private String nullableText(JSONObject value, String key) {
        if (value == null || !value.has(key) || value.isNull(key)) return "غير متاح";
        String result = value.optString(key, "").trim();
        return result.isEmpty() ? "غير متاح" : result;
    }

    private String formatDuration(long millis) {
        if (millis < 0) return "غير متاح";
        long seconds = millis / 1000;
        long hours = seconds / 3600;
        long minutes = (seconds % 3600) / 60;
        return hours > 0 ? hours + " س " + minutes + " د" : minutes > 0 ? minutes + " د " + (seconds % 60) + " ث" : seconds + " ث";
    }

    private void showBotDialog() {
        JSONArray serverRows = records("servers");
        if (serverRows.length() == 0) { toast("أضف سيرفرًا أولًا."); tab = "servers"; render(); return; }
        EditText name = field("اسم ملف البوت");
        EditText username = field("اسم اللاعب أو معرّف Microsoft");
        EditText version = field("إصدار Minecraft (auto افتراضي)");
        version.setText("auto");
        Spinner serverSpinner = spinner();
        List<JSONObject> servers = toList(serverRows);
        ArrayAdapter<String> serversAdapter = neonAdapter(serverNames(servers));
        serverSpinner.setAdapter(serversAdapter);
        Spinner authSpinner = spinner();
        authSpinner.setAdapter(neonAdapter(java.util.Arrays.asList("Offline (السيرفر يسمح بذلك)", "Microsoft (رمز جهاز)")));
        CheckBox reconnect = settingCheck("إعادة الاتصال تلقائيًا بعد انقطاع الشبكة", true);
        CheckBox autoEat = settingCheck("الأكل التلقائي من المخزون عند الحاجة", true);
        CheckBox autoRespawn = settingCheck("طلب إعادة الظهور تلقائيًا بعد موت مرصود", false);
        LinearLayout form = form(name, username, version);
        addFormField(form, "السيرفر", serverSpinner);
        addFormField(form, "المصادقة", authSpinner);
        form.addView(reconnect);
        form.addView(autoEat);
        form.addView(autoRespawn);
        addText(form, "لا تُدخل كلمة مرور Microsoft هنا. المصادقة تتم برمز جهاز رسمي. الأكل والظهور يستخدمان أحداث Minecraft وإعدادات هذا الملف.", 11, MUTED, false, 0, 0);
        new AlertDialog.Builder(this).setTitle("ملف بوت محلي")
                .setView(form)
                .setNegativeButton("إلغاء", null)
                .setPositiveButton("حفظ", (dialog, which) -> {
                    String botName = name.getText().toString().trim();
                    String account = username.getText().toString().trim();
                    String gameVersion = version.getText().toString().trim();
                    JSONObject selectedServer = servers.get(Math.max(0, serverSpinner.getSelectedItemPosition()));
                    String auth = authSpinner.getSelectedItemPosition() == 1 ? "microsoft" : "offline";
                    if (botName.isEmpty() || account.isEmpty()) { toast("أكمل اسم ملف البوت واسم الحساب."); return; }
                    if ("offline".equals(auth) && !account.matches("[A-Za-z0-9_]{3,16}")) { toast("اسم Offline يجب أن يكون بين 3 و16 حرفًا أو رقمًا أو _. "); return; }
                    if ("microsoft".equals(auth) && (account.length() > 254 || account.matches(".*\\s+.*"))) { toast("معرّف حساب Microsoft غير صالح."); return; }
                    if (gameVersion.isEmpty()) gameVersion = "auto";
                    JSONObject row = new JSONObject();
                    try {
                        row.put("id", UUID.randomUUID().toString()).put("name", botName).put("username", account).put("serverId", selectedServer.optString("id"))
                                .put("version", gameVersion).put("authMode", auth).put("reconnect", reconnect.isChecked()).put("autoEat", autoEat.isChecked()).put("autoRespawn", autoRespawn.isChecked()).put("status", "configured")
                                .put("createdAt", System.currentTimeMillis());
                        database.upsert("bots", row.toString());
                    } catch (JSONException ignored) { toast("تعذر حفظ ملف البوت."); }
                    render();
                }).show();
    }

    private void editBotDialog(JSONObject existing) {
        EditText name = field("اسم ملف البوت"); name.setText(existing.optString("name", ""));
        EditText username = field("اسم الحساب"); username.setText(existing.optString("username", ""));
        EditText version = field("إصدار Minecraft"); version.setText(existing.optString("version", "auto"));
        JSONArray serverRows = records("servers");
        List<JSONObject> servers = toList(serverRows);
        if (servers.isEmpty()) { toast("أضف سيرفرًا قبل تعديل ملف البوت."); return; }
        Spinner serverSpinner = spinner();
        serverSpinner.setAdapter(neonAdapter(serverNames(servers)));
        int selection = 0;
        for (int i = 0; i < servers.size(); i++) if (existing.optString("serverId", "").equals(servers.get(i).optString("id", ""))) selection = i;
        serverSpinner.setSelection(selection);
        CheckBox reconnect = settingCheck("إعادة الاتصال بعد انقطاع الشبكة", existing.optBoolean("reconnect", true));
        CheckBox autoEat = settingCheck("الأكل التلقائي عند الحاجة", existing.optBoolean("autoEat", true));
        CheckBox autoRespawn = settingCheck("طلب إعادة الظهور بعد موت مرصود", existing.optBoolean("autoRespawn", false));
        LinearLayout form = form(name, username, version);
        addFormField(form, "السيرفر", serverSpinner);
        form.addView(reconnect); form.addView(autoEat); form.addView(autoRespawn);
        addText(form, "التغييرات تُحفظ للاتصال التالي؛ لا نعدّل إعدادات جلسة Mineflayer وهي حيّة.", 10, MUTED, false, 0, 0);
        new AlertDialog.Builder(this).setTitle("تعديل ملف البوت")
                .setView(form)
                .setNegativeButton("إلغاء", null)
                .setPositiveButton("حفظ", (dialog, which) -> {
                    String cleanName = name.getText().toString().trim();
                    String account = username.getText().toString().trim();
                    String gameVersion = version.getText().toString().trim();
                    if (cleanName.isEmpty() || account.isEmpty()) { toast("أكمل الاسم والحساب."); return; }
                    if ("offline".equals(existing.optString("authMode", "offline")) && !account.matches("[A-Za-z0-9_]{3,16}")) { toast("اسم Offline غير صالح."); return; }
                    if ("microsoft".equals(existing.optString("authMode")) && (account.length() > 254 || account.matches(".*\\s+.*"))) { toast("معرّف Microsoft غير صالح."); return; }
                    try {
                        JSONObject updated = new JSONObject(existing.toString());
                        updated.put("name", cleanName).put("username", account).put("version", gameVersion.isEmpty() ? "auto" : gameVersion)
                                .put("serverId", servers.get(Math.max(0, serverSpinner.getSelectedItemPosition())).optString("id", ""))
                                .put("reconnect", reconnect.isChecked()).put("autoEat", autoEat.isChecked()).put("autoRespawn", autoRespawn.isChecked());
                        database.upsert("bots", updated.toString());
                        toast("تم حفظ إعدادات ملف البوت للجلسة القادمة.");
                        render();
                    } catch (JSONException error) { toast("تعذر تحديث ملف البوت."); }
                }).show();
    }

    private CheckBox settingCheck(String label, boolean checked) {
        CheckBox check = new CheckBox(this);
        check.setText(label);
        check.setTextColor(TEXT);
        check.setTextSize(11);
        check.setButtonTintList(ColorStateList.valueOf(CYAN));
        check.setPadding(dp(7), dp(5), dp(7), dp(5));
        check.setMinHeight(dp(44));
        check.setChecked(checked);
        return check;
    }

    private List<String> serverNames(List<JSONObject> servers) {
        ArrayList<String> values = new ArrayList<>();
        for (JSONObject server : servers) values.add(server.optString("name", "Server") + " · " + server.optString("host", ""));
        return values;
    }

    private void connectBot(String id) {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            toast("فعّل الإشعارات لرؤية حالة الجلسة في الخلفية.");
            requestNotificationPermission();
        }
        BotEngineService.connect(this, id);
        toast("طُلب تشغيل جلسة Minecraft الأصلية…");
    }

    private void confirmDisconnectBot(String botId) {
        new AlertDialog.Builder(this).setTitle("إيقاف جلسة Minecraft؟")
                .setMessage("سيُرسل Disconnect حقيقي. أي مهمة جمع تعمل على هذا البوت ستُلغى ويُحفظ ما تحقق من المخزون فقط.")
                .setNegativeButton("متابعة اللعب", null)
                .setPositiveButton("إيقاف الجلسة", (dialog, which) -> BotEngineService.disconnect(this, botId)).show();
    }

    private void confirmDeleteBot(JSONObject bot) {
        new AlertDialog.Builder(this).setTitle("حذف ملف البوت؟")
                .setMessage("يجب إيقاف جلسة هذا البوت أولًا. لن يُحذف أي حساب Microsoft من الجهاز.")
                .setNegativeButton("إلغاء", null)
                .setPositiveButton("حذف", (dialog, which) -> {
                    String id = bot.optString("id", "");
                    JSONObject live = find("bot_states", id);
                    String liveStatus = live == null ? "DISCONNECTED" : live.optString("status", "DISCONNECTED");
                    boolean potentiallyActive = isLiveBot(live) || (("ONLINE".equals(liveStatus) || isTransientStatus(liveStatus)) && (isRecentBotTransition(live) || "READY".equals(engineState)));
                    if (potentiallyActive) { toast("أوقف جلسة Minecraft أولًا ثم انتظر تأكيد DISCONNECTED."); return; }
                    for (JSONObject task : toList(records("tasks"))) if (id.equals(task.optString("botId", "")) && !isTerminal(task.optString("status", ""))) { try { task.put("botId", ""); database.upsert("tasks", task.toString()); } catch (JSONException ignored) { } }
                    database.remove("bots", id);
                    database.remove("bot_states", id);
                    render();
                }).show();
    }

    private String taskStatusLabel(String status) {
        switch (String.valueOf(status).toLowerCase(java.util.Locale.ROOT)) {
            case "pending": return "بانتظار التشغيل";
            case "running": return "قيد التنفيذ";
            case "paused": return "متوقفة مؤقتًا";
            case "completed": return "مكتملة";
            case "failed": return "فشلت";
            case "cancelled": return "أُلغيت";
            case "interrupted": return "انقطعت · تحقق قبل الإعادة";
            default: return "غير متاح";
        }
    }

    private boolean isTerminal(String status) { return status.equals("completed") || status.equals("failed") || status.equals("cancelled"); }

    private void renderBotDetails() {
        JSONObject bot = find("bots", selectedBotId);
        if (bot == null) { tab = "bots"; render(); return; }
        JSONObject live = find("bot_states", selectedBotId);
        boolean online = isLiveBot(live) && "bot_snapshot".equals(live.optString("type"));
        String liveStatus = live == null ? "DISCONNECTED" : live.optString("status", "DISCONNECTED");
        if ("ONLINE".equals(liveStatus) && !online) liveStatus = "STALE";
        JSONObject server = find("servers", bot.optString("serverId", ""));
        title("تفاصيل البوت", "ملف محلي · القياسات من جلسة Minecraft فقط");
        LinearLayout hero = card(new int[]{Color.rgb(23, 38, 83), Color.rgb(42, 24, 83)}, online ? GREEN : Color.rgb(77, 83, 136));
        addText(hero, "BOT NETWORK  /  LIVE SESSION PROFILE", 8, CYAN, true, 0, 7);
        LinearLayout heroRow = new LinearLayout(this);
        heroRow.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        heroRow.setGravity(Gravity.CENTER_VERTICAL);
        heroRow.addView(botAvatar(bot, 78), new LinearLayout.LayoutParams(dp(78), dp(78)));
        LinearLayout identity = new LinearLayout(this);
        identity.setOrientation(LinearLayout.VERTICAL);
        identity.setPadding(dp(12), 0, dp(12), 0);
        addText(identity, bot.optString("name", bot.optString("username", "Bot")), 19, TEXT, true, 0, 3);
        addText(identity, server == null ? "السيرفر: غير معيّن" : server.optString("name", "Minecraft") + " · " + server.optString("host", "") + ":" + server.optInt("port", 25565), 10, Color.rgb(211, 222, 255), false, 0, 6);
        addText(identity, "Uptime: " + (online ? formatDuration(live.optLong("uptimeMs", -1)) : "غير متاح") + " · Ping الجلسة: " + (online ? nullableNumber(live, "pingMs") + " ms" : "غير متاح"), 9, CYAN, false, 0, 0);
        heroRow.addView(identity, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        heroRow.addView(pill(statusLabel(online ? "ONLINE" : liveStatus), statusColor(online ? "ONLINE" : liveStatus)));
        hero.addView(heroRow);
        addText(hero, online ? "IN WORLD · Spawn مؤكد من جلسة البوت" : "لا يوجد دخول للعالم مؤكد حاليًا.", 9, online ? GREEN : MUTED, true, 8, 0);
        pageContent.addView(hero, margin(0, 0, 0, 12));

        if ("DEAD".equals(liveStatus)) button(pageContent, "طلب إعادة الظهور من Minecraft", true, () -> sendEngineCommand(command("respawn", selectedBotId)));
        else if (isTransientStatus(liveStatus)) button(pageContent, "إيقاف جلسة Minecraft", false, () -> confirmDisconnectBot(selectedBotId));
        else if (!online) button(pageContent, "تشغيل جلسة Minecraft", true, () -> connectBot(selectedBotId));

        horizontalChips(new String[][]{{"overview", "نظرة عامة"}, {"inventory", "المخزون"}, {"tasks", "المهام"}, {"skin", "السكن"}, {"logs", "السجل"}, {"settings", "الإعدادات"}}, selectedBotSection, value -> {
            selectedBotSection = value;
            if (value.equals("inventory")) tab = "inventory";
            render();
        });
        switch (selectedBotSection) {
            case "inventory":
                if (online) showInventory(live); else empty("المخزون غير متاح", "انتظر اتصالًا حيًا داخل العالم؛ لا نعرض مخزونًا محفوظًا كأنه حالي.");
                break;
            case "tasks": renderBotTasks(selectedBotId); break;
            case "skin": renderBotSkin(bot); break;
            case "logs": renderBotLogs(selectedBotId); break;
            case "settings": renderBotSettings(bot); break;
            default:
                if (!online) empty("لا توجد لقطة عالم حية", "انتظر Spawn من خادم Minecraft لعرض الصحة والطعام والموقع والكيانات.");
                else {
                    LinearLayout metrics = card(SURFACE, GREEN);
                    rowTitle(metrics, "حالة العالم", "IN WORLD");
                    addObservedSnapshot(metrics, live);
                    pageContent.addView(metrics, margin(0, 0, 0, 12));
                    showPlayers(live);
                    showEntities(live);
                    section("تحكم حقيقي");
                    LinearLayout controls = card(SURFACE_RAISED, PURPLE);
                    controlRow(controls, selectedBotId);
                    button(controls, "إرسال رسالة في Minecraft", false, () -> showChatDialog(selectedBotId));
                    button(controls, "إيقاف الحركة/المسار", false, () -> sendEngineCommand(command("stop-navigation", selectedBotId)));
                    pageContent.addView(controls);
                }
                break;
        }
        button(pageContent, "العودة إلى البوتات", false, () -> { tab = "bots"; render(); });
    }

    private void renderInventoryScreen() {
        JSONObject bot = find("bots", selectedBotId);
        if (bot == null) { tab = "bots"; render(); return; }
        JSONObject snapshot = find("bot_states", selectedBotId);
        title("المخزون المرصود", bot.optString("name", bot.optString("username", "Bot")) + " · Minecraft Inventory Snapshot");
        pageContent.addView(heroBanner("LIVE INVENTORY  /  WORLD SNAPSHOT", "مخزون العالم", "الخانات المعروضة لقطة حيّة من جلسة Mineflayer وليست بيانات افتراضية.", "تفاصيل البوت", () -> { tab = "bot-details"; selectedBotSection = "overview"; render(); }, 160), margin(0, 0, 0, 12));
        if (!isLiveBot(snapshot)) {
            empty("لا توجد لقطة مخزون حية", "تظهر الخانات فقط بعد Spawn حديث من Mineflayer؛ البيانات القديمة لا تُعرض كأنها حالية.");
        } else {
            LinearLayout livePanel = card(SURFACE_RAISED, CYAN);
            rowTitle(livePanel, "LIVE WORLD SNAPSHOT", "ONLINE");
            addText(livePanel, "آخر تحديث: " + dateLabel(snapshot.optLong("observedAt", 0)), 9, MUTED, false, 0, 0);
            pageContent.addView(livePanel, margin(0, 0, 0, 10));
            showInventory(snapshot);
        }
    }

    private void renderBotTasks(String botId) {
        section("المهام المرتبطة بهذا البوت");
        int count = 0;
        for (JSONObject task : sorted(records("tasks"))) if (botId.equals(task.optString("botId", ""))) { taskCard(task); count++; }
        if (count == 0) empty("لا توجد مهام للبوت", "أنشئ مهمة جمع مدعومة أو افتح مخطط AI المحدود.");
        button(pageContent, "إنشاء مهمة", true, () -> { tab = "task-types"; render(); });
    }

    private void renderBotSkin(JSONObject bot) {
        section("المعاينة المحلية للبوت");
        JSONObject skin = find("skins", bot.optString("skinId", ""));
        if (skin == null) empty("لم يُعيّن Skin محلي", "الاختيار هنا يغيّر صورة البطاقة داخل التطبيق فقط، ولا يرفع Skin إلى حساب Minecraft.");
        else {
            LinearLayout card = card(SURFACE, PURPLE);
            addText(card, skin.optString("name", "PNG Skin"), 14, TEXT, true, 0, 7);
            addSkinPreview(card, skin, 220);
            addText(card, "Texture محلي للمعاينة داخل التطبيق؛ لا يغيّر Skin لاعب Microsoft أو ملف الخادم.", 9, MUTED, false, 5, 8);
            button(card, "إزالة المعاينة من هذا البوت", false, () -> assignSkinToBot(bot, null));
            pageContent.addView(card, margin(0, 0, 0, 12));
        }
        button(pageContent, "اختيار Skin محلي محفوظ", true, () -> chooseSkinForBot(bot));
        button(pageContent, "فتح مدير Skins", false, () -> { tab = "skins"; render(); });
    }

    private void renderBotLogs(String botId) {
        section("أحداث مسجلة محليًا");
        int shown = 0;
        for (JSONObject log : sorted(records("logs"))) {
            if (!botId.equals(log.optString("botId", ""))) continue;
            LinearLayout card = card(SURFACE, "error".equals(log.optString("level", "")) ? RED : BLUE);
            rowTitle(card, log.optString("category", "engine"), log.optString("level", "info"));
            addText(card, log.optString("message", "غير متاح"), 11, TEXT, false, 0, 5);
            addText(card, dateLabel(log.optLong("createdAt", 0)), 9, MUTED, false, 0, 0);
            pageContent.addView(card, margin(0, 0, 0, 8));
            if (++shown >= 40) break;
        }
        if (shown == 0) empty("لا توجد سجلات محفوظة", "ستظهر أحداث المحرك الفعلية هنا بعد تشغيل البوت.");
    }

    private void renderBotSettings(JSONObject bot) {
        section("إعدادات هذا الملف");
        LinearLayout settings = card(SURFACE, BLUE);
        addKeyValue(settings, "الإصدار", bot.optString("version", "auto"));
        addKeyValue(settings, "المصادقة", "microsoft".equals(bot.optString("authMode")) ? "Microsoft device-code" : "Offline");
        addKeyValue(settings, "إعادة الاتصال", bot.optBoolean("reconnect", true) ? "مفعلة" : "متوقفة");
        addKeyValue(settings, "الأكل التلقائي", bot.optBoolean("autoEat", true) ? "مفعّل" : "متوقف");
        addKeyValue(settings, "إعادة الظهور التلقائي", bot.optBoolean("autoRespawn", false) ? "مفعّلة" : "متوقفة");
        pageContent.addView(settings, margin(0, 0, 0, 12));
        note("هذه القيم تُحفظ لملف البوت، وتُقرأ عند بدء الجلسة التالية. النوم التلقائي والقتال وتجنب المخاطر ليست موصولة للمحرك.");
        button(pageContent, "تعديل ملف البوت", false, () -> editBotDialog(bot));
    }

    private void controlRow(LinearLayout parent, String botId) {
        LinearLayout row1 = new LinearLayout(this);
        row1.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        row1.addView(smallButton("أمام", () -> pulseControl(botId, "forward", 700), true), weightMargin());
        row1.addView(smallButton("قفز", () -> pulseControl(botId, "jump", 250), false), weightMargin());
        row1.addView(smallButton("تسلل", () -> pulseControl(botId, "sneak", 600), false), weightMargin());
        parent.addView(row1, margin(0, 0, 0, 8));
        LinearLayout row2 = new LinearLayout(this);
        row2.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        row2.addView(smallButton("يسار", () -> pulseControl(botId, "left", 500), false), weightMargin());
        row2.addView(smallButton("خلف", () -> pulseControl(botId, "back", 500), false), weightMargin());
        row2.addView(smallButton("يمين", () -> pulseControl(botId, "right", 500), false), weightMargin());
        parent.addView(row2, margin(0, 0, 0, 10));
    }

    private void pulseControl(String botId, String control, long durationMs) {
        try {
            JSONObject on = command("control", botId).put("states", new JSONObject().put(control, true));
            sendEngineCommand(on);
            mainHandler.postDelayed(() -> sendEngineCommand(controlCommand(botId, control, false)), durationMs);
        } catch (JSONException ignored) { toast("تعذر إنشاء أمر الحركة."); }
    }

    private JSONObject controlCommand(String botId, String control, boolean value) {
        try { return command("control", botId).put("states", new JSONObject().put(control, value)); }
        catch (JSONException ignored) { return command("control", botId); }
    }

    private void showChatDialog(String botId) {
        EditText message = field("رسالة Minecraft");
        new AlertDialog.Builder(this).setTitle("إرسال Chat")
                .setView(form(message))
                .setNegativeButton("إلغاء", null)
                .setPositiveButton("إرسال", (dialog, which) -> {
                    String value = message.getText().toString().trim();
                    if (value.isEmpty()) { toast("اكتب رسالة أولًا."); return; }
                    JSONObject chat = command("chat", botId);
                    try { chat.put("text", value); sendEngineCommand(chat); }
                    catch (JSONException ignored) { toast("تعذر تجهيز رسالة Minecraft."); }
                })
                .show();
    }

    private void showInventory(JSONObject snapshot) {
        section("مخزن الجلسة · بيانات مرصودة");
        JSONArray slots = snapshot == null ? null : snapshot.optJSONArray("inventorySlots");
        if (slots == null) { empty("المخزون غير متاح", "لم تصل خانات من لقطة Minecraft الحالية."); return; }
        int occupied = 0;
        for (int i = 0; i < slots.length(); i++) {
            JSONObject slot = slots.optJSONObject(i);
            if (slot != null && slot.optInt("count", 0) > 0) occupied++;
        }
        LinearLayout summary = card(SURFACE, CYAN);
        rowTitle(summary, "Inventory", occupied + "/36 خانات مستخدمة");
        addText(summary, "Snapshot: " + dateLabel(snapshot.optLong("observedAt", 0)), 9, MUTED, false, 0, 0);
        pageContent.addView(summary, margin(0, 0, 0, 9));

        GridLayout grid = new GridLayout(this);
        grid.setColumnCount(4);
        grid.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        grid.setUseDefaultMargins(false);
        for (int i = 0; i < 36; i++) {
            JSONObject slot = slots.optJSONObject(i);
            boolean filled = slot != null && slot.optInt("count", 0) > 0;
            String name = filled ? slot.optString("displayName", slot.optString("name", "عنصر")) : "";
            int count = filled ? slot.optInt("count", 0) : 0;
            LinearLayout cell = new LinearLayout(this);
            cell.setOrientation(LinearLayout.VERTICAL);
            cell.setGravity(Gravity.CENTER);
            cell.setPadding(dp(4), dp(6), dp(4), dp(6));
            cell.setBackground(rounded(filled ? Color.rgb(23, 31, 59) : Color.argb(165, 10, 15, 34), filled ? Color.rgb(69, 91, 148) : Color.rgb(37, 47, 78), dp(12)));
            TextView glyph = text(filled ? firstGrapheme(name) : "·", filled ? 17 : 20, filled ? CYAN : Color.rgb(64, 75, 111), true);
            glyph.setGravity(Gravity.CENTER);
            cell.addView(glyph, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(23)));
            TextView amount = text(filled ? "×" + count : "", 8, TEXT, true);
            amount.setGravity(Gravity.CENTER);
            cell.addView(amount, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(15)));
            TextView itemName = text(filled ? name : "Slot " + (9 + i), 8, MUTED, false);
            itemName.setGravity(Gravity.CENTER);
            itemName.setMaxLines(2);
            cell.addView(itemName, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(26)));
            GridLayout.LayoutParams params = new GridLayout.LayoutParams(GridLayout.spec(GridLayout.UNDEFINED), GridLayout.spec(GridLayout.UNDEFINED, 1f));
            params.width = 0;
            params.height = dp(76);
            params.setMargins(dp(3), dp(3), dp(3), dp(3));
            grid.addView(cell, params);
        }
        LinearLayout gridCard = card(SURFACE, BLUE);
        gridCard.addView(grid, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        pageContent.addView(gridCard, margin(0, 0, 0, 12));

        JSONArray equipment = snapshot.optJSONArray("equipmentSlots");
        if (equipment != null) {
            LinearLayout gear = card(SURFACE, PURPLE);
            rowTitle(gear, "التجهيز المرصود", "Slots Minecraft");
            for (int i = 0; i < equipment.length(); i++) {
                JSONObject item = equipment.optJSONObject(i);
                if (item != null) addText(gear, "slot " + item.optInt("slot") + " · " + (item.isNull("name") ? "فارغ" : item.optString("displayName", item.optString("name"))), 10, MUTED, false, 0, 4);
            }
            pageContent.addView(gear, margin(0, 0, 0, 12));
        } else note("خانات الدرع/التجهيز غير متاحة في هذه اللقطة.");
        note("هذه شاشة قراءة فقط. التجهيز والإسقاط والتخزين داخل الصناديق والسحب غير موصولة بعد بمحرك Minecraft، لذلك لا تظهر كأزرار تنفيذ.");
    }

    private String firstGrapheme(String value) {
        if (value == null || value.isEmpty()) return "·";
        int end = value.offsetByCodePoints(0, 1);
        return value.substring(0, end);
    }

    private void showPlayers(JSONObject snapshot) {
        section("اللاعبون المرصودون");
        JSONArray players = snapshot.optJSONArray("players");
        if (players == null || players.length() == 0) { empty("لا توجد بيانات لاعبين", "قائمة اللاعبين لا تصل إلا بعد اتصال البروتوكول."); return; }
        LinearLayout card = card(SURFACE, BLUE);
        for (int i = 0; i < players.length(); i++) {
            JSONObject player = players.optJSONObject(i);
            if (player != null) addText(card, player.optString("username") + (player.isNull("ping") ? "" : " · " + player.optInt("ping") + " ms"), 12, TEXT, false, 0, 6);
        }
        pageContent.addView(card, margin(0, 0, 0, 14));
    }

    private void showEntities(JSONObject snapshot) {
        section("الكيانات القريبة");
        JSONArray entities = snapshot.optJSONArray("entities");
        if (entities == null || entities.length() == 0) { note("لا توجد كيانات قريبة مرصودة في آخر لقطة."); return; }
        LinearLayout card = card(SURFACE, PURPLE);
        for (int i = 0; i < Math.min(entities.length(), 40); i++) {
            JSONObject entity = entities.optJSONObject(i);
            if (entity != null) addText(card, entity.optString("name") + " · " + entity.optString("kind") + " · " + formatPosition(entity.optJSONObject("position")), 11, TEXT, false, 0, 5);
        }
        pageContent.addView(card, margin(0, 0, 0, 14));
    }

    private void renderTasks() {
        title("إدارة المهام", "تقدم موثّق · حالات محفوظة محليًا");
        pageContent.addView(heroBanner("MISSION CONTROL  /  JOB QUEUE", "مهام منظّمة", "أنشئ مهمة مدعومة، تابع تقدمها، أو حلّل هدفًا عبر المخطط الذكي.", "إنشاء مهمة", () -> { tab = "task-types"; render(); }, 160), margin(0, 0, 0, 11));
        LinearLayout summary = new LinearLayout(this);
        summary.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        int active = 0, pending = 0, completed = 0, failed = 0;
        JSONArray tasks = records("tasks");
        for (int i = 0; i < tasks.length(); i++) {
            JSONObject task = tasks.optJSONObject(i);
            if (task == null) continue;
            String status = task.optString("status", "pending");
            if (status.equals("running") || status.equals("paused")) active++;
            else if (status.equals("pending") || status.equals("interrupted")) pending++;
            else if (status.equals("completed")) completed++;
            else if (status.equals("failed") || status.equals("cancelled")) failed++;
        }
        summary.addView(statCard("نشطة", String.valueOf(active), CYAN), weightMargin());
        summary.addView(statCard("انتظار", String.valueOf(pending), AMBER), weightMargin());
        summary.addView(statCard("مكتملة", String.valueOf(completed), GREEN), weightMargin());
        pageContent.addView(summary, margin(0, 0, 0, 12));
        horizontalChips(new String[][]{{"all", "الكل"}, {"active", "النشطة"}, {"pending", "قيد الانتظار"}, {"completed", "مكتملة"}, {"failed", "فاشلة"}}, taskStatusFilter, value -> {
            taskStatusFilter = value;
            render();
        });
        int visible = 0;
        for (JSONObject task : sorted(tasks)) {
            if (!matchesTaskFilter(task, taskStatusFilter)) continue;
            taskCard(task);
            visible++;
        }
        if (visible == 0) empty(taskStatusFilter.equals("all") ? "لا توجد مهام محفوظة" : "لا توجد مهام في هذا التصنيف", "المهام لا تظهر إلا بعد حفظها فعليًا من المستخدم أو قبول اقتراح AI.");
        button(pageContent, "تخطيط هدف قابل للتنفيذ عبر AI", false, () -> { tab = "planner"; render(); });
        note("المنفذ الحقيقي حاليًا: collect_block للكتل التي تؤكد بيانات إصدار Minecraft إسقاط العنصر نفسه. الفئات الأخرى معروضة للشفافية لكنها غير موصولة بالمحرك.");
    }

    private boolean matchesTaskFilter(JSONObject task, String filter) {
        String status = task.optString("status", "pending");
        if (filter.equals("all")) return true;
        if (filter.equals("active")) return status.equals("running") || status.equals("paused");
        if (filter.equals("pending")) return status.equals("pending") || status.equals("interrupted");
        if (filter.equals("completed")) return status.equals("completed");
        return status.equals("failed") || status.equals("cancelled");
    }

    private void renderTaskTypes() {
        title("مهمة جديدة", "اختر نوعًا موصولًا بالمحرك أو راجع التوافر بوضوح");
        pageContent.addView(heroBanner("MISSION BUILDER  /  STEP 01", "اختر نوع المهمة", "الفئات غير الموصولة معطّلة بوضوح؛ التنفيذ الحقيقي متاح لمهام الجمع.", "عودة إلى المهام", () -> { tab = "tasks"; render(); }, 160), margin(0, 0, 0, 11));
        stepIndicator(1, 2, "اختيار الفئة");
        GridLayout grid = new GridLayout(this);
        grid.setColumnCount(3);
        grid.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        for (String[] category : TASK_CATEGORIES) {
            boolean available = category[0].equals("collect") || category[0].equals("ai");
            LinearLayout tile = card(available ? SURFACE_RAISED : Color.argb(180, 12, 17, 35), available ? PURPLE : Color.rgb(48, 55, 81));
            tile.addView(new TaskGlyphView(this, category[0], available ? CYAN : MUTED),
                    new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(38)));
            TextView name = text(category[1], 10, available ? TEXT : MUTED, true);
            name.setGravity(Gravity.CENTER);
            tile.addView(name, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(32)));
            TextView availability = text(category[2], 8, available ? GREEN : AMBER, false);
            availability.setGravity(Gravity.CENTER);
            availability.setMaxLines(2);
            tile.addView(availability, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(28)));
            GridLayout.LayoutParams params = new GridLayout.LayoutParams(GridLayout.spec(GridLayout.UNDEFINED), GridLayout.spec(GridLayout.UNDEFINED, 1f));
            params.width = 0;
            params.height = dp(103);
            params.setMargins(dp(3), dp(3), dp(3), dp(3));
            grid.addView(tile, params);
            if (available) {
                tile.setOnClickListener(view -> {
                    taskWizardCategory = category[0];
                    if (category[0].equals("ai")) tab = "planner";
                    else tab = "task-create";
                    render();
                });
                animatePress(tile);
            } else {
                tile.setAlpha(0.72f);
                tile.setOnClickListener(view -> toast(category[1] + ": غير موصولة بمحرك Minecraft الحالي."));
            }
        }
        pageContent.addView(grid, margin(0, 4, 0, 14));
        note("لا نعرض أزرارًا قابلة للتنفيذ للفئات التي لا يملك المحرك لها Handler حقيقيًا. المتاح هنا: جمع مباشر محدود وخطة AI لنفس الأداة.");
    }

    private void renderTaskCreate() {
        title("تهيئة مهمة الجمع", "الكتلة والكمية والبوت · لا يبدأ التنفيذ قبل تشغيل المهمة");
        pageContent.addView(heroBanner("MISSION BUILDER  /  STEP 02", "تفاصيل التنفيذ", "حدد الكتلة والكمية والبوت؛ الحفظ يبقي المهمة في الانتظار ولا يبدأ الجلسة.", "العودة للفئات", () -> { tab = "task-types"; render(); }, 160), margin(0, 0, 0, 11));
        stepIndicator(2, 2, "تفاصيل التنفيذ");
        section("اختر كتلة مرشحة");
        GridLayout items = new GridLayout(this);
        items.setColumnCount(3);
        items.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        for (String[] item : COMMON_COLLECTABLES) {
            boolean selected = taskBlockName.equals(item[0]);
            LinearLayout tile = card(selected ? new int[]{Color.rgb(34, 51, 117), Color.rgb(59, 34, 112)} : new int[]{Color.rgb(17, 23, 47), Color.rgb(19, 25, 50)}, selected ? CYAN : Color.rgb(54, 68, 110));
            tile.addView(new VoxelBlockGlyph(this, selected ? CYAN : BLUE),
                    new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(34)));
            TextView label = text(item[1], 9, TEXT, true);
            label.setGravity(Gravity.CENTER);
            tile.addView(label, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(28)));
            TextView id = text(item[0], 7, MUTED, false);
            id.setGravity(Gravity.CENTER);
            tile.addView(id, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(20)));
            GridLayout.LayoutParams params = new GridLayout.LayoutParams(GridLayout.spec(GridLayout.UNDEFINED), GridLayout.spec(GridLayout.UNDEFINED, 1f));
            params.width = 0;
            params.height = dp(81);
            params.setMargins(dp(3), dp(3), dp(3), dp(3));
            items.addView(tile, params);
            tile.setOnClickListener(view -> { taskBlockName = item[0]; render(); });
        }
        pageContent.addView(items, margin(0, 0, 0, 12));

        EditText amount = field("الكمية · 1–320");
        amount.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        amount.setText("10");
        LinearLayout quantity = new LinearLayout(this);
        quantity.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        TextView minus = smallButton("−", () -> {
            int current = parseBoundedAmount(amount.getText().toString(), 10);
            amount.setText(String.valueOf(Math.max(1, current - 1)));
        }, false);
        TextView plus = smallButton("＋", () -> {
            int current = parseBoundedAmount(amount.getText().toString(), 10);
            amount.setText(String.valueOf(Math.min(320, current + 1)));
        }, false);
        quantity.addView(minus, new LinearLayout.LayoutParams(dp(54), dp(48)));
        quantity.addView(amount, new LinearLayout.LayoutParams(0, dp(48), 1));
        quantity.addView(plus, new LinearLayout.LayoutParams(dp(54), dp(48)));
        pageContent.addView(quantity, margin(0, 0, 0, 12));

        List<JSONObject> botList = toList(records("bots"));
        if (botList.isEmpty()) {
            empty("لا توجد ملفات بوت", "أنشئ ملف بوت أولًا؛ لم يُنشأ أي اتصال أو مهمة تلقائيًا.");
            button(pageContent, "إنشاء ملف بوت", false, this::showBotDialog);
        } else {
            Spinner bots = spinner();
            bots.setAdapter(neonAdapter(botNames(botList)));
            int selected = 0;
            for (int i = 0; i < botList.size(); i++) if (taskSelectedBotId.equals(botList.get(i).optString("id"))) selected = i;
            bots.setSelection(selected);
            taskSelectedBotId = botList.get(selected).optString("id", "");
            bots.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
                @Override public void onItemSelected(AdapterView<?> parent, View view, int position, long id) { if (position >= 0 && position < botList.size()) taskSelectedBotId = botList.get(position).optString("id", ""); }
                @Override public void onNothingSelected(AdapterView<?> parent) { taskSelectedBotId = ""; }
            });
            addFormField(pageContent, "ملف البوت", bots);
            addText(pageContent, "الكتلة يجب أن تكون ضمن العالم المحمّل (48 block). لا يُقبل الخام أو Drop مختلف الاسم؛ الفشل يوضح السبب ولا يحتسب تقدمًا.", 10, MUTED, false, 8, 12);
            button(pageContent, "حفظ المهمة في الانتظار", true, () -> createCollectTask(taskBlockName, parseBoundedAmount(amount.getText().toString(), -1), taskSelectedBotId));
        }
        button(pageContent, "رجوع للفئات", false, () -> { tab = "task-types"; render(); });
    }

    private int parseBoundedAmount(String raw, int fallback) {
        try { int value = Integer.parseInt(raw.trim()); return value >= 1 && value <= 320 ? value : fallback; }
        catch (Exception ignored) { return fallback; }
    }

    private void createCollectTask(String blockName, int amount, String botId) {
        if (amount < 1 || amount > 320) { toast("أدخل كمية بين 1 و320."); return; }
        if (find("bots", botId) == null) { toast("اختر ملف بوت صالحًا."); return; }
        try {
            String id = UUID.randomUUID().toString();
            JSONObject task = new JSONObject().put("id", id).put("name", "اجمع " + amount + " من " + blockName)
                    .put("description", "Collect " + blockName).put("type", "collect").put("toolName", "collect_block")
                    .put("blockName", blockName).put("count", amount).put("botId", botId)
                    .put("status", "pending").put("progress", 0).put("verifiedCollected", 0).put("priority", "normal")
                    .put("createdAt", System.currentTimeMillis());
            database.upsert("tasks", task.toString());
            database.upsert("task_history", new JSONObject().put("id", UUID.randomUUID().toString()).put("taskId", id)
                    .put("botId", botId).put("status", "pending").put("message", "حُفظ طلب المستخدم محليًا؛ لم يبدأ التنفيذ.").put("createdAt", System.currentTimeMillis()).toString());
            taskBlockName = blockName;
            tab = "tasks";
            toast("حُفظت المهمة في الانتظار؛ لم يبدأ أي تنفيذ حتى تضغط تشغيل.");
            render();
        } catch (JSONException error) { toast("تعذر حفظ المهمة في SQLite."); }
    }

    private void taskCard(JSONObject task) {
        String id = task.optString("id", "");
        LinearLayout card = card(SURFACE, statusColor(task.optString("status", "pending")));
        String taskStatus = task.optString("status", "pending");
        rowTitle(card, task.optString("name", task.optString("description", "Minecraft task")), taskStatusLabel(taskStatus));
        JSONObject taskBot = find("bots", task.optString("botId", ""));
        JSONObject taskServer = taskBot == null ? null : find("servers", taskBot.optString("serverId", ""));
        String serverLabel = taskServer == null ? "السيرفر غير معيّن" : taskServer.optString("name", "Minecraft Java");
        addText(card, "البوت: " + botName(task.optString("botId", "")) + " · السيرفر: " + serverLabel + " · " + task.optString("blockName", ""), 10, MUTED, false, 0, 5);
        addText(card, "التقدم المؤكد من مخزون Minecraft: " + task.optInt("verifiedCollected", 0) + "/" + task.optInt("count", 0) + " · " + task.optInt("progress", 0) + "%", 11, BLUE, false, 0, 4);
        card.addView(progressBar(task.optInt("progress", 0), statusColor(taskStatus)), margin(0, 0, 0, 7));
        String currentAction = task.optString("currentAction", "");
        if (!currentAction.isEmpty()) addText(card, currentAction, 12, TEXT, false, 0, 5);
        JSONObject currentTarget = task.optJSONObject("currentTarget");
        if (currentTarget != null) addText(card, "موقع الهدف المرصود: " + formatPosition(currentTarget), 11, MUTED, false, 0, 5);
        String lastReason = task.optString("lastReason", "");
        if (!lastReason.isEmpty() && (task.optString("status", "").equals("failed") || task.optString("status", "").equals("interrupted")))
            addText(card, lastReason, 11, AMBER, false, 0, 10);
        LinearLayout actions = new LinearLayout(this);
        actions.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        String status = task.optString("status", "pending");
        if (status.equals("pending") || status.equals("failed") || status.equals("interrupted"))
            actions.addView(smallButton(status.equals("interrupted") ? "إعادة تشغيل" : "تشغيل", () -> startCollectTask(task), true), weightMargin());
        if (status.equals("running")) actions.addView(smallButton("إيقاف مؤقت", () -> taskCommand(task, "pause-task"), false), weightMargin());
        if (status.equals("paused") && "USER_PAUSE".equals(task.optString("runtimePriority")))
            actions.addView(smallButton("استئناف", () -> taskCommand(task, "resume-task"), true), weightMargin());
        else if (status.equals("paused")) addText(card, "توقف بأولوية المحرك/البقاء؛ سيُستأنف فقط بعد تعافي الاتصال أو الحالة المرصودة.", 11, AMBER, false, 0, 8);
        if (status.equals("running") || status.equals("paused")) actions.addView(smallButton("إلغاء", () -> taskCommand(task, "cancel-task"), false), weightMargin());
        card.addView(actions);
        pageContent.addView(card, margin(0, 0, 0, 12));
    }

    private void showCollectTaskDialog() {
        JSONArray bots = records("bots");
        if (bots.length() == 0) { toast("أنشئ ملف بوت أولًا."); tab = "bots"; render(); return; }
        EditText block = field("اسم الكتلة (مثال: oak_log)");
        EditText count = field("العدد المطلوب (1–320)");
        count.setInputType(2);
        Spinner botSpinner = spinner();
        List<JSONObject> botList = toList(bots);
        ArrayAdapter<String> adapter = neonAdapter(botNames(botList));
        botSpinner.setAdapter(adapter);
        LinearLayout form = form(block, count);
        addFormField(form, "ملف البوت", botSpinner);
        addText(form, "لا تبدأ المهمة حتى تحفظها وتضغط تشغيل. محرك الجمع يستخدم Mineflayer Pathfinder وTool ويُسجل التقدم فقط بعد زيادة العنصر في مخزون Minecraft.", 12, MUTED, false, 0, 0);
        new AlertDialog.Builder(this).setTitle("إنشاء مهمة جمع")
                .setView(form)
                .setNegativeButton("إلغاء", null)
                .setPositiveButton("حفظ المهمة", (dialog, which) -> {
                    String blockName = block.getText().toString().trim().toLowerCase(java.util.Locale.ROOT);
                    int amount;
                    try { amount = Integer.parseInt(count.getText().toString().trim()); } catch (NumberFormatException error) { toast("أدخل عددًا صحيحًا."); return; }
                    if (!blockName.matches("[a-z0-9_]{1,64}") || amount < 1 || amount > 320) { toast("اسم الكتلة أو العدد غير صالح."); return; }
                    JSONObject selected = botList.get(Math.max(0, botSpinner.getSelectedItemPosition()));
                    JSONObject task = new JSONObject();
                    try {
                        String id = UUID.randomUUID().toString();
                        task.put("id", id).put("name", "اجمع " + amount + " من " + blockName).put("description", "Collect " + blockName)
                                .put("type", "collect").put("blockName", blockName).put("count", amount).put("botId", selected.optString("id"))
                                .put("status", "pending").put("progress", 0).put("priority", "normal").put("createdAt", System.currentTimeMillis());
                        database.upsert("tasks", task.toString());
                        JSONObject history = new JSONObject().put("id", UUID.randomUUID().toString()).put("taskId", id).put("status", "pending").put("message", "تم حفظ طلب المستخدم محليًا؛ لم يبدأ التنفيذ.").put("createdAt", System.currentTimeMillis());
                        database.upsert("task_history", history.toString());
                    } catch (JSONException ignored) { toast("تعذر حفظ المهمة."); }
                    render();
                }).show();
    }

    private void startCollectTask(JSONObject task) {
        String botId = task.optString("botId", "");
        JSONObject live = find("bot_states", botId);
        if (!isLiveBot(live)) { toast("لا يمكن تشغيل المهمة: لا توجد لقطة حديثة تؤكد اتصال Spawn."); return; }
        try {
            JSONObject arguments = new JSONObject().put("block_name", task.optString("blockName")).put("amount", task.optInt("count"));
            JSONObject command = new JSONObject().put("action", "execute-tool").put("toolName", "collect_block")
                    .put("arguments", arguments).put("botId", botId).put("taskId", task.optString("id"))
                    .put("alreadyCollected", task.optInt("verifiedCollected", 0));
            if (task.has("initialInventoryCount")) command.put("initialInventoryCount", task.optInt("initialInventoryCount"));
            sendEngineCommand(command);
        } catch (JSONException ignored) { toast("تعذر إنشاء أمر المهمة."); }
    }

    private void taskCommand(JSONObject task, String action) {
        try { sendEngineCommand(new JSONObject().put("action", action).put("botId", task.optString("botId")).put("taskId", task.optString("id"))); }
        catch (JSONException ignored) { }
    }

    private void sendEngineCommand(JSONObject command) { BotEngineService.sendCommand(this, command); }

    private void renderLogs() {
        title("السجل", "أحداث محلية ومحرك Minecraft فقط");
        JSONArray rows = records("logs");
        List<JSONObject> list = toList(rows);
        list.sort(Comparator.comparingLong((JSONObject row) -> row.optLong("createdAt", 0)).reversed());
        if (list.isEmpty()) empty("السجل فارغ", "لن نولّد سجلات نشاط وهمية.");
        int shown = 0;
        for (JSONObject log : list) {
            if (shown++ >= 80) break;
            LinearLayout card = card(SURFACE, "error".equals(log.optString("level")) ? RED : BLUE);
            addText(card, log.optString("message", "حدث محلي"), 12, TEXT, false, 0, 5);
            addText(card, log.optString("category", "event") + " · " + log.optLong("createdAt"), 10, MUTED, false, 0, 0);
            pageContent.addView(card, margin(0, 0, 0, 8));
        }
    }

    private void renderSettings() {
        title("الإعدادات", "حماية الجهاز والتخزين المحلي");
        pageContent.addView(heroBanner("SYSTEM CONFIGURATION", "تحكم آمن", "مفاتيح الجهاز محمية، والحالة تظهر من محرك Minecraft الحقيقي.", "فتح مخطط AI", () -> { tab = "planner"; render(); }, 154), margin(0, 0, 0, 12));
        LinearLayout ai = card(SURFACE, PURPLE);
        rowTitle(ai, "OpenRouter AI", secureStore.hasApiKey() ? "مفتاح محفوظ مشفّر" : "غير مضبوط");
        addText(ai, "المفتاح يُشفّر بمفتاح Android Keystore. لن نضعه في ملفات المشروع أو السجلات.", 12, MUTED, false, 0, 12);
        button(ai, secureStore.hasApiKey() ? "تغيير مفتاح OpenRouter" : "إضافة مفتاح OpenRouter", true, this::showApiKeyDialog);
        JSONObject modelConfig = find("ai_config", "openrouter_models");
        JSONArray savedModels = modelConfig == null ? null : modelConfig.optJSONArray("freeModels");
        final JSONArray freeModels = savedModels == null ? new JSONArray() : savedModels;
        String selectedModel = modelConfig == null ? "" : modelConfig.optString("selectedModel", "");
        addText(ai, selectedModel.isEmpty() ? "لم يُحدّد نموذج مجاني بعد." : "النموذج الحالي: " + selectedModel, 12, BLUE, true, 0, 5);
        addText(ai, "النماذج تُكتشف من OpenRouter. التخطيط يجرب النموذج المحدد ثم حتى أربعة بدائل مجانية.", 11, MUTED, false, 0, 8);
        CheckBox autoExecute = settingCheck("السماح بالتنفيذ عند قبول خطة collect_block", settingEnabled("ai_auto_execute"));
        autoExecute.setOnCheckedChangeListener((buttonView, checked) -> saveSetting("ai_auto_execute", checked));
        ai.addView(autoExecute, margin(0, 0, 0, 5));
        button(ai, "اكتشاف / تحديث النماذج المجانية", false, this::discoverFreeModels);
        if (freeModels.length() > 0) button(ai, "اختيار النموذج", false, () -> showAiModelDialog(freeModels));
        button(ai, "فتح مخطط AI", false, () -> { tab = "planner"; render(); });
        if (secureStore.hasApiKey()) button(ai, "حذف المفتاح المشفّر", false, this::confirmClearApiKey);
        pageContent.addView(ai, margin(0, 0, 0, 14));

        LinearLayout runtime = card(SURFACE, BLUE);
        rowTitle(runtime, "محرك Android", engineState);
        addText(runtime, nodeVersion.isEmpty() ? "Node.js Mobile · Mineflayer + Pathfinder" : nodeVersion + " · Mineflayer + Pathfinder", 12, MUTED, false, 0, 5);
        addText(runtime, "الإشعار الأمامي وقفل CPU يعملان فقط أثناء جلسة بدأها المستخدم. قد توقف بعض الشركات المصنعة الخدمة بسبب سياسات البطارية.", 11, MUTED, false, 0, 10);
        button(runtime, "إيقاف كل البوتات", false, () -> new AlertDialog.Builder(this).setTitle("إيقاف جميع الجلسات؟").setMessage("سيُرسل Disconnect إلى كل جلسة. أي مهمة جمع نشطة ستُلغى ويُحفظ التقدم المؤكد فقط.").setNegativeButton("رجوع", null).setPositiveButton("إيقاف", (d, w) -> BotEngineService.stopAll(this)).show());
        pageContent.addView(runtime, margin(0, 0, 0, 14));

        LinearLayout behavior = card(SURFACE, CYAN);
        rowTitle(behavior, "السلوك والبقاء", "Behavior Engine");
        addKeyValue(behavior, "أولوية الطوارئ", "صحة ≤ 4 · توقف آمن");
        addKeyValue(behavior, "أولوية الطعام", "طعام ≤ 8 · استئناف بعد 12");
        addText(behavior, "إعادة الاتصال والأكل وإعادة الظهور تُضبط لكل ملف بوت. النوم التلقائي والقتال وتجنب المخاطر المتقدم غير موصولة؛ لا يوجد تبديل وهمي لها.", 10, MUTED, false, 4, 8);
        button(behavior, "إدارة ملفات البوت وإعداداتها", false, () -> { tab = "bots"; render(); });
        pageContent.addView(behavior, margin(0, 0, 0, 14));

        LinearLayout data = card(SURFACE, Color.rgb(55, 66, 105));
        rowTitle(data, "التخزين", "SQLite محلي");
        addText(data, "ملفات البوت " + records("bots").length() + " · المهام " + records("tasks").length() + " · السجلات " + records("logs").length(), 12, MUTED, false, 0, 10);
        button(data, "تصدير نسخة احتياطية", false, this::exportBackup);
        button(data, "سجلات محرك Minecraft", false, () -> { tab = "logs"; render(); });
        button(data, "إدارة Skins", false, () -> { tab = "skins"; render(); });
        pageContent.addView(data, margin(0, 0, 0, 14));

        section("الشفافية");
        note("Status Ping ليس Login. لا تعرض الواجهة Health أو Position أو Inventory إلا عندما يرسلها Mineflayer من الجلسة الحالية.");
        note("المهمة الحالية المدعومة: جمع نوع كتلة موجود في العالم المحمّل وتأكيد زيادة المخزون. تخزين الصندوق والـcrafting والبناء غير مدعوم بعد.");
    }

    private void discoverFreeModels() {
        if (!secureStore.hasApiKey()) { showApiKeyDialog(); return; }
        toast("جارٍ طلب قائمة النماذج المجانية من OpenRouter…");
        io.execute(() -> {
            try {
                String key = secureStore.readApiKey();
                JSONArray models = new OpenRouterClient().discoverFreeModels(key);
                if (models.length() == 0) throw new IllegalStateException("لم يُرجع الحساب نماذج مجانية قابلة للاستخدام.");
                JSONObject current = find("ai_config", "openrouter_models");
                String selected = current == null ? "" : current.optString("selectedModel", "");
                boolean found = false;
                for (int i = 0; i < models.length(); i++) if (selected.equals(models.optJSONObject(i).optString("id"))) found = true;
                if (!found) selected = models.optJSONObject(0).optString("id", "");
                saveAiModels(models, selected);
                String selectedFinal = selected;
                mainHandler.post(() -> { toast("اكتُشف " + models.length() + " نموذج مجاني. المختار: " + selectedFinal); render(); });
            } catch (Exception error) {
                mainHandler.post(() -> toast("تعذر جلب النماذج المجانية: " + safe(error)));
            }
        });
    }

    private void saveAiModels(JSONArray models, String selected) {
        try {
            JSONObject current = find("ai_config", "openrouter_models");
            JSONObject row = current == null ? new JSONObject() : new JSONObject(current.toString());
            row.put("id", "openrouter_models").put("freeModels", models).put("selectedModel", selected).put("updatedAt", System.currentTimeMillis());
            database.upsert("ai_config", row.toString());
        } catch (JSONException ignored) { throw new IllegalStateException("تعذر حفظ قائمة النماذج في SQLite."); }
    }

    private void showAiModelDialog(JSONArray models) {
        if (models == null || models.length() == 0) { toast("اكتشف النماذج المجانية أولًا."); return; }
        String[] labels = new String[models.length()];
        JSONObject config = find("ai_config", "openrouter_models");
        String selectedId = config == null ? "" : config.optString("selectedModel", "");
        int checked = 0;
        for (int i = 0; i < models.length(); i++) {
            JSONObject model = models.optJSONObject(i);
            if (model == null) { labels[i] = "نموذج غير معروف"; continue; }
            labels[i] = model.optString("name", model.optString("id")) + "\n" + model.optString("id") + " · context " + model.optInt("contextLength") + (model.optBoolean("supportsTools", false) ? " · tools" : " · tool support unknown");
            if (selectedId.equals(model.optString("id"))) checked = i;
        }
        final int[] choice = {checked};
        new AlertDialog.Builder(this).setTitle("اختيار نموذج مجاني")
                .setSingleChoiceItems(labels, checked, (dialog, which) -> choice[0] = which)
                .setNegativeButton("إلغاء", null)
                .setPositiveButton("اعتماد", (dialog, which) -> {
                    JSONObject model = models.optJSONObject(choice[0]);
                    if (model == null) return;
                    saveAiModels(models, model.optString("id", ""));
                    toast("حُفظ اختيار النموذج في SQLite.");
                    render();
                }).show();
    }

    private void renderPlanner() {
        title("مخطط المهام · AI", "OpenRouter → اقتراح أداة مسجلة → موافقتك → Task Engine");
        pageContent.addView(heroBanner("AI PLANNER  /  NEURAL TOOL ENGINE", "خطّة قبل الحركة", "النموذج يقترح أداة محدودة؛ المحرك يتحقق من العالم قبل أي تنفيذ.", "إعداد النماذج", this::discoverFreeModels, 168), margin(0, 0, 0, 12));
        if (!secureStore.hasApiKey()) {
            empty("OpenRouter غير مضبوط", "أضف مفتاح API؛ سيبقى مشفّرًا في Android Keystore ولا يُرسل إلى خادم وسيط.");
            return;
        }
        JSONObject config = find("ai_config", "openrouter_models");
        JSONArray freeModels = config == null ? null : config.optJSONArray("freeModels");
        if (freeModels == null || freeModels.length() == 0) {
            empty("لا توجد نماذج مجانية محفوظة", "اكتشف قائمة OpenRouter أولًا. لا يبدأ أي اتصال Minecraft من شاشة التخطيط.");
            return;
        }
        String selectedModel = config.optString("selectedModel", "");
        LinearLayout modelCard = card(SURFACE_RAISED, PURPLE);
        rowTitle(modelCard, "النموذج المجاني", selectedModel.isEmpty() ? "غير محدد" : "محدد");
        addText(modelCard, selectedModel.isEmpty() ? "لا يوجد نموذج مختار." : selectedModel, 10, CYAN, true, 0, 7);
        button(modelCard, "تغيير النموذج", false, () -> showAiModelDialog(freeModels));
        pageContent.addView(modelCard, margin(0, 0, 0, 12));

        LinearLayout card = card(SURFACE, PURPLE);
        addText(card, "اكتب بالعربية أو الإنجليزية. النموذج يستطيع طلب collect_block فقط؛ لا تُقبل أسماء أدوات غير مسجلة.", 11, MUTED, false, 0, 8);
        plannerInput = field("مثال: اجمع 10 خشبات");
        plannerInput.setSingleLine(false);
        plannerInput.setMinLines(4);
        plannerInput.setMaxLines(7);
        plannerInput.setGravity(Gravity.TOP | Gravity.RIGHT);
        plannerInput.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE | android.text.InputType.TYPE_TEXT_FLAG_AUTO_CORRECT | android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        plannerInput.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_NONE);
        plannerInput.setHorizontallyScrolling(false);
        plannerInput.setTextDirection(View.TEXT_DIRECTION_FIRST_STRONG);
        plannerInput.setText(plannerPrompt);
        plannerInput.setSelection(plannerInput.length());
        plannerInput.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) { }
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) { plannerPrompt = s == null ? "" : s.toString(); }
            @Override public void afterTextChanged(Editable s) { }
        });
        plannerInput.setOnFocusChangeListener((view, focused) -> {
            if (focused) plannerInput.post(() -> plannerInput.requestRectangleOnScreen(new android.graphics.Rect(0, 0, plannerInput.getWidth(), plannerInput.getHeight()), true));
        });
        card.addView(plannerInput, margin(0, 0, 0, 10));

        List<JSONObject> botList = toList(records("bots"));
        Spinner botSpinner = spinner();
        if (!botList.isEmpty()) {
            botSpinner.setAdapter(neonAdapter(botNames(botList)));
            int selection = 0;
            for (int i = 0; i < botList.size(); i++) if (plannerBotId.equals(botList.get(i).optString("id"))) selection = i;
            botSpinner.setSelection(selection);
            plannerBotId = botList.get(selection).optString("id", "");
            botSpinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
                @Override public void onItemSelected(AdapterView<?> parent, View view, int position, long id) { if (position >= 0 && position < botList.size()) plannerBotId = botList.get(position).optString("id", ""); }
                @Override public void onNothingSelected(AdapterView<?> parent) { plannerBotId = ""; }
            });
            addFormField(card, "إسناد الاقتراح إلى ملف بوت", botSpinner);
        } else addText(card, "لا توجد ملفات بوت؛ يمكن التخطيط لكن لا يمكن حفظ المهمة بعد.", 10, AMBER, false, 0, 8);
        CheckBox autoExecute = settingCheck("التنفيذ التلقائي بعد قبول خطة مدعومة", settingEnabled("ai_auto_execute"));
        autoExecute.setOnCheckedChangeListener((buttonView, checked) -> saveSetting("ai_auto_execute", checked));
        card.addView(autoExecute, margin(0, 0, 0, 6));
        addText(card, "حتى مع هذا الخيار لا تُنفذ خطة غير مدعومة، ويظل التحقق والقيود داخل المحرك.", 9, MUTED, false, 0, 8);
        button(card, plannerRequestRunning ? "جارٍ تحليل الطلب…" : "تحليل المهمة", true, () -> {
            plannerPrompt = plannerInput.getText().toString().trim();
            if (!plannerRequestRunning) {
                hideKeyboard(plannerInput);
                requestAiPlan(plannerPrompt, freeModels, selectedModel);
            }
        });
        pageContent.addView(card, margin(0, 0, 0, 14));

        if (latestAiPlan != null) {
            String action = latestAiPlan.optString("action", "unsupported");
            LinearLayout result = card(SURFACE_RAISED, action.equals("collect") ? GREEN : AMBER);
            rowTitle(result, "خطة الأداة المقترحة", action.equals("collect") ? "collect_block" : "غير مدعومة");
            if (action.equals("collect")) {
                addText(result, "اجمع " + latestAiPlan.optInt("count") + " × " + latestAiPlan.optString("blockName"), 15, TEXT, true, 0, 7);
                addText(result, "Tool Call مُتحقق من المخطط: collect_block(block_name, amount)", 9, CYAN, true, 0, 6);
            }
            String planReason = latestAiPlan.optString("reason", "").trim();
            addText(result, planReason.isEmpty() ? "لم يقدّم النموذج سببًا مستقلًا." : planReason, 11, MUTED, false, 0, 7);
            addText(result, "Model: " + latestAiPlan.optString("model", selectedModel), 9, BLUE, false, 0, 7);
            addText(result, "لم يعرف النموذج موقعك أو مخزونك. Mineflayer يتحقق من Spawn، والكتلة، وزيادة المخزون عند التنفيذ.", 9, MUTED, false, 0, 9);
            if (action.equals("collect")) {
                boolean hasBot = find("bots", plannerBotId) != null;
                if (hasBot) {
                    boolean canExecuteAfterApproval = settingEnabled("ai_auto_execute") && isLiveBot(find("bot_states", plannerBotId));
                    button(result, canExecuteAfterApproval ? "قبول الخطة وتنفيذها" : "موافقة · احفظ المهمة", true, () -> saveAiPlanAsTask(latestAiPlan));
                } else addText(result, "أنشئ ملف بوت أولًا لحفظ الخطة.", 10, AMBER, false, 0, 0);
            }
            pageContent.addView(result, margin(0, 0, 0, 12));
        }
        note("OpenRouter يخطط باستخدام أداة واحدة مسجلة فقط. افتراضيًا يتطلب التنفيذ موافقتك؛ الأدوات الأخرى (الصناديق والبناء والقتال…) غير متاحة ولا يخترعها النموذج.");
    }

    private void requestAiPlan(String prompt, JSONArray freeModels, String selectedModel) {
        if (prompt == null || prompt.trim().isEmpty()) { toast("اكتب الهدف أولًا."); return; }
        plannerRequestRunning = true;
        latestAiPlan = null;
        toast("يرسل التطبيق الهدف إلى OpenRouter للتخطيط فقط…");
        render();
        io.execute(() -> {
            try {
                JSONArray fallbacks = new JSONArray(freeModels.toString());
                boolean selectedIsFree = false;
                for (int i = 0; i < freeModels.length(); i++) {
                    JSONObject model = freeModels.optJSONObject(i);
                    if (model != null && selectedModel.equals(model.optString("id"))) selectedIsFree = true;
                }
                if (!selectedIsFree) throw new IllegalStateException("النموذج المختار ليس ضمن قائمة النماذج المجانية المكتشفة. حدّث القائمة.");
                String key = secureStore.readApiKey();
                JSONObject plan = new OpenRouterClient().createPlan(key, prompt, selectedModel, fallbacks);
                mainHandler.post(() -> { latestAiPlan = plan; plannerRequestRunning = false; render(); });
            } catch (Exception error) {
                mainHandler.post(() -> { plannerRequestRunning = false; toast("فشل التخطيط: " + safe(error)); render(); });
            }
        });
    }

    private void saveAiPlanAsTask(JSONObject plan) {
        if (plan == null || !"collect".equals(plan.optString("action"))) { toast("لا يوجد اقتراح قابل للحفظ."); return; }
        JSONObject bot = find("bots", plannerBotId);
        if (bot == null) { toast("اختر ملف بوت موجودًا أولًا."); return; }
        String blockName = plan.optString("blockName", "").trim().toLowerCase(java.util.Locale.ROOT);
        int count = plan.optInt("count", 0);
        if (!blockName.matches("[a-z0-9_]{1,64}") || count < 1 || count > 320) { toast("اقتراح AI خارج حدود المهمة؛ رُفض."); return; }
        try {
            String taskId = UUID.randomUUID().toString();
            JSONObject task = new JSONObject().put("id", taskId).put("name", "اجمع " + count + " من " + blockName)
                    .put("description", "اقتراح AI: " + plan.optString("reason", "")).put("source", "ai_high_level_plan")
                    .put("model", plan.optString("model", "")).put("type", "collect").put("blockName", blockName).put("count", count)
                    .put("botId", plannerBotId).put("status", "pending").put("progress", 0).put("priority", "normal")
                    .put("createdAt", System.currentTimeMillis());
            database.upsert("tasks", task.toString());
            JSONObject history = new JSONObject().put("id", UUID.randomUUID().toString()).put("taskId", taskId).put("botId", plannerBotId)
                    .put("status", "pending").put("message", "وافق المستخدم على اقتراح AI وحُفظ كـ Pending؛ لم يبدأ التنفيذ.").put("createdAt", System.currentTimeMillis());
            database.upsert("task_history", history.toString());
            latestAiPlan = null;
            tab = "tasks";
            boolean executeNow = settingEnabled("ai_auto_execute") && isLiveBot(find("bot_states", plannerBotId));
            if (executeNow) {
                toast("قُبلت الخطة؛ الإرسال محصور في collect_block والمحرك يتحقق من العالم والمخزون.");
                render();
                startCollectTask(task);
            } else {
                toast("حُفظت المهمة Pending؛ اضغط تشغيل بعد تحقق Spawn.");
                render();
            }
        } catch (JSONException ignored) { toast("تعذر حفظ المهمة في SQLite."); }
    }

    private void showApiKeyDialog() {
        EditText key = field("sk-or-v1-…");
        key.setInputType(129);
        LinearLayout form = form(key);
        addText(form, "أدخل المفتاح يدويًا. لن يظهر في السجلات أو يُضمّن في المشروع.", 12, MUTED, false, 0, 0);
        new AlertDialog.Builder(this).setTitle("مفتاح OpenRouter")
                .setView(form)
                .setNegativeButton("إلغاء", null)
                .setPositiveButton("تشفير وحفظ", (dialog, which) -> {
                    try { secureStore.saveApiKey(key.getText().toString()); toast("حُفظ المفتاح مشفّرًا في Android Keystore."); render(); }
                    catch (Exception error) { toast(safe(error)); }
                }).show();
    }

    private void confirmClearApiKey() {
        new AlertDialog.Builder(this).setTitle("حذف مفتاح AI؟").setMessage("سيُحذف المفتاح المشفّر من هذا الجهاز.")
                .setNegativeButton("إلغاء", null)
                .setPositiveButton("حذف", (dialog, which) -> { secureStore.clearApiKey(); render(); }).show();
    }

    private void renderSkins() {
        title("مدير السكنات", "معاينة محلية · لا تُرفع إلى حساب Minecraft");
        pageContent.addView(heroBanner("LOCAL SKIN VAULT  /  PREVIEW ONLY", "مخزن المظاهر", "PNG 64×64 أو 64×32 · يغيّر معاينة البطاقة فقط.", "استيراد Skin", this::pickSkin, 176), margin(0, 0, 0, 12));
        JSONArray rows = records("skins");
        LinearLayout summary = new LinearLayout(this);
        summary.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        summary.addView(statCard("LOCAL FILES", String.valueOf(rows.length()), PURPLE), weightMargin());
        summary.addView(statCard("ACCOUNT UPLOAD", "OFF", CYAN), weightMargin());
        pageContent.addView(summary, margin(0, 0, 0, 12));
        if (rows.length() == 0) empty("خزانة السكن فارغة", "استورد ملف PNG محليًا. لن نعرض مظهرًا افتراضيًا على أنه Skin حسابك.");
        else {
            section("المظاهر المحفوظة");
            GridLayout gallery = new GridLayout(this);
            gallery.setColumnCount(2);
            gallery.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
            for (JSONObject skin : sorted(rows)) {
                LinearLayout tile = card(SURFACE_RAISED, PURPLE);
                tile.setPadding(dp(10), dp(10), dp(10), dp(11));
                addSkinPreview(tile, skin, 112);
                addText(tile, skin.optString("name", "Skin"), 10, TEXT, true, 4, 3);
                addText(tile, "LOCAL PREVIEW", 7, CYAN, true, 0, 7);
                button(tile, "ربط ببطاقة بوت", false, () -> chooseBotForSkin(skin));
                tile.addView(smallButton("حذف من الجهاز", () -> deleteSkin(skin), false), margin(0, 3, 0, 1));
                GridLayout.LayoutParams params = new GridLayout.LayoutParams(GridLayout.spec(GridLayout.UNDEFINED), GridLayout.spec(GridLayout.UNDEFINED, 1f));
                params.width = 0;
                params.height = ViewGroup.LayoutParams.WRAP_CONTENT;
                params.setMargins(dp(4), dp(4), dp(4), dp(4));
                gallery.addView(tile, params);
            }
            pageContent.addView(gallery, margin(0, 0, 0, 10));
        }
        note("تعيين PNG يغيّر صورة البطاقة المحلية فقط. تغيير مظهر لاعب Microsoft أو رفع ملف للخادم غير مدعوم.");
    }

    private void addSkinPreview(LinearLayout parent, JSONObject skin, int maxHeightDp) {
        String path = skin == null ? "" : skin.optString("filePath", "");
        Bitmap bitmap = path.isEmpty() ? null : BitmapFactory.decodeFile(path);
        if (bitmap == null) { addText(parent, "معاينة غير متاحة · لم يعد ملف PNG المحلي قابلًا للقراءة.", 10, AMBER, false, 0, 8); return; }
        ImageView preview = new ImageView(this);
        preview.setImageBitmap(bitmap);
        preview.setScaleType(ImageView.ScaleType.FIT_CENTER);
        preview.setBackground(rounded(Color.rgb(8, 12, 30), Color.rgb(73, 72, 135), dp(14)));
        preview.setPadding(dp(8), dp(8), dp(8), dp(8));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(maxHeightDp));
        params.setMargins(dp(4), dp(4), dp(4), dp(4));
        parent.addView(preview, params);
    }

    private void chooseBotForSkin(JSONObject skin) {
        List<JSONObject> bots = toList(records("bots"));
        if (bots.isEmpty()) { toast("أنشئ ملف بوت أولًا؛ لا توجد بطاقة لربط هذا المظهر بها."); return; }
        String[] labels = new String[bots.size()];
        for (int i = 0; i < bots.size(); i++) labels[i] = bots.get(i).optString("name", bots.get(i).optString("username"));
        new AlertDialog.Builder(this).setTitle("ربط صورة البطاقة ببوت")
                .setItems(labels, (dialog, which) -> { if (which >= 0 && which < bots.size()) assignSkinToBot(bots.get(which), skin); }).show();
    }

    private void chooseSkinForBot(JSONObject bot) {
        List<JSONObject> skins = toList(records("skins"));
        if (skins.isEmpty()) { toast("احفظ Skin PNG محليًا أولًا."); tab = "skins"; render(); return; }
        String[] labels = new String[skins.size()];
        for (int i = 0; i < skins.size(); i++) labels[i] = skins.get(i).optString("name", "Skin");
        new AlertDialog.Builder(this).setTitle("اختيار معاينة محلية")
                .setItems(labels, (dialog, which) -> { if (which >= 0 && which < skins.size()) assignSkinToBot(bot, skins.get(which)); }).show();
    }

    private void assignSkinToBot(JSONObject bot, JSONObject skin) {
        try {
            JSONObject updated = new JSONObject(bot.toString());
            if (skin == null) updated.remove("skinId");
            else updated.put("skinId", skin.optString("id", ""));
            database.upsert("bots", updated.toString());
            toast("حُفظت معاينة البطاقة محليًا فقط؛ لم يتغير Skin Minecraft.");
            render();
        } catch (JSONException error) { toast("تعذر حفظ اختيار المعاينة."); }
    }

    private void pickSkin() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/png");
        startActivityForResult(intent, PICK_SKIN);
    }

    private void savePickedSkin(Uri uri) {
        io.execute(() -> {
            try (InputStream input = getContentResolver().openInputStream(uri)) {
                if (input == null) throw new IllegalArgumentException("تعذر فتح PNG.");
                File directory = new File(getFilesDir(), "skins");
                if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("تعذر إنشاء مجلد Skins.");
                File target = new File(directory, UUID.randomUUID() + ".png");
                try (FileOutputStream output = new FileOutputStream(target)) {
                    byte[] buffer = new byte[16 * 1024]; int read; long total = 0;
                    while ((read = input.read(buffer)) != -1) { total += read; if (total > 2 * 1024 * 1024) throw new IllegalArgumentException("حجم PNG يتجاوز 2 MB."); output.write(buffer, 0, read); }
                }
                android.graphics.BitmapFactory.Options options = new android.graphics.BitmapFactory.Options();
                options.inJustDecodeBounds = true;
                android.graphics.BitmapFactory.decodeFile(target.getAbsolutePath(), options);
                if (options.outWidth != 64 || (options.outHeight != 32 && options.outHeight != 64)) { target.delete(); throw new IllegalArgumentException("أبعاد Skin يجب أن تكون 64×64 أو 64×32."); }
                JSONObject row = new JSONObject().put("id", UUID.randomUUID().toString()).put("name", displayName(uri)).put("filePath", target.getAbsolutePath()).put("createdAt", System.currentTimeMillis());
                database.upsert("skins", row.toString());
                mainHandler.post(() -> { toast("تم حفظ PNG محليًا والتحقق من أبعاده."); render(); });
            } catch (Exception error) { mainHandler.post(() -> toast(safe(error))); }
        });
    }

    private String displayName(Uri uri) {
        try (android.database.Cursor cursor = getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) return cursor.getString(index);
            }
        } catch (Exception ignored) { }
        return "Minecraft Skin.png";
    }

    private void deleteSkin(JSONObject skin) {
        File file = new File(skin.optString("filePath", ""));
        if (file.isFile() && !file.delete()) { toast("تعذر حذف ملف Skin."); return; }
        database.remove("skins", skin.optString("id", ""));
        render();
    }

    private void exportBackup() {
        try {
            JSONObject entities = new JSONObject();
            for (String table : new String[]{"servers", "bots", "tasks", "task_history", "settings", "ai_config", "skins", "locations", "logs", "bot_states"}) entities.put(table, new JSONArray(database.readAll(table)));
            JSONObject backup = new JSONObject().put("format", "minebot-local-backup-v1").put("createdAt", System.currentTimeMillis()).put("entities", entities);
            pendingBackupJson = backup.toString();
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("application/json")
                    .putExtra(Intent.EXTRA_TITLE, "minebot-backup-" + System.currentTimeMillis() + ".json");
            startActivityForResult(intent, PICK_BACKUP);
        } catch (Exception ignored) { toast("تعذر تجهيز النسخة الاحتياطية."); }
    }

    private void writeBackup(Uri destination) {
        String content = pendingBackupJson;
        pendingBackupJson = "";
        if (content.isEmpty()) { toast("لا توجد نسخة احتياطية جاهزة للحفظ."); return; }
        io.execute(() -> {
            try (java.io.OutputStream output = getContentResolver().openOutputStream(destination, "wt")) {
                if (output == null) throw new IllegalStateException("تعذر فتح ملف النسخة الاحتياطية.");
                output.write(content.getBytes(StandardCharsets.UTF_8));
                output.flush();
                mainHandler.post(() -> toast("تم حفظ نسخة JSON في الموقع الذي اخترته."));
            } catch (Exception error) { mainHandler.post(() -> toast("تعذر كتابة النسخة الاحتياطية: " + safe(error))); }
        });
    }

    private LinearLayout bottomNav() {
        LinearLayout nav = new LinearLayout(this);
        nav.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        nav.setGravity(Gravity.CENTER);
        nav.setPadding(dp(7), dp(7), dp(7), dp(7));
        nav.setBackground(glassDrawable(BLUE, 25));
        nav.setElevation(dp(15));
        nav.setClipToOutline(true);
        String[][] items = {{"home", "home", "الرئيسية"}, {"bots", "bots", "البوتات"}, {"tasks", "tasks", "المهام"}, {"servers", "servers", "السيرفرات"}, {"settings", "settings", "الإعدادات"}};
        for (String[] item : items) {
            boolean active = tab.equals(item[0]) || ((tab.equals("bot-details") || tab.equals("inventory")) && item[0].equals("bots"))
                    || (tab.equals("server-details") && item[0].equals("servers"))
                    || (tab.equals("skins") && item[0].equals("settings"))
                    || ((tab.equals("planner") || tab.equals("task-types") || tab.equals("task-create")) && item[0].equals("tasks"));
            LinearLayout cell = new LinearLayout(this);
            cell.setOrientation(LinearLayout.VERTICAL);
            cell.setGravity(Gravity.CENTER);
            cell.setPadding(dp(3), dp(3), dp(3), dp(2));
            if (active) cell.setBackground(gradientDrawable(new int[]{Color.argb(205, 74, 47, 158), Color.argb(218, 19, 92, 155)}, CYAN));
            FrameLayout icon = new FrameLayout(this);
            if (active) icon.setBackground(glassDrawable(PURPLE, 12));
            icon.addView(new NavGlyph(this, item[1], active ? CYAN : MUTED), new FrameLayout.LayoutParams(dp(22), dp(22), Gravity.CENTER));
            cell.addView(icon, new LinearLayout.LayoutParams(dp(34), dp(30)));
            TextView label = text(item[2], 8, active ? TEXT : MUTED, active);
            label.setGravity(Gravity.CENTER);
            cell.addView(label, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(17)));
            cell.setContentDescription(item[2]);
            cell.setFocusable(true);
            nav.addView(cell, new LinearLayout.LayoutParams(0, dp(58), 1));
            cell.setOnClickListener(view -> { if (!tab.equals(item[0])) { tab = item[0]; render(); } });
            animatePress(cell);
        }
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.setMargins(dp(12), dp(4), dp(12), dp(7));
        nav.setLayoutParams(params);
        return nav;
    }

    private void horizontalChips(String[][] items, String selected, Consumer<String> onSelect) {
        HorizontalScrollView scroll = new HorizontalScrollView(this);
        scroll.setHorizontalScrollBarEnabled(false);
        scroll.setFillViewport(false);
        scroll.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        for (String[] item : items) {
            boolean active = item[0].equals(selected);
            TextView chip = text((active ? "◆  " : "") + item[1], 9, active ? TEXT : MUTED, active);
            chip.setGravity(Gravity.CENTER);
            chip.setLetterSpacing(0.02f);
            chip.setPadding(dp(15), dp(9), dp(15), dp(9));
            chip.setBackground(active ? gradientDrawable(new int[]{Color.rgb(126, 53, 226), Color.rgb(32, 110, 223), Color.rgb(17, 140, 185)}, CYAN) : glassDrawable(Color.rgb(53, 70, 123), 20));
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(42));
            params.setMargins(dp(3), 0, dp(3), 0);
            row.addView(chip, params);
            chip.setOnClickListener(view -> onSelect.accept(item[0]));
            animatePress(chip);
        }
        scroll.addView(row, new HorizontalScrollView.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        pageContent.addView(scroll, margin(0, 0, 0, 12));
    }

    private void animatePress(View view) {
        view.setOnTouchListener((target, event) -> {
            if (event.getAction() == android.view.MotionEvent.ACTION_DOWN) target.animate().scaleX(0.97f).scaleY(0.97f).setDuration(80).start();
            else if (event.getAction() == android.view.MotionEvent.ACTION_UP || event.getAction() == android.view.MotionEvent.ACTION_CANCEL) target.animate().scaleX(1f).scaleY(1f).setDuration(120).start();
            return false;
        });
    }

    private View progressBar(int progress, int accent) {
        int safe = Math.max(0, Math.min(100, progress));
        LinearLayout track = new LinearLayout(this);
        track.setOrientation(LinearLayout.HORIZONTAL);
        track.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        track.setBackground(rounded(Color.rgb(22, 29, 55), Color.rgb(40, 51, 91), dp(8)));
        track.setClipToOutline(true);
        View fill = new View(this);
        fill.setBackground(gradientDrawable(new int[]{accent, CYAN}, accent));
        LinearLayout.LayoutParams fillParams = new LinearLayout.LayoutParams(0, dp(7), Math.max(0.01f, safe));
        track.addView(fill, fillParams);
        View rest = new View(this);
        track.addView(rest, new LinearLayout.LayoutParams(0, dp(7), Math.max(0.01f, 100 - safe)));
        return track;
    }

    private void stepIndicator(int activeStep, int totalSteps, String label) {
        LinearLayout strip = new LinearLayout(this);
        strip.setGravity(Gravity.CENTER_VERTICAL);
        strip.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        for (int i = 1; i <= totalSteps; i++) {
            View segment = new View(this);
            segment.setBackground(i <= activeStep
                    ? gradientDrawable(new int[]{PURPLE, BLUE, CYAN}, CYAN)
                    : rounded(Color.rgb(17, 23, 47), Color.rgb(47, 62, 104), dp(12)));
            LinearLayout.LayoutParams segmentParams = new LinearLayout.LayoutParams(0, dp(5), 1f);
            segmentParams.setMargins(dp(3), 0, dp(3), 0);
            strip.addView(segment, segmentParams);
        }
        TextView caption = text("STEP " + activeStep + " / " + totalSteps + "   ·   " + label, 8, CYAN, true);
        caption.setLetterSpacing(0.04f);
        pageContent.addView(strip, margin(0, 0, 0, 6));
        pageContent.addView(caption, margin(0, 0, 0, 12));
    }

    private void addKeyValue(LinearLayout parent, String key, String value) {
        LinearLayout row = new LinearLayout(this);
        row.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        TextView keyView = text(key, 10, MUTED, false);
        TextView valueView = text(value == null || value.trim().isEmpty() ? "غير متاح" : value, 10, TEXT, true);
        valueView.setGravity(Gravity.LEFT | Gravity.CENTER_VERTICAL);
        row.addView(keyView, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        row.addView(valueView, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.3f));
        parent.addView(row, margin(0, 4, 0, 5));
        divider(parent);
    }

    private String dateLabel(long timestamp) {
        if (timestamp <= 0) return "غير متاح";
        java.text.DateFormat format = java.text.DateFormat.getDateTimeInstance(java.text.DateFormat.SHORT, java.text.DateFormat.SHORT, java.util.Locale.getDefault());
        return format.format(new java.util.Date(timestamp));
    }

    private void title(String heading, String subtitle) {
        FrameLayout panel = new FrameLayout(this);
        panel.setBackground(glassDrawable(PURPLE, 26));
        panel.setClipToOutline(true);
        panel.setElevation(dp(8));
        View glow = new View(this);
        GradientDrawable aura = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{Color.argb(65, 79, 104, 255), Color.argb(22, 33, 168, 255), Color.TRANSPARENT});
        aura.setCornerRadius(dp(30));
        glow.setBackground(aura);
        panel.addView(glow, new FrameLayout.LayoutParams(dp(118), ViewGroup.LayoutParams.MATCH_PARENT, Gravity.LEFT));

        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        row.setPadding(dp(14), dp(13), dp(14), dp(13));
        FrameLayout emblem = new FrameLayout(this);
        emblem.setBackground(gradientDrawable(new int[]{Color.rgb(58, 41, 128), Color.rgb(18, 89, 148)}, PURPLE));
        emblem.addView(new NavGlyph(this, routeGlyph(), CYAN), new FrameLayout.LayoutParams(dp(28), dp(28), Gravity.CENTER));
        row.addView(emblem, new LinearLayout.LayoutParams(dp(48), dp(48)));
        LinearLayout copy = new LinearLayout(this);
        copy.setOrientation(LinearLayout.VERTICAL);
        copy.setPadding(dp(12), 0, dp(12), 0);
        TextView overline = text("MINEBOT  /  " + routeCode(), 8, CYAN, true);
        overline.setLetterSpacing(0.12f);
        copy.addView(overline, margin(0, 0, 0, 3));
        TextView headingView = text(heading, 23, TEXT, true);
        headingView.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        copy.addView(headingView, margin(0, 0, 0, 2));
        TextView subtitleView = text(subtitle, 10, MUTED, false);
        subtitleView.setMaxLines(2);
        copy.addView(subtitleView, margin(0, 0, 0, 0));
        row.addView(copy, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        panel.addView(row, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        pageContent.addView(panel, margin(0, 0, 0, 14));
    }

    private String routeCode() {
        switch (tab) {
            case "welcome": return "BOOT SEQUENCE";
            case "home": return "COMMAND DECK";
            case "bots": case "bot-details": return "BOT NETWORK";
            case "inventory": return "LIVE INVENTORY";
            case "servers": case "server-details": return "SERVER GRID";
            case "task-types": case "task-create": return "MISSION BUILDER";
            case "tasks": return "MISSION CONTROL";
            case "planner": return "AI PLANNER";
            case "skins": return "LOCAL SKIN VAULT";
            case "logs": return "SYSTEM LOG";
            default: return "SYSTEM CONFIG";
        }
    }

    private String routeGlyph() {
        if (tab.equals("bots") || tab.equals("bot-details") || tab.equals("inventory")) return "bots";
        if (tab.equals("servers") || tab.equals("server-details")) return "servers";
        if (tab.equals("planner")) return "ai";
        if (tab.equals("tasks") || tab.equals("task-types") || tab.equals("task-create")) return "tasks";
        if (tab.equals("settings") || tab.equals("skins")) return "settings";
        return "home";
    }

    private void section(String value) {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        TextView mark = text("✦", 12, CYAN, true);
        mark.setGravity(Gravity.CENTER);
        row.addView(mark, new LinearLayout.LayoutParams(dp(22), dp(24)));
        TextView heading = text(value, 13, TEXT, true);
        row.addView(heading, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(24)));
        View line = new View(this);
        line.setBackground(new GradientDrawable(GradientDrawable.Orientation.RIGHT_LEFT,
                new int[]{Color.argb(170, 70, 219, 255), Color.argb(60, 126, 72, 255), Color.TRANSPARENT}));
        LinearLayout.LayoutParams lineParams = new LinearLayout.LayoutParams(0, dp(1), 1f);
        lineParams.setMargins(dp(10), 0, dp(6), 0);
        row.addView(line, lineParams);
        pageContent.addView(row, margin(1, 13, 1, 8));
    }

    private void empty(String heading, String description) {
        LinearLayout panel = card(SURFACE_RAISED, Color.rgb(82, 106, 183));
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        TextView emblem = text("◇", 28, CYAN, true);
        emblem.setGravity(Gravity.CENTER);
        emblem.setBackground(glassDrawable(BLUE, 16));
        row.addView(emblem, new LinearLayout.LayoutParams(dp(48), dp(48)));
        LinearLayout copy = new LinearLayout(this);
        copy.setOrientation(LinearLayout.VERTICAL);
        copy.setPadding(dp(12), 0, dp(12), 0);
        addText(copy, heading, 14, TEXT, true, 0, 4);
        addText(copy, description, 10, MUTED, false, 0, 0);
        row.addView(copy, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        panel.addView(row);
        pageContent.addView(panel, margin(0, 0, 0, 12));
    }

    private void note(String value) {
        LinearLayout panel = card(Color.argb(190, 11, 25, 48), CYAN);
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        TextView info = text("i", 12, CYAN, true);
        info.setGravity(Gravity.CENTER);
        info.setBackground(glassDrawable(CYAN, 13));
        row.addView(info, new LinearLayout.LayoutParams(dp(28), dp(28)));
        TextView message = text(value, 10, MUTED, false);
        message.setPadding(dp(9), 0, dp(9), 0);
        row.addView(message, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        panel.addView(row);
        pageContent.addView(panel, margin(0, 9, 0, 0));
    }

    private LinearLayout card(int color, int stroke) {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        panel.setPadding(dp(15), dp(12), dp(15), dp(15));
        int top = blend(color, Color.rgb(77, 113, 200), 0.10f);
        GradientDrawable background = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{top, color, Color.argb(Math.min(220, Color.alpha(color)), 8, 13, 34)});
        background.setCornerRadius(dp(22));
        background.setStroke(dp(1), withAlpha(stroke, 148));
        panel.setBackground(background);
        panel.setElevation(dp(8));
        panel.setClipToOutline(true);
        if (Build.VERSION.SDK_INT >= 28) {
            panel.setOutlineSpotShadowColor(withAlpha(stroke, 88));
            panel.setOutlineAmbientShadowColor(withAlpha(stroke, 42));
        }
        View edge = new View(this);
        edge.setBackground(new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,
                new int[]{withAlpha(stroke, 30), withAlpha(stroke, 185), withAlpha(CYAN, 100), Color.TRANSPARENT}));
        LinearLayout.LayoutParams edgeParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(2));
        edgeParams.setMargins(0, 0, 0, dp(9));
        panel.addView(edge, edgeParams);
        return panel;
    }

    private LinearLayout card(int[] gradient, int stroke) {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        panel.setPadding(dp(17), dp(12), dp(17), dp(16));
        GradientDrawable background = new GradientDrawable(GradientDrawable.Orientation.TL_BR, gradient);
        background.setCornerRadius(dp(24));
        background.setStroke(dp(1), withAlpha(stroke, 190));
        panel.setBackground(background);
        panel.setElevation(dp(9));
        panel.setClipToOutline(true);
        if (Build.VERSION.SDK_INT >= 28) panel.setOutlineSpotShadowColor(withAlpha(stroke, 90));
        View edge = new View(this);
        edge.setBackground(new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,
                new int[]{withAlpha(stroke, 30), withAlpha(stroke, 190), withAlpha(CYAN, 120), Color.TRANSPARENT}));
        LinearLayout.LayoutParams edgeParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(2));
        edgeParams.setMargins(0, 0, 0, dp(9));
        panel.addView(edge, edgeParams);
        return panel;
    }

    private GradientDrawable glassDrawable(int accent, float radiusDp) {
        GradientDrawable background = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{Color.argb(226, 28, 33, 75), Color.argb(212, 11, 16, 39), Color.argb(224, 15, 22, 50)});
        background.setCornerRadius(dp(radiusDp));
        background.setStroke(dp(1), withAlpha(accent, 170));
        return background;
    }

    private int withAlpha(int color, int alpha) {
        return Color.argb(Math.max(0, Math.min(255, alpha)), Color.red(color), Color.green(color), Color.blue(color));
    }

    private int blend(int base, int tint, float amount) {
        float p = Math.max(0f, Math.min(1f, amount));
        return Color.argb(Color.alpha(base),
                Math.round(Color.red(base) * (1f - p) + Color.red(tint) * p),
                Math.round(Color.green(base) * (1f - p) + Color.green(tint) * p),
                Math.round(Color.blue(base) * (1f - p) + Color.blue(tint) * p));
    }

    private GradientDrawable rounded(int color, int stroke, int radius) {
        GradientDrawable background = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{blend(color, Color.rgb(64, 80, 140), 0.11f), color});
        background.setCornerRadius(radius);
        background.setStroke(dp(1), withAlpha(stroke, 165));
        return background;
    }

    private TextView text(String value, int size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value); view.setTextSize(size); view.setTextColor(color); view.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
        view.setTypeface(Typeface.create("sans-serif", bold ? Typeface.BOLD : Typeface.NORMAL));
        view.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        view.setIncludeFontPadding(true);
        return view;
    }

    private TextView label(String value, int size, int color, boolean bold) { return text(value, size, color, bold); }

    private void addText(LinearLayout parent, String value, int size, int color, boolean bold, int top, int bottom) {
        parent.addView(text(value, size, color, bold), margin(0, top, 0, bottom));
    }

    private TextView pill(String value, int color) {
        TextView badge = text(value, 8, color, true);
        badge.setGravity(Gravity.CENTER);
        badge.setLetterSpacing(0.055f);
        badge.setPadding(dp(10), dp(7), dp(10), dp(7));
        badge.setBackground(rounded(Color.argb(165, 15, 24, 52), color, dp(18)));
        badge.setElevation(dp(2));
        return badge;
    }

    private void rowTitle(LinearLayout parent, String name, String status) {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        View pip = new View(this);
        pip.setBackground(rounded(statusColor(status), statusColor(status), dp(5)));
        row.addView(pip, new LinearLayout.LayoutParams(dp(7), dp(7)));
        TextView title = text(name, 14, TEXT, true);
        title.setPadding(dp(8), 0, dp(8), 0);
        row.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        row.addView(pill(status, statusColor(status)));
        parent.addView(row, margin(0, 0, 0, 6));
    }

    private void addQuickAction(GridLayout grid, String glyph, String index, String heading, String subtitle, Runnable action, int accent) {
        LinearLayout tile = card(SURFACE_RAISED, accent);
        tile.setMinimumHeight(dp(122));
        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        FrameLayout icon = new FrameLayout(this);
        icon.setBackground(gradientDrawable(new int[]{Color.rgb(47, 43, 115), Color.rgb(18, 74, 125)}, accent));
        String iconKind = glyph.equals("ai") ? "ai" : glyph;
        icon.addView(new NavGlyph(this, iconKind, accent), new FrameLayout.LayoutParams(dp(23), dp(23), Gravity.CENTER));
        top.addView(icon, new LinearLayout.LayoutParams(dp(39), dp(39)));
        TextView serial = text(index, 8, accent, true);
        serial.setGravity(Gravity.CENTER);
        serial.setLetterSpacing(0.08f);
        LinearLayout.LayoutParams serialParams = new LinearLayout.LayoutParams(dp(29), dp(27));
        serialParams.setMargins(dp(5), 0, 0, 0);
        top.addView(serial, serialParams);
        tile.addView(top, margin(0, 0, 0, 7));
        addText(tile, heading, 12, TEXT, true, 0, 2);
        addText(tile, subtitle, 9, MUTED, false, 0, 0);
        tile.setOnClickListener(view -> action.run());
        tile.setFocusable(true);
        animatePress(tile);
        GridLayout.LayoutParams params = new GridLayout.LayoutParams(GridLayout.spec(GridLayout.UNDEFINED), GridLayout.spec(GridLayout.UNDEFINED, 1f));
        params.width = 0;
        params.height = dp(122);
        params.setMargins(dp(4), dp(4), dp(4), dp(4));
        grid.addView(tile, params);
    }

    private void actionRow(LinearLayout parent, String number, String title, String subtitle, Runnable action, int accent) {
        LinearLayout row = new LinearLayout(this); row.setGravity(Gravity.CENTER_VERTICAL); row.setLayoutDirection(View.LAYOUT_DIRECTION_RTL); row.setPadding(0, dp(9), 0, dp(9));
        TextView numberView = text(number, 12, accent, true); numberView.setGravity(Gravity.CENTER); numberView.setBackground(rounded(Color.rgb(29, 31, 61), accent, dp(14)));
        row.addView(numberView, new LinearLayout.LayoutParams(dp(42), dp(42)));
        LinearLayout copy = new LinearLayout(this); copy.setOrientation(LinearLayout.VERTICAL); copy.setPadding(dp(11), 0, dp(8), 0);
        addText(copy, title, 13, TEXT, true, 0, 2); addText(copy, subtitle, 10, MUTED, false, 0, 0);
        row.addView(copy, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        TextView go = text("‹", 25, accent, true); go.setGravity(Gravity.CENTER); row.addView(go, new LinearLayout.LayoutParams(dp(24), dp(38)));
        row.setOnClickListener(view -> action.run()); parent.addView(row);
    }

    private void divider(LinearLayout parent) {
        View line = new View(this);
        line.setBackground(new GradientDrawable(GradientDrawable.Orientation.RIGHT_LEFT,
                new int[]{Color.argb(132, 74, 206, 255), Color.argb(54, 94, 86, 196), Color.TRANSPARENT}));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1));
        params.setMargins(0, dp(3), 0, dp(3));
        parent.addView(line, params);
    }

    private View statCard(String name, String value, int accent) {
        LinearLayout panel = card(SURFACE_RAISED, accent);
        addText(panel, name.toUpperCase(java.util.Locale.ROOT), 8, MUTED, true, 0, 3);
        TextView count = text(value, 24, accent, true);
        count.setLetterSpacing(0.025f);
        panel.addView(count, margin(0, 0, 0, 1));
        return panel;
    }

    private void button(LinearLayout parent, String label, boolean primary, Runnable action) {
        TextView control = text(label, 12, TEXT, true);
        control.setGravity(Gravity.CENTER);
        control.setPadding(dp(14), dp(14), dp(14), dp(14));
        control.setMinHeight(dp(50));
        control.setBackground(new RippleDrawable(ColorStateList.valueOf(Color.argb(65, 89, 218, 255)),
                primary ? gradientDrawable(new int[]{Color.rgb(132, 62, 245), Color.rgb(47, 119, 247), Color.rgb(31, 171, 224)}, CYAN)
                        : glassDrawable(BLUE, 18), null));
        control.setClickable(true);
        control.setFocusable(true);
        control.setOnClickListener(view -> action.run());
        animatePress(control);
        parent.addView(control, margin(0, 5, 0, 7));
    }

    private GradientDrawable gradientDrawable(int[] colors, int stroke) {
        GradientDrawable shape = new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, colors);
        shape.setCornerRadius(dp(18));
        shape.setStroke(dp(1), withAlpha(stroke, 208));
        return shape;
    }

    private TextView smallButton(String label, Runnable action, boolean primary) {
        TextView control = text(label, 9, primary ? TEXT : MUTED, true);
        control.setGravity(Gravity.CENTER);
        control.setPadding(dp(8), dp(11), dp(8), dp(11));
        control.setMinHeight(dp(42));
        control.setBackground(new RippleDrawable(ColorStateList.valueOf(Color.argb(55, 105, 190, 255)),
                primary ? gradientDrawable(new int[]{Color.rgb(101, 51, 211), Color.rgb(26, 111, 206)}, PURPLE)
                        : glassDrawable(Color.rgb(70, 95, 160), 14), null));
        control.setOnClickListener(view -> action.run());
        control.setFocusable(true);
        animatePress(control);
        return control;
    }

    private EditText field(String hint) {
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setTextSize(13);
        input.setTextColor(TEXT);
        input.setHintTextColor(Color.rgb(124, 143, 185));
        input.setHint(hint);
        input.setPadding(dp(15), dp(11), dp(15), dp(11));
        input.setMinHeight(dp(50));
        input.setBackground(glassDrawable(BLUE, 16));
        input.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        input.setTextDirection(View.TEXT_DIRECTION_FIRST_STRONG_RTL);
        input.setHighlightColor(Color.argb(120, 77, 215, 255));
        return input;
    }

    private Spinner spinner() {
        Spinner spinner = new Spinner(this);
        spinner.setPadding(dp(12), dp(4), dp(12), dp(4));
        spinner.setMinimumHeight(dp(48));
        spinner.setBackground(glassDrawable(PURPLE, 16));
        spinner.setPopupBackgroundDrawable(glassDrawable(BLUE, 15));
        return spinner;
    }

    private ArrayAdapter<String> neonAdapter(List<String> values) {
        return new ArrayAdapter<String>(this, android.R.layout.simple_spinner_item, values) {
            private TextView style(View view, boolean dropdown) {
                TextView label = (TextView) view;
                label.setTextColor(TEXT);
                label.setTextSize(12);
                label.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
                label.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
                label.setPadding(dp(13), dp(10), dp(13), dp(10));
                if (dropdown) label.setBackgroundColor(Color.rgb(16, 22, 49));
                return label;
            }
            @Override public View getView(int position, View convertView, ViewGroup parent) {
                return style(super.getView(position, convertView, parent), false);
            }
            @Override public View getDropDownView(int position, View convertView, ViewGroup parent) {
                return style(super.getDropDownView(position, convertView, parent), true);
            }
        };
    }

    private LinearLayout form(View... fields) {
        LinearLayout form = new LinearLayout(this); form.setOrientation(LinearLayout.VERTICAL); form.setLayoutDirection(View.LAYOUT_DIRECTION_RTL); form.setPadding(dp(20), dp(8), dp(20), dp(6));
        for (View field : fields) addFormField(form, "", field);
        return form;
    }

    private void addFormField(LinearLayout form, String label, View field) {
        if (!label.isEmpty()) addText(form, label, 11, MUTED, true, 4, 2);
        form.addView(field, margin(0, 3, 0, 8));
    }

    private void toast(String message) { Toast.makeText(this, message == null ? "تعذر تنفيذ العملية." : message, Toast.LENGTH_LONG).show(); }

    private void showMicrosoftCode(JSONObject event) {
        String code = event.optString("userCode", "");
        String url = event.optString("verificationUri", "https://microsoft.com/devicelogin");
        LinearLayout view = form();
        addText(view, "افتح صفحة Microsoft الرسمية وأدخل رمز الجهاز التالي:", 13, TEXT, false, 0, 10);
        TextView codeText = text(code, 24, BLUE, true); codeText.setGravity(Gravity.CENTER); view.addView(codeText, margin(0, 0, 0, 10));
        addText(view, "لا تشارك الرمز مع أي شخص. سينتهي في " + event.optLong("expiresAt"), 11, MUTED, false, 0, 0);
        new AlertDialog.Builder(this).setTitle("تسجيل دخول Microsoft")
                .setView(view)
                .setNegativeButton("إغلاق", null)
                .setPositiveButton("فتح صفحة التحقق", (dialog, which) -> {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
                    catch (Exception ignored) { toast("انسخ الرمز وافتح صفحة تسجيل الدخول من متصفح النظام."); }
                }).show();
    }

    private boolean settingEnabled(String id) {
        JSONObject setting = find("settings", id);
        return setting != null && setting.optBoolean("enabled", false);
    }

    private void saveSetting(String id, boolean enabled) {
        try {
            JSONObject row = new JSONObject().put("id", id).put("enabled", enabled).put("updatedAt", System.currentTimeMillis());
            database.upsert("settings", row.toString());
        } catch (JSONException error) { toast("تعذر حفظ الإعداد محليًا."); }
    }

    private void hideKeyboard(View view) {
        try {
            android.view.inputmethod.InputMethodManager manager = (android.view.inputmethod.InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
            if (manager != null) manager.hideSoftInputFromWindow(view.getWindowToken(), 0);
        } catch (Exception ignored) { }
        view.clearFocus();
    }

    private JSONArray records(String table) {
        try { return new JSONArray(database.readAll(table)); }
        catch (JSONException ignored) { return new JSONArray(); }
    }

    private JSONObject find(String table, String id) {
        JSONArray rows = records(table);
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row != null && id.equals(row.optString("id", ""))) return row;
        }
        return null;
    }

    private List<JSONObject> toList(JSONArray values) {
        ArrayList<JSONObject> result = new ArrayList<>();
        for (int i = 0; i < values.length(); i++) { JSONObject item = values.optJSONObject(i); if (item != null) result.add(item); }
        return result;
    }

    private List<JSONObject> sorted(JSONArray values) {
        List<JSONObject> rows = toList(values);
        rows.sort(Comparator.comparingLong((JSONObject value) -> value.optLong("createdAt", value.optLong("updatedAt", 0))).reversed());
        return rows;
    }

    private List<String> botNames(List<JSONObject> bots) {
        ArrayList<String> names = new ArrayList<>();
        for (JSONObject bot : bots) names.add(bot.optString("name", bot.optString("username", "Bot")) + " · " + bot.optString("username", ""));
        return names;
    }

    private String botName(String id) { JSONObject bot = find("bots", id); return bot == null ? "غير معيّن" : bot.optString("name", bot.optString("username")); }

    private boolean isLiveBot(JSONObject state) {
        if (state == null || !"ONLINE".equals(state.optString("status")) || !"bot_snapshot".equals(state.optString("type"))) return false;
        long observedAt = state.optLong("observedAt", 0);
        long age = System.currentTimeMillis() - observedAt;
        return observedAt > 0 && age >= 0 && age <= 15_000L;
    }

    private boolean isTransientStatus(String status) {
        return "CONNECTING".equals(status) || "AUTHENTICATING".equals(status) || "JOINING".equals(status) || "RECONNECTING".equals(status) || "DEAD".equals(status);
    }

    private boolean isRecentBotTransition(JSONObject state) {
        if (state == null) return false;
        long eventAt = state.optLong("at", state.optLong("updatedAt", 0));
        long age = System.currentTimeMillis() - eventAt;
        return eventAt > 0 && age >= 0 && age <= 60_000L;
    }

    private String serverStatusLabel(String status) {
        if ("status_reachable".equals(status)) return "SERVER REACHABLE";
        if ("status_failed".equals(status)) return "PING FAILED";
        return "NOT TESTED";
    }

    private int statusColor(String status) {
        String normalized = String.valueOf(status).toUpperCase(java.util.Locale.ROOT);
        if (normalized.equals("ONLINE") || normalized.equals("COMPLETED") || normalized.equals("SERVER REACHABLE") || normalized.startsWith("PING OK")) return GREEN;
        if (normalized.equals("FAILED") || normalized.equals("ERROR") || normalized.equals("PING FAILED")) return RED;
        if (normalized.equals("CONNECTING") || normalized.equals("AUTHENTICATING") || normalized.equals("JOINING") || normalized.equals("RECONNECTING") || normalized.equals("RUNNING")) return AMBER;
        if (normalized.equals("DEAD")) return RED;
        return MUTED;
    }

    private String statusLabel(String status) {
        switch (String.valueOf(status).toUpperCase(java.util.Locale.ROOT)) {
            case "ONLINE": return "IN WORLD";
            case "CONNECTING": return "CONNECTING";
            case "AUTHENTICATING": return "AUTHENTICATING";
            case "JOINING": return "JOINING";
            case "RECONNECTING": return "RECONNECTING";
            case "DEAD": return "DEAD";
            case "FAILED": return "CONNECTION FAILED";
            case "DISCONNECTED": return "DISCONNECTED";
            case "STALE": return "STALE · NOT VERIFIED";
            default: return "UNVERIFIED";
        }
    }

    private String formatPosition(JSONObject position) {
        if (position == null || !position.has("x") || !position.has("y") || !position.has("z")) return "غير متاح";
        double x = position.optDouble("x", Double.NaN);
        double y = position.optDouble("y", Double.NaN);
        double z = position.optDouble("z", Double.NaN);
        if (!Double.isFinite(x) || !Double.isFinite(y) || !Double.isFinite(z)) return "غير متاح";
        return String.format(java.util.Locale.US, "%.1f %.1f %.1f", x, y, z);
    }

    private JSONObject command(String action, String botId) {
        JSONObject value = new JSONObject();
        try { value.put("action", action).put("botId", botId); } catch (JSONException ignored) { }
        return value;
    }

    private LinearLayout.LayoutParams margin(int left, int top, int right, int bottom) {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT) {{ setMargins(dp(left), dp(top), dp(right), dp(bottom)); }};
    }

    private LinearLayout.LayoutParams weightMargin() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        params.setMargins(dp(3), 0, dp(3), 0); return params;
    }

    private int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private final class VoxelBlockGlyph extends View {
        private final int accent;
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

        VoxelBlockGlyph(Context context, int accent) { super(context); this.accent = accent; }

        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float size = Math.min(getWidth(), getHeight()) * .78f;
            float cx = getWidth() / 2f;
            float cy = getHeight() / 2f + size * .03f;
            float dx = size * .34f;
            float dy = size * .18f;
            float halfHeight = size * .26f;
            Path top = new Path();
            top.moveTo(cx, cy - halfHeight);
            top.lineTo(cx + dx, cy - dy);
            top.lineTo(cx, cy + dy * .08f);
            top.lineTo(cx - dx, cy - dy);
            top.close();
            Path left = new Path();
            left.moveTo(cx - dx, cy - dy);
            left.lineTo(cx, cy + dy * .08f);
            left.lineTo(cx, cy + halfHeight);
            left.lineTo(cx - dx, cy + dy * 1.52f);
            left.close();
            Path right = new Path();
            right.moveTo(cx + dx, cy - dy);
            right.lineTo(cx, cy + dy * .08f);
            right.lineTo(cx, cy + halfHeight);
            right.lineTo(cx + dx, cy + dy * 1.52f);
            right.close();
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(withAlpha(accent, 78)); canvas.drawPath(left, paint);
            paint.setColor(withAlpha(accent, 112)); canvas.drawPath(right, paint);
            paint.setColor(withAlpha(CYAN, 76)); canvas.drawPath(top, paint);
            paint.setStyle(Paint.Style.STROKE);
            paint.setColor(accent);
            paint.setStrokeWidth(dp(1.35f));
            paint.setStrokeJoin(Paint.Join.ROUND);
            paint.setStrokeCap(Paint.Cap.ROUND);
            canvas.drawPath(top, paint); canvas.drawPath(left, paint); canvas.drawPath(right, paint);
            paint.setColor(withAlpha(TEXT, 130));
            paint.setStrokeWidth(dp(0.8f));
            canvas.drawLine(cx - dx * .47f, cy - dy * .38f, cx - dx * .05f, cy - dy * .13f, paint);
            canvas.drawLine(cx + dx * .46f, cy - dy * .36f, cx + dx * .06f, cy - dy * .11f, paint);
        }
    }

    private final class TaskGlyphView extends View {
        private final String kind;
        private final int accent;
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

        TaskGlyphView(Context context, String kind, int accent) {
            super(context);
            this.kind = kind;
            this.accent = accent;
            setContentDescription(kind);
        }

        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float size = Math.min(getWidth(), getHeight()) * .76f;
            float cx = getWidth() / 2f;
            float cy = getHeight() / 2f;
            float l = cx - size * .46f, r = cx + size * .46f;
            float t = cy - size * .46f, b = cy + size * .46f;
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(withAlpha(accent, 18));
            canvas.drawCircle(cx, cy, size * .5f, paint);
            paint.setStyle(Paint.Style.STROKE);
            paint.setColor(accent);
            paint.setStrokeWidth(dp(1.7f));
            paint.setStrokeCap(Paint.Cap.ROUND);
            paint.setStrokeJoin(Paint.Join.ROUND);
            Path path = new Path();
            switch (kind) {
                case "collect":
                    canvas.drawLine(cx, cy + size * .35f, cx, cy - size * .04f, paint);
                    canvas.drawLine(cx - size * .26f, cy + size * .11f, cx + size * .27f, cy + size * .11f, paint);
                    canvas.drawLine(cx - size * .19f, cy - size * .12f, cx + size * .19f, cy - size * .12f, paint);
                    canvas.drawRoundRect(new RectF(cx - size * .24f, cy - size * .4f, cx + size * .24f, cy - size * .09f), dp(5), dp(5), paint);
                    canvas.drawRect(cx - size * .34f, cy - size * .31f, cx - size * .2f, cy - size * .16f, paint);
                    canvas.drawRect(cx + size * .2f, cy - size * .31f, cx + size * .34f, cy - size * .16f, paint);
                    break;
                case "mining":
                    path.moveTo(cx - size * .4f, cy - size * .24f); path.lineTo(cx - size * .05f, cy - size * .4f);
                    path.lineTo(cx + size * .39f, cy - size * .25f); path.lineTo(cx + size * .2f, cy - size * .07f);
                    path.moveTo(cx - size * .05f, cy - size * .4f); path.lineTo(cx + size * .13f, cy + size * .4f);
                    canvas.drawPath(path, paint);
                    break;
                case "building": case "storage":
                    drawCube(canvas, cx, cy, size * .78f);
                    if (kind.equals("storage")) {
                        canvas.drawLine(cx - size * .28f, cy - size * .02f, cx + size * .28f, cy - size * .02f, paint);
                        canvas.drawRect(cx - size * .07f, cy - size * .07f, cx + size * .07f, cy + size * .08f, paint);
                    }
                    break;
                case "protection":
                    path.moveTo(cx, t); path.lineTo(r, cy - size * .22f); path.lineTo(cx + size * .32f, b - size * .12f);
                    path.lineTo(cx, b); path.lineTo(cx - size * .32f, b - size * .12f); path.lineTo(l, cy - size * .22f); path.close();
                    canvas.drawPath(path, paint);
                    break;
                case "farming":
                    canvas.drawLine(cx, b, cx, t + size * .05f, paint);
                    path.moveTo(cx, cy + size * .03f); path.quadTo(cx - size * .42f, cy - size * .38f, cx - size * .35f, cy + size * .03f); path.quadTo(cx - size * .12f, cy + size * .16f, cx, cy + size * .03f);
                    canvas.drawPath(path, paint);
                    path.reset(); path.moveTo(cx, cy - size * .12f); path.quadTo(cx + size * .42f, cy - size * .5f, cx + size * .34f, cy - size * .1f); path.quadTo(cx + size * .13f, cy + size * .04f, cx, cy - size * .12f);
                    canvas.drawPath(path, paint);
                    break;
                case "exploration":
                    canvas.drawCircle(cx, cy, size * .4f, paint);
                    path.moveTo(cx, t + size * .12f); path.lineTo(cx + size * .13f, cy + size * .12f); path.lineTo(cx - size * .1f, cy + size * .04f); path.close();
                    canvas.drawPath(path, paint);
                    break;
                case "follow":
                    canvas.drawCircle(cx, cy, size * .4f, paint); canvas.drawCircle(cx, cy, size * .21f, paint); canvas.drawCircle(cx, cy, size * .05f, paint);
                    break;
                case "combat":
                    canvas.drawLine(l + size * .08f, t + size * .08f, r - size * .08f, b - size * .08f, paint);
                    canvas.drawLine(r - size * .08f, t + size * .08f, l + size * .08f, b - size * .08f, paint);
                    canvas.drawLine(cx - size * .12f, cy - size * .12f, cx - size * .28f, cy - size * .28f, paint);
                    canvas.drawLine(cx + size * .12f, cy - size * .12f, cx + size * .28f, cy - size * .28f, paint);
                    break;
                case "crafting":
                    canvas.drawLine(cx - size * .25f, b - size * .04f, cx + size * .25f, t + size * .15f, paint);
                    canvas.drawLine(cx - size * .18f, t + size * .13f, cx + size * .06f, t + size * .31f, paint);
                    canvas.drawLine(cx - size * .34f, t + size * .32f, cx - size * .13f, t + size * .03f, paint);
                    break;
                case "transport":
                    canvas.drawLine(l + size * .05f, cy - size * .15f, r - size * .07f, cy - size * .15f, paint);
                    canvas.drawLine(r - size * .22f, cy - size * .3f, r - size * .06f, cy - size * .15f, paint);
                    canvas.drawLine(r - size * .22f, cy, r - size * .06f, cy - size * .15f, paint);
                    canvas.drawLine(r - size * .05f, cy + size * .16f, l + size * .07f, cy + size * .16f, paint);
                    canvas.drawLine(l + size * .22f, cy + size * .31f, l + size * .06f, cy + size * .16f, paint);
                    canvas.drawLine(l + size * .22f, cy, l + size * .06f, cy + size * .16f, paint);
                    break;
                case "survival":
                    path.moveTo(cx, b - size * .03f); path.cubicTo(l - size * .1f, cy + size * .12f, l, t - size * .08f, cx, cy - size * .16f);
                    path.cubicTo(r, t - size * .08f, r + size * .1f, cy + size * .12f, cx, b - size * .03f); canvas.drawPath(path, paint);
                    break;
                case "ai":
                    for (int i = 0; i < 10; i++) {
                        double angle = -Math.PI / 2 + i * Math.PI / 5;
                        float radius = size * (i % 2 == 0 ? .46f : .19f);
                        float x = (float) (cx + Math.cos(angle) * radius);
                        float y = (float) (cy + Math.sin(angle) * radius);
                        if (i == 0) path.moveTo(x, y); else path.lineTo(x, y);
                    }
                    path.close(); canvas.drawPath(path, paint);
                    break;
                default:
                    drawCube(canvas, cx, cy, size * .78f);
                    break;
            }
        }

        private void drawCube(Canvas canvas, float cx, float cy, float size) {
            float dx = size * .36f, dy = size * .2f, h = size * .25f;
            Path p = new Path();
            p.moveTo(cx, cy - h); p.lineTo(cx + dx, cy - dy); p.lineTo(cx, cy); p.lineTo(cx - dx, cy - dy); p.close();
            canvas.drawPath(p, paint);
            p.reset(); p.moveTo(cx - dx, cy - dy); p.lineTo(cx, cy); p.lineTo(cx, cy + h); p.lineTo(cx - dx, cy + dy * 1.5f); p.close();
            canvas.drawPath(p, paint);
            p.reset(); p.moveTo(cx + dx, cy - dy); p.lineTo(cx, cy); p.lineTo(cx, cy + h); p.lineTo(cx + dx, cy + dy * 1.5f); p.close();
            canvas.drawPath(p, paint);
        }
    }

    private final class NeonBackdrop extends Drawable {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint grid = new Paint(Paint.ANTI_ALIAS_FLAG);
        private int opacity = 255;
        private ColorFilter colorFilter;

        @Override public void draw(Canvas canvas) {
            android.graphics.Rect bounds = getBounds();
            float width = bounds.width();
            float height = bounds.height();
            if (width <= 0 || height <= 0) return;
            paint.setAlpha(opacity);
            paint.setColorFilter(colorFilter);
            paint.setShader(new LinearGradient(bounds.left, bounds.top, bounds.right, bounds.bottom,
                    new int[]{Color.rgb(12, 10, 37), BG, Color.rgb(5, 19, 42)}, null, Shader.TileMode.CLAMP));
            canvas.drawRect(bounds, paint);
            paint.setShader(new RadialGradient(bounds.left + width * 0.93f, bounds.top + height * 0.13f,
                    Math.max(width, height) * 0.68f,
                    new int[]{Color.argb(76, 103, 51, 227), Color.argb(0, 103, 51, 227)}, null, Shader.TileMode.CLAMP));
            canvas.drawRect(bounds, paint);
            paint.setShader(new RadialGradient(bounds.left + width * 0.07f, bounds.top + height * 0.69f,
                    Math.max(width, height) * 0.72f,
                    new int[]{Color.argb(47, 20, 136, 234), Color.argb(0, 20, 136, 234)}, null, Shader.TileMode.CLAMP));
            canvas.drawRect(bounds, paint);
            paint.setShader(null);
            grid.setColor(Color.argb(9, 78, 206, 255));
            grid.setStrokeWidth(dp(0.65f));
            grid.setStyle(Paint.Style.STROKE);
            float step = dp(48);
            for (float x = bounds.left; x <= bounds.right; x += step) canvas.drawLine(x, bounds.top + height * .68f, x, bounds.bottom, grid);
            for (float y = bounds.top + height * .70f; y <= bounds.bottom; y += step) canvas.drawLine(bounds.left, y, bounds.right, y, grid);
            grid.setStyle(Paint.Style.FILL);
            paint.setAlpha(255);
            paint.setColorFilter(null);
        }

        @Override public void setAlpha(int alpha) { opacity = alpha; invalidateSelf(); }
        @Override public void setColorFilter(ColorFilter filter) { colorFilter = filter; invalidateSelf(); }
        @Override public int getOpacity() { return PixelFormat.TRANSLUCENT; }
    }

    private final class NavGlyph extends View {
        private final String kind;
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

        NavGlyph(Context context, String kind, int color) {
            super(context);
            this.kind = kind;
            paint.setColor(color);
            paint.setStrokeWidth(dp(1.7f));
            paint.setStrokeCap(Paint.Cap.ROUND);
            paint.setStrokeJoin(Paint.Join.ROUND);
            paint.setStyle(Paint.Style.STROKE);
            setContentDescription(kind);
            setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        }

        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float width = getWidth(), height = getHeight();
            float size = Math.min(width, height) * 0.78f;
            float cx = width / 2f, cy = height / 2f;
            float l = cx - size / 2f, r = cx + size / 2f, t = cy - size / 2f, b = cy + size / 2f;
            Path path = new Path();
            switch (kind) {
                case "home":
                    path.moveTo(l + size * .08f, cy - size * .05f); path.lineTo(cx, t + size * .02f); path.lineTo(r - size * .08f, cy - size * .05f);
                    canvas.drawPath(path, paint);
                    canvas.drawRoundRect(new RectF(l + size * .19f, cy - size * .08f, r - size * .19f, b - size * .03f), dp(3), dp(3), paint);
                    canvas.drawLine(cx, b - size * .03f, cx, cy + size * .18f, paint);
                    break;
                case "servers":
                    canvas.drawRoundRect(new RectF(l + size * .08f, t + size * .08f, r - size * .08f, t + size * .36f), dp(3), dp(3), paint);
                    canvas.drawRoundRect(new RectF(l + size * .08f, cy - size * .13f, r - size * .08f, cy + size * .13f), dp(3), dp(3), paint);
                    canvas.drawRoundRect(new RectF(l + size * .08f, b - size * .36f, r - size * .08f, b - size * .08f), dp(3), dp(3), paint);
                    canvas.drawCircle(l + size * .22f, t + size * .22f, dp(1), paint);
                    break;
                case "bots":
                    canvas.drawCircle(cx, t + size * .31f, size * .19f, paint);
                    canvas.drawRoundRect(new RectF(l + size * .14f, cy + size * .03f, r - size * .14f, b - size * .04f), size * .22f, size * .22f, paint);
                    canvas.drawLine(cx, t + size * .12f, cx, t - size * .01f, paint);
                    canvas.drawCircle(cx, t, dp(1.4f), paint);
                    break;
                case "tasks":
                    canvas.drawRoundRect(new RectF(l + size * .11f, t + size * .04f, r - size * .11f, b - size * .04f), dp(3), dp(3), paint);
                    for (int i = 0; i < 3; i++) {
                        float y = t + size * (.28f + i * .23f);
                        canvas.drawCircle(l + size * .27f, y, dp(1.1f), paint);
                        canvas.drawLine(l + size * .4f, y, r - size * .23f, y, paint);
                    }
                    break;
                case "ai":
                    Path star = new Path();
                    for (int i = 0; i < 10; i++) {
                        double angle = -Math.PI / 2 + i * Math.PI / 5;
                        float radius = size * (i % 2 == 0 ? .48f : .19f);
                        float x = (float) (cx + Math.cos(angle) * radius);
                        float y = (float) (cy + Math.sin(angle) * radius);
                        if (i == 0) star.moveTo(x, y); else star.lineTo(x, y);
                    }
                    star.close();
                    canvas.drawPath(star, paint);
                    break;
                default:
                    canvas.drawCircle(cx, cy, size * .19f, paint);
                    canvas.drawCircle(cx, cy, size * .43f, paint);
                    for (int i = 0; i < 8; i++) {
                        double angle = i * Math.PI / 4;
                        float x1 = (float) (cx + Math.cos(angle) * size * .43f);
                        float y1 = (float) (cy + Math.sin(angle) * size * .43f);
                        float x2 = (float) (cx + Math.cos(angle) * size * .53f);
                        float y2 = (float) (cy + Math.sin(angle) * size * .53f);
                        canvas.drawLine(x1, y1, x2, y2, paint);
                    }
                    break;
            }
        }
    }

    private static String safe(Exception error) {
        String message = error == null ? "تعذر تنفيذ العملية." : error.getMessage();
        if (message == null || message.trim().isEmpty()) return "تعذر تنفيذ العملية.";
        String sanitized = message.replaceAll("(?i)(access[_ -]?token|refresh[_ -]?token|authorization|bearer)\\s*[:=]?\\s*[^\\s,;]+", "$1=[مخفي]")
                .replaceAll("sk-or-[^\\s\"'<>]+", "[مفتاح مخفي]")
                .replaceAll("[\\r\\n\\u0000-\\u001f]", " ").trim();
        return sanitized.length() > 320 ? sanitized.substring(0, 320) : sanitized;
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_SKIN && resultCode == RESULT_OK && data != null && data.getData() != null) savePickedSkin(data.getData());
        else if (requestCode == PICK_BACKUP && resultCode == RESULT_OK && data != null && data.getData() != null) writeBackup(data.getData());
        else if (requestCode == PICK_BACKUP) pendingBackupJson = "";
    }

    @Override public void onBackPressed() {
        if (tab.equals("welcome")) { getPreferences(MODE_PRIVATE).edit().putBoolean("welcome_seen", true).apply(); tab = "home"; render(); }
        else if (tab.equals("bot-details")) { tab = "bots"; render(); }
        else if (tab.equals("inventory")) { tab = "bot-details"; selectedBotSection = "overview"; render(); }
        else if (tab.equals("server-details")) { tab = "servers"; render(); }
        else if (tab.equals("task-create")) { tab = "task-types"; render(); }
        else if (tab.equals("task-types") || tab.equals("planner")) { tab = "tasks"; render(); }
        else if (tab.equals("skins")) { tab = "settings"; render(); }
        else if (!tab.equals("home")) { tab = "home"; render(); }
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (receiverRegistered) { try { unregisterReceiver(engineReceiver); } catch (Exception ignored) { } receiverRegistered = false; }
        io.shutdownNow();
        if (database != null) database.close();
        super.onDestroy();
    }
}
