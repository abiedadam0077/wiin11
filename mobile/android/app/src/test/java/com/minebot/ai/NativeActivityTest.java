package com.minebot.ai;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public final class NativeActivityTest {
    @Test public void initialScreenIsNativeArabicAndContainsNoWebView() {
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).setup().get();
        View decor = activity.getWindow().getDecorView();
        assertFalse("The Android UI must not contain WebView", containsWebView(decor));
        assertTrue("Native Arabic navigation should be visible", containsText(decor, "الرئيسية"));
        assertTrue("Native Minecraft server screen should be reachable", containsText(decor, "السيرفرات"));
        assertTrue("Empty state should not fabricate a bot", containsText(decor, "ملفات البوت"));
        activity.finish();
    }

    private static boolean containsWebView(View view) {
        if (view.getClass().getName().contains("WebView")) return true;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) if (containsWebView(group.getChildAt(i))) return true;
        }
        return false;
    }

    private static boolean containsText(View view, String expected) {
        if (view instanceof TextView && ((TextView) view).getText().toString().contains(expected)) return true;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) if (containsText(group.getChildAt(i), expected)) return true;
        }
        return false;
    }
}
