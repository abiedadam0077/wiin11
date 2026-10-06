package com.minebot.ai;

import android.content.Context;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.net.ssl.HttpsURLConnection;

/** Narrow JS bridge for trusted bundled UI: SQLite, Keystore-backed secrets, and local TCP status ping. */
public final class MineBotBridge {
    private static final int MAX_SKIN_BYTES = 2 * 1024 * 1024;
    private static final int MAX_BACKUP_BYTES = 8 * 1024 * 1024;
    private final MainActivity activity;
    private final WebView webView;
    private final DatabaseStore database;
    private final SecureStore secureStore;
    private final ExecutorService io = Executors.newFixedThreadPool(3);

    MineBotBridge(MainActivity activity, WebView webView, DatabaseStore database, SecureStore secureStore) {
        this.activity = activity;
        this.webView = webView;
        this.database = database;
        this.secureStore = secureStore;
    }

    @JavascriptInterface public String readAll(String table) { return database.readAll(table); }
    @JavascriptInterface public String upsert(String table, String payload) { return database.upsert(table, payload); }
    @JavascriptInterface public String remove(String table, String id) { return database.remove(table, id); }
    @JavascriptInterface public String clear(String table) { return database.clear(table); }
    @JavascriptInterface public boolean hasApiKey() { return secureStore.hasApiKey(); }

    @JavascriptInterface public String saveApiKey(String key) {
        try {
            secureStore.saveApiKey(key);
            return new JSONObject().put("ok", true).put("configured", true).toString();
        } catch (IllegalArgumentException error) {
            return errorJson(error.getMessage());
        } catch (Exception ignored) {
            return errorJson("تعذر تشفير المفتاح في Android Keystore.");
        }
    }

    @JavascriptInterface public String clearApiKey() {
        try { secureStore.clearApiKey(); return "{\"ok\":true}"; }
        catch (Exception ignored) { return errorJson("تعذر حذف المفتاح المشفر."); }
    }

    @JavascriptInterface public void pingServer(String host, int port, int timeoutMs, String requestId) {
        io.execute(() -> {
            String response;
            try { response = MinecraftStatus.ping(host, port, Math.max(2000, Math.min(30_000, timeoutMs))).toString(); }
            catch (Exception error) { response = errorJson(safeError(error)).replace("\"ok\":false,", "\"online\":false,"); }
            deliver(requestId, response);
        });
    }

    @JavascriptInterface public void openRouter(String endpoint, String method, String body, String requestId) {
        io.execute(() -> {
            String response;
            try { response = requestOpenRouter(endpoint, method, body); }
            catch (Exception error) { response = errorJson(safeError(error)); }
            deliver(requestId, response);
        });
    }

    @JavascriptInterface public void saveSkin(String originalName, String dataUrl, String requestId) {
        io.execute(() -> {
            String response;
            try { response = saveSkinToAppStorage(originalName, dataUrl); }
            catch (Exception error) { response = errorJson(safeError(error)); }
            deliver(requestId, response);
        });
    }

    @JavascriptInterface public String deleteSkin(String id, String filePath) {
        try {
            String filename = Uri.parse(filePath == null ? "" : filePath).getLastPathSegment();
            if (filename == null || !filename.matches("[a-fA-F0-9-]{36}\\.(png|jpg|webp)")) return errorJson("مسار ملف السكن غير صالح.");
            File directory = new File(activity.getFilesDir(), "skins").getCanonicalFile();
            File file = new File(directory, filename).getCanonicalFile();
            if (!file.getParentFile().equals(directory)) return errorJson("مسار ملف السكن غير مسموح.");
            boolean deleted = !file.exists() || file.delete();
            if (!deleted) return errorJson("تعذر حذف ملف السكن.");
            return "{\"ok\":true}";
        } catch (Exception ignored) { return errorJson("تعذر حذف ملف السكن المحلي."); }
    }

    @JavascriptInterface public void saveBackup(String json, String requestId) {
        io.execute(() -> {
            String response;
            try { response = writeBackup(json); }
            catch (Exception error) { response = errorJson(safeError(error)); }
            deliver(requestId, response);
        });
    }

    @JavascriptInterface public boolean hasPin() { return secureStore.hasPin(); }
    @JavascriptInterface public String savePin(String pin) {
        try { secureStore.savePin(pin); return "{\"ok\":true,\"enabled\":true}"; }
        catch (Exception ignored) { return errorJson("تعذر حفظ رمز القفل."); }
    }
    @JavascriptInterface public String verifyPin(String pin) {
        return "{\"valid\":" + secureStore.verifyPin(pin) + "}";
    }
    @JavascriptInterface public String clearPin(String unused) {
        try { secureStore.clearPin(); return "{\"ok\":true,\"enabled\":false}"; }
        catch (Exception ignored) { return errorJson("تعذر إزالة رمز القفل."); }
    }

    @JavascriptInterface public String requestNotificationPermission() { return activity.requestMineBotNotificationPermission(); }
    @JavascriptInterface public void notify(String title, String body) { activity.showMineBotNotification(title, body); }

    private String requestOpenRouter(String endpoint, String method, String body) throws Exception {
        if (!("/models".equals(endpoint) || "/chat/completions".equals(endpoint))) return errorJson("مسار OpenRouter غير مسموح.");
        String verb = method == null ? "GET" : method.toUpperCase(Locale.ROOT);
        if (("/models".equals(endpoint) && !"GET".equals(verb)) || ("/chat/completions".equals(endpoint) && !"POST".equals(verb))) return errorJson("طريقة طلب OpenRouter غير مسموحة.");
        if (body != null && body.length() > 1_000_000) return errorJson("طلب AI أكبر من الحد المسموح.");
        String key = secureStore.readApiKey();
        if (key == null || key.length() < 20) return errorJson("أضف مفتاح OpenRouter من الإعدادات.");

        HttpsURLConnection connection = null;
        try {
            URL url = new URL("https://openrouter.ai/api/v1" + endpoint);
            connection = (HttpsURLConnection) url.openConnection();
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout("/models".equals(endpoint) ? 20_000 : 45_000);
            connection.setRequestMethod(verb);
            connection.setRequestProperty("Authorization", "Bearer " + key);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("X-Title", "MineBot AI");
            connection.setUseCaches(false);
            if ("POST".equals(verb)) {
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                try (OutputStream output = connection.getOutputStream()) {
                    output.write((body == null ? "{}" : body).getBytes(StandardCharsets.UTF_8));
                }
            }
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                String message = status == 401 ? "مفتاح OpenRouter مرفوض؛ تحقّق من المفتاح." : status == 429 ? "تم تجاوز حد OpenRouter؛ حاول لاحقًا." : "أعاد OpenRouter خطأ HTTP " + status + ".";
                return errorJson(message);
            }
            try (InputStream input = connection.getInputStream()) {
                byte[] bytes = readLimited(input, 5 * 1024 * 1024);
                return new String(bytes, StandardCharsets.UTF_8);
            }
        } finally {
            if (connection != null) connection.disconnect();
            // The value is not written to disk or logs. The JVM String itself is immutable.
        }
    }

    private String saveSkinToAppStorage(String originalName, String dataUrl) throws Exception {
        if (dataUrl == null || dataUrl.length() > 2_800_000) throw new IllegalArgumentException("حجم ملف السكن أكبر من 2 MB.");
        Matcher matcher = Pattern.compile("^data:image/png;base64,([A-Za-z0-9+/=]+)$", Pattern.CASE_INSENSITIVE).matcher(dataUrl);
        if (!matcher.matches()) throw new IllegalArgumentException("اختر ملف سكن PNG صالحًا.");
        byte[] bytes;
        try { bytes = Base64.decode(matcher.group(1), Base64.DEFAULT); }
        catch (IllegalArgumentException ignored) { throw new IllegalArgumentException("بيانات صورة السكن غير صالحة."); }
        if (bytes.length < 33 || bytes.length > MAX_SKIN_BYTES) throw new IllegalArgumentException("حجم ملف السكن غير صالح أو يتجاوز 2 MB.");
        byte[] signature = new byte[]{(byte) 137, 80, 78, 71, 13, 10, 26, 10};
        if (!java.util.Arrays.equals(java.util.Arrays.copyOfRange(bytes, 0, 8), signature)) throw new IllegalArgumentException("محتوى الملف ليس صورة PNG.");
        BitmapFactory.Options dimensions = new BitmapFactory.Options();
        dimensions.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, dimensions);
        if (dimensions.outWidth != 64 || (dimensions.outHeight != 32 && dimensions.outHeight != 64)) throw new IllegalArgumentException("أبعاد السكن يجب أن تكون 64×64 أو 64×32 بكسل.");
        String extension = "png";
        File directory = new File(activity.getFilesDir(), "skins");
        if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("تعذر إنشاء مجلد skins المحلي.");
        String id = UUID.randomUUID().toString();
        File file = new File(directory, id + "." + extension);
        try (FileOutputStream output = new FileOutputStream(file, false)) { output.write(bytes); output.flush(); }
        java.util.Arrays.fill(bytes, (byte) 0);
        return new JSONObject().put("ok", true).put("id", id).put("filePath", Uri.fromFile(file).toString()).put("bytes", file.length()).toString();
    }

    private String writeBackup(String json) throws Exception {
        if (json == null || json.getBytes(StandardCharsets.UTF_8).length > MAX_BACKUP_BYTES) throw new IllegalArgumentException("حجم النسخة الاحتياطية أكبر من 8 MB.");
        JSONObject input = new JSONObject(json);
        if (!(input.opt("entities") instanceof JSONObject)) throw new IllegalArgumentException("صيغة النسخة الاحتياطية غير صالحة.");
        JSONObject backup = new JSONObject();
        backup.put("format", "minebot-local-backup-v1");
        backup.put("createdAt", System.currentTimeMillis());
        backup.put("entities", input.getJSONObject("entities"));
        File directory = new File(activity.getFilesDir(), "backups");
        if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("تعذر إنشاء مجلد النسخ الاحتياطية.");
        String date = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date());
        File target = new File(directory, "minebot-backup-" + date + ".json");
        try (FileOutputStream output = new FileOutputStream(target, false)) {
            output.write(backup.toString().getBytes(StandardCharsets.UTF_8));
            output.flush();
            output.getFD().sync();
        }
        return new JSONObject().put("ok", true).put("filename", target.getName()).put("path", target.getAbsolutePath()).toString();
    }

    private static byte[] readLimited(InputStream input, int maxBytes) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int total = 0;
        int count;
        while ((count = input.read(buffer)) != -1) {
            total += count;
            if (total > maxBytes) throw new IllegalStateException("استجابة OpenRouter أكبر من الحد المسموح.");
            output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }

    private void deliver(String requestId, String result) {
        if (requestId == null || requestId.length() > 96) return;
        final String idLiteral = JSONObject.quote(requestId);
        final String resultLiteral = JSONObject.quote(result == null ? "{}" : result);
        webView.post(() -> webView.evaluateJavascript("window.__minebotNativeResult && window.__minebotNativeResult(" + idLiteral + "," + resultLiteral + ")", null));
    }

    private static String safeError(Exception error) {
        String message = error == null ? "حدث خطأ محلي." : error.getMessage();
        if (message == null || message.trim().isEmpty()) return "حدث خطأ محلي. تحقق من الإعدادات وحاول مجددًا.";
        return message.replaceAll("sk-or-[^\\s\\\"'<>]+", "[مفتاح مخفي]").substring(0, Math.min(220, message.length()));
    }

    private static String errorJson(String message) {
        try { return new JSONObject().put("ok", false).put("error", message == null ? "تعذر إكمال العملية." : message).toString(); }
        catch (JSONException ignored) { return "{\"ok\":false,\"error\":\"تعذر إكمال العملية\"}"; }
    }
}
