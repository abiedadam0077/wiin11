package com.minebot.ai;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.SecretKeySpec;

/** Device-local secret handling: AES-GCM key material remains in Android Keystore. */
final class SecureStore {
    private static final String PREFS = "minebot_secure_v1";
    private static final String KEY_ALIAS = "minebot.openrouter.aes.v1";
    private static final String API_CIPHER = "openrouter_cipher";
    private static final String API_IV = "openrouter_iv";
    private static final String PIN_SALT = "app_lock_salt";
    private static final String PIN_HASH = "app_lock_hash";
    private static final String PIN_FAILURES = "app_lock_failures";
    private static final String PIN_BLOCK_UNTIL = "app_lock_block_until";
    private static final int GCM_TAG_BITS = 128;
    private final Context context;

    SecureStore(Context context) { this.context = context.getApplicationContext(); }

    synchronized boolean hasApiKey() {
        SharedPreferences preferences = prefs();
        return preferences.contains(API_CIPHER) && preferences.contains(API_IV);
    }

    synchronized void saveApiKey(String key) throws Exception {
        String clean = key == null ? "" : key.trim();
        if (clean.length() < 20 || clean.length() > 512 || clean.matches(".*\\s+.*")) throw new IllegalArgumentException("صيغة مفتاح OpenRouter غير صالحة.");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] encrypted = cipher.doFinal(clean.getBytes(StandardCharsets.UTF_8));
        prefs().edit()
                .putString(API_CIPHER, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .putString(API_IV, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .apply();
        Arrays.fill(encrypted, (byte) 0);
    }

    synchronized String readApiKey() throws Exception {
        SharedPreferences preferences = prefs();
        String cipherValue = preferences.getString(API_CIPHER, null);
        String ivValue = preferences.getString(API_IV, null);
        if (cipherValue == null || ivValue == null) return "";
        byte[] cipherBytes = Base64.decode(cipherValue, Base64.NO_WRAP);
        byte[] iv = Base64.decode(ivValue, Base64.NO_WRAP);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
        byte[] clear = cipher.doFinal(cipherBytes);
        try { return new String(clear, StandardCharsets.UTF_8); }
        finally { Arrays.fill(clear, (byte) 0); Arrays.fill(cipherBytes, (byte) 0); }
    }

    synchronized void clearApiKey() {
        prefs().edit().remove(API_CIPHER).remove(API_IV).apply();
    }

    synchronized boolean hasPin() {
        return prefs().contains(PIN_HASH) && prefs().contains(PIN_SALT);
    }

    synchronized void savePin(String pin) throws Exception {
        if (pin == null || !pin.matches("[0-9]{6}")) throw new IllegalArgumentException("رمز القفل يجب أن يتكون من 6 أرقام.");
        byte[] salt = new byte[16];
        new SecureRandom().nextBytes(salt);
        byte[] hash = derive(pin.toCharArray(), salt);
        prefs().edit()
                .putString(PIN_SALT, Base64.encodeToString(salt, Base64.NO_WRAP))
                .putString(PIN_HASH, Base64.encodeToString(hash, Base64.NO_WRAP))
                .remove(PIN_FAILURES)
                .remove(PIN_BLOCK_UNTIL)
                .apply();
        Arrays.fill(hash, (byte) 0);
    }

    synchronized boolean verifyPin(String pin) {
        if (!hasPin()) return true;
        SharedPreferences preferences = prefs();
        if (System.currentTimeMillis() < preferences.getLong(PIN_BLOCK_UNTIL, 0)) return false;
        if (pin == null || !pin.matches("[0-9]{6}")) return registerPinFailure(preferences);
        try {
            byte[] salt = Base64.decode(preferences.getString(PIN_SALT, ""), Base64.NO_WRAP);
            byte[] expected = Base64.decode(preferences.getString(PIN_HASH, ""), Base64.NO_WRAP);
            byte[] actual = derive(pin.toCharArray(), salt);
            boolean valid = MessageDigest.isEqual(expected, actual);
            Arrays.fill(expected, (byte) 0);
            Arrays.fill(actual, (byte) 0);
            if (valid) preferences.edit().remove(PIN_FAILURES).remove(PIN_BLOCK_UNTIL).apply();
            else registerPinFailure(preferences);
            return valid;
        } catch (Exception ignored) { return registerPinFailure(preferences); }
    }

    private boolean registerPinFailure(SharedPreferences preferences) {
        int failures = preferences.getInt(PIN_FAILURES, 0) + 1;
        if (failures >= 5) preferences.edit().putInt(PIN_FAILURES, 0).putLong(PIN_BLOCK_UNTIL, System.currentTimeMillis() + 30_000L).apply();
        else preferences.edit().putInt(PIN_FAILURES, failures).apply();
        return false;
    }

    synchronized void clearPin() {
        prefs().edit().remove(PIN_SALT).remove(PIN_HASH).remove(PIN_FAILURES).remove(PIN_BLOCK_UNTIL).apply();
    }

    private byte[] derive(char[] pin, byte[] salt) throws Exception {
        PBEKeySpec spec = new PBEKeySpec(pin, salt, 120_000, 256);
        try { return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded(); }
        finally { spec.clearPassword(); Arrays.fill(pin, '\0'); }
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        java.security.Key existing = store.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;
        KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build();
        javax.crypto.KeyGenerator generator = javax.crypto.KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(spec);
        return generator.generateKey();
    }

    private SharedPreferences prefs() {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
