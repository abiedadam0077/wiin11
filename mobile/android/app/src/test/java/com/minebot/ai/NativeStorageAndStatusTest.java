package com.minebot.ai;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;

import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(RobolectricTestRunner.class)
public final class NativeStorageAndStatusTest {
    private Context context;

    @Before public void clearDatabase() {
        context = RuntimeEnvironment.getApplication();
        context.deleteDatabase("minebot.db");
    }

    @Test public void sqliteUpsertReadAndRemoveUseStableIds() throws Exception {
        DatabaseStore database = new DatabaseStore(context);
        JSONObject server = new JSONObject().put("id", "server-1").put("name", "Local test").put("host", "127.0.0.1").put("port", 25565);
        assertTrue(database.upsert("servers", server.toString()).contains("\"ok\":true"));
        JSONArray read = new JSONArray(database.readAll("servers"));
        assertEquals(1, read.length());
        assertEquals("server-1", read.getJSONObject(0).getString("id"));
        database.remove("servers", "server-1");
        assertEquals(0, new JSONArray(database.readAll("servers")).length());
        assertEquals(0, new JSONArray(database.readAll("not-a-table")).length());
        database.close();
    }

    @Test public void minecraftStatusPingUsesJavaStatusHandshakeAndParsesServerReply() throws Exception {
        AtomicReference<Throwable> serverFailure = new AtomicReference<>();
        try (ServerSocket server = new ServerSocket(0)) {
            server.setSoTimeout(5000);
            Thread responder = new Thread(() -> {
                try (Socket socket = server.accept()) {
                    socket.setSoTimeout(3000);
                    DataInputStream input = new DataInputStream(socket.getInputStream());
                    DataOutputStream output = new DataOutputStream(socket.getOutputStream());
                    readFrame(input); // Status handshake
                    readFrame(input); // Status request
                    byte[] json = "{\"version\":{\"name\":\"1.21.4-test\",\"protocol\":769},\"players\":{\"max\":20,\"online\":3},\"description\":{\"text\":\"Local protocol test\"}}".getBytes(StandardCharsets.UTF_8);
                    ByteArrayOutputStream payload = new ByteArrayOutputStream();
                    writeVarInt(payload, 0); // Status response packet ID
                    writeVarInt(payload, json.length);
                    payload.write(json);
                    ByteArrayOutputStream framed = new ByteArrayOutputStream();
                    writeVarInt(framed, payload.size());
                    payload.writeTo(framed);
                    output.write(framed.toByteArray());
                    output.flush();
                } catch (Throwable error) { serverFailure.set(error); }
            }, "minecraft-status-test-server");
            responder.start();
            JSONObject result = MinecraftStatus.ping("127.0.0.1", server.getLocalPort(), 3000);
            responder.join(5000);
            assertTrue("The protocol test server must finish", !responder.isAlive());
            if (serverFailure.get() != null) throw new AssertionError(serverFailure.get());
            assertTrue(result.getBoolean("online"));
            assertEquals("1.21.4-test", result.getString("version"));
            assertEquals(3, result.getInt("playersOnline"));
            assertEquals(20, result.getInt("playersMax"));
            assertEquals("Local protocol test", result.getString("description"));
        }
    }

    private static byte[] readFrame(DataInputStream input) throws Exception {
        int length = readVarInt(input);
        if (length < 0 || length > 1_000_000) throw new IllegalStateException("Invalid test packet length");
        byte[] packet = new byte[length];
        input.readFully(packet);
        return packet;
    }

    private static int readVarInt(DataInputStream input) throws Exception {
        int value = 0;
        int shift = 0;
        int current;
        do {
            current = input.readUnsignedByte();
            value |= (current & 0x7f) << shift;
            shift += 7;
            if (shift > 35) throw new IllegalStateException("Invalid test VarInt");
        } while ((current & 0x80) != 0);
        return value;
    }

    private static void writeVarInt(ByteArrayOutputStream output, int raw) {
        int value = raw;
        while ((value & 0xffffff80) != 0) { output.write((value & 0x7f) | 0x80); value >>>= 7; }
        output.write(value & 0x7f);
    }
}
