package com.minebot.ai;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

@RunWith(RobolectricTestRunner.class)
public final class OpenRouterClientTest {
    @Test public void onlyExplicitFreeOrZeroPricedModelsAreSelected() throws Exception {
        assertTrue(OpenRouterClient.isFree(new JSONObject("{\"id\":\"vendor/model:free\",\"pricing\":{\"prompt\":\"0.1\",\"completion\":\"0.1\"}}")));
        assertTrue(OpenRouterClient.isFree(new JSONObject("{\"id\":\"vendor/model\",\"pricing\":{\"prompt\":\"0\",\"completion\":\"0.000\"}}")));
        assertFalse(OpenRouterClient.isFree(new JSONObject("{\"id\":\"vendor/paid\",\"pricing\":{\"prompt\":\"0.0001\",\"completion\":\"0\"}}")));
        assertFalse(OpenRouterClient.isFree(new JSONObject("{\"id\":\"vendor/unknown\"}")));
    }

    @Test public void plannerOutputIsLimitedToValidatedCollectionOrUnsupported() throws Exception {
        JSONObject plan = OpenRouterClient.parsePlan("{\"action\":\"collect\",\"blockName\":\"oak_log\",\"count\":4,\"reason\":\"User asked for wood\"}");
        assertEquals("collect", plan.getString("action"));
        assertEquals("oak_log", plan.getString("blockName"));
        assertEquals(4, plan.getInt("count"));

        JSONObject unsupported = OpenRouterClient.parsePlan("{\"action\":\"build\",\"reason\":\"Not supported\"}");
        assertEquals("unsupported", unsupported.getString("action"));
        assertFalse(unsupported.has("blockName"));
    }

    @Test public void invalidModelTaskCannotBecomeExecutable() throws Exception {
        assertInvalid("{\"action\":\"collect\",\"blockName\":\"/give\",\"count\":1}");
        assertInvalid("{\"action\":\"collect\",\"blockName\":\"oak_log\",\"count\":321}");
        assertInvalid("Here is a plan: collect oak logs");
    }

    private static void assertInvalid(String result) throws Exception {
        try {
            OpenRouterClient.parsePlan(result);
            fail("Invalid AI output must be rejected.");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage().contains("لم يُنشأ") || expected.getMessage().contains("حدود"));
        }
    }
}
