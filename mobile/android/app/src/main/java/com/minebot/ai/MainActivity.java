package com.minebot.ai;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.ConsoleMessage;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.util.ArrayList;
import java.util.List;

public final class MainActivity extends Activity {
    private static final int PICK_FILE = 4217;
    private static final int REQUEST_NOTIFICATIONS = 4218;
    private static final String NOTIFICATION_CHANNEL = "minebot_local_events";
    private WebView webView;
    private DatabaseStore database;
    private SecureStore secureStore;
    private MineBotBridge bridge;
    private ValueCallback<Uri[]> fileCallback;
    private boolean pageLoaded;
    private boolean notificationRequestPending;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(8, 13, 27));
        getWindow().setNavigationBarColor(Color.rgb(8, 13, 27));
        getWindow().getDecorView().setSystemUiVisibility(0);
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        createNotificationChannel();

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(8, 13, 27));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            }
            return insets;
        });
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(8, 13, 27));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        // The only JavaScript document is a bundled, read-only app asset; local file access is used
        // exclusively to display images the user explicitly imported into this app's private folder.
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setDefaultTextEncodingName("UTF-8");

        database = new DatabaseStore(getApplicationContext());
        secureStore = new SecureStore(getApplicationContext());
        bridge = new MineBotBridge(this, webView, database, secureStore);
        webView.addJavascriptInterface(bridge, "MineBotNative");
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("file".equalsIgnoreCase(uri.getScheme())) return false;
                // No remote page is allowed to replace the trusted local application shell.
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                pageLoaded = true;
                view.evaluateJavascript("window.__minebotForeground && window.__minebotForeground()", null);
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                    String[] acceptTypes = params.getAcceptTypes();
                    List<String> cleaned = new ArrayList<>();
                    if (acceptTypes != null) for (String type : acceptTypes) if (type != null && !type.trim().isEmpty()) cleaned.add(type.trim());
                    if (!cleaned.isEmpty()) intent.putExtra(Intent.EXTRA_MIME_TYPES, cleaned.toArray(new String[0]));
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                    startActivityForResult(intent, PICK_FILE);
                    return true;
                } catch (Exception error) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                    return false;
                }
            }
            @Override public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                // Do not forward WebView console output to Android logs; request bodies can contain user text.
                return true;
            }
        });

        root.addView(webView, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        if (savedInstanceState == null) webView.loadUrl("file:///android_asset/www/index.html");
        else webView.restoreState(savedInstanceState);
    }

    String requestMineBotNotificationPermission() {
        if (Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return "granted";
        runOnUiThread(() -> {
            notificationRequestPending = true;
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQUEST_NOTIFICATIONS);
        });
        return "pending";
    }

    void showMineBotNotification(String title, String body) {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        try {
            Notification notification = new Notification.Builder(this, NOTIFICATION_CHANNEL)
                    .setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setContentTitle(limit(title, 64))
                    .setContentText(limit(body, 180))
                    .setStyle(new Notification.BigTextStyle().bigText(limit(body, 400)))
                    .setAutoCancel(true)
                    .setCategory(Notification.CATEGORY_STATUS)
                    .build();
            NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (manager != null) manager.notify((int) (System.currentTimeMillis() & 0x7fffffff), notification);
        } catch (Exception ignored) { /* Notifications are optional and must not crash the app. */ }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) manager.createNotificationChannel(new NotificationChannel(NOTIFICATION_CHANNEL, "MineBot AI", NotificationManager.IMPORTANCE_DEFAULT));
    }

    private static String limit(String value, int length) {
        if (value == null) return "MineBot AI";
        String clean = value.replaceAll("[\\p{Cntrl}]", " ").trim();
        return clean.length() > length ? clean.substring(0, length) : clean;
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_FILE && fileCallback != null) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) result = new Uri[]{data.getData()};
            fileCallback.onReceiveValue(result);
            fileCallback = null;
        }
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_NOTIFICATIONS && notificationRequestPending) {
            notificationRequestPending = false;
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (pageLoaded && webView != null) webView.evaluateJavascript("window.__minebotPermissionResult && window.__minebotPermissionResult(" + granted + ")", null);
        }
    }

    @Override protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
            if (pageLoaded) webView.postDelayed(() -> webView.evaluateJavascript("window.__minebotForeground && window.__minebotForeground()", null), 180);
        }
    }

    @Override protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override public void onBackPressed() {
        if (webView != null && pageLoaded) webView.evaluateJavascript("window.__minebotBack && window.__minebotBack()", null);
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
        if (webView != null) {
            webView.removeJavascriptInterface("MineBotNative");
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        if (database != null) { database.close(); database = null; }
        super.onDestroy();
    }
}
