package com.minebot.ai;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** OpenRouter adapter. AI returns a proposed, constrained task; it never sends game protocol commands. */
final class OpenRouterClient {
    private static final String API = "https://openrouter.ai/api/v1";
    private static final int MAX_RESPONSE_BYTES = 1_000_000;

    JSONArray discoverFreeModels(String apiKey) throws Exception {
        JSONObject response = request("GET", API + "/models", apiKey, null, 10_000, 20_000);
        JSONArray data = response.optJSONArray("data");
        if (data == null) throw new IllegalStateException("لم يُرجع OpenRouter قائمة نماذج صالحة.");
        List<JSONObject> models = new ArrayList<>();
        for (int i = 0; i < data.length() && models.size() < 2000; i++) {
            JSONObject model = data.optJSONObject(i);
            if (model == null || !isFree(model)) continue;
            String id = model.optString("id", "").trim();
            if (id.isEmpty() || id.length() > 200) continue;
            JSONObject item = new JSONObject();
            try {
                item.put("id", id)
                        .put("name", model.optString("name", id))
                        .put("contextLength", Math.max(0, model.optInt("context_length", 0)))
                        .put("supportsTools", supportsToolCalls(model))
                        .put("description", model.optString("description", ""));
                models.add(item);
            } catch (JSONException ignored) { }
        }
        models.sort(Comparator
                .comparing((JSONObject model) -> model.optBoolean("supportsTools", false)).reversed()
                .thenComparing(Comparator.comparingInt((JSONObject model) -> model.optInt("contextLength", 0)).reversed())
                .thenComparing(model -> model.optString("id", "")));
        JSONArray result = new JSONArray();
        for (int i = 0; i < Math.min(models.size(), 50); i++) result.put(models.get(i));
        return result;
    }

    JSONObject createPlan(String apiKey, String rawPrompt, String preferredModel, JSONArray fallbackModels) throws Exception {
        String prompt = rawPrompt == null ? "" : rawPrompt.trim();
        if (prompt.isEmpty() || prompt.length() > 4000) throw new IllegalArgumentException("اكتب طلبًا من 1 إلى 4000 حرف.");
        Set<String> candidates = new LinkedHashSet<>();
        if (preferredModel != null && !preferredModel.trim().isEmpty()) candidates.add(preferredModel.trim());
        if (fallbackModels != null) {
            for (int i = 0; i < fallbackModels.length() && candidates.size() < 5; i++) {
                JSONObject model = fallbackModels.optJSONObject(i);
                if (model != null) {
                    String id = model.optString("id", "").trim();
                    if (!id.isEmpty()) candidates.add(id);
                }
            }
        }
        if (candidates.isEmpty()) throw new IllegalStateException("اكتشف نموذجًا مجانيًا أو اختره قبل طلب التخطيط.");

        Exception lastFailure = null;
        int attempted = 0;
        for (String model : candidates) {
            if (attempted++ >= 5) break;
            try { return requestPlanForModel(apiKey, prompt, model); }
            catch (Exception error) { lastFailure = error; }
        }
        throw new IllegalStateException(lastFailure == null ? "لم يتوفر نموذج تخطيط." : safe(lastFailure.getMessage()));
    }

    private JSONObject requestPlanForModel(String apiKey, String prompt, String model) throws Exception {
        JSONObject system = new JSONObject()
                .put("role", "system")
                .put("content", "أنت مخطط عالي المستوى لتطبيق Minecraft Java فقط. لا تدّع معرفة العالم أو المخزون أو الاتصال ولا تنفّذ بنفسك. لديك وظيفة واحدة فقط اسمها collect_block مقدّمة من التطبيق؛ إذا كان طلب المستخدم يطابق جمع كتلة واحدة بكمية 1 إلى 320 وبمعرّف block_name صالح، استدعِ هذه الوظيفة مرة واحدة بالوسائط المحددة. لا تستدعِ أدوات أخرى ولا تضع أوامر داخل النص. إذا كان الطلب غير مدعوم، أو يحتاج خامًا ذا Drop مختلف أو صندوقًا أو تصنيعًا أو عدة خطوات، فأعد JSON فقط بالشكل {\"action\":\"unsupported\",\"reason\":\"...\"}. لا تفترض أن الكتلة موجودة أو أن التنفيذ سينجح؛ سيطلب التطبيق موافقة المستخدم ثم يتحقق Mineflayer من العالم والمخزون.");
        JSONObject user = new JSONObject().put("role", "user").put("content", prompt);
        JSONArray messages = new JSONArray().put(system).put(user);
        JSONObject body = new JSONObject()
                .put("model", model)
                .put("messages", messages)
                .put("tools", new JSONArray().put(collectBlockTool()))
                .put("tool_choice", "auto")
                .put("temperature", 0.15)
                .put("max_tokens", 350);
        JSONObject response = request("POST", API + "/chat/completions", apiKey, body, 12_000, 35_000);
        JSONArray choices = response.optJSONArray("choices");
        JSONObject first = choices == null ? null : choices.optJSONObject(0);
        JSONObject message = first == null ? null : first.optJSONObject("message");
        if (message == null) throw new IllegalStateException("لم يُرجع OpenRouter رسالة خطة صالحة.");
        JSONObject plan;
        JSONArray calls = message.optJSONArray("tool_calls");
        if (calls != null && calls.length() > 0) {
            if (calls.length() != 1) plan = unsupported("أعاد النموذج أكثر من Tool Call؛ رُفضت الخطة ولم يُرسل أمر.");
            else {
                JSONObject call = calls.optJSONObject(0);
                JSONObject function = call == null ? null : call.optJSONObject("function");
                String name = function == null ? "" : function.optString("name", "");
                String arguments = function == null ? "" : function.optString("arguments", "");
                plan = parseToolCall(name, arguments, message.optString("content", ""));
            }
        } else {
            String content = message.optString("content", "").trim();
            plan = parsePlan(content);
        }
        plan.put("model", model);
        plan.put("createdAt", System.currentTimeMillis());
        return plan;
    }

    static JSONObject collectBlockTool() throws JSONException {
        JSONObject properties = new JSONObject()
                .put("block_name", new JSONObject().put("type", "string").put("pattern", "^[a-z0-9_]{1,64}$"))
                .put("amount", new JSONObject().put("type", "integer").put("minimum", 1).put("maximum", 320));
        JSONObject parameters = new JSONObject().put("type", "object").put("additionalProperties", false)
                .put("properties", properties).put("required", new JSONArray().put("block_name").put("amount"));
        JSONObject function = new JSONObject().put("name", "collect_block")
                .put("description", "Propose a single bounded collection task. This is only a plan; the Android user must approve it before the local Minecraft Task Engine executes it.")
                .put("parameters", parameters);
        return new JSONObject().put("type", "function").put("function", function);
    }

    static JSONObject parseToolCall(String toolName, String rawArguments, String reason) throws Exception {
        if (!"collect_block".equals(toolName)) return unsupported("طلب النموذج أداة غير مسجلة؛ لم يُنشأ أمر Minecraft.");
        JSONObject arguments;
        try { arguments = new JSONObject(rawArguments == null ? "" : rawArguments); }
        catch (JSONException error) { throw new IllegalStateException("وسائط Tool Call ليست JSON صالحًا؛ لم يُنشأ أمر."); }
        if (arguments.length() != 2 || !arguments.has("block_name") || !arguments.has("amount")) throw new IllegalStateException("وسائط collect_block لا تطابق المخطط المسموح؛ لم يُنشأ أمر.");
        String block = arguments.optString("block_name", "").trim().toLowerCase(java.util.Locale.ROOT);
        Object rawAmount = arguments.opt("amount");
        if (!(rawAmount instanceof Number)) throw new IllegalStateException("الكمية ليست عددًا صحيحًا؛ لم يُنشأ أمر.");
        double numeric = ((Number) rawAmount).doubleValue();
        if (!Double.isFinite(numeric) || numeric != Math.rint(numeric) || numeric < 1 || numeric > 320) throw new IllegalStateException("الكمية خارج الحدود؛ لم يُنشأ أمر.");
        if (!block.matches("[a-z0-9_]{1,64}")) throw new IllegalStateException("اسم الكتلة غير صالح؛ لم يُنشأ أمر.");
        return new JSONObject().put("action", "collect").put("toolName", "collect_block")
                .put("blockName", block).put("count", (int) numeric).put("reason", safe(reason));
    }

    private static JSONObject unsupported(String reason) throws JSONException {
        return new JSONObject().put("action", "unsupported").put("reason", safe(reason));
    }

    static JSONObject parsePlan(String content) throws Exception {
        String json = content == null ? "" : content.trim();
        if (json.startsWith("```")) {
            int firstNewline = json.indexOf('\n');
            int lastFence = json.lastIndexOf("```");
            if (firstNewline >= 0 && lastFence > firstNewline) json = json.substring(firstNewline + 1, lastFence).trim();
        }
        JSONObject raw;
        try { raw = new JSONObject(json); }
        catch (JSONException error) { throw new IllegalStateException("رد النموذج لم يكن JSON صالحًا؛ لم يُنشأ أي أمر Minecraft."); }
        String action = raw.optString("action", "unsupported").trim().toLowerCase(java.util.Locale.ROOT);
        JSONObject plan = new JSONObject().put("action", action).put("reason", safe(raw.optString("reason", "")));
        if (!"collect".equals(action)) {
            plan.put("action", "unsupported");
            return plan;
        }
        String block = raw.optString("blockName", "").trim().toLowerCase(java.util.Locale.ROOT);
        int count = raw.optInt("count", -1);
        if (!block.matches("[a-z0-9_]{1,64}") || count < 1 || count > 320) throw new IllegalStateException("رد النموذج لا يطابق حدود مهمة الجمع؛ لم يُنشأ أي أمر.");
        plan.put("blockName", block).put("count", count).put("toolName", "collect_block");
        return plan;
    }

    private static boolean supportsToolCalls(JSONObject model) {
        JSONArray supported = model.optJSONArray("supported_parameters");
        if (supported == null) return false;
        for (int i = 0; i < supported.length(); i++) if ("tools".equalsIgnoreCase(supported.optString(i, ""))) return true;
        return false;
    }

    static boolean isFree(JSONObject model) {
        String id = model.optString("id", "").toLowerCase(java.util.Locale.ROOT);
        if (id.endsWith(":free")) return true;
        JSONObject pricing = model.optJSONObject("pricing");
        if (pricing == null) return false;
        return isZero(pricing.opt("prompt")) && isZero(pricing.opt("completion"));
    }

    private static boolean isZero(Object value) {
        if (value == null || value == JSONObject.NULL) return false;
        try { return Double.parseDouble(String.valueOf(value)) == 0.0d; }
        catch (NumberFormatException ignored) { return false; }
    }

    private JSONObject request(String method, String url, String apiKey, JSONObject body, int connectTimeout, int readTimeout) throws Exception {
        String key = apiKey == null ? "" : apiKey.trim();
        if (key.length() < 20 || key.length() > 512 || key.matches(".*\\s+.*")) throw new IllegalArgumentException("مفتاح OpenRouter غير صالح أو لم يُحفظ.");
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setRequestMethod(method);
            connection.setConnectTimeout(connectTimeout);
            connection.setReadTimeout(readTimeout);
            connection.setUseCaches(false);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Authorization", "Bearer " + key);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Accept-Encoding", "identity");
            connection.setRequestProperty("User-Agent", "MineBot-AI-Android");
            if (body != null) {
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(bytes.length);
                try (java.io.OutputStream output = connection.getOutputStream()) { output.write(bytes); output.flush(); }
            }
            int status = connection.getResponseCode();
            InputStream stream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
            String response = readLimited(stream, MAX_RESPONSE_BYTES);
            if (status < 200 || status >= 300) throw new IllegalStateException(apiError(status, response));
            try { return new JSONObject(response); }
            catch (JSONException error) { throw new IllegalStateException("رد OpenRouter غير صالح."); }
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String readLimited(InputStream input, int maximumBytes) throws Exception {
        if (input == null) return "";
        try (InputStream stream = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int read; int total = 0;
            while ((read = stream.read(buffer)) != -1) {
                total += read;
                if (total > maximumBytes) throw new IllegalStateException("تجاوز رد OpenRouter حد الحجم الآمن.");
                output.write(buffer, 0, read);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private static String apiError(int status, String response) {
        if (status == 401 || status == 403) return "رفض OpenRouter مفتاح API (HTTP " + status + "). تحقق من المفتاح والصلاحيات.";
        if (status == 429) return "حد OpenRouter الطلبات أو الحصة المجانية (HTTP 429). سيُجرّب التطبيق نماذج بديلة عند التخطيط.";
        String detail = "";
        try {
            JSONObject json = new JSONObject(response);
            JSONObject error = json.optJSONObject("error");
            if (error != null) detail = safe(error.optString("message", ""));
        } catch (JSONException ignored) { }
        return "فشل طلب OpenRouter (HTTP " + status + ")" + (detail.isEmpty() ? "." : ": " + detail);
    }

    private static String safe(String value) {
        if (value == null || value.trim().isEmpty()) return "";
        String text = value.replaceAll("(?i)(access[_ -]?token|refresh[_ -]?token|authorization|bearer)\\s*[:=]?\\s*[^\\s,;]+", "$1=[مخفي]")
                .replaceAll("sk-or-[^\\s\"'<>]+", "[مفتاح مخفي]")
                .replaceAll("[\\r\\n\\u0000-\\u001f]", " ").trim();
        return text.length() > 320 ? text.substring(0, 320) : text;
    }
}
