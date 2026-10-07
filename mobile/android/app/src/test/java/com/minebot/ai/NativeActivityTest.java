package com.minebot.ai;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import io.flutter.embedding.android.FlutterActivity;

/** Guards the Flutter-native shell and its versioned platform-channel contract. */
public final class NativeActivityTest {
    @Test public void launcherUsesFlutterActivityInsteadOfWebView() {
        assertTrue("The launcher must render the Dart application with Flutter", FlutterActivity.class.isAssignableFrom(MainActivity.class));
        assertEquals("com.minebot.ai/native", MainActivity.METHOD_CHANNEL);
        assertEquals("com.minebot.ai/events", MainActivity.EVENT_CHANNEL);
    }
}
