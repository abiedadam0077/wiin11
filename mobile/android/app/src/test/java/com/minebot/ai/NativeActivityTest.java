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

import java.lang.reflect.Field;
import java.lang.reflect.Method;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public final class NativeActivityTest {
    @Test public void welcomeTransitionsToNativeDashboardWithoutWebViewOrFakeBots() {
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).setup().get();
        View decor = activity.getWindow().getDecorView();
        assertFalse("The Android UI must not contain WebView", containsWebView(decor));
        assertTrue("The splash welcome action should be visible", containsText(decor, "ابدأ المغامرة"));
        TextView begin = findText(decor, "ابدأ المغامرة");
        assertTrue("Welcome action should be a native clickable view", begin != null && begin.performClick());
        View dashboard = activity.getWindow().getDecorView();
        assertTrue("Native Arabic navigation should be visible", containsText(dashboard, "الرئيسية"));
        assertTrue("Native Minecraft server navigation should be visible", containsText(dashboard, "السيرفرات"));
        assertTrue("The dashboard should not fabricate a bot", containsText(dashboard, "لا توجد بوتات بعد"));
        assertFalse("Navigation transition must remain WebView-free", containsWebView(dashboard));
        activity.finish();
    }

    @Test public void allTwelveNativeScreensUseTheNewNeonShell() throws Exception {
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).setup().get();
        Field databaseField = MainActivity.class.getDeclaredField("database");
        databaseField.setAccessible(true);
        DatabaseStore store = (DatabaseStore) databaseField.get(activity);
        store.upsert("servers", "{\"id\":\"test-server\",\"name\":\"Test Server\",\"host\":\"example.invalid\",\"port\":25565,\"status\":\"untested\",\"createdAt\":1}");
        store.upsert("bots", "{\"id\":\"test-bot\",\"name\":\"Test Bot\",\"username\":\"TestBot\",\"serverId\":\"test-server\",\"authMode\":\"offline\",\"version\":\"auto\",\"createdAt\":1}");
        Field botId = MainActivity.class.getDeclaredField("selectedBotId");
        botId.setAccessible(true);
        botId.set(activity, "test-bot");
        Field serverId = MainActivity.class.getDeclaredField("selectedServerId");
        serverId.setAccessible(true);
        serverId.set(activity, "test-server");
        Field currentTab = MainActivity.class.getDeclaredField("tab");
        currentTab.setAccessible(true);
        Method render = MainActivity.class.getDeclaredMethod("render");
        render.setAccessible(true);

        String[][] routes = {
                {"home", "COMMAND DECK"}, {"bots", "BOT NETWORK"}, {"bot-details", "BOT NETWORK"},
                {"inventory", "LIVE INVENTORY"}, {"skins", "LOCAL SKIN VAULT"}, {"servers", "SERVER GRID"},
                {"server-details", "SERVER GRID"}, {"tasks", "MISSION CONTROL"}, {"task-types", "MISSION BUILDER"},
                {"task-create", "MISSION BUILDER"}, {"planner", "AI PLANNER"}, {"settings", "SYSTEM CONFIG"}
        };
        for (String[] route : routes) {
            currentTab.set(activity, route[0]);
            render.invoke(activity);
            View decor = activity.getWindow().getDecorView();
            ViewGroup content = activity.findViewById(android.R.id.content);
            View root = content.getChildAt(0);
            assertTrue("Every route must use the redesigned neon background: " + route[0],
                    root.getBackground() != null && root.getBackground().getClass().getName().contains("NeonBackdrop"));
            assertTrue("Every route must expose its screen hierarchy: " + route[0], containsText(decor, route[1]));
            assertFalse("Every native screen must remain WebView-free: " + route[0], containsWebView(decor));
        }
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
        return findText(view, expected) != null;
    }

    private static TextView findText(View view, String expected) {
        if (view instanceof TextView && ((TextView) view).getText().toString().contains(expected)) return (TextView) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                TextView found = findText(group.getChildAt(i), expected);
                if (found != null) return found;
            }
        }
        return null;
    }
}
