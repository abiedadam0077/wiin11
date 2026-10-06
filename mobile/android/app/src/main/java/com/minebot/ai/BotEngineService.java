package com.minebot.ai;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** Owns the in-process Node/Mineflayer worker and runs only while a user-started bot session is active. */
public final class BotEngineService extends Service {
    public static final String EVENT_ACTION = "com.minebot.ai.BOT_ENGINE_EVENT";
    private static final String CHANNEL = "minebot_engine_foreground";
    private static final int NOTIFICATION_ID = 5081;
    private static final String ACTION_CONNECT = "com.minebot.ai.action.CONNECT";
    private static final String ACTION_DISCONNECT = "com.minebot.ai.action.DISCONNECT";
    private static final String ACTION_COMMAND = "com.minebot.ai.action.COMMAND";
    private static final String ACTION_STOP_ALL = "com.minebot.ai.action.STOP_ALL";

    private final ExecutorService io = Executors.newCachedThreadPool();
    private final ConcurrentLinkedQueue<JSONObject> pending = new ConcurrentLinkedQueue<>();
    private final AtomicBoolean nodeStarted = new AtomicBoolean(false);
    private final AtomicBoolean closing = new AtomicBoolean(false);
    private DatabaseStore database;
    private ServerSocket serverSocket;
    private Socket workerSocket;
    private BufferedWriter workerWriter;
    private PowerManager.WakeLock wakeLock;
    private String bridgeToken;
    private volatile boolean authenticated;
    private volatile String runtime = "";
    private File projectDirectory;
    private File authCacheDirectory;

    public static void connect(Context context, String botId) {
        Intent intent = new Intent(context, BotEngineService.class).setAction(ACTION_CONNECT).putExtra("botId", botId);
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent); else context.startService(intent);
    }

    public static void disconnect(Context context, String botId) {
        context.startService(new Intent(context, BotEngineService.class).setAction(ACTION_DISCONNECT).putExtra("botId", botId));
    }

    public static void stopAll(Context context) {
        context.startService(new Intent(context, BotEngineService.class).setAction(ACTION_STOP_ALL));
    }

    public static void sendCommand(Context context, JSONObject command) {
        context.startService(new Intent(context, BotEngineService.class).setAction(ACTION_COMMAND).putExtra("command", command.toString()));
    }

    @Override public void onCreate() {
        super.onCreate();
        database = new DatabaseStore(getApplicationContext());
        markPersistedSessionsUnverified();
        markPersistedTasksInterrupted();
        createNotificationChannel();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || closing.get()) { stopSelf(startId); return START_NOT_STICKY; }
        String action = intent.getAction();
        if (ACTION_DISCONNECT.equals(action) && !nodeStarted.get()) {
            reportDisconnectedWithoutRuntime(intent.getStringExtra("botId"));
            stopSelf(startId);
            return START_NOT_STICKY;
        }
        if (ACTION_COMMAND.equals(action) && !nodeStarted.get()) {
            emit("command_result", error("محرك Minecraft غير مشغّل؛ ابدأ جلسة بوت أولًا."));
            stopSelf(startId);
            return START_NOT_STICKY;
        }
        if (ACTION_STOP_ALL.equals(action) && !nodeStarted.get()) { stopSelf(startId); return START_NOT_STICKY; }
        promoteToForeground();
        acquireWakeLock();
        if (ACTION_CONNECT.equals(action)) {
            ensureRuntime();
            io.execute(() -> connectBot(intent.getStringExtra("botId")));
        } else if (ACTION_DISCONNECT.equals(action)) {
            String botId = intent.getStringExtra("botId");
            io.execute(() -> sendAction("disconnect", botId));
        } else if (ACTION_COMMAND.equals(action)) {
            io.execute(() -> forwardCommand(intent.getStringExtra("command")));
        } else if (ACTION_STOP_ALL.equals(action)) {
            io.execute(this::stopAllBots);
        }
        return START_NOT_STICKY;
    }

    private void ensureRuntime() {
        if (!nodeStarted.compareAndSet(false, true)) return;
        io.execute(() -> {
            try {
                projectDirectory = new File(getFilesDir(), "nodejs-project");
                installNodeProject(projectDirectory);
                authCacheDirectory = new File(getCacheDir(), "minecraft-auth");
                deleteTree(authCacheDirectory);
                if (!authCacheDirectory.mkdirs() && !authCacheDirectory.isDirectory()) throw new IllegalStateException("تعذر إعداد مخزن تسجيل دخول مؤقت.");
                bridgeToken = randomToken();
                serverSocket = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"));
                serverSocket.setSoTimeout(90_000);
                int port = serverSocket.getLocalPort();
                Thread worker = new Thread(() -> {
                    try {
                        int result = NativeNode.startNode(projectDirectory.getAbsolutePath(), new String[]{
                                "node", new File(projectDirectory, "main.js").getAbsolutePath(),
                                "--port", String.valueOf(port), "--token", bridgeToken,
                                "--project-dir", projectDirectory.getAbsolutePath(),
                                "--auth-dir", authCacheDirectory.getAbsolutePath()
                        });
                        if (!closing.get()) {
                            if (result != 0) emit("engine_state", new JSONObject().put("status", "FAILED").put("reason", "انتهى Node.js المضمّن برمز خروج " + result + "."));
                            shutdownRuntime();
                        }
                    } catch (Throwable error) {
                        if (!closing.get()) {
                            try { emit("engine_state", new JSONObject().put("status", "FAILED").put("reason", "تعذر تشغيل محرك Android الأصلي: " + error.getClass().getSimpleName())); }
                            catch (JSONException ignored) { }
                            shutdownRuntime();
                        }
                    }
                }, "minebot-node-runtime");
                worker.setDaemon(true);
                worker.start();
                acceptWorker();
            } catch (Exception ignored) {
                emitEngineState("FAILED", "تعذر تهيئة محرك Minecraft الأصلي.");
                shutdownRuntime();
            }
        });
    }

    private void acceptWorker() {
        try (Socket accepted = serverSocket.accept()) {
            accepted.setTcpNoDelay(true);
            accepted.setKeepAlive(true);
            BufferedReader reader = new BufferedReader(new InputStreamReader(accepted.getInputStream(), StandardCharsets.UTF_8));
            BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(accepted.getOutputStream(), StandardCharsets.UTF_8));
            String helloLine = reader.readLine();
            if (helloLine == null || helloLine.length() > 8192) throw new IllegalStateException("Bridge handshake missing.");
            JSONObject hello = new JSONObject(helloLine);
            if (!"hello".equals(hello.optString("channel")) || !bridgeToken.equals(hello.optString("token"))) throw new SecurityException("Bridge handshake rejected.");
            workerSocket = accepted;
            workerWriter = writer;
            runtime = hello.optString("runtime", "");
            authenticated = true;
            writeToWorker(new JSONObject().put("action", "ready").put("token", bridgeToken));
            emit("engine_state", new JSONObject().put("status", "READY").put("runtime", runtime));
            flushPending();
            String line;
            while (!closing.get() && (line = reader.readLine()) != null) {
                if (line.length() > 1_000_000) throw new IllegalStateException("Engine event exceeded limit.");
                try { handleEngineMessage(new JSONObject(line)); }
                catch (JSONException ignored) { emitEngineState("FAILED", "أرسل محرك Minecraft حدثًا غير صالح."); }
            }
        } catch (Exception ignored) {
            if (!closing.get()) {
                authenticated = false;
                emitEngineState("DISCONNECTED", "انقطع اتصال خدمة المحرك المحلية.");
                shutdownRuntime();
            }
        } finally {
            authenticated = false;
            workerWriter = null;
            if (workerSocket != null) { try { workerSocket.close(); } catch (Exception ignored) { } workerSocket = null; }
        }
    }

    private void handleEngineMessage(JSONObject message) throws JSONException {
        String channel = message.optString("channel", "");
        if ("engine_ready".equals(channel)) {
            JSONObject ready = new JSONObject().put("status", "READY").put("runtime", message.optString("runtime", runtime)).put("mineflayer", message.optString("mineflayer", ""));
            emit("engine_state", ready);
            NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (manager != null) manager.notify(NOTIFICATION_ID, buildNotification("محرك Minecraft جاهز", "لا توجد جلسة ONLINE قبل تأكيد Spawn."));
            return;
        }
        if ("heartbeat".equals(channel)) {
            emit("engine_state", new JSONObject().put("status", "READY").put("runtime", message.optString("runtime", runtime)).put("heartbeatAt", message.optLong("at", System.currentTimeMillis())));
            return;
        }
        if ("event".equals(channel)) {
            String type = message.optString("type", "");
            String botId = message.optString("botId", "");
            if (type.equals("bot_snapshot") || type.equals("bot_state")) {
                JSONObject state = new JSONObject(message.toString()).put("id", botId);
                database.upsert("bot_states", state.toString());
            }
            if (type.equals("task_state")) persistTaskEvent(botId, message);
            if (type.equals("bot_state") || type.equals("bot_error") || type.equals("task_state") || type.equals("behavior")) persistLog(botId, message);
            emit(type, message);
            updateNotification(message);
            if (type.equals("bot_state")) {
                String status = message.optString("status", "");
                if (status.equals("DISCONNECTED")) stopServiceIfIdle();
                else if (status.equals("FAILED") && !message.optBoolean("retryable", false)) scheduleIdleCheck();
            }
            return;
        }
        if ("command_result".equals(channel)) {
            emit("command_result", message);
            return;
        }
        if ("protocol_error".equals(channel)) emit("engine_state", new JSONObject().put("status", "FAILED").put("reason", message.optString("error", "خطأ بروتوكول محلي.")));
    }

    private void reportDisconnectedWithoutRuntime(String botId) {
        if (botId == null || botId.isEmpty()) return;
        try {
            JSONObject state = findById(database.readAll("bot_states"), botId);
            if (state == null) state = new JSONObject();
            state.put("id", botId).put("botId", botId).put("status", "DISCONNECTED").put("type", "bot_state")
                    .put("detail", "لا توجد عملية محرك حية لهذا السجل؛ تم تسجيله كغير متصل.")
                    .put("at", System.currentTimeMillis()).put("updatedAt", System.currentTimeMillis());
            database.upsert("bot_states", state.toString());
            emit("bot_state", state);
        } catch (Exception ignored) { emit("command_result", error("تعذر تحديث حالة البوت المحلية.")); }
    }

    private void markPersistedSessionsUnverified() {
        JSONArray states;
        try { states = new JSONArray(database.readAll("bot_states")); }
        catch (Exception ignored) { return; }
        for (int i = 0; i < states.length(); i++) {
            JSONObject state = states.optJSONObject(i);
            if (state == null) continue;
            String status = state.optString("status", "");
            if (!status.equals("ONLINE") && !status.equals("JOINING") && !status.equals("CONNECTING") && !status.equals("RECONNECTING") && !status.equals("DEAD")) continue;
            try {
                state.put("status", "DISCONNECTED").put("type", "bot_state")
                        .put("detail", "أُعيد تشغيل خدمة Android؛ لا تُعد الجلسة السابقة متصلة حتى تصل حزمة Minecraft جديدة.")
                        .put("updatedAt", System.currentTimeMillis());
                database.upsert("bot_states", state.toString());
            } catch (JSONException ignored) { }
        }
    }

    private void markPersistedTasksInterrupted() {
        JSONArray tasks;
        try { tasks = new JSONArray(database.readAll("tasks")); }
        catch (Exception ignored) { return; }
        for (int i = 0; i < tasks.length(); i++) {
            JSONObject task = tasks.optJSONObject(i);
            if (task == null) continue;
            String status = task.optString("status", "").toLowerCase(java.util.Locale.ROOT);
            if (!status.equals("running") && !status.equals("paused")) continue;
            try {
                String reason = "أُعيد تشغيل خدمة Android؛ حالة العمل التنفيذية السابقة لم تعد موجودة. راجع المخزون ثم أعد تشغيل المهمة يدويًا.";
                task.put("status", "interrupted").put("lastReason", reason).put("updatedAt", System.currentTimeMillis());
                database.upsert("tasks", task.toString());
                JSONObject history = new JSONObject().put("id", UUID.randomUUID().toString()).put("taskId", task.optString("id"))
                        .put("botId", task.optString("botId")).put("status", "INTERRUPTED").put("message", reason).put("createdAt", System.currentTimeMillis());
                database.upsert("task_history", history.toString());
            } catch (JSONException ignored) { }
        }
    }

    private void connectBot(String botId) {
        if (botId == null || botId.isEmpty()) { emit("command_result", error("معرّف البوت غير صالح.")); return; }
        try {
            JSONObject bot = findById(database.readAll("bots"), botId);
            if (bot == null) throw new IllegalArgumentException("ملف البوت غير موجود في SQLite.");
            JSONObject server = findById(database.readAll("servers"), bot.optString("serverId", ""));
            if (server == null) throw new IllegalArgumentException("السيرفر المحدد غير موجود في SQLite.");
            JSONObject config = new JSONObject()
                    .put("host", server.optString("host", ""))
                    .put("port", server.optInt("port", 25565))
                    .put("username", bot.optString("username", ""))
                    .put("auth", bot.optString("authMode", "offline"))
                    .put("version", bot.optString("version", "auto"))
                    .put("reconnect", bot.optBoolean("reconnect", true));
            sendCommandJson(new JSONObject().put("action", "connect").put("botId", botId).put("config", config).put("requestId", UUID.randomUUID().toString()));
        } catch (Exception error) {
            try {
                JSONObject failure = new JSONObject().put("type", "bot_state").put("botId", botId).put("id", botId)
                        .put("status", "FAILED").put("reason", "تعذر بدء الاتصال: " + safe(error.getMessage())).put("at", System.currentTimeMillis());
                database.upsert("bot_states", failure.toString());
                persistLog(botId, failure);
                emit("bot_state", failure);
            } catch (JSONException ignored) { emit("command_result", error("تعذر بدء الاتصال: " + safe(error.getMessage()))); }
        }
    }

    private void sendAction(String action, String botId) {
        try { sendCommandJson(new JSONObject().put("action", action).put("botId", botId == null ? "" : botId)); }
        catch (JSONException ignored) { }
    }

    private void forwardCommand(String value) {
        if (value == null || value.length() > 32_768) { emit("command_result", error("حجم أمر المحرك غير صالح.")); return; }
        try {
            JSONObject command = new JSONObject(value);
            if (!command.has("requestId")) command.put("requestId", UUID.randomUUID().toString());
            sendCommandJson(command);
        } catch (Exception ignored) { emit("command_result", error("صيغة أمر المحرك غير صالحة.")); }
    }

    private void sendCommandJson(JSONObject command) {
        if (closing.get()) return;
        if (!authenticated || workerSocket == null || workerSocket.isClosed()) {
            pending.offer(command);
            if (pending.size() > 100) pending.poll();
            return;
        }
        try { writeToWorker(command); }
        catch (Exception ignored) {
            authenticated = false;
            pending.offer(command);
            emit("engine_state", error("تعذر إرسال الأمر إلى محرك Minecraft المحلي."));
        }
    }

    private synchronized void writeToWorker(JSONObject command) throws Exception {
        BufferedWriter writer = workerWriter;
        if (writer == null) throw new IllegalStateException("Native engine bridge is not connected.");
        writer.write(command.toString());
        writer.newLine();
        writer.flush();
    }

    private void flushPending() {
        JSONObject next;
        while (authenticated && (next = pending.poll()) != null) sendCommandJson(next);
    }

    private void stopAllBots() {
        JSONArray states = new JSONArray(database.readAll("bot_states"));
        for (int i = 0; i < states.length(); i++) {
            JSONObject state = states.optJSONObject(i);
            if (state == null) continue;
            String status = state.optString("status", "");
            if (status.equals("ONLINE") || status.equals("JOINING") || status.equals("CONNECTING") || status.equals("RECONNECTING") || status.equals("DEAD")) sendAction("disconnect", state.optString("botId", state.optString("id", "")));
        }
        try { sendCommandJson(new JSONObject().put("action", "shutdown")); } catch (JSONException ignored) { }
        io.execute(() -> { try { Thread.sleep(300); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); } shutdownRuntime(); });
    }

    private void scheduleIdleCheck() {
        io.execute(() -> {
            try { Thread.sleep(1500); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
            if (!closing.get()) stopServiceIfIdle();
        });
    }

    private void stopServiceIfIdle() {
        JSONArray states = new JSONArray(database.readAll("bot_states"));
        for (int i = 0; i < states.length(); i++) {
            JSONObject state = states.optJSONObject(i);
            if (state == null) continue;
            String status = state.optString("status", "");
            if (status.equals("ONLINE") || status.equals("JOINING") || status.equals("CONNECTING") || status.equals("RECONNECTING") || status.equals("DEAD")) return;
        }
        try { sendCommandJson(new JSONObject().put("action", "shutdown")); } catch (JSONException ignored) { }
        io.execute(() -> {
            try { Thread.sleep(250); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
            if (!closing.get()) shutdownRuntime();
        });
    }

    private void persistTaskEvent(String botId, JSONObject event) {
        String taskId = event.optString("taskId", "");
        if (taskId.isEmpty()) return;
        try {
            JSONObject task = findById(database.readAll("tasks"), taskId);
            if (task != null) {
                String status = event.optString("status", "");
                if (!status.isEmpty()) task.put("status", status.toLowerCase(java.util.Locale.ROOT));
                if (event.has("progress")) task.put("progress", event.optInt("progress"));
                if (event.has("verifiedCollected")) task.put("verifiedCollected", event.optInt("verifiedCollected"));
                if (event.has("verifiedBy")) task.put("verifiedBy", event.optString("verifiedBy"));
                if (event.has("priority")) task.put("runtimePriority", event.optString("priority"));
                if (event.has("goal")) task.put("goal", event.optString("goal"));
                if (event.has("reason")) task.put("lastReason", safe(event.optString("reason")));
                task.put("updatedAt", event.optLong("at", System.currentTimeMillis()));
                database.upsert("tasks", task.toString());
            }
            JSONObject history = new JSONObject().put("id", UUID.randomUUID().toString()).put("taskId", taskId).put("botId", botId).put("status", event.optString("status", "")).put("message", event.optString("reason", event.optString("goal", "Minecraft engine event"))).put("createdAt", System.currentTimeMillis());
            database.upsert("task_history", history.toString());
        } catch (Exception ignored) { }
    }

    private void persistLog(String botId, JSONObject event) {
        try {
            JSONObject row = new JSONObject()
                    .put("id", UUID.randomUUID().toString())
                    .put("botId", botId)
                    .put("category", event.optString("type", "engine"))
                    .put("level", event.optString("status", "").equals("FAILED") ? "error" : "info")
                    .put("message", safe(event.optString("detail", event.optString("reason", event.optString("action", event.optString("status", "Minecraft event"))))))
                    .put("createdAt", System.currentTimeMillis());
            database.upsert("logs", row.toString());
        } catch (Exception ignored) { }
    }

    private void updateNotification(JSONObject event) {
        String type = event.optString("type", "");
        if (type.equals("bot_state")) {
            String status = event.optString("status", "");
            NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (manager != null) {
                if (status.equals("ONLINE") || status.equals("CONNECTING") || status.equals("JOINING") || status.equals("RECONNECTING") || status.equals("DEAD")) {
                    manager.notify(NOTIFICATION_ID, buildNotification("جلسة Minecraft", "حالة البروتوكول: " + status));
                } else if (status.equals("FAILED") || status.equals("DISCONNECTED")) {
                    manager.notify(NOTIFICATION_ID, buildNotification("جلسة Minecraft غير متصلة", safe(event.optString("reason", status))));
                }
            }
        }
    }

    private static JSONObject findById(String array, String id) throws JSONException {
        JSONArray values = new JSONArray(array);
        for (int i = 0; i < values.length(); i++) {
            JSONObject record = values.optJSONObject(i);
            if (record != null && id.equals(record.optString("id", ""))) return record;
        }
        return null;
    }

    private void emitEngineState(String status, String reason) {
        try { emit("engine_state", new JSONObject().put("status", status).put("reason", safe(reason))); }
        catch (JSONException ignored) { }
    }

    private void emit(String eventName, JSONObject payload) {
        if ("engine_state".equals(eventName) && payload != null) {
            getSharedPreferences("minebot_engine_state_v1", MODE_PRIVATE).edit()
                    .putString("status", payload.optString("status", "UNKNOWN"))
                    .putString("runtime", payload.optString("runtime", runtime))
                    .putString("reason", safe(payload.optString("reason", "")))
                    .putLong("observedAt", System.currentTimeMillis())
                    .apply();
        }
        Intent intent = new Intent(EVENT_ACTION).setPackage(getPackageName()).putExtra("eventName", eventName).putExtra("payload", payload == null ? "{}" : payload.toString());
        sendBroadcast(intent);
    }

    private static JSONObject error(String message) {
        try { return new JSONObject().put("type", "service_error").put("reason", message); }
        catch (JSONException ignored) { return new JSONObject(); }
    }

    private static String safe(String value) {
        if (value == null) return "حدث محرك Minecraft.";
        String sanitized = value.replaceAll("(?i)(access[_ -]?token|refresh[_ -]?token|client[_ -]?token|authorization|bearer)\\s*[:=]?\\s*[^\\s,;]+", "$1=[مخفي]")
                .replaceAll("sk-or-[^\\s\"'<>]+", "[مفتاح مخفي]")
                .replaceAll("[\\r\\n\\u0000-\\u001f]", " ").trim();
        return sanitized.length() > 320 ? sanitized.substring(0, 320) : sanitized;
    }

    private String randomToken() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        StringBuilder value = new StringBuilder(64);
        for (byte item : bytes) value.append(String.format(java.util.Locale.ROOT, "%02x", item & 0xff));
        Arrays.fill(bytes, (byte) 0);
        return value.toString();
    }

    private void installNodeProject(File destination) throws Exception {
        File marker = new File(destination, ".minebot-engine-v" + BuildConfig.VERSION_CODE);
        if (marker.isFile()) return;
        deleteTree(destination);
        if (!destination.mkdirs() && !destination.isDirectory()) throw new IllegalStateException("تعذر إنشاء مجلد محرك التطبيق.");
        copyAssetTree("nodejs-project", destination);
        try (FileOutputStream output = new FileOutputStream(marker)) { output.write("engine-v1".getBytes(StandardCharsets.UTF_8)); output.getFD().sync(); }
    }

    private void copyAssetTree(String source, File destination) throws Exception {
        String[] children = getAssets().list(source);
        if (children == null || children.length == 0) {
            try (InputStream input = getAssets().open(source); FileOutputStream output = new FileOutputStream(destination)) {
                byte[] buffer = new byte[32 * 1024];
                int read;
                while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            }
            return;
        }
        if (!destination.exists() && !destination.mkdirs()) throw new IllegalStateException("تعذر إنشاء أحد مجلدات محرك Minecraft.");
        for (String child : children) copyAssetTree(source + "/" + child, new File(destination, child));
    }

    private static void deleteTree(File file) {
        if (file == null || !file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteTree(child);
        if (!file.delete()) file.deleteOnExit();
    }

    private void promoteToForeground() {
        Notification notification = buildNotification("تهيئة خدمة Minecraft", "بانتظار بدء Node/Mineflayer؛ لا توجد جلسة Minecraft مؤكدة بعد.");
        if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
        else startForeground(NOTIFICATION_ID, notification);
    }

    private Notification buildNotification(String title, String text) {
        Intent openApp = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, openApp, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_minebot)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) manager.createNotificationChannel(new NotificationChannel(CHANNEL, "جلسات Minecraft", NotificationManager.IMPORTANCE_LOW));
    }

    private void acquireWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) return;
            PowerManager manager = (PowerManager) getSystemService(POWER_SERVICE);
            if (manager != null) {
                wakeLock = manager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MineBotAI:BotEngine");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire(6L * 60L * 60L * 1000L);
            }
        } catch (Exception ignored) { }
    }

    private void releaseWakeLock() {
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); }
        catch (Exception ignored) { }
        wakeLock = null;
    }

    private void shutdownRuntime() {
        if (!closing.compareAndSet(false, true)) return;
        authenticated = false;
        try { if (serverSocket != null) serverSocket.close(); } catch (Exception ignored) { }
        try { if (workerSocket != null) workerSocket.close(); } catch (Exception ignored) { }
        deleteTree(authCacheDirectory);
        releaseWakeLock();
        if (!"FAILED".equals(getSharedPreferences("minebot_engine_state_v1", MODE_PRIVATE).getString("status", ""))) {
            try { emit("engine_state", new JSONObject().put("status", "STOPPED").put("reason", "أُوقفت خدمة محرك Minecraft بعد انتهاء الجلسات.")); }
            catch (JSONException ignored) { }
        }
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override public void onDestroy() {
        closing.set(true);
        try { if (serverSocket != null) serverSocket.close(); } catch (Exception ignored) { }
        try { if (workerSocket != null) workerSocket.close(); } catch (Exception ignored) { }
        deleteTree(authCacheDirectory);
        releaseWakeLock();
        if (database != null) database.close();
        io.shutdownNow();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
