package com.minebot.ai;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;

/** Real Minecraft Java Server List Ping (handshake status state); this is not a bot login. */
final class MinecraftStatus {
    private MinecraftStatus() { }

    static JSONObject ping(String rawHost, int port, int timeoutMs) throws Exception {
        String host = rawHost == null ? "" : rawHost.trim();
        if (host.startsWith("[") && host.endsWith("]")) host = host.substring(1, host.length() - 1);
        if (host.isEmpty() || host.length() > 253 || host.matches(".*[\\s/\\\\?#@].*")) throw new IllegalArgumentException("أدخل عنوان IP أو نطاق صالحًا.");
        if (port < 1 || port > 65535) throw new IllegalArgumentException("المنفذ يجب أن يكون بين 1 و65535.");

        long started = System.nanoTime();
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), timeoutMs);
            socket.setSoTimeout(timeoutMs);
            DataOutputStream output = new DataOutputStream(socket.getOutputStream());
            DataInputStream input = new DataInputStream(socket.getInputStream());

            ByteArrayOutputStream handshake = new ByteArrayOutputStream();
            writeVarInt(handshake, 0);                 // Handshake packet ID
            writeVarInt(handshake, 765);              // Status protocol; status ping is version-tolerant
            writeString(handshake, host);
            handshake.write((port >>> 8) & 0xff);
            handshake.write(port & 0xff);
            writeVarInt(handshake, 1);                // Next state: status
            writePacket(output, handshake.toByteArray());
            writePacket(output, new byte[]{0});       // Status request

            int packetLength = readVarInt(input);
            if (packetLength < 1 || packetLength > 1_000_000) throw new IOException("حجم استجابة حالة السيرفر غير صالح.");
            int packetId = readVarInt(input);
            if (packetId != 0) throw new IOException("أرسل السيرفر حزمة حالة غير متوقعة.");
            int jsonLength = readVarInt(input);
            if (jsonLength < 2 || jsonLength > packetLength || jsonLength > 1_000_000) throw new IOException("بيانات حالة السيرفر غير صالحة.");
            byte[] bytes = new byte[jsonLength];
            input.readFully(bytes);
            JSONObject status = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
            JSONObject version = status.optJSONObject("version");
            JSONObject players = status.optJSONObject("players");

            JSONObject result = new JSONObject();
            result.put("online", true);
            result.put("host", host);
            result.put("port", port);
            result.put("version", version == null ? "غير معروف" : version.optString("name", "غير معروف"));
            result.put("protocol", version == null ? JSONObject.NULL : version.opt("protocol"));
            result.put("playersOnline", players == null ? 0 : Math.max(0, players.optInt("online", 0)));
            result.put("playersMax", players == null ? 0 : Math.max(0, players.optInt("max", 0)));
            result.put("description", flattenChat(status.opt("description")).substring(0, Math.min(300, flattenChat(status.opt("description")).length())));
            result.put("latencyMs", Math.max(0, (System.nanoTime() - started) / 1_000_000L));
            result.put("checkedAt", System.currentTimeMillis());
            return result;
        } catch (SocketTimeoutException timeout) {
            throw new IOException("انتهت مهلة الاتصال. تحقق من العنوان والمنفذ وإمكانية الوصول من الهاتف.");
        }
    }

    private static String flattenChat(Object value) {
        if (value == null || value == JSONObject.NULL) return "";
        if (value instanceof String) return (String) value;
        if (value instanceof org.json.JSONArray) {
            org.json.JSONArray array = (org.json.JSONArray) value;
            StringBuilder result = new StringBuilder();
            for (int i = 0; i < array.length(); i++) result.append(flattenChat(array.opt(i)));
            return result.toString();
        }
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject) value;
            StringBuilder result = new StringBuilder(object.optString("text", ""));
            Object extra = object.opt("extra");
            if (extra != null) result.append(flattenChat(extra));
            return result.toString();
        }
        return "";
    }

    private static void writePacket(DataOutputStream output, byte[] payload) throws IOException {
        ByteArrayOutputStream packet = new ByteArrayOutputStream();
        writeVarInt(packet, payload.length);
        packet.write(payload);
        output.write(packet.toByteArray());
        output.flush();
    }

    private static void writeString(ByteArrayOutputStream output, String value) throws IOException {
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        writeVarInt(output, bytes.length);
        output.write(bytes);
    }

    private static void writeVarInt(ByteArrayOutputStream output, int raw) throws IOException {
        int value = raw;
        while ((value & 0xffffff80) != 0) {
            output.write((value & 0x7f) | 0x80);
            value >>>= 7;
        }
        output.write(value & 0x7f);
    }

    private static int readVarInt(DataInputStream input) throws IOException {
        int result = 0;
        int position = 0;
        byte current;
        do {
            if (position >= 35) throw new IOException("استجابة Minecraft تحتوي على VarInt غير صالح.");
            current = input.readByte();
            result |= (current & 0x7f) << position;
            position += 7;
        } while ((current & 0x80) != 0);
        return result;
    }
}
