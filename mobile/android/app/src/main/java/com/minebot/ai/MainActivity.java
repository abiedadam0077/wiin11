package com.minebot.ai;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

import io.flutter.embedding.android.FlutterActivity;
import io.flutter.embedding.engine.FlutterEngine;
import io.flutter.plugin.common.EventChannel;
import io.flutter.plugin.common.MethodCall;
import io.flutter.plugin.common.MethodChannel;

/** Flutter/Dart host with a narrow typed bridge to local Android and Minecraft services. */
public final class MainActivity extends FlutterActivity implements MethodChannel.MethodCallHandler {
    public static final String METHOD_CHANNEL = "com.minebot.ai/native";
    public static final String EVENT_CHANNEL = "com.minebot.ai/events";
    private static final String PREFERENCES = "minebot_flutter_preferences_v1";
    private static final int NOTIFICATION_PERMISSION_REQUEST = 7302;
    private static final int MAX_JSON_BYTES = 1_000_000;
    private static final Set<String> ALLOWED_COMMANDS = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
            "chat", "look", "control", "follow", "goto", "stop-navigation", "dig", "use-item",
            "interact-block", "respawn", "collect", "execute-tool", "observe-nearby-blocks",
            "pause-task", "resume-task", "cancel-task"
    )));
    private static final Pattern SECRET_PATTERN = Pattern.compile(
            "(?i)(access[_ -]?token|refresh[_ -]?token|client[_ -]?token|authorization|bearer)\\s*[:=]?\\s*[^\\s,;]+|sk-or-[^\\s\\\"'<>]+"
    );

    private final ExecutorService io = Executors.newFixedThreadPool(3);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final BroadcastReceiver engineReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (!BotEngineService.EVENT_ACTION.equals(intent.getAction())) return;
            final EventChannel.EventSink sink = eventSink;
            if (sink == null) return;
            String name = intent.getStringExtra("eventName");
            String raw = intent.getStringExtra("payload");
            try {
                JSONObject event = new JSONObject(raw == null ? "{}" : raw);
                if (!event.has("type")) event.put("type", name == null ? "unknown" : name);
                if (name != null) event.put("eventName", name);
                Map<String, Object> value = jsonObjectToMap(event);
                mainHandler.post(() -> {
                    EventChannel.EventSink current = eventSink;
                    if (current != null) current.success(value);
                });
            } catch (JSONException ignored) {
                // Malformed engine broadcasts are discarded instead of leaking raw payloads.
            }
        }
    };

    private DatabaseStore database;
    private SecureStore secureStore;
    private MethodChannel methodChannel;
    private EventChannel.EventSink eventSink;
    private boolean receiverRegistered;

    @Override protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        database = new DatabaseStore(getApplicationContext());
        secureStore = new SecureStore(getApplicationContext());
    }

    @Override public void configureFlutterEngine(@NonNull FlutterEngine flutterEngine) {
        super.configureFlutterEngine(flutterEngine);
        methodChannel = new MethodChannel(flutterEngine.getDartExecutor().getBinaryMessenger(), METHOD_CHANNEL);
        methodChannel.setMethodCallHandler(this);
        new EventChannel(flutterEngine.getDartExecutor().getBinaryMessenger(), EVENT_CHANNEL).setStreamHandler(new EventChannel.StreamHandler() {
            @Override public void onListen(Object arguments, EventChannel.EventSink sink) { eventSink = sink; }
            @Override public void onCancel(Object arguments) { eventSink = null; }
        });
    }

    @Override protected void onStart() {
        super.onStart();
        registerEngineReceiver();
    }

    @Override protected void onStop() {
        unregisterEngineReceiver();
        super.onStop();
    }

    @Override protected void onDestroy() {
        unregisterEngineReceiver();
        if (methodChannel != null) methodChannel.setMethodCallHandler(null);
        eventSink = null;
        io.shutdownNow();
        if (database != null) database.close();
        super.onDestroy();
    }

    private void registerEngineReceiver() {
        if (receiverRegistered) return;
        IntentFilter filter = new IntentFilter(BotEngineService.EVENT_ACTION);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(engineReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(engineReceiver, filter);
        receiverRegistered = true;
    }

    private void unregisterEngineReceiver() {
        if (!receiverRegistered) return;
        try { unregisterReceiver(engineReceiver); }
        catch (IllegalArgumentException ignored) { }
        receiverRegistered = false;
    }

    @Override public void onMethodCall(@NonNull MethodCall call, @NonNull MethodChannel.Result result) {
        try {
            switch (call.method) {
                case "readRecords": {
                    String table = requiredString(call, "table", 64);
                    runOnIo(result, () -> database.readAll(table));
                    return;
                }
                case "upsertRecord": {
                    String table = requiredString(call, "table", 64);
                    String json = requiredString(call, "json", MAX_JSON_BYTES);
                    runOnIo(result, () -> database.upsert(table, json));
                    return;
                }
                case "removeRecord": {
                    String table = requiredString(call, "table", 64);
                    String id = requiredString(call, "id", 128);
                    runOnIo(result, () -> database.remove(table, id));
                    return;
                }
                case "clearRecords": {
                    String table = requiredString(call, "table", 64);
                    runOnIo(result, () -> database.clear(table));
                    return;
                }
                case "countRecords": {
                    String table = requiredString(call, "table", 64);
                    runOnIo(result, () -> database.count(table));
                    return;
                }
                case "getEngineStatus":
                    result.success(engineStatus());
                    return;
                case "connectBot": {
                    String botId = requiredString(call, "botId", 128);
                    requestNotifications();
                    BotEngineService.connect(getApplicationContext(), botId);
                    result.success(null);
                    return;
                }
                case "disconnectBot": {
                    String botId = requiredString(call, "botId", 128);
                    BotEngineService.disconnect(getApplicationContext(), botId);
                    result.success(null);
                    return;
                }
                case "reconnectBot": {
                    String botId = requiredString(call, "botId", 128);
                    BotEngineService.connect(getApplicationContext(), botId);
                    result.success(null);
                    return;
                }
                case "stopAllBots":
                    BotEngineService.stopAll(getApplicationContext());
                    result.success(null);
                    return;
                case "sendCommand": {
                    String json = requiredString(call, "json", 32_768);
                    JSONObject command = new JSONObject(json);
                    String action = command.optString("action", "");
                    if (!ALLOWED_COMMANDS.contains(action)) throw new IllegalArgumentException("Minecraft action is not enabled in this client.");
                    if ("execute-tool".equals(action) && !"collect_block".equals(command.optString("toolName", ""))) {
                        throw new IllegalArgumentException("Only the registered collect_block tool is enabled.");
                    }
                    if (("execute-tool".equals(action) || "collect".equals(action)) && command.optString("taskId", "").isEmpty()) {
                        throw new IllegalArgumentException("A saved task ID is required before collection can start.");
                    }
                    BotEngineService.sendCommand(getApplicationContext(), command);
                    result.success(null);
                    return;
                }
                case "pingServer": {
                    String host = requiredString(call, "host", 253);
                    Integer port = requiredInteger(call, "port", 1, 65535);
                    io.execute(() -> {
                        try {
                            JSONObject response = MinecraftStatus.ping(host, port, 7_000);
                            complete(result, jsonObjectToMap(response));
                        } catch (Exception error) {
                            fail(result, "STATUS_PING", safe(error), null);
                        }
                    });
                    return;
                }
                case "hasApiKey":
                    result.success(secureStore.hasApiKey());
                    return;
                case "saveApiKey": {
                    String key = requiredString(call, "key", 512);
                    io.execute(() -> {
                        try {
                            secureStore.saveApiKey(key);
                            complete(result, null);
                        } catch (Exception error) {
                            fail(result, "SECURE_STORE", safe(error), null);
                        }
                    });
                    return;
                }
                case "clearApiKey":
                    secureStore.clearApiKey();
                    result.success(null);
                    return;
                case "discoverFreeModels":
                    io.execute(() -> discoverFreeModels(result));
                    return;
                case "createPlan": {
                    String prompt = requiredString(call, "prompt", 4_000);
                    String model = requiredString(call, "model", 200);
                    String modelsJson = requiredString(call, "modelsJson", 200_000);
                    io.execute(() -> createPlan(result, prompt, model, modelsJson));
                    return;
                }
                case "getPreference": {
                    String key = requiredString(call, "key", 64);
                    if (!"welcome_seen".equals(key)) throw new IllegalArgumentException("Preference is not available to the UI.");
                    result.success(getSharedPreferences(PREFERENCES, MODE_PRIVATE).getBoolean(key, false));
                    return;
                }
                case "setPreference": {
                    String key = requiredString(call, "key", 64);
                    if (!"welcome_seen".equals(key)) throw new IllegalArgumentException("Preference is not available to the UI.");
                    Object value = call.argument("value");
                    if (!(value instanceof Boolean)) throw new IllegalArgumentException("Preference value must be boolean.");
                    getSharedPreferences(PREFERENCES, MODE_PRIVATE).edit().putBoolean(key, (Boolean) value).apply();
                    result.success(null);
                    return;
                }
                case "requestNotificationPermission":
                    requestNotifications();
                    result.success(null);
                    return;
                case "openExternalUrl": {
                    String rawUrl = requiredString(call, "url", 2_048);
                    openTrustedExternalUrl(rawUrl);
                    result.success(null);
                    return;
                }
                default:
                    result.notImplemented();
            }
        } catch (Exception error) {
            fail(result, "NATIVE_OPERATION", safe(error), null);
        }
    }

    private void discoverFreeModels(MethodChannel.Result result) {
        try {
            String key = secureStore.readApiKey();
            if (key.isEmpty()) throw new IllegalStateException("Add an OpenRouter API key in AI settings first.");
            JSONArray models = new OpenRouterClient().discoverFreeModels(key);
            complete(result, models.toString());
        } catch (Exception error) {
            fail(result, "OPENROUTER", safe(error), null);
        }
    }

    private void createPlan(MethodChannel.Result result, String prompt, String model, String modelsJson) {
        try {
            JSONArray models = new JSONArray(modelsJson);
            boolean permittedModel = false;
            for (int i = 0; i < models.length(); i++) {
                JSONObject item = models.optJSONObject(i);
                if (item != null && model.equals(item.optString("id")) && item.optBoolean("supportsTools", false)) {
                    permittedModel = true;
                    break;
                }
            }
            if (!permittedModel) throw new IllegalArgumentException("Choose a tool-capable model discovered by this app before planning.");
            String key = secureStore.readApiKey();
            if (key.isEmpty()) throw new IllegalStateException("The OpenRouter key is not configured.");
            JSONObject plan = new OpenRouterClient().createPlan(key, prompt, model, models);
            complete(result, plan.toString());
        } catch (Exception error) {
            fail(result, "OPENROUTER", safe(error), null);
        }
    }

    private Map<String, Object> engineStatus() {
        SharedPreferences values = getSharedPreferences("minebot_engine_state_v1", MODE_PRIVATE);
        String status = values.getString("status", "STOPPED");
        long observedAt = values.getLong("observedAt", 0L);
        if ("READY".equals(status) && (observedAt <= 0L || System.currentTimeMillis() - observedAt > 10_000L)) status = "STOPPED";
        java.util.HashMap<String, Object> output = new java.util.HashMap<>();
        output.put("status", status);
        output.put("runtime", values.getString("runtime", ""));
        output.put("reason", values.getString("reason", ""));
        output.put("observedAt", observedAt);
        return output;
    }

    private void requestNotifications() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
        }
    }

    private void openTrustedExternalUrl(String rawUrl) throws Exception {
        Uri uri = Uri.parse(rawUrl);
        if (!"https".equalsIgnoreCase(uri.getScheme())) throw new IllegalArgumentException("Only trusted HTTPS sign-in pages can be opened.");
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(java.util.Locale.ROOT);
        if (!(host.equals("aka.ms") || host.endsWith(".microsoft.com") || host.equals("microsoft.com")
                || host.endsWith(".live.com") || host.equals("live.com") || host.endsWith(".microsoftonline.com")
                || host.equals("microsoftonline.com"))) {
            throw new IllegalArgumentException("This link is not an official Microsoft authentication host.");
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        if (intent.resolveActivity(getPackageManager()) == null) throw new IllegalStateException("No browser can open the Microsoft sign-in link.");
        startActivity(intent);
    }

    private static String requiredString(MethodCall call, String key, int maximumLength) {
        Object raw = call.argument(key);
        if (!(raw instanceof String)) throw new IllegalArgumentException("Missing or invalid " + key + ".");
        String value = (String) raw;
        if (value.isEmpty() || value.length() > maximumLength) throw new IllegalArgumentException("Invalid " + key + " length.");
        return value;
    }

    private static Integer requiredInteger(MethodCall call, String key, int minimum, int maximum) {
        Object raw = call.argument(key);
        if (!(raw instanceof Number)) throw new IllegalArgumentException("Missing or invalid " + key + ".");
        double value = ((Number) raw).doubleValue();
        if (!Double.isFinite(value) || value != Math.rint(value) || value < minimum || value > maximum) throw new IllegalArgumentException("Invalid " + key + ".");
        return (int) value;
    }

    private interface IoOperation { Object run() throws Exception; }

    private void runOnIo(MethodChannel.Result result, IoOperation operation) {
        io.execute(() -> {
            try { complete(result, operation.run()); }
            catch (Exception error) { fail(result, "LOCAL_STORAGE", safe(error), null); }
        });
    }

    private void complete(MethodChannel.Result result, Object value) {
        mainHandler.post(() -> result.success(value));
    }

    private void fail(MethodChannel.Result result, String code, String message, Object details) {
        mainHandler.post(() -> result.error(code, message, details));
    }

    private static String safe(Throwable error) {
        String message = error == null ? "Operation failed." : String.valueOf(error.getMessage());
        if (message.trim().isEmpty()) message = "Operation failed.";
        message = SECRET_PATTERN.matcher(message).replaceAll("[redacted]")
                .replaceAll("[\\r\\n\\u0000-\\u001f]", " ").trim();
        return message.length() > 320 ? message.substring(0, 320) : message;
    }

    private static Map<String, Object> jsonObjectToMap(JSONObject object) throws JSONException {
        java.util.HashMap<String, Object> output = new java.util.HashMap<>();
        Iterator<String> keys = object.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            output.put(key, jsonValue(object.opt(key)));
        }
        return output;
    }

    private static Object jsonValue(Object value) throws JSONException {
        if (value == null || value == JSONObject.NULL) return null;
        if (value instanceof JSONObject) return jsonObjectToMap((JSONObject) value);
        if (value instanceof JSONArray) {
            JSONArray input = (JSONArray) value;
            java.util.ArrayList<Object> output = new java.util.ArrayList<>(input.length());
            for (int i = 0; i < input.length(); i++) output.add(jsonValue(input.opt(i)));
            return output;
        }
        if (value instanceof String || value instanceof Boolean || value instanceof Integer || value instanceof Long || value instanceof Double) return value;
        if (value instanceof Number) return ((Number) value).doubleValue();
        return String.valueOf(value);
    }
}
