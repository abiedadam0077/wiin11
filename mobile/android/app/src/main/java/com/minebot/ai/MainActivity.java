package com.minebot.ai;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.CheckBox;
import android.widget.EditText;
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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Entire Android UI is native Android Views; the Minecraft worker is a separate embedded Node service. */
public final class MainActivity extends Activity {
    private static final int PICK_SKIN = 7301;
    private static final int NOTIFICATION_REQUEST = 7302;
    private static final int PICK_BACKUP = 7303;

    private static final int BG = Color.rgb(7, 10, 24);
    private static final int SURFACE = Color.rgb(16, 22, 42);
    private static final int SURFACE_RAISED = Color.rgb(22, 29, 54);
    private static final int TEXT = Color.rgb(241, 244, 255);
    private static final int MUTED = Color.rgb(155, 166, 196);
    private static final int PURPLE = Color.rgb(153, 93, 255);
    private static final int BLUE = Color.rgb(62, 165, 255);
    private static final int GREEN = Color.rgb(72, 222, 163);
    private static final int RED = Color.rgb(255, 103, 129);
    private static final int AMBER = Color.rgb(255, 194, 93);

    private final ExecutorService io = Executors.newFixedThreadPool(2);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private DatabaseStore database;
    private SecureStore secureStore;
    private LinearLayout pageContent;
    private LinearLayout root;
    private ScrollView contentScroll;
    private long lastSnapshotRenderAt;
    private String tab = "home";
    private String selectedBotId = "";
    private String engineState = "STOPPED";
    private String engineReason = "";
    private String nodeVersion = "";
    private String plannerPrompt = "";
    private String plannerBotId = "";
    private JSONObject latestAiPlan;
    private String pendingBackupJson = "";
    private boolean plannerRequestRunning;
    private boolean receiverRegistered;

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
                boolean refreshSnapshotView = snapshotEvent && (tab.equals("home") || tab.equals("bots") || tab.equals("bot-details"))
                        && System.currentTimeMillis() - lastSnapshotRenderAt >= 2500L;
                if ((!snapshotEvent && shouldRender) || refreshSnapshotView) {
                    if (snapshotEvent) lastSnapshotRenderAt = System.currentTimeMillis();
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
        final int restoreScroll = contentScroll == null ? 0 : contentScroll.getScrollY();
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        root.setBackground(new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{Color.rgb(11, 10, 30), BG, Color.rgb(6, 17, 35)}));

        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(20), dp(18), dp(20), dp(10));
        TextView brand = text("MINEBOT  AI", 13, TEXT, true);
        brand.setLetterSpacing(0.08f);
        brand.setGravity(Gravity.CENTER_VERTICAL | Gravity.RIGHT);
        header.addView(brand, new LinearLayout.LayoutParams(0, dp(38), 1));
        TextView engine = pill(engineState.equals("READY") ? "ENGINE READY" : engineState.equals("FAILED") ? "ENGINE ERROR" : "ENGINE IDLE",
                engineState.equals("READY") ? GREEN : engineState.equals("FAILED") ? RED : MUTED);
        header.addView(engine);
        root.addView(header);

        ScrollView scroll = new ScrollView(this);
        contentScroll = scroll;
        scroll.setFillViewport(false);
        scroll.setClipToPadding(false);
        scroll.setVerticalScrollBarEnabled(false);
        pageContent = new LinearLayout(this);
        pageContent.setOrientation(LinearLayout.VERTICAL);
        pageContent.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        pageContent.setPadding(dp(18), dp(6), dp(18), dp(26));
        scroll.addView(pageContent);
        root.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        renderContent();
        root.addView(bottomNav());
        setContentView(root);
        if (restoreScroll > 0) scroll.post(() -> scroll.scrollTo(0, restoreScroll));
    }

    private void renderContent() {
        switch (tab) {
            case "servers": renderServers(); break;
            case "bots": renderBots(); break;
            case "tasks": renderTasks(); break;
            case "logs": renderLogs(); break;
            case "settings": renderSettings(); break;
            case "skins": renderSkins(); break;
            case "planner": renderPlanner(); break;
            case "bot-details": renderBotDetails(); break;
            default: renderHome(); break;
        }
    }

    private void renderHome() {
        title("مساء الخير 👋", "إدارة محلية لجلسات Minecraft Java");
        LinearLayout hero = card(new int[]{Color.rgb(81, 48, 152), Color.rgb(32, 87, 163)}, PURPLE);
        addText(hero, "MINEBOT AI  ·  NATIVE ANDROID", 11, Color.rgb(224, 216, 255), true, 0, 4);
        addText(hero, "عالمك،\nتحت سيطرتك.", 28, TEXT, true, 0, 6);
        addText(hero, "واجهة Android أصلية. بيانات اللعب المعروضة تأتي من محرك Minecraft فقط؛ لا نخترع صحة أو موقعًا أو مخزونًا.", 13, Color.rgb(218, 225, 255), false, 0, 14);
        button(hero, "إضافة سيرفر", true, () -> { tab = "servers"; showServerDialog(null); });
        pageContent.addView(hero, margin(0, 8, 0, 16));

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

        section("ابدأ هنا");
        LinearLayout actions = card(SURFACE_RAISED, Color.rgb(55, 66, 105));
        actionRow(actions, "01", "أضف سيرفر Java", "احفظ العنوان والمنفذ محليًا.", () -> showServerDialog(null), BLUE);
        divider(actions);
        actionRow(actions, "02", "أنشئ ملف بوت", "اختر Offline أو مصادقة Microsoft برمز جهاز.", () -> showBotDialog(), PURPLE);
        divider(actions);
        actionRow(actions, "03", "شغّل الجلسة", "تبدأ خدمة أمامية واضحة عند طلبك.", () -> { tab = "bots"; render(); }, GREEN);
        divider(actions);
        actionRow(actions, "AI", "خطط بمساعدة النموذج", "اقتراح عالي المستوى يحتاج موافقتك قبل إنشاء مهمة.", () -> { tab = "planner"; render(); }, PURPLE);
        pageContent.addView(actions);

        section("حالة المحرك");
        LinearLayout status = card(SURFACE, engineState.equals("READY") ? GREEN : engineState.equals("FAILED") ? RED : Color.rgb(72, 85, 126));
        String detail = engineState.equals("READY") ? "محرك Mineflayer الأصلي جاهز" + (nodeVersion.isEmpty() ? "" : " · Node " + nodeVersion)
                : engineState.equals("FAILED") ? (engineReason.isEmpty() ? "فشل تهيئة المحرك." : engineReason)
                : "المحرك غير مبدوء حتى تطلب اتصال بوت؛ لا توجد جلسة وهمية.";
        addText(status, detail, 14, TEXT, true, 0, 5);
        addText(status, "فحص Server Status وحده لا يعني تسجيل دخول. ONLINE لا يظهر إلا بعد حزمة Spawn الحقيقية.", 12, MUTED, false, 0, 0);
        pageContent.addView(status, margin(0, 0, 0, 18));
    }

    private void renderServers() {
        title("السيرفرات", "Minecraft Java · تخزين SQLite محلي");
        button(pageContent, "＋  إضافة سيرفر", true, () -> showServerDialog(null));
        JSONArray rows = records("servers");
        if (rows.length() == 0) empty("لا توجد سيرفرات", "أضف عنوان سيرفر تملكه أو لديك إذن الاتصال به.");
        for (JSONObject server : sorted(rows)) serverCard(server);
        note("اختبار الحالة يرسل Status Ping حقيقي فقط؛ لا يسجّل دخول لاعب.");
    }

    private void serverCard(JSONObject server) {
        String id = server.optString("id", "");
        LinearLayout card = card(SURFACE, Color.rgb(55, 66, 105));
        rowTitle(card, server.optString("name", "Minecraft server"), serverStatusLabel(server.optString("status", "untested")));
        addText(card, server.optString("host", "") + ":" + server.optInt("port", 25565), 13, MUTED, false, 0, 10);
        String pingVersion = server.optString("pingVersion", "");
        if (!pingVersion.isEmpty()) addText(card, "آخر Status Ping: " + pingVersion + " · " + server.optInt("playersOnline", 0) + "/" + server.optInt("playersMax", 0), 12, BLUE, true, 0, 10);
        LinearLayout actions = new LinearLayout(this);
        actions.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        actions.addView(smallButton("اختبر الحالة", () -> pingServer(id), true), weightMargin());
        actions.addView(smallButton("تعديل", () -> showServerDialog(server), false), weightMargin());
        actions.addView(smallButton("حذف", () -> confirmDeleteServer(server), false), weightMargin());
        card.addView(actions);
        pageContent.addView(card, margin(0, 0, 0, 12));
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
        title("البوتات", "كل حالة اتصال مصدرها خدمة البروتوكول");
        button(pageContent, "＋  إنشاء ملف بوت", true, this::showBotDialog);
        JSONArray rows = records("bots");
        if (rows.length() == 0) empty("لا توجد ملفات بوت", "أنشئ إعدادًا محليًا ثم ابدأ الاتصال يدويًا.");
        for (JSONObject bot : sorted(rows)) botCard(bot);
        note("ONLINE لا يظهر إلا بعد نجاح المصادقة واستقبال حزمة Spawn من الخادم.");
    }

    private void botCard(JSONObject bot) {
        String id = bot.optString("id", "");
        JSONObject live = find("bot_states", id);
        String status = live == null ? "DISCONNECTED" : live.optString("status", "DISCONNECTED");
        if ("ONLINE".equals(status) && !isLiveBot(live)) status = "STALE";
        else if (isTransientStatus(status) && !isRecentBotTransition(live)) status = "STALE";
        JSONObject server = find("servers", bot.optString("serverId", ""));
        LinearLayout card = card(SURFACE, statusColor(status));
        rowTitle(card, bot.optString("name", bot.optString("username", "Bot")), statusLabel(status));
        addText(card, "الحساب: " + bot.optString("username", "غير محدد") + " · " + ("microsoft".equals(bot.optString("authMode")) ? "Microsoft" : "Offline"), 12, MUTED, false, 0, 5);
        addText(card, server == null ? "لا يوجد سيرفر معيّن" : server.optString("host", "") + ":" + server.optInt("port", 25565) + " · " + bot.optString("version", "auto"), 12, MUTED, false, 0, 12);
        if (live != null && "bot_snapshot".equals(live.optString("type"))) {
            if (isLiveBot(live)) addObservedSnapshot(card, live);
            else addText(card, "لقطة سابقة فقط · " + live.optLong("observedAt") + " · لا تُعرض كحالة حية", 10, MUTED, false, 0, 10);
        }
        LinearLayout actions = new LinearLayout(this);
        actions.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        String storedStatus = live == null ? "DISCONNECTED" : live.optString("status", "DISCONNECTED");
        boolean mayHaveSession = "ONLINE".equals(storedStatus) || isTransientStatus(storedStatus);
        if ("ONLINE".equals(status) || "CONNECTING".equals(status) || "JOINING".equals(status) || "RECONNECTING".equals(status) || "DEAD".equals(status))
            actions.addView(smallButton("إيقاف", () -> confirmDisconnectBot(id), false), weightMargin());
        else if (status.equals("STALE") && mayHaveSession)
            actions.addView(smallButton("إيقاف غير متحقق", () -> confirmDisconnectBot(id), false), weightMargin());
        else actions.addView(smallButton("تشغيل", () -> connectBot(id), true), weightMargin());
        actions.addView(smallButton("تفاصيل", () -> { selectedBotId = id; tab = "bot-details"; render(); }, false), weightMargin());
        actions.addView(smallButton("حذف", () -> confirmDeleteBot(bot), false), weightMargin());
        card.addView(actions);
        pageContent.addView(card, margin(0, 0, 0, 12));
    }

    private void addObservedSnapshot(LinearLayout parent, JSONObject snapshot) {
        String observedAt = snapshot.has("observedAt") ? " · " + snapshot.optLong("observedAt") : "";
        String health = snapshot.isNull("health") ? "غير متاح" : String.valueOf(snapshot.optDouble("health"));
        String food = snapshot.isNull("food") ? "غير متاح" : String.valueOf(snapshot.optDouble("food"));
        JSONObject position = snapshot.optJSONObject("position");
        String pos = position == null ? "غير متاح" : String.format(java.util.Locale.US, "%.1f, %.1f, %.1f", position.optDouble("x"), position.optDouble("y"), position.optDouble("z"));
        addText(parent, "من العالم: صحة " + health + " · طعام " + food + " · موقع " + pos + observedAt, 11, GREEN, false, 0, 10);
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
        ArrayAdapter<String> serversAdapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, serverNames(servers));
        serverSpinner.setAdapter(serversAdapter);
        Spinner authSpinner = spinner();
        authSpinner.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, new String[]{"Offline (السيرفر يسمح بذلك)", "Microsoft (رمز جهاز)"}));
        CheckBox reconnect = new CheckBox(this);
        reconnect.setText("إعادة الاتصال تلقائيًا بعد انقطاع الشبكة");
        reconnect.setTextColor(TEXT);
        reconnect.setChecked(true);
        LinearLayout form = form(name, username, version);
        addFormField(form, "السيرفر", serverSpinner);
        addFormField(form, "المصادقة", authSpinner);
        form.addView(reconnect);
        addText(form, "لا تُدخل كلمة مرور Microsoft هنا. المصادقة تتم برمز جهاز رسمي عند التشغيل.", 11, MUTED, false, 0, 0);
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
                                .put("version", gameVersion).put("authMode", auth).put("reconnect", reconnect.isChecked()).put("status", "configured")
                                .put("createdAt", System.currentTimeMillis());
                        database.upsert("bots", row.toString());
                    } catch (JSONException ignored) { toast("تعذر حفظ ملف البوت."); }
                    render();
                }).show();
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

    private boolean isTerminal(String status) { return status.equals("completed") || status.equals("failed") || status.equals("cancelled"); }

    private void renderBotDetails() {
        JSONObject bot = find("bots", selectedBotId);
        if (bot == null) { tab = "bots"; render(); return; }
        JSONObject live = find("bot_states", selectedBotId);
        boolean online = isLiveBot(live);
        title(bot.optString("name", "Bot"), "بيانات Minecraft الحية عند الاتصال فقط");
        if (!online || !"bot_snapshot".equals(live.optString("type"))) {
            empty("لا توجد لقطة عالم حية", "شغّل البوت وانتظر Spawn قبل طلب القياسات أو الأوامر.");
            button(pageContent, "تشغيل جلسة Minecraft", true, () -> connectBot(selectedBotId));
        } else {
            LinearLayout metrics = card(SURFACE, GREEN);
            addObservedSnapshot(metrics, live);
            pageContent.addView(metrics, margin(0, 0, 0, 14));
            showInventory(live);
            showPlayers(live);
            showEntities(live);
            section("تحكم حقيقي");
            LinearLayout controls = card(SURFACE_RAISED, PURPLE);
            controlRow(controls, selectedBotId);
            button(controls, "إرسال رسالة في Minecraft", false, () -> showChatDialog(selectedBotId));
            button(controls, "إيقاف الحركة/المسار", false, () -> sendEngineCommand(command("stop-navigation", selectedBotId)));
            pageContent.addView(controls);
        }
        button(pageContent, "العودة إلى البوتات", false, () -> { tab = "bots"; render(); });
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
        section("المخزون المرصود");
        JSONArray items = snapshot.optJSONArray("inventory");
        if (items == null || items.length() == 0) { empty("المخزون فارغ أو غير متاح", "لا نعرض عناصر لم تصل من بروتوكول Minecraft."); return; }
        LinearLayout card = card(SURFACE, BLUE);
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item != null) addText(card, item.optString("displayName", item.optString("name")) + " × " + item.optInt("count") + " · slot " + item.optInt("slot"), 12, TEXT, false, 0, 6);
        }
        pageContent.addView(card, margin(0, 0, 0, 14));
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
        title("المهام", "أوامر تنفيذ محدودة تُتحقق من أحداث العالم");
        button(pageContent, "＋  مهمة جمع كتلة", true, this::showCollectTaskDialog);
        button(pageContent, "تخطيط مقترح عبر AI", false, () -> { tab = "planner"; render(); });
        JSONArray tasks = records("tasks");
        if (tasks.length() == 0) empty("لا توجد مهام محفوظة", "أنشئ جمع مورد محددًا؛ لا ندّعي تنفيذ أوامر غير مدعومة.");
        for (JSONObject task : sorted(tasks)) taskCard(task);
        note("النسخة الحالية تنفّذ فقط جمع كتل ذات عنصر مطابق في المخزون؛ تخزين الصندوق وخطط البناء المعقدة غير مفعّلة.");
    }

    private void taskCard(JSONObject task) {
        String id = task.optString("id", "");
        LinearLayout card = card(SURFACE, statusColor(task.optString("status", "pending")));
        rowTitle(card, task.optString("name", task.optString("description", "Minecraft task")), task.optString("status", "pending"));
        addText(card, "البوت: " + botName(task.optString("botId", "")) + " · " + task.optString("blockName", ""), 12, MUTED, false, 0, 5);
        addText(card, "التقدم المؤكد: " + task.optInt("progress", 0) + "%" + (task.has("verifiedCollected") ? " · عناصر " + task.optInt("verifiedCollected") : ""), 12, BLUE, false, 0, 10);
        LinearLayout actions = new LinearLayout(this);
        actions.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        String status = task.optString("status", "pending");
        if (status.equals("pending") || status.equals("failed") || status.equals("interrupted"))
            actions.addView(smallButton(status.equals("interrupted") ? "إعادة تشغيل" : "تشغيل", () -> startCollectTask(task), true), weightMargin());
        if (status.equals("running")) actions.addView(smallButton("إيقاف مؤقت", () -> taskCommand(task, "pause-task"), false), weightMargin());
        if (status.equals("paused")) actions.addView(smallButton("استئناف", () -> taskCommand(task, "resume-task"), true), weightMargin());
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
        ArrayAdapter<String> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, botNames(botList));
        botSpinner.setAdapter(adapter);
        LinearLayout form = form(block, count);
        addFormField(form, "ملف البوت", botSpinner);
        addText(form, "المحرك سيبحث عن الكتلة في العالم المحمّل، يمشي إليها عبر pathfinder، ثم ينتظر زيادة المخزون الحقيقية.", 12, MUTED, false, 0, 0);
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
            JSONObject command = new JSONObject().put("action", "collect").put("botId", botId).put("taskId", task.optString("id"))
                    .put("blockName", task.optString("blockName")).put("count", task.optInt("count"));
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
            labels[i] = model.optString("name", model.optString("id")) + "\n" + model.optString("id") + " · context " + model.optInt("contextLength");
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
        title("مخطط AI", "اقتراح عالي المستوى · الموافقة والتنفيذ منفصلان");
        if (!secureStore.hasApiKey()) {
            empty("OpenRouter غير مضبوط", "أضف مفتاحًا مشفّرًا في الإعدادات لاكتشاف النماذج.");
            button(pageContent, "إعداد OpenRouter", true, this::showApiKeyDialog);
            return;
        }
        JSONObject config = find("ai_config", "openrouter_models");
        JSONArray freeModels = config == null ? null : config.optJSONArray("freeModels");
        if (freeModels == null || freeModels.length() == 0) {
            empty("لا توجد نماذج مجانية محفوظة", "اكتشف النماذج أولًا. لا يبدأ أي اتصال Minecraft من هذه الشاشة.");
            button(pageContent, "اكتشاف النماذج", true, this::discoverFreeModels);
            return;
        }
        String selectedModel = config.optString("selectedModel", "");
        addText(pageContent, "النموذج المحدد: " + selectedModel, 11, BLUE, true, 0, 10);
        button(pageContent, "تغيير النموذج", false, () -> showAiModelDialog(freeModels));
        LinearLayout card = card(SURFACE, PURPLE);
        addText(card, "اكتب هدفًا عامًا. سيعيد النموذج اقتراح مهمة جمع واحدة أو يرفض الطلب غير المدعوم.", 12, MUTED, false, 0, 10);
        EditText prompt = field("مثال: اجمع عدة جذوع بلوط قرب نقطة البداية");
        prompt.setSingleLine(false);
        prompt.setMinLines(3);
        prompt.setMaxLines(6);
        prompt.setGravity(Gravity.TOP | Gravity.RIGHT);
        prompt.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE | android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        prompt.setText(plannerPrompt);
        card.addView(prompt, margin(0, 0, 0, 10));

        List<JSONObject> botList = toList(records("bots"));
        Spinner botSpinner = spinner();
        if (!botList.isEmpty()) {
            botSpinner.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, botNames(botList)));
            int selection = 0;
            for (int i = 0; i < botList.size(); i++) if (plannerBotId.equals(botList.get(i).optString("id"))) selection = i;
            botSpinner.setSelection(selection);
            plannerBotId = botList.get(selection).optString("id", "");
            botSpinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
                @Override public void onItemSelected(AdapterView<?> parent, View view, int position, long id) { if (position >= 0 && position < botList.size()) plannerBotId = botList.get(position).optString("id", ""); }
                @Override public void onNothingSelected(AdapterView<?> parent) { plannerBotId = ""; }
            });
            addFormField(card, "البوت الذي ستُسند إليه المهمة لاحقًا", botSpinner);
        } else addText(card, "لا توجد ملفات بوت؛ يمكن التخطيط، لكن لن يمكن حفظ مهمة قبل إنشاء بوت.", 11, AMBER, false, 0, 8);
        button(card, plannerRequestRunning ? "جارٍ انتظار OpenRouter…" : "إنشاء اقتراح", true, () -> {
            plannerPrompt = prompt.getText().toString().trim();
            if (!plannerRequestRunning) requestAiPlan(plannerPrompt, freeModels, selectedModel);
        });
        pageContent.addView(card, margin(0, 0, 0, 14));

        if (latestAiPlan != null) {
            LinearLayout result = card(SURFACE_RAISED, latestAiPlan.optString("action").equals("collect") ? GREEN : AMBER);
            String action = latestAiPlan.optString("action", "unsupported");
            rowTitle(result, "اقتراح النموذج", action.toUpperCase(java.util.Locale.ROOT));
            if (action.equals("collect")) addText(result, "اجمع " + latestAiPlan.optInt("count") + " من " + latestAiPlan.optString("blockName"), 15, TEXT, true, 0, 7);
            addText(result, latestAiPlan.optString("reason", "لا يوجد تفسير من النموذج."), 12, MUTED, false, 0, 8);
            addText(result, "Model: " + latestAiPlan.optString("model", selectedModel), 10, BLUE, false, 0, 9);
            addText(result, "هذا اقتراح غير منفذ. لا يعرف النموذج حالة العالم؛ Task Engine وMineflayer يتحققان من الاتصال والكتلة والمخزون عند التشغيل.", 11, MUTED, false, 0, 10);
            if (action.equals("collect")) {
                boolean hasBot = find("bots", plannerBotId) != null;
                if (hasBot) button(result, "موافقة: احفظ كـ Pending Task", true, () -> saveAiPlanAsTask(latestAiPlan));
                else addText(result, "أنشئ ملف بوت أولًا لتثبيت المهمة.", 11, AMBER, false, 0, 0);
            }
            pageContent.addView(result, margin(0, 0, 0, 12));
        }
        note("AI لا يملك أدوات مباشرة ولا يتصل بخادم Minecraft؛ مخرجاته محصورة في اقتراح collect أو unsupported.");
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
            toast("حُفظت المهمة Pending؛ اضغط تشغيل بعد تحقق Spawn.");
            render();
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
        title("Skins", "ملفات PNG محلية");
        button(pageContent, "اختيار PNG من الجهاز", true, this::pickSkin);
        JSONArray rows = records("skins");
        if (rows.length() == 0) empty("لا توجد Skins محفوظة", "اختر ملفًا محليًا؛ لا نعرض معاينة أو Skin غير موجود.");
        for (JSONObject skin : sorted(rows)) {
            LinearLayout card = card(SURFACE, BLUE);
            rowTitle(card, skin.optString("name", "Skin"), "PNG محلي");
            addText(card, skin.optString("filePath", ""), 10, MUTED, false, 0, 8);
            button(card, "حذف الملف المحلي", false, () -> deleteSkin(skin));
            pageContent.addView(card, margin(0, 0, 0, 12));
        }
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
        nav.setPadding(dp(8), dp(9), dp(8), dp(12));
        nav.setBackground(rounded(Color.rgb(15, 18, 37), Color.rgb(47, 55, 87), dp(20)));
        String[][] items = {{"home", "الرئيسية"}, {"servers", "السيرفرات"}, {"bots", "البوتات"}, {"tasks", "المهام"}, {"settings", "الإعدادات"}};
        for (String[] item : items) {
            boolean active = tab.equals(item[0]) || (tab.equals("bot-details") && item[0].equals("bots")) || tab.equals("skins") && item[0].equals("settings");
            TextView button = text(item[1], 10, active ? TEXT : MUTED, active);
            button.setGravity(Gravity.CENTER);
            button.setBackground(rounded(active ? Color.rgb(61, 47, 115) : Color.TRANSPARENT, active ? PURPLE : Color.TRANSPARENT, dp(13)));
            button.setPadding(dp(3), dp(11), dp(3), dp(11));
            nav.addView(button, new LinearLayout.LayoutParams(0, dp(42), 1));
            button.setOnClickListener(view -> { tab = item[0]; render(); });
        }
        return nav;
    }

    private void title(String heading, String subtitle) {
        addText(pageContent, heading, 25, TEXT, true, 0, 4);
        addText(pageContent, subtitle, 12, MUTED, false, 0, 17);
    }

    private void section(String value) {
        TextView text = label(value, 14, TEXT, true);
        pageContent.addView(text, margin(2, 16, 0, 9));
    }

    private void empty(String heading, String description) {
        LinearLayout card = card(SURFACE, Color.rgb(55, 66, 105));
        addText(card, heading, 15, TEXT, true, 0, 5);
        addText(card, description, 12, MUTED, false, 0, 0);
        pageContent.addView(card, margin(0, 0, 0, 12));
    }

    private void note(String value) {
        LinearLayout card = card(Color.rgb(17, 28, 48), Color.rgb(45, 92, 145));
        addText(card, value, 11, MUTED, false, 0, 0);
        pageContent.addView(card, margin(0, 10, 0, 0));
    }

    private LinearLayout card(int color, int stroke) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        card.setPadding(dp(16), dp(15), dp(16), dp(15));
        card.setBackground(rounded(color, stroke, dp(20)));
        return card;
    }

    private LinearLayout card(int[] gradient, int stroke) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        card.setPadding(dp(20), dp(19), dp(20), dp(19));
        GradientDrawable background = new GradientDrawable(GradientDrawable.Orientation.TL_BR, gradient);
        background.setCornerRadius(dp(23)); background.setStroke(dp(1), stroke);
        card.setBackground(background);
        return card;
    }

    private GradientDrawable rounded(int color, int stroke, int radius) {
        GradientDrawable background = new GradientDrawable();
        background.setColor(color); background.setCornerRadius(radius); background.setStroke(dp(1), stroke);
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
        TextView pill = text(value, 9, color, true);
        pill.setGravity(Gravity.CENTER); pill.setPadding(dp(10), dp(8), dp(10), dp(8));
        pill.setBackground(rounded(Color.rgb(23, 31, 54), color, dp(18)));
        return pill;
    }

    private void rowTitle(LinearLayout parent, String name, String status) {
        LinearLayout row = new LinearLayout(this); row.setGravity(Gravity.CENTER_VERTICAL); row.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        TextView title = text(name, 15, TEXT, true); row.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        row.addView(pill(status, statusColor(status)));
        parent.addView(row, margin(0, 0, 0, 4));
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
        View line = new View(this); line.setBackgroundColor(Color.rgb(49, 57, 90));
        parent.addView(line, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1)));
    }

    private View statCard(String name, String value, int accent) {
        LinearLayout card = card(SURFACE, accent);
        addText(card, name, 10, MUTED, false, 0, 4);
        addText(card, value, 21, accent, true, 0, 0);
        return card;
    }

    private void button(LinearLayout parent, String label, boolean primary, Runnable action) {
        TextView button = text(label, 13, TEXT, true); button.setGravity(Gravity.CENTER); button.setPadding(dp(12), dp(13), dp(12), dp(13));
        button.setBackground(primary ? gradientDrawable(new int[]{Color.rgb(127, 76, 235), Color.rgb(45, 120, 220)}, PURPLE) : rounded(Color.rgb(28, 35, 60), Color.rgb(71, 85, 128), dp(15)));
        button.setClickable(true); button.setFocusable(true); button.setOnClickListener(view -> action.run());
        parent.addView(button, margin(0, 5, 0, 7));
    }

    private GradientDrawable gradientDrawable(int[] colors, int stroke) {
        GradientDrawable shape = new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, colors);
        shape.setCornerRadius(dp(16)); shape.setStroke(dp(1), stroke); return shape;
    }

    private TextView smallButton(String label, Runnable action, boolean primary) {
        TextView button = text(label, 10, primary ? TEXT : MUTED, true); button.setGravity(Gravity.CENTER); button.setPadding(dp(3), dp(9), dp(3), dp(9));
        button.setBackground(rounded(primary ? Color.rgb(74, 57, 139) : Color.rgb(27, 34, 58), primary ? PURPLE : Color.rgb(67, 80, 120), dp(12)));
        button.setOnClickListener(view -> action.run()); return button;
    }

    private EditText field(String hint) {
        EditText input = new EditText(this); input.setSingleLine(true); input.setTextSize(14); input.setTextColor(TEXT); input.setHintTextColor(MUTED); input.setHint(hint);
        input.setPadding(dp(13), dp(8), dp(13), dp(8)); input.setBackground(rounded(Color.rgb(18, 24, 43), Color.rgb(67, 78, 114), dp(13)));
        input.setLayoutDirection(View.LAYOUT_DIRECTION_RTL); input.setTextDirection(View.TEXT_DIRECTION_FIRST_STRONG_RTL); return input;
    }

    private Spinner spinner() {
        Spinner spinner = new Spinner(this); spinner.setPadding(dp(8), 0, dp(8), 0); spinner.setBackground(rounded(Color.rgb(18, 24, 43), Color.rgb(67, 78, 114), dp(13))); return spinner;
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
        return "CONNECTING".equals(status) || "JOINING".equals(status) || "RECONNECTING".equals(status) || "DEAD".equals(status);
    }

    private boolean isRecentBotTransition(JSONObject state) {
        if (state == null) return false;
        long eventAt = state.optLong("at", state.optLong("updatedAt", 0));
        long age = System.currentTimeMillis() - eventAt;
        return eventAt > 0 && age >= 0 && age <= 60_000L;
    }

    private String serverStatusLabel(String status) {
        if ("status_reachable".equals(status)) return "PING OK · NO LOGIN";
        if ("status_failed".equals(status)) return "PING FAILED";
        return "NOT TESTED";
    }

    private int statusColor(String status) {
        String normalized = String.valueOf(status).toUpperCase(java.util.Locale.ROOT);
        if (normalized.equals("ONLINE") || normalized.equals("COMPLETED") || normalized.startsWith("PING OK")) return GREEN;
        if (normalized.equals("FAILED") || normalized.equals("ERROR") || normalized.equals("PING FAILED")) return RED;
        if (normalized.equals("CONNECTING") || normalized.equals("JOINING") || normalized.equals("RECONNECTING") || normalized.equals("RUNNING")) return AMBER;
        if (normalized.equals("DEAD")) return RED;
        return MUTED;
    }

    private String statusLabel(String status) {
        switch (String.valueOf(status).toUpperCase(java.util.Locale.ROOT)) {
            case "ONLINE": return "ONLINE";
            case "CONNECTING": return "CONNECTING";
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
        if (position == null) return "غير متاح";
        return String.format(java.util.Locale.US, "%.1f %.1f %.1f", position.optDouble("x"), position.optDouble("y"), position.optDouble("z"));
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
        if (tab.equals("bot-details") || tab.equals("skins")) { tab = tab.equals("bot-details") ? "bots" : "settings"; render(); }
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
