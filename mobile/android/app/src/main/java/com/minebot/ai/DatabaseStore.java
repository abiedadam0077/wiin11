package com.minebot.ai;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/** Small, versioned local SQLite store. Entity payloads are JSON, indexed by stable IDs. */
final class DatabaseStore extends SQLiteOpenHelper {
    private static final String DB_NAME = "minebot.db";
    private static final int DB_VERSION = 1;
    private static final Set<String> TABLES = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
            "servers", "bots", "tasks", "task_history", "settings", "ai_config",
            "skins", "locations", "logs", "bot_states"
    )));

    DatabaseStore(Context context) {
        super(context, DB_NAME, null, DB_VERSION);
        setWriteAheadLoggingEnabled(true);
    }

    @Override public void onConfigure(SQLiteDatabase db) {
        super.onConfigure(db);
        db.setForeignKeyConstraintsEnabled(true);
    }

    @Override public void onCreate(SQLiteDatabase db) {
        for (String table : TABLES) {
            db.execSQL("CREATE TABLE IF NOT EXISTS \"" + table + "\" (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)");
            db.execSQL("CREATE INDEX IF NOT EXISTS \"idx_" + table + "_updated\" ON \"" + table + "\"(updated_at DESC)");
        }
    }

    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        // Future schema upgrades must be additive and preserve locally stored user data.
    }

    static boolean isTableAllowed(String table) { return TABLES.contains(table); }

    synchronized String readAll(String table) {
        if (!isTableAllowed(table)) return new JSONArray().toString();
        JSONArray result = new JSONArray();
        SQLiteDatabase db = getReadableDatabase();
        try (Cursor cursor = db.rawQuery("SELECT payload FROM \"" + table + "\" ORDER BY updated_at DESC", null)) {
            while (cursor.moveToNext()) {
                try { result.put(new JSONObject(cursor.getString(0))); }
                catch (JSONException ignored) { /* Skip a damaged row; keep the rest of the user's data available. */ }
            }
        } catch (Exception ignored) {
            return new JSONArray().toString();
        }
        return result.toString();
    }

    synchronized String upsert(String table, String json) {
        if (!isTableAllowed(table)) return error("نوع بيانات غير مسموح.");
        try {
            if (json == null || json.length() > 1_000_000) return error("حجم السجل غير صالح.");
            JSONObject record = new JSONObject(json);
            String id = record.optString("id", "").trim();
            if (id.isEmpty() || id.length() > 128) return error("المعرّف غير صالح.");
            ContentValues values = new ContentValues();
            values.put("id", id);
            values.put("payload", record.toString());
            values.put("updated_at", System.currentTimeMillis());
            long result = getWritableDatabase().insertWithOnConflict(table, null, values, SQLiteDatabase.CONFLICT_REPLACE);
            if (result < 0) return error("تعذر حفظ السجل في SQLite.");
            return "{\"ok\":true}";
        } catch (Exception ignored) {
            return error("تعذر حفظ سجل غير صالح.");
        }
    }

    synchronized String remove(String table, String id) {
        if (!isTableAllowed(table)) return error("نوع بيانات غير مسموح.");
        if (id == null || id.length() > 128) return error("المعرّف غير صالح.");
        try {
            int rows = getWritableDatabase().delete(table, "id = ?", new String[]{id});
            return "{\"ok\":true,\"deleted\":" + (rows > 0) + "}";
        } catch (Exception ignored) { return error("تعذر حذف السجل."); }
    }

    synchronized String clear(String table) {
        if (!isTableAllowed(table)) return error("نوع بيانات غير مسموح.");
        try {
            getWritableDatabase().delete(table, null, null);
            return "{\"ok\":true}";
        } catch (Exception ignored) { return error("تعذر مسح السجلات."); }
    }

    synchronized long count(String table) {
        if (!isTableAllowed(table)) return 0;
        try (Cursor cursor = getReadableDatabase().rawQuery("SELECT COUNT(*) FROM \"" + table + "\"", null)) {
            return cursor.moveToFirst() ? cursor.getLong(0) : 0;
        }
    }

    private static String error(String message) {
        try { return new JSONObject().put("ok", false).put("error", message).toString(); }
        catch (JSONException ignored) { return "{\"ok\":false,\"error\":\"Storage error\"}"; }
    }
}
