(() => {
  // www/js/platform.js
  var TABLES = /* @__PURE__ */ new Set(["servers", "bots", "tasks", "task_history", "settings", "ai_config", "skins", "locations", "logs", "bot_states"]);
  var native = typeof window !== "undefined" && Boolean(window.MineBotNative);
  var pending = /* @__PURE__ */ new Map();
  var sequence = 0;
  if (typeof window !== "undefined") window.__minebotNativeResult = (requestId, raw) => {
    const entry = pending.get(String(requestId));
    if (!entry) return;
    pending.delete(String(requestId));
    clearTimeout(entry.timeout);
    try {
      const result = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (result?.ok === false) entry.reject(new Error(result.error || "\u062A\u0639\u0630\u0631 \u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u0639\u0645\u0644\u064A\u0629 \u0639\u0644\u0649 \u0627\u0644\u062C\u0647\u0627\u0632."));
      else entry.resolve(result);
    } catch (error) {
      entry.reject(error instanceof Error ? error : new Error("\u0627\u0633\u062A\u062C\u0627\u0628\u0629 \u0645\u062D\u0644\u064A\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629."));
    }
  };
  function asyncNative(method, args = [], timeout = 3e4) {
    if (!native || typeof window.MineBotNative[method] !== "function") return Promise.reject(new Error("\u0647\u0630\u0647 \u0627\u0644\u0648\u0638\u064A\u0641\u0629 \u062A\u062A\u0637\u0644\u0628 \u0625\u0635\u062F\u0627\u0631 Android."));
    const requestId = `mb-${Date.now()}-${++sequence}`;
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error("\u0627\u0646\u062A\u0647\u062A \u0645\u0647\u0644\u0629 \u0627\u0644\u0639\u0645\u0644\u064A\u0629. \u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649."));
      }, timeout);
      pending.set(requestId, { resolve, reject, timeout: timeoutHandle });
      try {
        window.MineBotNative[method](...args, requestId);
      } catch (error) {
        clearTimeout(timeoutHandle);
        pending.delete(requestId);
        reject(error);
      }
    });
  }
  async function apiJson(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers || {} },
      cache: "no-store"
    });
    let result;
    try {
      result = await response.json();
    } catch {
      result = {};
    }
    if (!response.ok) throw new Error(result.error || `\u0641\u0634\u0644 \u0627\u0644\u0637\u0644\u0628 (${response.status}).`);
    return result;
  }
  var Platform = Object.freeze({
    isNative: native,
    mode: native ? "android" : "local-preview",
    async list(table) {
      if (!TABLES.has(table)) throw new Error("\u0646\u0648\u0639 \u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641.");
      if (native) {
        const raw = window.MineBotNative.readAll(table);
        const result2 = JSON.parse(raw || "[]");
        return Array.isArray(result2) ? result2 : [];
      }
      const result = await apiJson(`/api/data/${encodeURIComponent(table)}`);
      return result.data || [];
    },
    async get(table, id) {
      const items = await this.list(table);
      return items.find((item) => item.id === id) || null;
    },
    async save(table, record) {
      if (!TABLES.has(table)) throw new Error("\u0646\u0648\u0639 \u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641.");
      if (!record || typeof record.id !== "string" || !record.id.trim()) throw new Error("\u0627\u0644\u0645\u0639\u0631\u0651\u0641 \u0645\u0637\u0644\u0648\u0628.");
      if (native) {
        const result2 = JSON.parse(window.MineBotNative.upsert(table, JSON.stringify(record)) || "{}");
        if (!result2.ok) throw new Error(result2.error || "\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0641\u064A SQLite.");
        return record;
      }
      const result = await apiJson(`/api/data/${encodeURIComponent(table)}`, { method: "POST", body: JSON.stringify(record) });
      return result.data;
    },
    async remove(table, id) {
      if (!TABLES.has(table)) throw new Error("\u0646\u0648\u0639 \u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641.");
      if (native) {
        const result2 = JSON.parse(window.MineBotNative.remove(table, id) || "{}");
        if (!result2.ok) throw new Error(result2.error || "\u062A\u0639\u0630\u0631 \u062D\u0630\u0641 \u0627\u0644\u0633\u062C\u0644 \u0645\u0646 SQLite.");
        return Boolean(result2.deleted);
      }
      const result = await apiJson(`/api/data/${encodeURIComponent(table)}/${encodeURIComponent(id)}`, { method: "DELETE" });
      return Boolean(result.deleted);
    },
    async clear(table) {
      if (!TABLES.has(table)) throw new Error("\u0646\u0648\u0639 \u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641.");
      if (native) {
        const result = JSON.parse(window.MineBotNative.clear(table) || "{}");
        if (!result.ok) throw new Error(result.error || "\u062A\u0639\u0630\u0631 \u0645\u0633\u062D \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A.");
        return;
      }
      await apiJson(`/api/data/${encodeURIComponent(table)}`, { method: "DELETE" });
    },
    async pingServer(host, port, timeoutMs = 8e3) {
      const timeout = Math.max(2e3, Math.min(3e4, Number(timeoutMs) || 8e3));
      if (native) {
        const result2 = await asyncNative("pingServer", [host, Number(port), timeout], timeout + 5e3);
        if (!result2.online) throw new Error(result2.error || "\u0627\u0644\u0633\u064A\u0631\u0641\u0631 \u063A\u064A\u0631 \u0645\u062A\u0635\u0644.");
        return result2;
      }
      const result = await apiJson("/api/servers/ping", { method: "POST", body: JSON.stringify({ host, port: Number(port), timeoutMs: timeout }) });
      if (!result.online) throw new Error(result.error || "\u0627\u0644\u0633\u064A\u0631\u0641\u0631 \u063A\u064A\u0631 \u0645\u062A\u0635\u0644.");
      return result;
    },
    async aiStatus() {
      if (native) return { configured: Boolean(window.MineBotNative.hasApiKey()), storage: "android-keystore" };
      return apiJson("/api/ai/status");
    },
    async setApiKey(key) {
      if (native) {
        const result2 = JSON.parse(window.MineBotNative.saveApiKey(key) || "{}");
        if (!result2.ok) throw new Error(result2.error || "\u062A\u0639\u0630\u0631 \u062A\u062E\u0632\u064A\u0646 \u0627\u0644\u0645\u0641\u062A\u0627\u062D \u0627\u0644\u0622\u0645\u0646.");
        return { configured: Boolean(result2.configured), storage: "android-keystore" };
      }
      const result = await apiJson("/api/ai/key", { method: "POST", body: JSON.stringify({ key }) });
      return result;
    },
    async clearApiKey() {
      if (native) {
        const result = JSON.parse(window.MineBotNative.clearApiKey() || "{}");
        if (!result.ok) throw new Error(result.error || "\u062A\u0639\u0630\u0631 \u062D\u0630\u0641 \u0627\u0644\u0645\u0641\u062A\u0627\u062D.");
        return { configured: false, storage: "android-keystore" };
      }
      return apiJson("/api/ai/key", { method: "POST", body: JSON.stringify({ key: "" }) });
    },
    async aiRequest(endpoint, method = "GET", body = void 0) {
      if (!["/models", "/chat/completions"].includes(endpoint)) throw new Error("\u0645\u0633\u0627\u0631 OpenRouter \u063A\u064A\u0631 \u0645\u0633\u0645\u0648\u062D.");
      if (native) {
        return asyncNative("openRouter", [endpoint, method, body ? JSON.stringify(body) : ""], endpoint === "/models" ? 25e3 : 5e4);
      }
      const options = { method };
      if (body !== void 0) options.body = JSON.stringify(body);
      return apiJson(`/api/ai${endpoint}`, options);
    },
    async saveSkin(fileName, dataUrl) {
      if (native) return asyncNative("saveSkin", [fileName, dataUrl], 18e3);
      return apiJson("/api/skins", { method: "POST", body: JSON.stringify({ name: fileName, data: dataUrl }) });
    },
    async saveBackup(payload) {
      if (native) return asyncNative("saveBackup", [JSON.stringify(payload)], 18e3);
      return apiJson("/api/backups", { method: "POST", body: JSON.stringify(payload) });
    },
    async lock(action, pin = "") {
      if (native) {
        if (action === "status") return { enabled: Boolean(window.MineBotNative.hasPin()) };
        const method = action === "set" ? "savePin" : action === "verify" ? "verifyPin" : "clearPin";
        if (action === "verify") return JSON.parse(window.MineBotNative[method](pin) || "{}");
        const result = JSON.parse(window.MineBotNative[method](pin) || "{}");
        if (!result.ok) throw new Error(result.error || "\u062A\u0639\u0630\u0631 \u062A\u062D\u062F\u064A\u062B \u0642\u0641\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642.");
        return result;
      }
      return apiJson("/api/security/pin", { method: "POST", body: JSON.stringify({ action, pin }) });
    },
    async health() {
      if (native) return { ok: true, mode: "android", native: true, sqlite: true };
      return apiJson("/api/health");
    }
  });

  // www/js/ai.js
  var DEFAULT_SYSTEM = `You are a careful planning component for a Minecraft Java bot manager. Convert the user's request into a safe, concise task plan; do not claim the task has been executed. Do not invent observations about a world, inventory, server, or bot. Return exactly one JSON object with this schema: {"name":"short task name","summary":"one sentence","steps":[{"title":"action","details":"what the bot would need to do","done_when":"observable completion condition"}],"requires_confirmation":true,"risks":["short risk"]}. Make 2 to 8 ordered steps. If the request is ambiguous, include a clarification step. If it asks for a task that cannot be represented safely, explain that in summary and make a single clarification step. Keep names and descriptions in the user's language. No markdown fences.`;
  var speedHints = ["flash", "turbo", "swift", "instant", "mini", "8b", "small", "fast"];
  var reasoningHints = ["reason", "r1", "deepseek", "qwq", "thinking", "o1", "o3"];
  var reliableVendors = ["google", "anthropic", "openai", "deepseek", "qwen", "meta-llama"];
  function priceIsZero(value) {
    if (value === void 0 || value === null || value === "") return false;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed === 0;
  }
  function isFreeModel(model) {
    if (!model || typeof model.id !== "string") return false;
    const id = model.id.toLowerCase();
    if (id.endsWith(":free")) return true;
    const pricing = model.pricing;
    return Boolean(pricing && priceIsZero(pricing.prompt) && priceIsZero(pricing.completion));
  }
  function scoreModel(model, reliability = {}) {
    const id = String(model?.id ?? "").toLowerCase();
    const context = Math.max(0, Number(model?.context_length) || 0);
    const parameters = Array.isArray(model?.supported_parameters) ? model.supported_parameters.map(String) : [];
    const toolSupport = parameters.includes("tools") || parameters.includes("tool_choice");
    const reasoningSupport = parameters.includes("reasoning") || reasoningHints.some((hint) => id.includes(hint));
    const speedSupport = speedHints.some((hint) => id.includes(hint));
    const stableProvider = reliableVendors.some((vendor) => id.startsWith(`${vendor}/`) || id.includes(`${vendor}/`));
    const calls = Number(reliability[id]?.calls) || 0;
    const failures = Number(reliability[id]?.failures) || 0;
    const recentReliability = calls ? Math.max(-25, Math.min(25, (calls - failures) / calls * 25)) : 0;
    const contextScore = context >= 128e3 ? 24 : context >= 64e3 ? 20 : context >= 32e3 ? 16 : context >= 16e3 ? 12 : context >= 8e3 ? 8 : context >= 4e3 ? 4 : 0;
    return contextScore + (toolSupport ? 19 : 0) + (reasoningSupport ? 13 : 0) + (speedSupport ? 8 : 0) + (stableProvider ? 6 : 0) + recentReliability;
  }
  function rankFreeModels(models, reliability = {}) {
    return (Array.isArray(models) ? models : []).filter((model) => isFreeModel(model) && Number(model.context_length || 0) >= 4096).sort((a, b) => scoreModel(b, reliability) - scoreModel(a, reliability));
  }
  function getErrorMessage(error) {
    const message = String(error?.message || "\u062A\u0639\u0630\u0631 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0628\u062E\u062F\u0645\u0629 OpenRouter.");
    return message.replace(/\bsk-or-[^\s"'<>]+/gi, "[\u0645\u0641\u062A\u0627\u062D \u0645\u062E\u0641\u064A]").slice(0, 230);
  }
  function parsePlan(content) {
    if (typeof content !== "string") throw new Error("\u0644\u0645 \u064A\u064F\u0631\u062C\u0639 \u0627\u0644\u0646\u0645\u0648\u0630\u062C \u062E\u0637\u0629 \u0646\u0635\u064A\u0629.");
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("\u0627\u0633\u062A\u062C\u0627\u0628\u0629 \u0627\u0644\u0646\u0645\u0648\u0630\u062C \u0644\u064A\u0633\u062A JSON \u0635\u0627\u0644\u062D\u064B\u0627.");
    let plan;
    try {
      plan = JSON.parse(content.slice(start, end + 1));
    } catch {
      throw new Error("\u062A\u0639\u0630\u0631 \u0642\u0631\u0627\u0621\u0629 \u062E\u0637\u0629 \u0627\u0644\u0646\u0645\u0648\u0630\u062C.");
    }
    if (!plan || typeof plan !== "object" || !Array.isArray(plan.steps) || plan.steps.length < 1 || plan.steps.length > 12) throw new Error("\u062A\u0646\u0633\u064A\u0642 \u0627\u0644\u062E\u0637\u0629 \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644.");
    const steps = plan.steps.slice(0, 8).map((step, index) => {
      if (!step || typeof step !== "object") throw new Error("\u062A\u062D\u062A\u0648\u064A \u0627\u0644\u062E\u0637\u0629 \u0639\u0644\u0649 \u062E\u0637\u0648\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629.");
      const title = String(step.title || "").trim();
      const details = String(step.details || "").trim();
      const doneWhen = String(step.done_when || "").trim();
      if (!title || !details) throw new Error(`\u0627\u0644\u062E\u0637\u0648\u0629 ${index + 1} \u0646\u0627\u0642\u0635\u0629.`);
      return { id: `step-${index + 1}`, title: title.slice(0, 120), details: details.slice(0, 480), doneWhen: doneWhen.slice(0, 240), status: "pending" };
    });
    return {
      name: String(plan.name || "").trim().slice(0, 80) || "\u0645\u0647\u0645\u0629 Minecraft",
      summary: String(plan.summary || "").trim().slice(0, 500),
      steps,
      requiresConfirmation: plan.requires_confirmation !== false,
      risks: Array.isArray(plan.risks) ? plan.risks.map((risk) => String(risk).slice(0, 160)).slice(0, 5) : []
    };
  }
  var AIEngine = class {
    constructor({ getConfig, saveConfig, log = async () => {
    }, onAttempt = () => {
    }, platform = Platform } = {}) {
      this.getConfig = getConfig || (async () => ({ id: "main", automatic: true }));
      this.saveConfig = saveConfig || (async () => {
      });
      this.log = log;
      this.onAttempt = onAttempt;
      this.platform = platform;
      this.modelsCache = null;
      this.modelsFetchedAt = 0;
    }
    async getModels({ force = false } = {}) {
      if (!force && this.modelsCache && Date.now() - this.modelsFetchedAt < 9e4) return this.modelsCache;
      const response = await this.platform.aiRequest("/models");
      const models = Array.isArray(response?.data) ? response.data.filter((model) => model && typeof model.id === "string") : [];
      if (!models.length) throw new Error("\u0644\u0645 \u062A\u064F\u0631\u062C\u0639 OpenRouter \u0623\u064A \u0646\u0645\u0627\u0630\u062C \u0645\u062A\u0627\u062D\u0629.");
      this.modelsCache = models;
      this.modelsFetchedAt = Date.now();
      return models;
    }
    async selectBestFree({ force = false } = {}) {
      const models = await this.getModels({ force });
      const config = await this.getConfig();
      const ranked = rankFreeModels(models, config.modelReliability || {});
      if (!ranked.length) throw new Error("\u0644\u0645 \u064A\u064F\u0639\u062B\u0631 \u0639\u0644\u0649 \u0646\u0645\u0648\u0630\u062C \u0645\u062C\u0627\u0646\u064A \u0645\u062A\u0627\u062D \u0628\u0633\u064A\u0627\u0642 \u0644\u0627 \u064A\u0642\u0644 \u0639\u0646 4096 \u0631\u0645\u0632\u064B\u0627.");
      const selected = ranked[0];
      await this.saveConfig({ ...config, id: "main", model: selected.id, automatic: true, lastModelCheck: Date.now() });
      return { model: selected, count: ranked.length, rank: ranked };
    }
    async candidateModels() {
      const config = await this.getConfig();
      const models = await this.getModels();
      const reliability = config.modelReliability || {};
      const freeRanked = rankFreeModels(models, reliability);
      if (config.automatic !== false) return freeRanked.slice(0, 5);
      const chosen = models.find((model) => model.id === config.model);
      if (!chosen) return freeRanked.slice(0, 5);
      if (!isFreeModel(chosen)) throw new Error("\u0627\u0644\u0646\u0645\u0648\u0630\u062C \u0627\u0644\u0645\u062D\u062F\u062F \u063A\u064A\u0631 \u0645\u062C\u0627\u0646\u064A\u061B \u0623\u0648\u0642\u0641\u0646\u0627 \u0627\u0644\u0637\u0644\u0628 \u0644\u062A\u062C\u0646\u0628 \u0623\u064A \u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0645\u062F\u0641\u0648\u0639.");
      const rest = freeRanked.filter((model) => model.id !== chosen.id);
      return [chosen, ...rest.slice(0, 4)];
    }
    async planTask(prompt, { botName = "", serverName = "" } = {}) {
      const status = await this.platform.aiStatus();
      if (!status.configured) throw new Error("\u0623\u0636\u0641 \u0645\u0641\u062A\u0627\u062D OpenRouter \u0623\u0648\u0644\u064B\u0627 \u0644\u0625\u0646\u0634\u0627\u0621 \u062E\u0637\u0629 \u0628\u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A.");
      const config = await this.getConfig();
      const candidates = await this.candidateModels();
      if (!candidates.length) throw new Error("\u0644\u0645 \u062A\u062A\u0648\u0641\u0631 \u0646\u0645\u0627\u0630\u062C \u0645\u062C\u0627\u0646\u064A\u0629 \u0635\u0627\u0644\u062D\u0629. \u0627\u062E\u062A\u0628\u0631 \u0625\u0639\u062F\u0627\u062F\u0627\u062A OpenRouter \u0648\u062D\u0627\u0648\u0644 \u0645\u062C\u062F\u062F\u064B\u0627.");
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      if (config.usageDate !== today) {
        config.usageDate = today;
        config.usageCount = 0;
      }
      const dailyLimit = Math.max(1, Math.min(500, Number(config.dailyLimit) || 30));
      if ((Number(config.usageCount) || 0) >= dailyLimit) throw new Error("\u062A\u0645 \u0628\u0644\u0648\u063A \u062D\u062F \u0637\u0644\u0628\u0627\u062A AI \u0627\u0644\u064A\u0648\u0645\u064A \u0627\u0644\u0645\u062D\u0641\u0648\u0638 \u0645\u062D\u0644\u064A\u064B\u0627. \u064A\u0645\u0643\u0646\u0643 \u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u062D\u062F \u0645\u0646 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A.");
      const errors = [];
      for (let index = 0; index < candidates.length; index += 1) {
        if ((Number(config.usageCount) || 0) >= dailyLimit) throw new Error("\u062A\u0645 \u0628\u0644\u0648\u063A \u062D\u062F \u0637\u0644\u0628\u0627\u062A AI \u0627\u0644\u064A\u0648\u0645\u064A \u0627\u0644\u0645\u062D\u0641\u0648\u0638 \u0645\u062D\u0644\u064A\u064B\u0627 \u0623\u062B\u0646\u0627\u0621 \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629.");
        const model = candidates[index];
        this.onAttempt({ model: model.id, index: index + 1, total: candidates.length });
        config.usageCount = (Number(config.usageCount) || 0) + 1;
        await this.saveConfig({ ...config, id: "main" });
        const userMessage = [
          `\u0637\u0644\u0628 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645: ${String(prompt).slice(0, 2e3)}`,
          botName ? `\u0627\u0644\u0628\u0648\u062A \u0627\u0644\u0645\u062D\u062F\u062F: ${String(botName).slice(0, 80)}` : "\u0644\u0645 \u064A\u062D\u062F\u062F \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0628\u0648\u062A\u064B\u0627 \u0628\u0639\u062F.",
          serverName ? `\u0627\u0644\u0633\u064A\u0631\u0641\u0631 \u0627\u0644\u0645\u062D\u062F\u062F: ${String(serverName).slice(0, 80)}` : "",
          "\u0623\u0646\u0634\u0626 \u062E\u0637\u0629 \u0645\u0642\u062A\u0631\u062D\u0629 \u0641\u0642\u0637. \u0644\u0627 \u062A\u0641\u062A\u0631\u0636 \u0623\u0646 \u0627\u0644\u0628\u0648\u062A \u0645\u062A\u0635\u0644 \u0623\u0648 \u0623\u0646 \u0627\u0644\u0645\u0648\u0627\u0631\u062F/\u0627\u0644\u0645\u0648\u0627\u0642\u0639 \u0645\u0648\u062C\u0648\u062F\u0629."
        ].filter(Boolean).join("\n");
        const body = {
          model: model.id,
          messages: [{ role: "system", content: DEFAULT_SYSTEM }, { role: "user", content: userMessage }],
          temperature: 0.2,
          max_tokens: Math.max(128, Math.min(8192, Number(config.maxTokens) || 900))
        };
        try {
          const result = await this.platform.aiRequest("/chat/completions", "POST", body);
          const content = result?.choices?.[0]?.message?.content;
          const plan = parsePlan(typeof content === "string" ? content : Array.isArray(content) ? content.map((part) => part?.text || "").join("\n") : "");
          const usage = result?.usage || {};
          const reliability = { ...config.modelReliability || {} };
          const previous = reliability[model.id] || { calls: 0, failures: 0, successes: 0 };
          reliability[model.id] = { calls: (Number(previous.calls) || 0) + 1, failures: Number(previous.failures) || 0, successes: (Number(previous.successes) || 0) + 1, lastSuccess: Date.now() };
          const updatedConfig = { ...config, id: "main", model: model.id, modelReliability: reliability, lastSuccessfulModel: model.id, lastModelCheck: Date.now() };
          await this.saveConfig(updatedConfig);
          await this.log({ level: "info", category: "ai", message: `\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u062E\u0637\u0629 \u0645\u0642\u062A\u0631\u062D\u0629 \u0628\u0627\u0633\u062A\u062E\u062F\u0627\u0645 ${model.id}.` });
          return { plan, model: model.id, usage: { promptTokens: Number(usage.prompt_tokens) || 0, completionTokens: Number(usage.completion_tokens) || 0 }, fallbackIndex: index };
        } catch (error) {
          errors.push(model.id);
          const reliability = { ...config.modelReliability || {} };
          const previous = reliability[model.id] || { calls: 0, failures: 0, successes: 0 };
          reliability[model.id] = { calls: (Number(previous.calls) || 0) + 1, failures: (Number(previous.failures) || 0) + 1, successes: Number(previous.successes) || 0, lastFailure: Date.now() };
          config.modelReliability = reliability;
          await this.saveConfig({ ...config, id: "main", modelReliability: reliability }).catch(() => {
          });
          await this.log({ level: "warning", category: "ai", message: `\u0641\u0634\u0644 \u0627\u0644\u0646\u0645\u0648\u0630\u062C ${model.id}\u061B \u062C\u0627\u0631 \u062A\u062C\u0631\u0628\u0629 \u0646\u0645\u0648\u0630\u062C \u0645\u062C\u0627\u0646\u064A \u0622\u062E\u0631.` });
          if (index === candidates.length - 1) throw new Error(`\u062A\u0639\u0630\u0631 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u062E\u0637\u0629 \u0628\u0639\u062F \u062A\u062C\u0631\u0628\u0629 ${errors.length} \u0646\u0645\u0648\u0630\u062C\u064B\u0627. ${getErrorMessage(error)}`);
        }
      }
      throw new Error("\u062A\u0639\u0630\u0631 \u0625\u0646\u0634\u0627\u0621 \u062E\u0637\u0629 \u0627\u0644\u0645\u0647\u0645\u0629.");
    }
  };

  // www/js/task-engine.js
  var TASK_STATUSES = Object.freeze(["pending_plan", "pending", "running", "paused", "completed", "failed", "cancelled"]);
  var allowed = Object.freeze({
    pending_plan: /* @__PURE__ */ new Set(["pending", "cancelled", "failed"]),
    pending: /* @__PURE__ */ new Set(["running", "cancelled", "failed"]),
    running: /* @__PURE__ */ new Set(["paused", "completed", "failed", "cancelled"]),
    paused: /* @__PURE__ */ new Set(["running", "cancelled", "failed"]),
    completed: /* @__PURE__ */ new Set(),
    failed: /* @__PURE__ */ new Set(),
    cancelled: /* @__PURE__ */ new Set()
  });
  function transitionTask(task, nextStatus, { engineAvailable = false, progress = void 0 } = {}) {
    if (!task || !TASK_STATUSES.includes(task.status) || !TASK_STATUSES.includes(nextStatus)) throw new Error("\u062D\u0627\u0644\u0629 \u0645\u0647\u0645\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629.");
    if (!allowed[task.status].has(nextStatus)) throw new Error(`\u0644\u0627 \u064A\u0645\u0643\u0646 \u0646\u0642\u0644 \u0627\u0644\u0645\u0647\u0645\u0629 \u0645\u0646 ${task.status} \u0625\u0644\u0649 ${nextStatus}.`);
    if (["running", "completed"].includes(nextStatus) && !engineAvailable) throw new Error("\u064A\u062A\u0637\u0644\u0628 \u062A\u0634\u063A\u064A\u0644 \u0627\u0644\u0645\u0647\u0645\u0629 \u0645\u062D\u0631\u0643 Minecraft \u0645\u062A\u0635\u0644\u064B\u0627\u061B \u0644\u0645 \u062A\u062A\u063A\u064A\u0631 \u0627\u0644\u062D\u0627\u0644\u0629.");
    const updated = { ...task, status: nextStatus, updatedAt: Date.now() };
    if (progress !== void 0) updated.progress = Math.max(0, Math.min(100, Number(progress) || 0));
    if (nextStatus === "completed") updated.progress = 100;
    if (nextStatus === "cancelled") updated.progress = Math.max(0, Math.min(99, Number(task.progress) || 0));
    return updated;
  }

  // www/js/behavior-engine.js
  var BEHAVIOR_ORDER = Object.freeze(["emergency", "survival", "user_command", "current_task", "resource_management", "idle"]);

  // www/js/ui.js
  var paths = {
    home: '<path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9M9 20v-6h6v6"/>',
    bot: '<rect x="5" y="7" width="14" height="13" rx="3"/><path d="M12 3v4M9 12h.01M15 12h.01M9 16h6M3 11v5M21 11v5"/>',
    tasks: '<path d="M8 5h11v15H5V5h2"/><path d="M9 3h6v4H9zM8 11h8M8 15h6"/><path d="m7 11 1 1 2-2"/>',
    server: '<rect x="4" y="4" width="16" height="7" rx="2"/><rect x="4" y="13" width="16" height="7" rx="2"/><path d="M8 7.5h.01M8 16.5h.01M12 7.5h4M12 16.5h4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1 1.7-1.7 2.9-2-.5a8 8 0 0 1-1.8 1l-.4 2h-3.4l-.4-2a8 8 0 0 1-1.8-1l-2 .5-1.7-2.9 1-1.7a8 8 0 0 1 0-2L5.3 11l1.7-2.9 2 .5a8 8 0 0 1 1.8-1l.4-2h3.4l.4 2a8 8 0 0 1 1.8 1l2-.5 1.7 2.9-1 1.7a8 8 0 0 1-.1 2.3Z" transform="translate(-.2 -1.4) scale(.91)"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="10.8" cy="10.8" r="6.6"/><path d="m16 16 4.5 4.5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 8v6M23 11h-6"/>',
    player: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    cube: '<path d="m12 3 9 5v8l-9 5-9-5V8l9-5Z"/><path d="m3.5 8.3 8.5 4.8 8.5-4.8M12 13v8"/>',
    heart: '<path d="M20.8 8.7c0 5-8.8 10.1-8.8 10.1S3.2 13.7 3.2 8.7a4.7 4.7 0 0 1 8.8-2.3 4.7 4.7 0 0 1 8.8 2.3Z"/>',
    apple: '<path d="M12 8c-3.3-4-8.6-.8-8.6 4.7S6.2 21 9.6 21c1 0 1.7-.5 2.4-.5s1.4.5 2.4.5c3.4 0 6.2-2.8 6.2-8.3S15.3 4 12 8ZM12 7c0-2 1.4-3.5 4-4"/>',
    pin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    spark: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l1 2.2 2 1-2 1-1 2-1-2-2-1 2-1 1-2.2Z"/>',
    wand: '<path d="m15 4 5 5M4 20l12-12 4 4L8 24l-4-4ZM4 4l.8 2.2L7 7l-2.2.8L4 10l-.8-2.2L1 7l2.2-.8L4 4ZM19 16l.7 1.6L21 18l-1.3.5L19 20l-.7-1.5L17 18l1.3-.4L19 16Z"/>',
    shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
    plug: '<path d="M8 3v5M16 3v5M7 8h10v4a5 5 0 0 1-5 5v4M12 17v4"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 14h12l1-14M9 7V4h6v3"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a14 14 0 0 1-3.1 3.9M6.2 6.2C3.5 8 2 12 2 12s3.5 7 10 7a10.6 10.6 0 0 0 4-.8"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6.3L20 12M4 12l2 5.7A7 7 0 0 0 18.4 15"/>',
    play: '<path d="m8 5 11 7-11 7V5Z"/>',
    stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
    pause: '<path d="M9 5v14M15 5v14"/>',
    reconnect: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6.3L20 12M4 12l2 5.7A7 7 0 0 0 18.4 15"/>',
    inventory: '<path d="M4 7h16v14H4zM4 7l2-4h12l2 4M9 12h6M10 7v4M14 7v4"/>',
    skin: '<path d="M12 3 20 7v10l-8 4-8-4V7l8-4Z"/><path d="m4.5 7.3 7.5 4.2 7.5-4.2M12 11.5V21M8 5l8 4.5"/>',
    logs: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
    alert: '<path d="M10.3 4.3 2 18.5A2 2 0 0 0 3.7 21h16.6a2 2 0 0 0 1.7-2.5L13.7 4.3a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 18v2h16v-2"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18h1a2.3 2.3 0 0 0 1.5-4c-1-.9-.4-2.6 1-2.6H17A4 4 0 0 0 21 10c0-4-4-7-9-7Z"/><path d="M7 12h.01M9 8h.01M14 7h.01M17 10h.01"/>',
    moon: '<path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z"/>',
    notification: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    arrowRight: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6v6H9zM9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4"/>',
    wifi: '<path d="M5 12.5a11 11 0 0 1 14 0M8 15.5a6 6 0 0 1 8 0M11 18.5a2 2 0 0 1 2 0M2 9a16 16 0 0 1 20 0"/>',
    filter: '<path d="M4 7h16M7 12h10M10 17h4"/>',
    message: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8A8.5 8.5 0 0 1 12.5 20a8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3h.5a8.5 8.5 0 0 1 8 8v.5Z"/>'
  };
  function icon(name, className = "") {
    const pathData = paths[name] || paths.info;
    const cls = className ? ` class="${escapeHtml(className)}"` : "";
    return `<svg${cls} viewBox="0 0 24 24" aria-hidden="true">${pathData}</svg>`;
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }
  function uid() {
    return globalThis.crypto?.randomUUID?.() || `mb-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
  function formatDate(value, { time = false } = {}) {
    if (!value) return "\u2014";
    const date = new Date(Number(value));
    if (Number.isNaN(date.getTime())) return "\u2014";
    return new Intl.DateTimeFormat("ar", time ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "medium" }).format(date);
  }
  function statusPill(status, label = null) {
    const styles = {
      online: ["online", label || "\u0645\u062A\u0635\u0644"],
      offline: ["offline", label || "\u063A\u064A\u0631 \u0645\u062A\u0635\u0644"],
      ready: ["purple", label || "\u0645\u064F\u0639\u062F\u0651 \u0645\u062D\u0644\u064A\u064B\u0627"],
      idle: ["idle", label || "\u063A\u064A\u0631 \u0645\u062E\u062A\u0628\u0631"],
      pending: ["pending", label || "\u0642\u064A\u062F \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631"],
      planned: ["pending", label || "\u0645\u062E\u0637\u0637\u0629"],
      pending_plan: ["pending", label || "\u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u0627\u0644\u062A\u062E\u0637\u064A\u0637"],
      completed: ["online", label || "\u0645\u0643\u062A\u0645\u0644\u0629"],
      failed: ["offline", label || "\u0641\u0634\u0644\u062A"],
      paused: ["pending", label || "\u0645\u062A\u0648\u0642\u0641\u0629 \u0645\u0624\u0642\u062A\u064B\u0627"],
      cancelled: ["idle", label || "\u0623\u064F\u0644\u063A\u064A\u062A"],
      running: ["online", label || "\u062A\u0639\u0645\u0644"]
    };
    const [cls, text] = styles[status] || ["idle", label || "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641"];
    return `<span class="status-pill ${cls}">${escapeHtml(text)}</span>`;
  }
  function pageHeading(title, subtitle = "", action = "") {
    return `<div class="page-heading"><div><h1>${escapeHtml(title)}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}</div>${action}</div>`;
  }
  function notice(text, tone = "info", heading = "") {
    const iconName = tone === "warning" || tone === "error" ? "alert" : tone === "success" ? "check" : "info";
    return `<div class="notice ${tone}"><span class="notice-icon">${icon(iconName)}</span><span>${heading ? `<strong>${escapeHtml(heading)} \u2014 </strong>` : ""}${escapeHtml(text)}</span></div>`;
  }
  function emptyState({ icon: iconName = "cube", title, description, actionLabel = "", action = "" }) {
    return `<div class="empty-state"><div class="empty-icon">${icon(iconName)}</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p>${actionLabel ? `<button class="btn btn-secondary btn-small" data-action="${escapeHtml(action)}">${icon("plus")}${escapeHtml(actionLabel)}</button>` : ""}</div>`;
  }
  function button(label, action, kind = "primary", { icon: iconName = "", attrs = "", size = "", block = false } = {}) {
    return `<button class="btn btn-${kind} ${size ? `btn-${size}` : ""} ${block ? "btn-block" : ""}" data-action="${escapeHtml(action)}" ${attrs}>${iconName ? icon(iconName) : ""}<span>${escapeHtml(label)}</span></button>`;
  }
  function fmtNumber(value) {
    const n = Number(value) || 0;
    return new Intl.NumberFormat("ar").format(n);
  }
  function timeAgo(value) {
    const seconds = Math.max(0, Math.floor((Date.now() - Number(value || 0)) / 1e3));
    if (seconds < 60) return "\u0627\u0644\u0622\u0646";
    if (seconds < 3600) return `\u0642\u0628\u0644 ${Math.floor(seconds / 60)} \u062F`;
    if (seconds < 86400) return `\u0642\u0628\u0644 ${Math.floor(seconds / 3600)} \u0633`;
    return `\u0642\u0628\u0644 ${Math.floor(seconds / 86400)} \u064A`;
  }

  // www/js/views.js
  var actionButton = (name, label, style, iconName = "", extra = "") => `<button class="btn btn-${style} btn-small" data-action="${name}" ${extra}>${iconName ? icon(iconName) : ""}<span>${escapeHtml(label)}</span></button>`;
  var plusButton = (action, label = "\u0625\u0636\u0627\u0641\u0629") => `<button class="heading-action" data-action="${action}" aria-label="${escapeHtml(label)}">${icon("plus")}</button>`;
  var backButton = () => `<button class="heading-action" data-action="back" aria-label="\u0631\u062C\u0648\u0639" style="background:rgba(29,42,69,.76);border-color:rgba(137,160,213,.17);box-shadow:none">${icon("arrowRight")}</button>`;
  var field = (label, name, value = "", { placeholder = "", type = "text", required = false, help = "", max = "", attrs = "" } = {}) => `<div class="form-row"><label class="form-label" for="${escapeHtml(name)}">${escapeHtml(label)}${required ? "<small>\u0645\u0637\u0644\u0648\u0628</small>" : ""}</label><input class="field" id="${escapeHtml(name)}" name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" ${required ? "required" : ""} ${max ? `maxlength="${escapeHtml(max)}"` : ""} ${attrs}>${help ? `<div class="field-help">${escapeHtml(help)}</div>` : ""}</div>`;
  var selectField = (label, name, choices, value, { help = "", required = false, disabled = false } = {}) => `<div class="form-row"><label class="form-label" for="${escapeHtml(name)}">${escapeHtml(label)}${required ? "<small>\u0645\u0637\u0644\u0648\u0628</small>" : ""}</label><select class="field field-select" id="${escapeHtml(name)}" name="${escapeHtml(name)}" ${required ? "required" : ""} ${disabled ? "disabled" : ""}>${choices.map((choice) => `<option value="${escapeHtml(choice.value)}" ${choice.value === value ? "selected" : ""}>${escapeHtml(choice.label)}</option>`).join("")}</select>${help ? `<div class="field-help">${escapeHtml(help)}</div>` : ""}</div>`;
  var switchMarkup = (name, checked, label = "") => `<label class="switch" aria-label="${escapeHtml(label)}"><input type="checkbox" data-setting="${escapeHtml(name)}" ${checked ? "checked" : ""}><span class="switch-track"></span></label>`;
  var settingItem = ({ icon: iconName, color = "", title, subtitle, route = "", action = "", control = "" }) => `<button class="setting-item" ${route ? `data-route="${escapeHtml(route)}"` : `data-action="${escapeHtml(action)}"`}> <span class="setting-icon ${color}">${icon(iconName)}</span><span class="setting-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(subtitle)}</small></span>${control || `<span class="setting-chevron">${icon("chevron")}</span>`}</button>`;
  var group = (title, items) => `<section class="setting-group"><h2 class="setting-group-title">${escapeHtml(title)}</h2>${items}</section>`;
  function heroArt() {
    return `<div class="hero-orb" aria-hidden="true"><span class="hero-spark spark-a">\u2726</span><span class="hero-spark spark-b">\u2727</span><span class="hero-spark spark-c">\u2726</span><div class="bot-figure"><div class="bot-head"></div><div class="bot-arm arm-l"></div><div class="bot-arm arm-r"></div><div class="bot-body"></div><div class="bot-leg leg-l"></div><div class="bot-leg leg-r"></div></div></div>`;
  }
  function statCard(iconName, tone, label, value, detail = "") {
    return `<div class="stat-card"><div class="stat-icon ${tone}">${icon(iconName)}</div><div class="stat-copy"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</div></div>`;
  }
  function quickCard(iconName, tone, title, subtitle, action) {
    return `<button class="quick-card ${tone}" data-action="${escapeHtml(action)}"><span class="quick-icon">${icon(iconName)}</span><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(subtitle)}</small></span><span class="quick-arrow">\u2039</span></button>`;
  }
  function renderHome(state2) {
    const online = state2.bots.filter((bot) => bot.status === "online").length;
    const completed = state2.tasks.filter((task) => task.status === "completed").length;
    const activeTasks = state2.tasks.filter((task) => ["pending_plan", "pending", "running", "paused"].includes(task.status)).length;
    const botDetail = state2.bots.length ? `${fmtNumber(online)} \u0645\u062A\u0635\u0644 \u0641\u0639\u0644\u064A\u064B\u0627` : "\u0627\u0628\u062F\u0623 \u0628\u0625\u0639\u062F\u0627\u062F \u0623\u0648\u0644 \u0628\u0648\u062A";
    const aiLabel = state2.aiConfigured ? "\u0627\u0644\u0645\u0641\u062A\u0627\u062D \u0645\u062D\u0641\u0648\u0638" : "\u064A\u062D\u062A\u0627\u062C \u0625\u0639\u062F\u0627\u062F \u0627\u0644\u0645\u0641\u062A\u0627\u062D";
    const recentTasks = [...state2.tasks].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).slice(0, 2);
    const recentBots = [...state2.bots].slice(0, 2);
    return `
    <section class="hero-card"><div class="hero-copy"><div class="hero-greeting"><span class="tiny-avatar">M</span><span>\u0645\u0631\u062D\u0628\u064B\u0627 \u0628\u0643 \u0641\u064A \u0645\u0633\u0627\u062D\u0629 \u0627\u0644\u062A\u062D\u0643\u0645</span></div><h1>\u0639\u0627\u0644\u0645\u0643\u060C <span>\u0628\u0625\u062F\u0627\u0631\u062A\u0643.</span></h1><p>\u0625\u062F\u0627\u0631\u0629 \u0645\u062D\u0644\u064A\u0629 \u0644\u0633\u064A\u0631\u0641\u0631\u0627\u062A\u0643 \u0648\u0628\u0648\u062A\u0627\u062A\u0643 \u0648\u062E\u0637\u0637 \u0645\u0647\u0627\u0645\u0643 \u2014 \u0628\u062F\u0648\u0646 \u0628\u064A\u0627\u0646\u0627\u062A \u062A\u062C\u0631\u064A\u0628\u064A\u0629.</p></div>${heroArt()}</section>
    <div class="section-title"><h2>\u0646\u0638\u0631\u0629 \u0639\u0627\u0645\u0629</h2><span class="section-hint">\u0628\u064A\u0627\u0646\u0627\u062A \u0645\u062D\u0641\u0648\u0638\u0629 \u0639\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632</span></div>
    <div class="stats-grid">
      ${statCard("bot", "purple", "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0628\u0648\u062A\u0627\u062A", fmtNumber(state2.bots.length), botDetail)}
      ${statCard("server", "cyan", "\u0627\u0644\u0633\u064A\u0631\u0641\u0631\u0627\u062A", fmtNumber(state2.servers.length), "\u0633\u064A\u0631\u0641\u0631\u0627\u062A \u0645\u062D\u0641\u0648\u0638\u0629 \u0645\u062D\u0644\u064A\u064B\u0627")}
      ${statCard("wifi", "green", "Bots Online", fmtNumber(online), online ? "\u0627\u062A\u0635\u0627\u0644 \u062D\u064A\u0651" : "\u0644\u0627 \u062A\u0648\u062C\u062F \u062C\u0644\u0633\u0629 \u0628\u0648\u062A \u062D\u064A\u0651\u0629")}
      ${statCard("plug", "amber", "Bots Offline", fmtNumber(state2.bots.length - online), "\u0645\u0644\u0641\u0627\u062A \u0645\u064F\u0639\u062F\u0629 \u063A\u064A\u0631 \u0645\u062A\u0635\u0644\u0629")}
      ${statCard("tasks", "blue", "\u0627\u0644\u0645\u0647\u0627\u0645 \u0627\u0644\u0646\u0634\u0637\u0629", fmtNumber(activeTasks), "\u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u0627\u0644\u062A\u062E\u0637\u064A\u0637 \u0623\u0648 \u0627\u0644\u062A\u0646\u0641\u064A\u0630")}
      ${statCard("check", "green", "\u0627\u0644\u0645\u0647\u0627\u0645 \u0627\u0644\u0645\u0643\u062A\u0645\u0644\u0629", fmtNumber(completed), "\u0633\u062C\u0644 \u0645\u062D\u0644\u064A \u0641\u0642\u0637")}
    </div>
    <div class="section-title"><h2>\u0625\u062C\u0631\u0627\u0621\u0627\u062A \u0633\u0631\u064A\u0639\u0629</h2></div>
    <div class="quick-grid">
      ${quickCard("server", "purple", "\u0625\u0636\u0627\u0641\u0629 \u0633\u064A\u0631\u0641\u0631", "\u0627\u062E\u062A\u0628\u0627\u0631 \u0627\u062A\u0635\u0627\u0644 Minecraft", "add-server")}
      ${quickCard("bot", "green", "\u0625\u0636\u0627\u0641\u0629 \u0628\u0648\u062A", "\u062D\u0641\u0638 \u0625\u0639\u062F\u0627\u062F\u0627\u062A\u0647 \u0645\u062D\u0644\u064A\u064B\u0627", "add-bot")}
      ${quickCard("tasks", "cyan", "\u0625\u0646\u0634\u0627\u0621 \u0645\u0647\u0645\u0629", "\u062E\u0637\u0637\u0647\u0627 \u0628\u0648\u0627\u0633\u0637\u0629 AI", "add-task")}
      ${quickCard("spark", "violet", "\u0625\u0639\u062F\u0627\u062F\u0627\u062A AI", "OpenRouter \u0648\u0627\u0644\u0646\u0645\u0627\u0630\u062C", "open-ai")}
    </div>
    <div class="section-title"><h2>\u062D\u0627\u0644\u0629 \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A</h2><button class="text-action" data-action="open-ai">\u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A</button></div>
    <div class="status-strip"><div><div class="strip-title">OpenRouter</div><div class="strip-subtitle">${state2.aiConfigured ? "\u0645\u0641\u062A\u0627\u062D \u0645\u062D\u0641\u0648\u0638 \u0641\u064A \u0627\u0644\u062A\u062E\u0632\u064A\u0646 \u0627\u0644\u0622\u0645\u0646" : "\u0644\u0627 \u064A\u0648\u062C\u062F \u0645\u0641\u062A\u0627\u062D \u0645\u062D\u0641\u0648\u0638"}</div></div>${statusPill(state2.aiConfigured ? "ready" : "idle", aiLabel)}</div>
    <div class="section-title"><h2>\u0628\u0648\u062A\u0627\u062A\u064A</h2><button class="text-action" data-route="bots">\u0639\u0631\u0636 \u0627\u0644\u0643\u0644</button></div>
    ${recentBots.length ? `<div class="list-stack">${recentBots.map((bot) => botCard(bot, state2.servers)).join("")}</div>` : emptyState({ icon: "bot", title: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u0648\u062A\u0627\u062A \u0628\u0639\u062F", description: "\u0623\u0646\u0634\u0626 \u0645\u0644\u0641 \u0628\u0648\u062A \u0648\u0627\u0631\u0628\u0637\u0647 \u0628\u0633\u064A\u0631\u0641\u0631 \u0645\u062D\u0641\u0648\u0638. \u0633\u064A\u0628\u0642\u0649 \u063A\u064A\u0631 \u0645\u062A\u0635\u0644 \u062D\u062A\u0649 \u064A\u062A\u0648\u0641\u0631 \u0645\u062D\u0631\u0643 Minecraft \u0641\u0639\u0644\u064A.", actionLabel: "\u0625\u0636\u0627\u0641\u0629 \u0628\u0648\u062A", action: "add-bot" })}
    <div class="section-title"><h2>\u0627\u0644\u0645\u0647\u0627\u0645 \u0627\u0644\u0623\u062E\u064A\u0631\u0629</h2><button class="text-action" data-route="tasks">\u0639\u0631\u0636 \u0627\u0644\u0643\u0644</button></div>
    ${recentTasks.length ? `<div class="list-stack">${recentTasks.map((task) => taskCard(task, state2.bots)).join("")}</div>` : emptyState({ icon: "tasks", title: "\u0645\u0633\u0627\u062D\u0629 \u0627\u0644\u0645\u0647\u0627\u0645 \u062C\u0627\u0647\u0632\u0629", description: "\u0623\u0636\u0641 \u0637\u0644\u0628\u064B\u0627 \u0648\u0627\u062D\u0641\u0638\u0647 \u0645\u062D\u0644\u064A\u064B\u0627\u060C \u062B\u0645 \u0623\u0646\u0634\u0626 \u0644\u0647 \u062E\u0637\u0629 \u0639\u0628\u0631 \u0646\u0645\u0648\u0630\u062C OpenRouter \u0645\u062C\u0627\u0646\u064A \u0639\u0646\u062F \u0625\u0639\u062F\u0627\u062F \u0627\u0644\u0645\u0641\u062A\u0627\u062D.", actionLabel: "\u0625\u0636\u0627\u0641\u0629 \u0645\u0647\u0645\u0629", action: "add-task" })}
  `;
  }
  function serverCard(server, state2) {
    const bots = state2.bots.filter((bot) => bot.serverId === server.id && bot.status === "online").length;
    const isOnline = server.status === "online";
    const status = isOnline ? statusPill("online") : server.status === "offline" ? statusPill("offline") : statusPill("idle", "\u063A\u064A\u0631 \u0645\u062E\u062A\u0628\u0631");
    const players = isOnline ? `${fmtNumber(server.playersOnline || 0)}/${fmtNumber(server.playersMax || 0)}` : "\u2014";
    const version = server.lastPingVersion || server.version || "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F";
    const checking = state2.pinging.has(server.id);
    return `<article class="list-card" data-action="server-details" data-id="${escapeHtml(server.id)}" tabindex="0" role="button" aria-label="\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0633\u064A\u0631\u0641\u0631 ${escapeHtml(server.name)}">
    <div class="tile-art server-art">${icon("cube")}</div>
    <div class="list-content"><div class="list-topline"><strong>${escapeHtml(server.name)}</strong>${status}</div><div class="secondary">${escapeHtml(server.host)}:${escapeHtml(server.port)}</div><div class="list-meta"><span>${icon("cube")}${escapeHtml(version)}</span><span>${icon("users")}${players}</span><span>${icon("bot")}${fmtNumber(bots)}</span></div></div>
    <div class="card-trailing"><button class="more-button" data-action="server-menu" data-id="${escapeHtml(server.id)}" aria-label="\u062E\u064A\u0627\u0631\u0627\u062A">\u22EE</button><button class="mini-action" data-action="ping-server" data-id="${escapeHtml(server.id)}" ${checking ? "disabled" : ""}>${checking ? '<span class="spinner"></span>' : "\u0627\u062E\u062A\u0628\u0627\u0631"}</button></div>
  </article>`;
  }
  function botCard(bot, servers) {
    const server = servers.find((item) => item.id === bot.serverId);
    const statePill = bot.status === "online" ? statusPill("online") : statusPill("ready", "\u0645\u064F\u0639\u062F\u0651");
    const avatar = `<span class="avatar-pixel" style="--avatar-hair:${escapeHtml(bot.color || "#293454")}"></span>`;
    return `<article class="list-card bot-card" data-action="bot-details" data-id="${escapeHtml(bot.id)}" tabindex="0" role="button" aria-label="\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0628\u0648\u062A ${escapeHtml(bot.name)}">
    <div class="tile-art bot-art">${avatar}</div><div class="list-content"><div class="list-topline"><strong>${escapeHtml(bot.name)}</strong>${statePill}</div><div class="secondary">${escapeHtml(server?.name || "\u0644\u0627 \u064A\u0648\u062C\u062F \u0633\u064A\u0631\u0641\u0631 \u0645\u0631\u062A\u0628\u0637")}</div><div class="list-meta"><span>${icon("server")}${escapeHtml(server?.host || "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F")}</span><span>${icon("skin")}${bot.skinId ? "\u0633\u0643\u0646 \u0645\u062D\u062F\u062F" : "\u0628\u062F\u0648\u0646 \u0633\u0643\u0646"}</span></div></div>
    <div class="card-trailing"><button class="more-button" data-action="bot-menu" data-id="${escapeHtml(bot.id)}" aria-label="\u062E\u064A\u0627\u0631\u0627\u062A">\u22EE</button><span class="muted" style="font-size:9px">${bot.status === "online" ? "\u0627\u062A\u0635\u0627\u0644 \u062D\u064A" : "\u063A\u064A\u0631 \u0645\u062A\u0635\u0644"}</span></div>
  </article>`;
  }
  function taskStatus(task) {
    if (task.status === "pending_plan") return statusPill("pending_plan");
    if (task.status === "pending") return statusPill("planned", task.plan?.steps?.length ? "\u0645\u062E\u0637\u0637\u0629 \xB7 \u0645\u0639\u0644\u0651\u0642\u0629" : "\u0645\u0639\u0644\u0651\u0642\u0629");
    return statusPill(task.status);
  }
  function taskCard(task, bots) {
    const bot = bots.find((item) => item.id === task.botId);
    const progress = Math.min(100, Math.max(0, Number(task.progress) || 0));
    return `<article class="glass-card task-card" data-action="task-details" data-id="${escapeHtml(task.id)}" role="button" tabindex="0">
    <div class="task-head"><div class="task-main"><div class="task-name">${escapeHtml(task.name || task.description || "\u0645\u0647\u0645\u0629 \u062C\u062F\u064A\u062F\u0629")}</div><div class="task-description">${escapeHtml(task.description || "")}</div></div>${taskStatus(task)}</div>
    <div class="task-progress-row"><div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div><b>${task.status === "completed" ? "100%" : `${fmtNumber(progress)}%`}</b></div>
    <div class="task-foot"><span>${icon("bot")} ${escapeHtml(bot?.name || "\u063A\u064A\u0631 \u0645\u0639\u064A\u0651\u0646\u0629")}</span><span class="priority ${escapeHtml(task.priority || "normal")}">${{ high: "\u0639\u0627\u0644\u064A\u0629", normal: "\u0639\u0627\u062F\u064A\u0629", low: "\u0645\u0646\u062E\u0641\u0636\u0629" }[task.priority] || "\u0639\u0627\u062F\u064A\u0629"}</span><span>${timeAgo(task.createdAt)}</span></div>
  </article>`;
  }
  function searchBox(placeholder) {
    return `<label class="search-wrap">${icon("search")}<input class="search-input" type="search" data-search placeholder="${escapeHtml(placeholder)}" autocomplete="off"></label>`;
  }
  function renderServers(state2) {
    const query = state2.search.trim().toLocaleLowerCase();
    const servers = state2.servers.filter((server) => !query || `${server.name} ${server.host} ${server.version}`.toLocaleLowerCase().includes(query));
    const rows = servers.length ? `<div class="list-stack">${servers.map((server) => serverCard(server, state2)).join("")}</div>` : emptyState({ icon: "server", title: query ? "\u0644\u0627 \u062A\u0648\u062C\u062F \u0646\u062A\u0627\u0626\u062C" : "\u0623\u0636\u0641 \u0623\u0648\u0644 \u0633\u064A\u0631\u0641\u0631", description: query ? "\u062C\u0631\u0651\u0628 \u0627\u0633\u0645\u064B\u0627 \u0623\u0648 \u0639\u0646\u0648\u0627\u0646\u064B\u0627 \u0645\u062E\u062A\u0644\u0641\u064B\u0627." : "\u0623\u062F\u062E\u0644 \u0639\u0646\u0648\u0627\u0646 Java Edition \u062D\u0642\u064A\u0642\u064A\u064B\u0627. \u0627\u062E\u062A\u0628\u0627\u0631 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u064A\u0631\u0633\u0644 Minecraft status ping \u0641\u0639\u0644\u064A\u064B\u0627.", actionLabel: query ? "" : "\u0625\u0636\u0627\u0641\u0629 \u0633\u064A\u0631\u0641\u0631", action: "add-server" });
    return `${pageHeading("\u0633\u064A\u0631\u0641\u0631\u0627\u062A\u064A", `${fmtNumber(state2.servers.length)} \u0633\u064A\u0631\u0641\u0631 \u0645\u062D\u0641\u0648\u0638 \u0645\u062D\u0644\u064A\u064B\u0627`, plusButton("add-server", "\u0625\u0636\u0627\u0641\u0629 \u0633\u064A\u0631\u0641\u0631"))}${searchBox("\u0627\u0628\u062D\u062B \u0639\u0646 \u0633\u064A\u0631\u0641\u0631...")}${rows}`;
  }
  function renderServerForm(state2) {
    const id = state2.params.id;
    const current = id ? state2.servers.find((server) => server.id === id) : null;
    const editing = Boolean(current);
    const defaults = state2.settings.defaultVersion || "1.20.4";
    const statusInfo = current?.status === "online" ? notice(`\u0622\u062E\u0631 \u0627\u062E\u062A\u0628\u0627\u0631 \u0646\u0627\u062C\u062D: ${formatDate(current.lastCheckedAt, { time: true })}.`, "success") : "";
    return `${pageHeading(editing ? "\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0633\u064A\u0631\u0641\u0631" : "\u0625\u0636\u0627\u0641\u0629 \u0633\u064A\u0631\u0641\u0631", "\u0627\u062A\u0635\u0627\u0644 Minecraft Java Edition", backButton())}
    <form class="form-card" data-form="server" data-id="${escapeHtml(current?.id || "")}">
      ${field("\u0627\u0633\u0645 \u0627\u0644\u0633\u064A\u0631\u0641\u0631", "name", current?.name || "", { placeholder: "\u0645\u062B\u0627\u0644: Survival World", required: true, max: 48 })}
      <div class="form-row"><label class="form-label" for="host">\u0639\u0646\u0648\u0627\u0646 IP \u0623\u0648 \u0627\u0644\u0646\u0637\u0627\u0642<small>Java Edition</small></label><input class="field" id="host" name="host" type="text" dir="ltr" inputmode="url" autocapitalize="none" spellcheck="false" required maxlength="253" placeholder="play.example.com" value="${escapeHtml(current?.host || "")}"><div class="field-help">\u0644\u0627 \u062A\u062F\u0639\u0645 \u0647\u0630\u0647 \u0627\u0644\u0646\u0633\u062E\u0629 \u0639\u0646\u0627\u0648\u064A\u0646 SRV \u0623\u0648 Bedrock. \u064A\u0645\u0643\u0646 \u0625\u062F\u062E\u0627\u0644 IP \u0623\u0648 \u0627\u0633\u0645 \u0646\u0637\u0627\u0642 \u0645\u0639 \u0627\u0644\u0645\u0646\u0641\u0630.</div></div>
      <div class="field-inline">${field("\u0627\u0644\u0645\u0646\u0641\u0630", "port", current?.port ?? 25565, { type: "number", required: true, attrs: 'min="1" max="65535" inputmode="numeric"' })}${selectField("\u0627\u0644\u0646\u0633\u062E\u0629", "version", ["1.21.8", "1.21.6", "1.21.4", "1.21.1", "1.20.6", "1.20.4", "1.20.1", "1.19.4", "1.18.2", "\u0623\u062E\u0631\u0649"].map((value) => ({ value, label: value === "\u0623\u062E\u0631\u0649" ? "\u0623\u062E\u0631\u0649" : value })), current?.version || defaults)}</div>
      ${statusInfo}
      ${notice("\u0627\u062E\u062A\u0628\u0627\u0631 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u064A\u0633\u062A\u062E\u062F\u0645 Minecraft Server List Ping \u0639\u0628\u0631 TCP \u0645\u0646 \u0627\u0644\u0647\u0627\u062A\u0641/\u0627\u0644\u0645\u0639\u0627\u064A\u0646\u0629\u061B \u0644\u0627 \u064A\u062D\u062A\u0627\u062C \u062D\u0633\u0627\u0628\u064B\u0627 \u0648\u0644\u0627 \u064A\u0631\u0633\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062F\u062E\u0648\u0644.", "info")}
      <div class="form-actions"><button class="btn btn-primary" type="submit">${icon(editing ? "check" : "plus")}<span>${editing ? "\u062D\u0641\u0638 \u0627\u0644\u062A\u063A\u064A\u064A\u0631\u0627\u062A" : "\u062D\u0641\u0638 \u0627\u0644\u0633\u064A\u0631\u0641\u0631"}</span></button><button class="btn btn-secondary" type="button" data-action="back">\u0625\u0644\u063A\u0627\u0621</button></div>
    </form>`;
  }
  function renderServerDetails(state2) {
    const server = state2.servers.find((item) => item.id === state2.params.id);
    if (!server) return `${pageHeading("\u0627\u0644\u0633\u064A\u0631\u0641\u0631", "", backButton())}${emptyState({ icon: "server", title: "\u0627\u0644\u0633\u064A\u0631\u0641\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F", description: "\u0642\u062F \u064A\u0643\u0648\u0646 \u062D\u064F\u0630\u0641 \u0645\u0646 \u0627\u0644\u062A\u062E\u0632\u064A\u0646 \u0627\u0644\u0645\u062D\u0644\u064A." })}`;
    const bots = state2.bots.filter((bot) => bot.serverId === server.id);
    const onlineBots = bots.filter((bot) => bot.status === "online").length;
    const status = server.status === "online" ? statusPill("online") : server.status === "offline" ? statusPill("offline") : statusPill("idle", "\u0644\u0645 \u064A\u064F\u062E\u062A\u0628\u0631");
    const pingLabel = state2.pinging.has(server.id) ? "\u062C\u0627\u0631 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u2026" : "\u0627\u062E\u062A\u0628\u0627\u0631 \u0627\u0644\u0627\u062A\u0635\u0627\u0644";
    return `${pageHeading("\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0633\u064A\u0631\u0641\u0631", "", backButton())}
    <section class="detail-hero"><div class="detail-head"><div class="tile-art server-art">${icon("cube")}</div><div style="min-width:0;flex:1"><div class="list-topline"><h2>${escapeHtml(server.name)}</h2>${status}</div><p class="ltr">${escapeHtml(server.host)}:${escapeHtml(server.port)}</p></div><button class="more-button" data-action="server-menu" data-id="${escapeHtml(server.id)}" aria-label="\u062E\u064A\u0627\u0631\u0627\u062A">\u22EE</button></div>
      <div class="detail-stat-grid"><div class="detail-stat"><span>\u0627\u0644\u0625\u0635\u062F\u0627\u0631 \u0627\u0644\u0645\u0637\u0644\u0648\u0628</span><strong>${escapeHtml(server.version || "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F")}</strong></div><div class="detail-stat"><span>\u0627\u0644\u0625\u0635\u062F\u0627\u0631 \u0627\u0644\u0645\u064F\u0639\u0644\u0646</span><strong>${escapeHtml(server.lastPingVersion || "\u0644\u0645 \u064A\u064F\u062E\u062A\u0628\u0631")}</strong></div><div class="detail-stat"><span>\u0627\u0644\u0644\u0627\u0639\u0628\u0648\u0646</span><strong>${server.status === "online" ? `${fmtNumber(server.playersOnline || 0)} / ${fmtNumber(server.playersMax || 0)}` : "\u063A\u064A\u0631 \u0645\u062A\u0627\u062D"}</strong></div><div class="detail-stat"><span>\u0628\u0648\u062A\u0627\u062A \u0639\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u0633\u064A\u0631\u0641\u0631</span><strong>${fmtNumber(onlineBots)} \u0645\u062A\u0635\u0644\u0629 \u0645\u0646 ${fmtNumber(bots.length)}</strong></div></div>
    </section>
    <div class="btn-row mt-12">${actionButton("ping-server", pingLabel, "primary", "wifi", `data-id="${escapeHtml(server.id)}" ${state2.pinging.has(server.id) ? "disabled" : ""}`)}${actionButton("edit-server", "\u062A\u0639\u062F\u064A\u0644", "secondary", "edit", `data-id="${escapeHtml(server.id)}"`)}${actionButton("delete-server", "\u062D\u0630\u0641", "danger", "trash", `data-id="${escapeHtml(server.id)}"`)}</div>
    ${server.lastPingError ? `<div class="mt-12">${notice(server.lastPingError, "warning", "\u0622\u062E\u0631 \u0646\u062A\u064A\u062C\u0629")}</div>` : ""}
    <div class="section-title"><h2>\u0627\u0644\u0628\u0648\u062A\u0627\u062A \u0627\u0644\u0645\u0631\u062A\u0628\u0637\u0629</h2><button class="text-action" data-action="add-bot">\u0625\u0636\u0627\u0641\u0629 \u0628\u0648\u062A</button></div>
    ${bots.length ? `<div class="list-stack">${bots.map((bot) => botCard(bot, state2.servers)).join("")}</div>` : emptyState({ icon: "bot", title: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u0648\u062A\u0627\u062A \u0645\u0631\u062A\u0628\u0637\u0629", description: "\u0645\u0644\u0641\u0627\u062A \u0627\u0644\u0628\u0648\u062A\u0627\u062A \u0627\u0644\u062A\u064A \u062A\u0646\u0634\u0626\u0647\u0627 \u0633\u062A\u0638\u0647\u0631 \u0647\u0646\u0627. \u0644\u0627 \u064A\u062A\u0645 \u062A\u0634\u063A\u064A\u0644 \u0627\u062A\u0635\u0627\u0644 \u0648\u0647\u0645\u064A." })}`;
  }
  function renderBots(state2) {
    const query = state2.search.trim().toLocaleLowerCase();
    const bots = state2.bots.filter((bot) => !query || `${bot.name} ${bot.username || ""}`.toLocaleLowerCase().includes(query));
    const rows = bots.length ? `<div class="list-stack">${bots.map((bot) => botCard(bot, state2.servers)).join("")}</div>` : emptyState({ icon: "bot", title: query ? "\u0644\u0627 \u062A\u0648\u062C\u062F \u0646\u062A\u0627\u0626\u062C" : "\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u0648\u062A\u0627\u062A \u0645\u062D\u0641\u0648\u0638\u0629", description: query ? "\u063A\u064A\u0651\u0631 \u0639\u0628\u0627\u0631\u0629 \u0627\u0644\u0628\u062D\u062B." : "\u0623\u0646\u0634\u0626 \u0645\u0644\u0641\u064B\u0627 \u0645\u062D\u0644\u064A\u064B\u0627 \u0644\u0643\u0644 \u062D\u0633\u0627\u0628/\u0628\u0648\u062A. \u0633\u064A\u062A\u0645 \u0625\u0638\u0647\u0627\u0631 \u062D\u0627\u0644\u0629 \u0645\u064F\u0639\u062F\u0651\u060C \u0648\u0644\u064A\u0633 \u0627\u062A\u0635\u0627\u0644\u064B\u0627\u060C \u0625\u0644\u0649 \u0623\u0646 \u064A\u062A\u0648\u0641\u0631 \u0645\u062D\u0631\u0643 Minecraft \u062D\u0642\u064A\u0642\u064A.", actionLabel: query ? "" : "\u0625\u0636\u0627\u0641\u0629 \u0628\u0648\u062A", action: "add-bot" });
    const engine = notice("\u0645\u062D\u0631\u0643 \u0627\u062A\u0635\u0627\u0644 \u0648\u062A\u0648\u062C\u064A\u0647 \u0627\u0644\u0628\u0648\u062A\u0627\u062A \u063A\u064A\u0631 \u0645\u062F\u0645\u062C \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0646\u0633\u062E\u0629\u061B \u0644\u0646 \u0646\u0639\u0631\u0636 \u0645\u0644\u0641\u0627\u062A \u0627\u0644\u0628\u0648\u062A \u0639\u0644\u0649 \u0623\u0646\u0647\u0627 \u0645\u062A\u0635\u0644\u0629 \u0648\u0644\u0646 \u0646\u0628\u062F\u0623 \u0645\u0647\u0645\u0629 \u0645\u0632\u064A\u0641\u0629.", "warning", "\u0634\u0641\u0627\u0641\u064A\u0629 \u062D\u0627\u0644\u0629 \u0627\u0644\u0627\u062A\u0635\u0627\u0644");
    return `${pageHeading("\u0628\u0648\u062A\u0627\u062A\u064A", `${fmtNumber(state2.bots.length)} \u0645\u0644\u0641 \u0628\u0648\u062A \u0645\u062D\u0644\u064A`, plusButton("add-bot", "\u0625\u0636\u0627\u0641\u0629 \u0628\u0648\u062A"))}${engine}${searchBox("\u0627\u0628\u062D\u062B \u0639\u0646 \u0628\u0648\u062A...")}${rows}`;
  }
  function renderBotForm(state2) {
    const current = state2.params.id ? state2.bots.find((bot) => bot.id === state2.params.id) : null;
    const editing = Boolean(current);
    const serverChoices = state2.servers.map((server) => ({ value: server.id, label: `${server.name} \xB7 ${server.host}:${server.port}` }));
    const savedSkins = state2.skins.map((skin) => ({ value: skin.id, label: skin.name }));
    return `${pageHeading(editing ? "\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0628\u0648\u062A" : "\u0625\u0636\u0627\u0641\u0629 \u0628\u0648\u062A", "\u0627\u062D\u0641\u0638 \u0645\u0644\u0641 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0639\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632", backButton())}
    ${state2.servers.length ? "" : `<div class="mb-12">${notice("\u064A\u0644\u0632\u0645 \u062D\u0641\u0638 \u0633\u064A\u0631\u0641\u0631 \u0623\u0648\u0644\u064B\u0627 \u0644\u0631\u0628\u0637 \u0645\u0644\u0641 \u0627\u0644\u0628\u0648\u062A. \u0623\u0636\u0641 \u0633\u064A\u0631\u0641\u0631\u064B\u0627 \u062B\u0645 \u0627\u0631\u062C\u0639 \u0625\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629.", "warning")}<div class="mt-8">${actionButton("add-server", "\u0625\u0636\u0627\u0641\u0629 \u0633\u064A\u0631\u0641\u0631", "secondary", "plus")}</div></div>`}
    <form class="form-card" data-form="bot" data-id="${escapeHtml(current?.id || "")}">
      ${field("\u0627\u0633\u0645 \u0627\u0644\u0628\u0648\u062A", "name", current?.name || "", { placeholder: "\u0645\u062B\u0627\u0644: MinerBot", required: true, max: 40 })}
      ${field("\u0627\u0633\u0645 \u0627\u0644\u0644\u0627\u0639\u0628 / Username", "username", current?.username || "", { placeholder: "Minecraft username", required: true, max: 16, attrs: 'dir="ltr" autocapitalize="none" spellcheck="false" pattern="[A-Za-z0-9_]{3,16}"' })}
      ${selectField("\u0627\u0644\u0633\u064A\u0631\u0641\u0631", "serverId", serverChoices.length ? serverChoices : [{ value: "", label: "\u0623\u0636\u0641 \u0633\u064A\u0631\u0641\u0631\u064B\u0627 \u0623\u0648\u0644\u064B\u0627" }], current?.serverId || serverChoices[0]?.value || "", { required: true, disabled: !serverChoices.length })}
      ${selectField("Minecraft Version", "version", ["1.21.8", "1.21.6", "1.21.4", "1.21.1", "1.20.6", "1.20.4", "1.20.1", "1.19.4", "1.18.2"].map((value) => ({ value, label: value })), current?.version || state2.settings.defaultVersion || "1.20.4")}
      ${selectField("\u0646\u0648\u0639 \u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629", "authMode", [{ value: "offline", label: "Offline \u2014 \u062E\u0627\u062F\u0645 \u062E\u0627\u0635 \u0641\u0642\u0637" }, { value: "microsoft", label: "Microsoft \u2014 \u064A\u062A\u0637\u0644\u0628 \u062A\u0633\u062C\u064A\u0644\u064B\u0627 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D" }], current?.authMode || "offline")}
      <div class="form-row"><label class="form-label" for="skinId">\u0627\u0644\u0633\u0643\u0646</label><div class="field-inline"><select class="field field-select" id="skinId" name="skinId"><option value="">\u0628\u062F\u0648\u0646 \u0633\u0643\u0646 \u0645\u062D\u062F\u062F</option>${savedSkins.map((skin) => `<option value="${escapeHtml(skin.value)}" ${current?.skinId === skin.value ? "selected" : ""}>${escapeHtml(skin.label)}</option>`).join("")}</select><button class="btn btn-secondary btn-small" type="button" data-action="open-skins">\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0633\u0643\u0646</button></div></div>
      ${notice("\u062D\u0641\u0638 \u0627\u0644\u0645\u0644\u0641 \u0644\u0627 \u064A\u0646\u0634\u0626 \u0627\u062A\u0635\u0627\u0644\u064B\u0627. \u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629 \u0639\u0628\u0631 Microsoft \u0648\u0645\u062D\u0631\u0643 Minecraft \u0644\u0644\u062D\u0631\u0643\u0629 \u0648\u0627\u0644\u062A\u0646\u0641\u064A\u0630 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u064A\u0646 \u0641\u064A \u0647\u0630\u0627 \u0627\u0644\u0625\u0635\u062F\u0627\u0631\u061B \u0644\u0627 \u062A\u062F\u062E\u0644 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u062D\u0633\u0627\u0628\u0643 \u0647\u0646\u0627.", "warning")}
      <div class="form-actions"><button class="btn btn-primary" type="submit" ${!state2.servers.length ? "disabled" : ""}>${icon(editing ? "check" : "plus")}<span>${editing ? "\u062D\u0641\u0638 \u0627\u0644\u062A\u063A\u064A\u064A\u0631\u0627\u062A" : "\u062D\u0641\u0638 \u0645\u0644\u0641 \u0627\u0644\u0628\u0648\u062A"}</span></button><button class="btn btn-secondary" type="button" data-action="back">\u0625\u0644\u063A\u0627\u0621</button></div>
    </form>`;
  }
  function renderBotDetails(state2) {
    const bot = state2.bots.find((item) => item.id === state2.params.id);
    if (!bot) return `${pageHeading("\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0628\u0648\u062A", "", backButton())}${emptyState({ icon: "bot", title: "\u0627\u0644\u0628\u0648\u062A \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F", description: "\u0642\u062F \u064A\u0643\u0648\u0646 \u062D\u064F\u0630\u0641 \u0645\u0646 \u0627\u0644\u062A\u062E\u0632\u064A\u0646 \u0627\u0644\u0645\u062D\u0644\u064A." })}`;
    const server = state2.servers.find((item) => item.id === bot.serverId);
    const task = state2.tasks.find((item) => item.id === bot.currentTaskId && !["completed", "cancelled", "failed"].includes(item.status));
    const skin = state2.skins.find((item) => item.id === bot.skinId);
    const avatar = `<span class="avatar-pixel" style="--avatar-hair:${escapeHtml(bot.color || "#293454")}"></span>`;
    return `${pageHeading("\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0628\u0648\u062A", "", backButton())}
    <section class="detail-hero"><div class="detail-head"><div class="tile-art bot-art">${avatar}</div><div style="min-width:0;flex:1"><div class="list-topline"><h2>${escapeHtml(bot.name)}</h2>${statusPill("ready", "\u0645\u064F\u0639\u062F\u0651 \u0645\u062D\u0644\u064A\u064B\u0627")}</div><p>${escapeHtml(bot.username || "\u0627\u0633\u0645 \u0645\u0633\u062A\u062E\u062F\u0645 \u063A\u064A\u0631 \u0645\u062D\u062F\u062F")}</p></div><button class="more-button" data-action="bot-menu" data-id="${escapeHtml(bot.id)}" aria-label="\u062E\u064A\u0627\u0631\u0627\u062A">\u22EE</button></div>
      <div class="detail-stat-grid"><div class="detail-stat"><span>\u062D\u0627\u0644\u0629 \u0627\u0644\u0627\u062A\u0635\u0627\u0644</span><strong>\u063A\u064A\u0631 \u0645\u062A\u0635\u0644 \u2014 \u0644\u0645 \u064A\u0628\u062F\u0623 \u0623\u064A \u0627\u062A\u0635\u0627\u0644</strong></div><div class="detail-stat"><span>\u0627\u0644\u0633\u064A\u0631\u0641\u0631</span><strong>${escapeHtml(server?.name || "\u063A\u064A\u0631 \u0645\u0631\u062A\u0628\u0637")}</strong></div><div class="detail-stat"><span>Health / Food</span><strong>\u063A\u064A\u0631 \u0645\u062A\u0627\u062D \u0642\u0628\u0644 \u0627\u062A\u0635\u0627\u0644 \u0627\u0644\u0645\u062D\u0631\u0643</strong></div><div class="detail-stat"><span>Position / Uptime</span><strong>\u063A\u064A\u0631 \u0645\u062A\u0627\u062D \u0642\u0628\u0644 \u0627\u062A\u0635\u0627\u0644 \u0627\u0644\u0645\u062D\u0631\u0643</strong></div><div class="detail-stat"><span>\u0627\u0644\u0645\u0647\u0645\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629</span><strong>${escapeHtml(task?.name || "\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0647\u0645\u0629 \u0642\u064A\u062F \u0627\u0644\u062A\u0646\u0641\u064A\u0630")}</strong></div><div class="detail-stat"><span>\u0627\u0644\u0633\u0643\u0646</span><strong>${escapeHtml(skin?.name || "\u0628\u062F\u0648\u0646 \u0633\u0643\u0646")}</strong></div></div>
    </section>
    <div class="detail-actions">
      <button class="detail-action primary" data-action="engine-info" data-id="${escapeHtml(bot.id)}">${icon("play")}<span>\u062A\u0634\u063A\u064A\u0644</span></button>
      <button class="detail-action" data-action="engine-info" data-id="${escapeHtml(bot.id)}">${icon("stop")}<span>\u0625\u064A\u0642\u0627\u0641</span></button>
      <button class="detail-action" data-action="engine-info" data-id="${escapeHtml(bot.id)}">${icon("refresh")}<span>\u0625\u0639\u0627\u062F\u0629 \u0627\u062A\u0635\u0627\u0644</span></button>
      <button class="detail-action" data-action="bot-tasks" data-id="${escapeHtml(bot.id)}">${icon("tasks")}<span>\u0627\u0644\u0645\u0647\u0627\u0645</span></button>
      <button class="detail-action" data-action="open-inventory" data-id="${escapeHtml(bot.id)}">${icon("inventory")}<span>\u0627\u0644\u0645\u062E\u0632\u0648\u0646</span></button>
      <button class="detail-action" data-action="change-skin" data-id="${escapeHtml(bot.id)}">${icon("skin")}<span>\u0627\u0644\u0633\u0643\u0646</span></button>
      <button class="detail-action" data-action="bot-logs" data-id="${escapeHtml(bot.id)}">${icon("logs")}<span>\u0627\u0644\u0633\u062C\u0644\u0627\u062A</span></button>
      <button class="detail-action" data-action="edit-bot" data-id="${escapeHtml(bot.id)}">${icon("settings")}<span>\u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A</span></button>
    </div>
    ${notice(`\u0625\u0639\u062F\u0627\u062F \u0627\u0644\u0627\u062A\u0635\u0627\u0644: ${bot.authMode === "microsoft" ? "Microsoft \u2014 \u0644\u0645 \u064A\u062A\u0645 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644" : "Offline mode \u2014 \u0644\u0627 \u064A\u0639\u0645\u0644 \u0625\u0644\u0627 \u0639\u0644\u0649 \u062E\u0648\u0627\u062F\u0645 \u062A\u0633\u0645\u062D \u0628\u0630\u0644\u0643"}. \u0645\u0644\u0641 \u0627\u0644\u0628\u0648\u062A \u0645\u062D\u0641\u0648\u0638\u060C \u0644\u0643\u0646 \u0644\u0627 \u062A\u0648\u062C\u062F \u062C\u0644\u0633\u0629 \u0623\u0648 \u0625\u062D\u0635\u0627\u0621\u0627\u062A \u062D\u064A\u0651\u0629.`, "warning", "\u0645\u062D\u0631\u0643 \u0627\u0644\u0628\u0648\u062A")}
    <div class="section-title"><h2>\u0627\u0644\u0645\u0647\u0627\u0645 \u0627\u0644\u0645\u0633\u0646\u062F\u0629</h2><button class="text-action" data-action="add-task-for-bot" data-id="${escapeHtml(bot.id)}">\u0625\u0636\u0627\u0641\u0629 \u0645\u0647\u0645\u0629</button></div>
    ${state2.tasks.filter((item) => item.botId === bot.id).length ? `<div class="list-stack">${state2.tasks.filter((item) => item.botId === bot.id).slice(0, 4).map((item) => taskCard(item, state2.bots)).join("")}</div>` : emptyState({ icon: "tasks", title: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0647\u0627\u0645 \u0644\u0647\u0630\u0627 \u0627\u0644\u0628\u0648\u062A", description: "\u0623\u0646\u0634\u0626 \u062E\u0637\u0629 \u0645\u062D\u0644\u064A\u0629 \u0648\u0627\u0631\u0628\u0637\u0647\u0627 \u0628\u0627\u0644\u0628\u0648\u062A. \u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u062E\u0637\u0629 \u064A\u062D\u062A\u0627\u062C \u0645\u062D\u0631\u0643\u064B\u0627 \u0641\u0639\u0644\u064A\u064B\u0627." })}`;
  }
  function renderTasks(state2) {
    const query = state2.search.trim().toLocaleLowerCase();
    let tasks = [...state2.tasks];
    if (state2.params.botId) tasks = tasks.filter((task) => task.botId === state2.params.botId);
    tasks = tasks.filter((task) => !query || `${task.name} ${task.description}`.toLocaleLowerCase().includes(query));
    const isHistory = state2.taskTab === "history";
    tasks = tasks.filter((task) => isHistory ? ["completed", "failed", "cancelled"].includes(task.status) : !["completed", "failed", "cancelled"].includes(task.status));
    tasks.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    const rows = tasks.length ? `<div class="list-stack">${tasks.map((task) => taskCard(task, state2.bots)).join("")}</div>` : emptyState({ icon: "tasks", title: isHistory ? "\u0644\u0627 \u064A\u0648\u062C\u062F \u0633\u062C\u0644 \u0645\u0647\u0627\u0645 \u0628\u0639\u062F" : query ? "\u0644\u0627 \u062A\u0648\u062C\u062F \u0646\u062A\u0627\u0626\u062C" : "\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0647\u0627\u0645 \u0646\u0634\u0637\u0629", description: isHistory ? "\u0633\u062A\u0638\u0647\u0631 \u0647\u0646\u0627 \u0627\u0644\u0645\u0647\u0627\u0645 \u0627\u0644\u062A\u064A \u062A\u0646\u062A\u0647\u064A \u0623\u0648 \u062A\u064F\u0644\u063A\u0649." : "\u0623\u0636\u0641 \u0648\u0635\u0641\u064B\u0627\u060C \u0648\u0627\u062D\u0641\u0638\u0647 \u0643\u0637\u0644\u0628 \u0645\u0639\u0644\u0651\u0642\u060C \u062B\u0645 \u0623\u0631\u0633\u0644 \u0627\u0644\u0637\u0644\u0628 \u0625\u0644\u0649 OpenRouter \u0644\u0625\u0646\u0634\u0627\u0621 \u062E\u0637\u0629. \u0644\u0627 \u064A\u062A\u0645 \u0627\u0644\u0627\u062F\u0639\u0627\u0621 \u0628\u062A\u0646\u0641\u064A\u0630\u0647\u0627 \u062A\u0644\u0642\u0627\u0626\u064A\u064B\u0627.", actionLabel: isHistory || query ? "" : "\u0625\u0636\u0627\u0641\u0629 \u0645\u0647\u0645\u0629", action: "add-task" });
    const activeCount = state2.tasks.filter((task) => !["completed", "failed", "cancelled"].includes(task.status)).length;
    return `${pageHeading(state2.params.botId ? "\u0645\u0647\u0627\u0645 \u0627\u0644\u0628\u0648\u062A" : "\u0627\u0644\u0645\u0647\u0627\u0645", `${fmtNumber(activeCount)} \u0645\u0647\u0645\u0629 \u0645\u0639\u0644\u0651\u0642\u0629 \u0623\u0648 \u0642\u064A\u062F \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629`, plusButton("add-task", "\u0625\u0636\u0627\u0641\u0629 \u0645\u0647\u0645\u0629"))}
    <div class="segmented"><button data-action="task-tab" data-value="active" class="${isHistory ? "" : "is-active"}">\u0627\u0644\u0645\u0647\u0627\u0645 \u0627\u0644\u062D\u0627\u0644\u064A\u0629</button><button data-action="task-tab" data-value="history" class="${isHistory ? "is-active" : ""}">\u0627\u0644\u0633\u062C\u0644</button></div>
    ${searchBox("\u0627\u0628\u062D\u062B \u0641\u064A \u0627\u0644\u0645\u0647\u0627\u0645...")}${notice("\u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u062E\u0637\u0629 \u0648\u0625\u062F\u0627\u0631\u0629 \u062D\u0627\u0644\u062A\u0647\u0627 \u0645\u062D\u0644\u064A\u0627\u0646. \u0644\u0627 \u064A\u0628\u062F\u0623 \u0627\u0644\u062A\u0646\u0641\u064A\u0630 \u0648\u0644\u0627 \u062A\u062A\u063A\u064A\u0631 \u0627\u0644\u0645\u0647\u0645\u0629 \u0625\u0644\u0649 \xAB\u0642\u064A\u062F \u0627\u0644\u062A\u0646\u0641\u064A\u0630\xBB \u062F\u0648\u0646 \u0645\u062D\u0631\u0643 Minecraft \u0641\u0639\u0644\u064A.", "info")}
    <div class="mt-12">${rows}</div>`;
  }
  function renderTaskForm(state2) {
    const bots = state2.bots.map((bot) => ({ value: bot.id, label: `${bot.name} \xB7 ${bot.username || "\u0628\u062F\u0648\u0646 \u0627\u0633\u0645 \u0644\u0627\u0639\u0628"}` }));
    const selectedBot = state2.params.botId || "";
    const planChecked = state2.aiConfigured ? "checked" : "";
    return `${pageHeading("\u0625\u0636\u0627\u0641\u0629 \u0645\u0647\u0645\u0629 \u062C\u062F\u064A\u062F\u0629", "\u0627\u0643\u062A\u0628 \u0645\u0627 \u062A\u0631\u064A\u062F \u0645\u0646 \u0627\u0644\u0628\u0648\u062A \u0641\u0639\u0644\u0647", backButton())}
    <div class="form-card"><form data-form="task">
      <div class="form-row"><label class="form-label" for="description">\u0648\u0635\u0641 \u0627\u0644\u0645\u0647\u0645\u0629<small>\u062D\u062A\u0649 2000 \u062D\u0631\u0641</small></label><textarea class="field field-textarea" id="description" name="description" maxlength="2000" required placeholder="\u0645\u062B\u0627\u0644: \u0627\u062C\u0645\u0639 5 stacks \u0645\u0646 \u0627\u0644\u062E\u0634\u0628 \u0648\u062E\u0632\u0646\u0647\u0645 \u0641\u064A \u0627\u0644\u0635\u0646\u062F\u0648\u0642."></textarea><div class="field-help">\u0648\u0635\u0641 \u0648\u0627\u0636\u062D \u064A\u0633\u0627\u0639\u062F \u0627\u0644\u0646\u0645\u0648\u0630\u062C \u0639\u0644\u0649 \u0625\u0639\u062F\u0627\u062F \u062E\u0637\u0629 \u0645\u0642\u062A\u0631\u062D\u0629. \u0644\u0627 \u062A\u064F\u0631\u0633\u0644 \u0645\u0641\u0627\u062A\u064A\u062D \u0623\u0648 \u0628\u064A\u0627\u0646\u0627\u062A \u062F\u062E\u0648\u0644 \u0636\u0645\u0646 \u0648\u0635\u0641 \u0627\u0644\u0645\u0647\u0645\u0629.</div></div>
      ${selectField("\u0627\u0644\u0628\u0648\u062A", "botId", [{ value: "", label: "\u063A\u064A\u0631 \u0645\u0639\u064A\u0651\u0646\u0629 \u2014 \u0627\u062E\u062A\u0631 \u0644\u0627\u062D\u0642\u064B\u0627" }, ...bots], selectedBot)}
      ${selectField("\u0627\u0644\u0623\u0648\u0644\u0648\u064A\u0629", "priority", [{ value: "high", label: "\u0639\u0627\u0644\u064A\u0629" }, { value: "normal", label: "\u0639\u0627\u062F\u064A\u0629" }, { value: "low", label: "\u0645\u0646\u062E\u0641\u0636\u0629" }], "normal")}
      <div class="form-row"><label class="checkbox-row"><input type="checkbox" name="generatePlan" ${planChecked}><span>\u0623\u0646\u0634\u0626 \u062E\u0637\u0629 \u0628\u0627\u0633\u062A\u062E\u062F\u0627\u0645 OpenRouter \u0628\u0639\u062F \u0627\u0644\u062D\u0641\u0638</span></label><div class="field-help">${state2.aiConfigured ? "\u0633\u062A\u064F\u062C\u0631\u0651\u0628 \u0627\u0644\u0646\u0645\u0627\u0630\u062C \u0627\u0644\u0645\u062C\u0627\u0646\u064A\u0629 \u0627\u0644\u0645\u062A\u0627\u062D\u0629 \u0628\u0627\u0644\u062A\u062A\u0627\u0628\u0639 \u0625\u0630\u0627 \u0641\u0634\u0644 \u0623\u062D\u062F\u0647\u0627." : "\u0644\u0627 \u064A\u0648\u062C\u062F \u0645\u0641\u062A\u0627\u062D AI \u0645\u062D\u0641\u0648\u0638\u061B \u0633\u064A\u064F\u062D\u0641\u0638 \u0627\u0644\u0637\u0644\u0628 \u062F\u0648\u0646 \u0627\u062F\u0639\u0627\u0621 \u0648\u062C\u0648\u062F \u062E\u0637\u0629."}</div></div>
      ${notice("\u0639\u0646\u062F \u062A\u0641\u0639\u064A\u0644 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u062E\u0637\u0629\u060C \u064A\u064F\u0631\u0633\u0644 \u0648\u0635\u0641 \u0627\u0644\u0645\u0647\u0645\u0629 \u0648\u0627\u0633\u0645 \u0627\u0644\u0628\u0648\u062A/\u0627\u0644\u0633\u064A\u0631\u0641\u0631 \u0625\u0644\u0649 OpenRouter \u0639\u0628\u0631 HTTPS. \u0644\u0627 \u062A\u064F\u0636\u0645\u0651\u0646 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u0623\u0648 \u0645\u0641\u062A\u0627\u062D\u064B\u0627 \u0641\u064A \u0627\u0644\u0648\u0635\u0641.", "info")}
      <div class="mt-8">${notice("\u0627\u0644\u062E\u0637\u0629 \u0627\u0644\u0646\u0627\u062A\u062C\u0629 \u0627\u0642\u062A\u0631\u0627\u062D \u0645\u0646 AI \u0645\u062D\u0641\u0648\u0638 \u0645\u062D\u0644\u064A\u064B\u0627. \u0643\u0644 \u062E\u0637\u0648\u0629 \u062A\u0628\u0642\u0649 \u063A\u064A\u0631 \u0645\u0646\u0641\u0630\u0629 \u062D\u062A\u0649 \u064A\u062A\u0648\u0641\u0631 \u0645\u062D\u0631\u0643 Minecraft.", "warning")}</div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">${icon("plus")}<span>\u062D\u0641\u0638 \u0627\u0644\u0645\u0647\u0645\u0629</span></button><button class="btn btn-secondary" type="button" data-action="back">\u0625\u0644\u063A\u0627\u0621</button></div>
    </form></div>`;
  }
  function renderTaskDetails(state2) {
    const task = state2.tasks.find((item) => item.id === state2.params.id);
    if (!task) return `${pageHeading("\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0645\u0647\u0645\u0629", "", backButton())}${emptyState({ icon: "tasks", title: "\u0627\u0644\u0645\u0647\u0645\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629", description: "\u0642\u062F \u062A\u0643\u0648\u0646 \u062D\u064F\u0630\u0641\u062A \u0645\u0646 \u0627\u0644\u062A\u062E\u0632\u064A\u0646 \u0627\u0644\u0645\u062D\u0644\u064A." })}`;
    const bot = state2.bots.find((item) => item.id === task.botId);
    const plan = task.plan;
    const history = state2.taskHistory.filter((entry) => entry.taskId === task.id).sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
    const planMarkup = plan?.steps?.length ? `<div class="section-title"><h2>\u062E\u0637\u0629 \u0645\u0642\u062A\u0631\u062D\u0629 \xB7 ${escapeHtml(task.modelUsed || "OpenRouter")}</h2></div><div class="list-stack">${plan.steps.map((step, index) => `<div class="glass-card" style="display:flex;gap:11px;padding:12px"><div class="stat-icon purple" style="width:29px;height:29px;min-width:29px;border-radius:10px;font-size:10px">${fmtNumber(index + 1)}</div><div style="min-width:0"><strong style="font-size:10px">${escapeHtml(step.title)}</strong><p class="muted" style="margin:5px 0 0;font-size:9px;line-height:1.65">${escapeHtml(step.details)}</p>${step.doneWhen ? `<p style="margin:5px 0 0;color:#79bfff;font-size:8px">\u0634\u0631\u0637 \u0627\u0644\u0627\u0643\u062A\u0645\u0627\u0644: ${escapeHtml(step.doneWhen)}</p>` : ""}</div></div>`).join("")}</div>${plan.summary ? `<div class="mt-12">${notice(plan.summary, "info", "\u0645\u0644\u062E\u0635 AI")}</div>` : ""}${plan.risks?.length ? `<div class="mt-8">${notice(plan.risks.join(" \xB7 "), "warning", "\u062A\u0646\u0628\u064A\u0647\u0627\u062A")}</div>` : ""}` : `<div class="section-title"><h2>\u062E\u0637\u0629 \u0627\u0644\u0645\u0647\u0645\u0629</h2></div>${emptyState({ icon: "spark", title: "\u0644\u0645 \u062A\u064F\u0646\u0634\u0623 \u062E\u0637\u0629 \u0628\u0639\u062F", description: "\u064A\u0645\u0643\u0646 \u0625\u0646\u0634\u0627\u0621 \u062E\u0637\u0629 \u0645\u0646 \u0648\u0635\u0641\u0643 \u0639\u0628\u0631 \u0646\u0645\u0648\u0630\u062C \u0645\u062C\u0627\u0646\u064A \u0645\u062A\u0627\u062D \u0641\u064A OpenRouter.", actionLabel: "\u0625\u0646\u0634\u0627\u0621 \u062E\u0637\u0629 AI", action: "generate-task-plan" })}`;
    const canCancel = !["completed", "failed", "cancelled"].includes(task.status);
    const planning = state2.busy === "planning";
    const planningNotice = planning ? `<div class="status-strip mb-12"><div><div class="strip-title">\u062C\u0627\u0631 \u0625\u0639\u062F\u0627\u062F \u0627\u0644\u062E\u0637\u0629</div><div class="strip-subtitle ltr">${escapeHtml(state2.aiAttempt?.model || "\u062C\u0627\u0631\u064A \u0627\u062E\u062A\u064A\u0627\u0631 \u0646\u0645\u0648\u0630\u062C \u0645\u062C\u0627\u0646\u064A")}</div></div><span class="spinner"></span></div>` : "";
    return `${pageHeading("\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0645\u0647\u0645\u0629", "", backButton())}
    ${planningNotice}
    <section class="detail-hero"><div class="task-head"><div class="task-main"><div class="eyebrow">${{ high: "\u0623\u0648\u0644\u0648\u064A\u0629 \u0639\u0627\u0644\u064A\u0629", normal: "\u0623\u0648\u0644\u0648\u064A\u0629 \u0639\u0627\u062F\u064A\u0629", low: "\u0623\u0648\u0644\u0648\u064A\u0629 \u0645\u0646\u062E\u0641\u0636\u0629" }[task.priority] || "\u0623\u0648\u0644\u0648\u064A\u0629 \u0639\u0627\u062F\u064A\u0629"}</div><h2 style="margin:5px 0 0;font-size:16px">${escapeHtml(task.name || "\u0645\u0647\u0645\u0629 \u062C\u062F\u064A\u062F\u0629")}</h2></div>${taskStatus(task)}</div><p style="font-size:10px;color:#a3b2ca;line-height:1.7;margin:11px 0 0">${escapeHtml(task.description || "")}</p><div class="detail-stat-grid"><div class="detail-stat"><span>\u0627\u0644\u0628\u0648\u062A</span><strong>${escapeHtml(bot?.name || "\u063A\u064A\u0631 \u0645\u0639\u064A\u0651\u0646\u0629")}</strong></div><div class="detail-stat"><span>\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0625\u0646\u0634\u0627\u0621</span><strong>${formatDate(task.createdAt, { time: true })}</strong></div><div class="detail-stat"><span>\u0627\u0644\u062A\u0642\u062F\u0645 \u0627\u0644\u0641\u0639\u0644\u064A</span><strong>${task.status === "completed" ? "100%" : "0% \u2014 \u0644\u0627 \u064A\u0648\u062C\u062F \u062A\u0646\u0641\u064A\u0630 \u062D\u064A\u0651"}</strong></div><div class="detail-stat"><span>\u062D\u0627\u0644\u0629 \u0627\u0644\u062E\u0637\u0629</span><strong>${plan?.steps?.length ? `${fmtNumber(plan.steps.length)} \u062E\u0637\u0648\u0627\u062A \u0645\u0642\u062A\u0631\u062D\u0629` : "\u0644\u0645 \u062A\u064F\u0646\u0634\u0623"}</strong></div></div></section>
    <div class="btn-row mt-12">${!plan?.steps?.length ? actionButton("generate-task-plan", planning ? "\u062C\u0627\u0631 \u0627\u0644\u062A\u062E\u0637\u064A\u0637\u2026" : "\u0625\u0646\u0634\u0627\u0621 \u062E\u0637\u0629 AI", "primary", "spark", planning ? "disabled" : "") : actionButton("generate-task-plan", planning ? "\u062C\u0627\u0631 \u0627\u0644\u062A\u062E\u0637\u064A\u0637\u2026" : "\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u062A\u062E\u0637\u064A\u0637", "secondary", "refresh", planning ? "disabled" : "")}${canCancel && !planning ? actionButton("cancel-task", "\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0645\u0647\u0645\u0629", "danger", "close", `data-id="${escapeHtml(task.id)}"`) : ""}</div>
    <div class="mt-12">${notice("\u0647\u0630\u0647 \u062D\u0627\u0644\u0629 \u0645\u062D\u0644\u064A\u0629 \u0644\u0644\u0637\u0644\u0628 \u0648\u0627\u0644\u062E\u0637\u0629. \u0644\u0627 \u062A\u0648\u062C\u062F \u062D\u0631\u0643\u0629 \u0623\u0648 \u062A\u0646\u0641\u064A\u0630 \u0641\u064A \u0627\u0644\u0639\u0627\u0644\u0645 \u062D\u062A\u0649 \u064A\u062A\u0648\u0641\u0631 \u0645\u062D\u0631\u0643 Minecraft\u061B \u0644\u0627 \u062A\u0633\u062A\u062E\u062F\u0645 \u0627\u0644\u062E\u0637\u0629 \u0643\u0625\u062B\u0628\u0627\u062A \u0639\u0644\u0649 \u0625\u0646\u062C\u0627\u0632 \u0627\u0644\u0645\u0647\u0645\u0629.", "warning", "\u063A\u064A\u0631 \u0645\u0646\u0641\u0630\u0629")}</div>
    ${planMarkup}
    <div class="section-title"><h2>\u0633\u062C\u0644 \u0627\u0644\u0645\u0647\u0645\u0629</h2></div>
    ${history.length ? `<div class="log-list">${history.map((entry) => `<div class="log-row"><div class="log-symbol task">${icon("tasks")}</div><div class="log-copy"><p>${escapeHtml(entry.message)}</p><div class="log-meta"><span>${formatDate(entry.createdAt, { time: true })}</span><span>${escapeHtml(entry.status || "")}</span></div></div></div>`).join("")}</div>` : emptyState({ icon: "logs", title: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u062D\u062F\u0627\u062B \u0628\u0639\u062F", description: "\u0633\u062A\u0638\u0647\u0631 \u0647\u0646\u0627 \u0639\u0645\u0644\u064A\u0627\u062A \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u062E\u0637\u0629 \u0623\u0648 \u062A\u0639\u062F\u064A\u0644 \u062D\u0627\u0644\u0629 \u0627\u0644\u0645\u0647\u0645\u0629." })}`;
  }
  function renderAiSettings(state2) {
    const config = state2.aiConfig || {};
    const selected = config.model || "";
    const models = state2.aiModels || [];
    const options = models.map((model) => `<option value="${escapeHtml(model.id)}" ${selected === model.id ? "selected" : ""}>${escapeHtml(model.name || model.id)}${model.id.toLowerCase().endsWith(":free") ? " \xB7 \u0645\u062C\u0627\u0646\u064A" : ""}</option>`).join("");
    const modelDisplay = selected ? selected : "\u0644\u0645 \u064A\u062A\u0645 \u0627\u062E\u062A\u064A\u0627\u0631 \u0646\u0645\u0648\u0630\u062C \u0628\u0639\u062F";
    return `${pageHeading("\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A", "\u0645\u0641\u062A\u0627\u062D\u0643 \u0644\u0627 \u064A\u064F\u062D\u0641\u0638 \u0628\u0646\u0635 \u0648\u0627\u0636\u062D \u0639\u0644\u0649 Android", backButton())}
    <div class="center" style="padding:8px 0 13px"><div class="ai-orb" style="width:58px;height:58px;margin:auto;border-radius:20px">${icon("spark")}</div><div class="eyebrow mt-8">OpenRouter \xB7 AI Provider</div></div>
    <form class="form-card" data-form="ai-key">
      <div class="form-row"><label class="form-label" for="apiKey">\u0645\u0641\u062A\u0627\u062D API</label><div class="field-icon-wrap"><input class="field" id="apiKey" name="apiKey" type="password" autocomplete="new-password" dir="ltr" spellcheck="false" placeholder="sk-or-v1-\u2026 (\u0644\u0646 \u064A\u0638\u0647\u0631 \u0628\u0639\u062F \u0627\u0644\u062D\u0641\u0638)" maxlength="512"><button type="button" class="reveal" data-action="reveal-key" aria-label="\u0625\u0638\u0647\u0627\u0631 \u0627\u0644\u0645\u0641\u062A\u0627\u062D">${icon("eye")}</button></div><div class="field-help">\u064A\u064F\u0631\u0633\u0644 \u0641\u0642\u0637 \u0625\u0644\u0649 OpenRouter \u0639\u0628\u0631 TLS. \u0641\u064A APK \u064A\u064F\u0634\u0641\u0651\u0631 \u0628\u0627\u0633\u062A\u062E\u062F\u0627\u0645 Android Keystore\u061B \u0641\u064A \u0627\u0644\u0645\u0639\u0627\u064A\u0646\u0629 \u0627\u0644\u0645\u062D\u0644\u064A\u0629 \u064A\u0628\u0642\u0649 \u0641\u064A \u0630\u0627\u0643\u0631\u0629 \u0639\u0645\u0644\u064A\u0629 \u0627\u0644\u062E\u0627\u062F\u0645 \u0641\u0642\u0637 \u0648\u064A\u064F\u0645\u062D\u0649 \u0639\u0646\u062F \u0625\u063A\u0644\u0627\u0642\u0647\u0627.</div></div>
      <div class="status-strip"><div><div class="strip-title">\u062D\u0627\u0644\u0629 \u0627\u0644\u0645\u0641\u062A\u0627\u062D</div><div class="strip-subtitle">${state2.aiConfigured ? state2.aiStorage === "android-keystore" ? "\u0645\u062D\u0641\u0648\u0638 \u0628\u062A\u0634\u0641\u064A\u0631 \u0627\u0644\u062C\u0647\u0627\u0632" : "\u0645\u0636\u0628\u0648\u0637 \u0645\u0624\u0642\u062A\u064B\u0627 \u0644\u0644\u0645\u0639\u0627\u064A\u0646\u0629" : "\u0644\u0627 \u064A\u0648\u062C\u062F \u0645\u0641\u062A\u0627\u062D \u0645\u0636\u0628\u0648\u0637"}</div></div>${statusPill(state2.aiConfigured ? "ready" : "idle", state2.aiConfigured ? "\u0645\u064F\u0639\u062F\u0651" : "\u063A\u064A\u0631 \u0645\u064F\u0639\u062F\u0651")}</div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">${icon("lock")}<span>${state2.aiConfigured ? "\u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0645\u0641\u062A\u0627\u062D" : "\u062D\u0641\u0638 \u0627\u0644\u0645\u0641\u062A\u0627\u062D"}</span></button><button class="btn btn-secondary" type="button" data-action="test-ai">\u0627\u062E\u062A\u0628\u0627\u0631 \u0627\u0644\u0627\u062A\u0635\u0627\u0644</button></div>
      ${state2.aiConfigured ? `<div class="mt-8">${actionButton("clear-ai-key", "\u062D\u0630\u0641 \u0627\u0644\u0645\u0641\u062A\u0627\u062D \u0627\u0644\u0645\u062D\u0641\u0648\u0638", "danger", "trash")}</div>` : ""}
    </form>
    <div class="section-title"><h2>\u0627\u062E\u062A\u064A\u0627\u0631 \u0627\u0644\u0646\u0645\u0648\u0630\u062C</h2><button class="text-action" data-action="update-models">${state2.aiModelsLoading ? "\u062C\u0627\u0631 \u0627\u0644\u062A\u062D\u0645\u064A\u0644\u2026" : "\u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0642\u0627\u0626\u0645\u0629"}</button></div>
    <div class="ai-model-card"><div class="ai-orb">${icon("spark")}</div><div class="ai-model-copy"><strong>\u0627\u0644\u0646\u0645\u0648\u0630\u062C \u0627\u0644\u062D\u0627\u0644\u064A</strong><small class="ltr">${escapeHtml(modelDisplay)}</small></div>${config.automatic !== false ? statusPill("ready", "\u062A\u0644\u0642\u0627\u0626\u064A") : statusPill("purple", "\u064A\u062F\u0648\u064A")}</div>
    <div class="form-card mt-12">
      <label class="checkbox-row"><input type="checkbox" data-setting="aiAutomatic" ${config.automatic !== false ? "checked" : ""}><span>\u0627\u062E\u062A\u064A\u0627\u0631 \u0623\u0641\u0636\u0644 \u0646\u0645\u0648\u0630\u062C \u0645\u062C\u0627\u0646\u064A \u062A\u0644\u0642\u0627\u0626\u064A\u064B\u0627</span></label>
      <p class="help-copy">\u064A\u0641\u0644\u062A\u0631 \u0627\u0644\u0646\u0645\u0627\u0630\u062C \u0627\u0644\u0645\u062C\u0627\u0646\u064A\u0629 \u0627\u0644\u0645\u062A\u0627\u062D\u0629\u060C \u062B\u0645 \u064A\u0648\u0627\u0632\u0646 \u0633\u064A\u0627\u0642 \u0627\u0644\u0646\u0645\u0648\u0630\u062C \u0648\u062F\u0639\u0645 \u0627\u0644\u0623\u062F\u0648\u0627\u062A/\u0627\u0644\u0627\u0633\u062A\u062F\u0644\u0627\u0644 \u0648\u0645\u0624\u0634\u0631\u0627\u062A \u0627\u0644\u0633\u0631\u0639\u0629 \u0648\u0633\u062C\u0644 \u0646\u062C\u0627\u062D\u0647. \u0639\u0646\u062F \u0627\u0644\u0641\u0634\u0644 \u064A\u064F\u062C\u0631\u0651\u0628 \u0646\u0645\u0648\u0630\u062C\u064B\u0627 \u0645\u062C\u0627\u0646\u064A\u064B\u0627 \u0622\u062E\u0631.</p>
      ${models.length ? `<div class="form-row mt-12"><label class="form-label" for="ai-model-select">\u0627\u0644\u0646\u0645\u0648\u0630\u062C \u0627\u0644\u064A\u062F\u0648\u064A</label><select class="field field-select" id="ai-model-select" data-action="choose-ai-model"><option value="">\u0627\u062E\u062A\u0631 \u0646\u0645\u0648\u0630\u062C\u064B\u0627</option>${options}</select></div>` : `<div class="mt-12">${notice("\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0645\u0641\u062A\u0627\u062D \u0644\u062C\u0644\u0628 \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0646\u0645\u0627\u0630\u062C \u0627\u0644\u062D\u0642\u064A\u0642\u064A\u0629 \u0645\u0646 OpenRouter.", "info")}</div>`}
      <div class="mt-12">${actionButton("select-free-model", "\u0627\u0639\u062B\u0631 \u0639\u0644\u0649 \u0623\u0641\u0636\u0644 \u0646\u0645\u0648\u0630\u062C \u0645\u062C\u0627\u0646\u064A \u0627\u0644\u0622\u0646", "secondary", "spark", state2.aiModelsLoading ? "disabled" : "")}</div>
    </div>
    <div class="section-title"><h2>\u062D\u062F\u0648\u062F \u0627\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645</h2></div>
    <div class="form-card"><div class="form-grid-two">${field("\u0627\u0644\u062D\u062F \u0627\u0644\u064A\u0648\u0645\u064A \u0644\u0644\u0637\u0644\u0628\u0627\u062A", "aiDailyLimit", config.dailyLimit ?? 30, { type: "number", attrs: 'min="1" max="500" data-setting-input="dailyLimit"' })}${field("\u062D\u062F \u0627\u0644\u0631\u0645\u0648\u0632 \u0644\u0644\u0637\u0644\u0628", "aiMaxTokens", config.maxTokens ?? 900, { type: "number", attrs: 'min="128" max="8192" data-setting-input="maxTokens"' })}</div><div class="form-actions"><button class="btn btn-secondary btn-block" type="button" data-action="save-ai-limits">\u062D\u0641\u0638 \u0627\u0644\u062D\u062F\u0648\u062F</button></div></div>
    <div class="mt-12">${notice("\u064A\u062A\u0645 \u0637\u0644\u0628 \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0646\u0645\u0627\u0630\u062C \u0627\u0644\u0641\u0639\u0644\u064A\u0629 \u0645\u0646 OpenRouter. \u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0641\u0627\u062A\u064A\u062D \u0627\u0641\u062A\u0631\u0627\u0636\u064A\u0629 \u0623\u0648 \u0628\u064A\u0627\u0646\u0627\u062A \u0646\u0645\u0627\u0630\u062C \u062B\u0627\u0628\u062A\u0629 \u062F\u0627\u062E\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642.", "info")}</div>`;
  }
  function renderSettings(state2) {
    const localCount = state2.servers.length + state2.bots.length + state2.tasks.length;
    return `${pageHeading("\u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A", "\u062E\u0635\u0635 MineBot AI \u0648\u0628\u064A\u0627\u0646\u0627\u062A\u0643 \u0627\u0644\u0645\u062D\u0644\u064A\u0629")}
    ${group("\u0627\u0644\u062A\u0637\u0628\u064A\u0642", settingItem({ icon: "settings", title: "\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u062A\u0637\u0628\u064A\u0642", subtitle: "\u0627\u0644\u0644\u063A\u0629\u060C \u0627\u0644\u0645\u0638\u0647\u0631\u060C \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0648\u0627\u0644\u062D\u0631\u0643\u0629", route: "settings-app", color: "blue" }))}
    ${group("Minecraft", settingItem({ icon: "cube", title: "\u0625\u0639\u062F\u0627\u062F\u0627\u062A Minecraft", subtitle: "\u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A\u0629 \u0648\u0633\u0644\u0648\u0643 \u0627\u0644\u0628\u0648\u062A \u0648\u0627\u0644\u0627\u062A\u0635\u0627\u0644", route: "settings-minecraft", color: "green" }))}
    ${group("\u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A", settingItem({ icon: "spark", title: "\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A", subtitle: "OpenRouter \u0648\u0627\u0644\u0646\u0645\u0648\u0630\u062C \u0627\u0644\u0645\u062C\u0627\u0646\u064A \u0648\u0627\u0644\u062D\u062F\u0648\u062F", route: "settings-ai", color: "purple" }))}
    ${group("\u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0648\u0627\u0644\u0623\u0645\u0627\u0646", settingItem({ icon: "database", title: "\u0627\u0644\u062A\u062E\u0632\u064A\u0646 \u0648\u0627\u0644\u0646\u0633\u062E \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637\u064A", subtitle: `${fmtNumber(localCount)} \u0633\u062C\u0644 \u0645\u062D\u0641\u0648\u0638 \u0641\u064A SQLite \u0645\u062D\u0644\u064A\u064B\u0627`, route: "settings-storage", color: "cyan" }) + settingItem({ icon: "shield", title: "\u0627\u0644\u0623\u0645\u0627\u0646 \u0648\u0642\u0641\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642", subtitle: "\u0645\u0641\u062A\u0627\u062D API \u0645\u0634\u0641\u0631 \u0648\u0625\u0639\u062F\u0627\u062F \u0631\u0645\u0632 \u0642\u0641\u0644 \u0645\u062D\u0644\u064A", route: "settings-security", color: "amber" }))}
    ${group("\u0645\u0639\u0644\u0648\u0645\u0627\u062A", settingItem({ icon: "info", title: "\u062D\u0648\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642", subtitle: "\u0627\u0644\u0625\u0635\u062F\u0627\u0631\u060C \u0627\u0644\u0645\u0635\u062F\u0631 \u0648\u0627\u0644\u0642\u064A\u0648\u062F \u0627\u0644\u062A\u0642\u0646\u064A\u0629", route: "settings-about", color: "purple" }))}`;
  }
  function renderSettingsApp(state2) {
    return `${pageHeading("\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u062A\u0637\u0628\u064A\u0642", "\u0645\u0638\u0647\u0631 \u0647\u0627\u062F\u0626 \u0648\u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0645\u062D\u0644\u064A\u0629", backButton())}
    <div class="form-card">
      <div class="kv-row"><span>\u0627\u0644\u0644\u063A\u0629</span><strong class="rtl-value">\u0627\u0644\u0639\u0631\u0628\u064A\u0629</strong></div>
      <div class="kv-row"><span>\u0627\u0644\u0645\u0638\u0647\u0631</span><strong class="rtl-value">\u062F\u0627\u0643\u0646 \xB7 \u0623\u0633\u0627\u0633\u064A</strong></div>
      <div class="setting-item" style="margin:12px -1px 0;border:1px solid var(--line);border-radius:14px"><span class="setting-icon purple">${icon("spark")}</span><span class="setting-copy"><strong>\u062A\u0642\u0644\u064A\u0644 \u0627\u0644\u062D\u0631\u0643\u0629</strong><small>\u062E\u0641\u0636 \u0627\u0644\u0627\u0646\u062A\u0642\u0627\u0644\u0627\u062A \u0648\u0627\u0644\u062D\u0631\u0643\u0629 \u0627\u0644\u062F\u0642\u064A\u0642\u0629</small></span>${switchMarkup("reduceMotion", state2.settings.reduceMotion, "\u062A\u0642\u0644\u064A\u0644 \u0627\u0644\u062D\u0631\u0643\u0629")}</div>
      <div class="setting-item" style="margin:8px -1px 0;border:1px solid var(--line);border-radius:14px"><span class="setting-icon green">${icon("bell")}</span><span class="setting-copy"><strong>\u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0627\u0644\u0645\u062D\u0644\u064A\u0629</strong><small>\u062A\u0638\u0647\u0631 \u0644\u0644\u0623\u062D\u062F\u0627\u062B \u0627\u0644\u062A\u064A \u064A\u0646\u0634\u0626\u0647\u0627 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0641\u0642\u0637</small></span>${switchMarkup("notifications", state2.settings.notifications, "\u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A")}</div>
      <p class="help-copy">\u0644\u0627 \u062A\u0648\u062C\u062F \u062E\u062F\u0645\u0629 \u062E\u0644\u0641\u064A\u0629 \u0623\u0648 \u062C\u0644\u0633\u0627\u062A \u0628\u0648\u062A \u0644\u062A\u0648\u0644\u064A\u062F \u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0627\u062A\u0635\u0627\u0644/\u0645\u0647\u0627\u0645 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0646\u0633\u062E\u0629.</p>
    </div>
    <div class="mt-12">${notice("\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u063A\u064A\u064A\u0631 \u0627\u0644\u0644\u063A\u0629 \u0623\u0648 \u0627\u0644\u0645\u0638\u0647\u0631 \u0627\u0644\u0641\u0627\u062A\u062D \u0641\u064A \u0647\u0630\u0627 \u0627\u0644\u0625\u0635\u062F\u0627\u0631\u061B \u0627\u0644\u0648\u0627\u062C\u0647\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0627\u0644\u062F\u0627\u0643\u0646\u0629 \u0647\u064A \u0647\u0648\u064A\u0629 \u0627\u0644\u062A\u0635\u0645\u064A\u0645 \u0627\u0644\u0645\u0631\u062C\u0639\u064A.", "info")}</div>`;
  }
  function renderSettingsMinecraft(state2) {
    const behavior = state2.settings.defaultBehavior || "survival";
    return `${pageHeading("\u0625\u0639\u062F\u0627\u062F\u0627\u062A Minecraft", "\u0633\u064A\u0627\u0633\u0629 \u0645\u062D\u0644\u064A\u0629\u061B \u0627\u0644\u062A\u0646\u0641\u064A\u0630 \u064A\u062A\u0637\u0644\u0628 \u0645\u062D\u0631\u0643\u064B\u0627", backButton())}
    <form class="form-card" data-form="minecraft-settings">
      ${selectField("\u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A\u0629", "defaultVersion", ["1.21.8", "1.21.6", "1.21.4", "1.21.1", "1.20.6", "1.20.4", "1.20.1", "1.19.4", "1.18.2"].map((value) => ({ value, label: value })), state2.settings.defaultVersion || "1.20.4")}
      ${selectField("\u0633\u0644\u0648\u0643 \u0627\u0644\u0628\u0648\u062A \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A", "defaultBehavior", [{ value: "survival", label: "\u0628\u0642\u0627\u0621 \u2014 \u0623\u0648\u0644\u0648\u064A\u0629 \u0627\u0644\u0633\u0644\u0627\u0645\u0629" }, { value: "balanced", label: "\u0645\u062A\u0648\u0627\u0632\u0646" }, { value: "follow", label: "\u0627\u062A\u0628\u0627\u0639 \u0627\u0644\u0644\u0627\u0639\u0628" }], behavior)}
      ${field("\u0645\u062D\u0627\u0648\u0644\u0627\u062A \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0627\u062A\u0635\u0627\u0644", "reconnectAttempts", state2.settings.reconnectAttempts ?? 5, { type: "number", attrs: 'min="0" max="30"' })}
      ${field("\u0645\u0647\u0644\u0629 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 (\u062B\u0627\u0646\u064A\u0629)", "connectionTimeout", state2.settings.connectionTimeout ?? 8, { type: "number", attrs: 'min="2" max="60"' })}
      <div class="form-actions"><button class="btn btn-primary btn-block" type="submit">\u062D\u0641\u0638 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A</button></div>
    </form>
    <div class="section-title"><h2>\u062A\u0631\u062A\u064A\u0628 Behavior Engine</h2></div>
    <div class="form-card"><div class="kv-list" style="padding:0">${[["\u0637\u0648\u0627\u0631\u0626", "\u0627\u0633\u062A\u0639\u0627\u062F\u0629 \u0628\u0639\u062F \u0627\u0644\u0645\u0648\u062A \u0623\u0648 \u062E\u0637\u0631 \u062D\u0631\u062C"], ["\u0628\u0642\u0627\u0621", "\u0627\u0644\u0637\u0639\u0627\u0645 \u0648\u0627\u0644\u0635\u062D\u0629\u061B \u062A\u0639\u0644\u064A\u0642 \u0627\u0644\u0645\u0647\u0645\u0629 \u0645\u0624\u0642\u062A\u064B\u0627"], ["\u0623\u0645\u0631 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645", "\u0627\u0644\u0623\u0648\u0627\u0645\u0631 \u0627\u0644\u0635\u0631\u064A\u062D\u0629"], ["\u0627\u0644\u0645\u0647\u0645\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629", "\u0627\u0644\u062E\u0637\u0629 \u0627\u0644\u0645\u062D\u0641\u0648\u0638\u0629"], ["\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0648\u0627\u0631\u062F", "\u062A\u0646\u0638\u064A\u0645 \u0627\u0644\u0645\u0648\u0627\u0631\u062F"], ["\u0627\u0646\u062A\u0638\u0627\u0631", "\u0639\u0646\u062F \u0639\u062F\u0645 \u0648\u062C\u0648\u062F \u0639\u0645\u0644"]].map(([title, text], i) => `<div class="kv-row"><span>${fmtNumber(i + 1)} \xB7 ${escapeHtml(title)}</span><strong class="rtl-value">${escapeHtml(text)}</strong></div>`).join("")}</div><p class="help-copy">\u0647\u0630\u0647 \u0633\u064A\u0627\u0633\u0629 \u0623\u0648\u0644\u0648\u064A\u0629 \u0645\u0646\u0641\u0635\u0644\u0629 \u0648\u0645\u062E\u062A\u0628\u0631\u0629 \u0643\u0645\u0646\u0637\u0642 \u0646\u0637\u0627\u0642. \u0644\u0627 \u062A\u062A\u0644\u0642\u0649 \u062D\u0627\u0644\u0629 \u0635\u062D\u0629 \u0623\u0648 \u0637\u0639\u0627\u0645 \u0641\u0639\u0644\u064A\u0629 \u0644\u0623\u0646 \u0645\u062D\u0631\u0643 Minecraft \u063A\u064A\u0631 \u0645\u062F\u0645\u062C.</p></div>`;
  }
  function renderSettingsStorage(state2) {
    const count = state2.servers.length + state2.bots.length + state2.tasks.length + state2.logs.length + state2.skins.length;
    return `${pageHeading("\u0627\u0644\u062A\u062E\u0632\u064A\u0646 \u0648\u0627\u0644\u0646\u0633\u062E \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637\u064A", "\u0642\u0627\u0639\u062F\u0629 SQLite \u0645\u062D\u0644\u064A\u0629 \xB7 \u0644\u0627 \u062A\u0648\u062C\u062F Cloud", backButton())}
    <section class="detail-hero"><div class="detail-head"><div class="setting-icon" style="width:43px;height:43px">${icon("database")}</div><div><h2>\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A</h2><p>SQLite \u062F\u0627\u062E\u0644 \u0645\u0633\u0627\u062D\u0629 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u062E\u0627\u0635\u0629</p></div></div><div class="detail-stat-grid"><div class="detail-stat"><span>\u0627\u0644\u0633\u062C\u0644\u0627\u062A</span><strong>${fmtNumber(count)}</strong></div><div class="detail-stat"><span>\u0648\u0636\u0639 \u0627\u0644\u062A\u062E\u0632\u064A\u0646</span><strong>${state2.platformMode === "android" ? "SQLite \xB7 Android" : "SQLite \xB7 \u0645\u0639\u0627\u064A\u0646\u0629 \u0645\u062D\u0644\u064A\u0629"}</strong></div></div></section>
    <div class="section-title"><h2>\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062A\u0637\u0628\u064A\u0642</h2></div>
    <div class="form-card"><div class="kv-row"><span>\u0633\u064A\u0631\u0641\u0631\u0627\u062A</span><strong>${fmtNumber(state2.servers.length)}</strong></div><div class="kv-row"><span>\u0628\u0648\u062A\u0627\u062A</span><strong>${fmtNumber(state2.bots.length)}</strong></div><div class="kv-row"><span>\u0645\u0647\u0627\u0645</span><strong>${fmtNumber(state2.tasks.length)}</strong></div><div class="kv-row"><span>\u0633\u062C\u0644\u0627\u062A / \u0633\u062C\u0644\u0627\u062A \u0627\u0644\u0645\u0647\u0627\u0645</span><strong>${fmtNumber(state2.logs.length + state2.taskHistory.length)}</strong></div><div class="kv-row"><span>Skins</span><strong>${fmtNumber(state2.skins.length)}</strong></div><div class="kv-row"><span>Cache \u0627\u0644\u0646\u0645\u0627\u0630\u062C</span><strong class="rtl-value">${state2.aiModels.length ? `${fmtNumber(state2.aiModels.length)} \u0646\u0645\u0648\u0630\u062C \u0645\u0624\u0642\u062A` : "\u063A\u064A\u0631 \u0645\u062D\u0645\u0651\u0644"}</strong></div>
    <div class="form-actions"><button class="btn btn-secondary" type="button" data-action="export-backup">${icon("download")}<span>\u062A\u0635\u062F\u064A\u0631 \u0646\u0633\u062E\u0629</span></button><button class="btn btn-outline" type="button" data-action="import-backup">${icon("upload")}<span>\u0627\u0633\u062A\u064A\u0631\u0627\u062F</span></button></div>
    <div class="btn-row mt-8">${actionButton("clear-cache", "\u0645\u0633\u062D Cache \u0627\u0644\u0646\u0645\u0627\u0630\u062C", "secondary", "refresh")}${actionButton("clear-logs", "\u0645\u0633\u062D \u0627\u0644\u0633\u062C\u0644\u0627\u062A", "danger", "trash")}</div></div>
    <input id="backup-file" class="hidden" type="file" accept="application/json,.json">
    <div class="mt-12">${notice("\u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637\u064A\u0629 \u062A\u0636\u0645 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0648\u0627\u0644\u0633\u062C\u0644\u0627\u062A \u0641\u0642\u0637\u061B \u0645\u0641\u0627\u062A\u064A\u062D API \u0648\u0627\u0644\u0623\u0633\u0631\u0627\u0631 \u0645\u0633\u062A\u062B\u0646\u0627\u0629. \u062E\u0632\u0651\u0646 \u0627\u0644\u0646\u0633\u062E\u0629 \u0641\u064A \u0645\u0643\u0627\u0646 \u0622\u0645\u0646.", "warning")}</div>`;
  }
  function renderSettingsSecurity(state2) {
    return `${pageHeading("\u0627\u0644\u0623\u0645\u0627\u0646", "\u062D\u0645\u0627\u064A\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062D\u0633\u0627\u0633\u0629 \u0639\u0644\u0649 \u0627\u0644\u062C\u0647\u0627\u0632", backButton())}
    <div class="form-card"><div class="kv-row"><span>OpenRouter API Key</span><strong class="rtl-value">${state2.aiConfigured ? state2.aiStorage === "android-keystore" ? "Android Keystore \xB7 \u0645\u0634\u0641\u0651\u0631" : "\u0630\u0627\u0643\u0631\u0629 \u0645\u0624\u0642\u062A\u0629 \u0644\u0644\u0645\u0639\u0627\u064A\u0646\u0629" : "\u063A\u064A\u0631 \u0645\u0636\u0628\u0648\u0637"}</strong></div><div class="kv-row"><span>\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0648\u0643\u0644\u0645\u0627\u062A \u0627\u0644\u0645\u0631\u0648\u0631</span><strong class="rtl-value">\u0644\u0627 \u0646\u062E\u0632\u0646\u0647\u0627</strong></div><div class="kv-row"><span>\u0642\u0641\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642</span><strong class="rtl-value">${state2.settings.lockEnabled ? "\u0645\u0641\u0639\u0651\u0644" : "\u063A\u064A\u0631 \u0645\u0641\u0639\u0651\u0644"}</strong></div><div class="form-actions"><button class="btn ${state2.settings.lockEnabled ? "btn-danger" : "btn-primary"} btn-block" data-action="configure-lock">${icon("lock")}<span>${state2.settings.lockEnabled ? "\u062A\u063A\u064A\u064A\u0631 \u0623\u0648 \u0625\u0632\u0627\u0644\u0629 \u0631\u0645\u0632 \u0627\u0644\u0642\u0641\u0644" : "\u0625\u0639\u062F\u0627\u062F \u0631\u0645\u0632 \u0642\u0641\u0644 \u0645\u0646 6 \u0623\u0631\u0642\u0627\u0645"}</span></button></div></div>
    <div class="mt-12">${notice("\u0639\u0644\u0649 Android\u060C \u0645\u0641\u062A\u0627\u062D AI \u064A\u064F\u0634\u0641\u0651\u0631 \u0628\u0645\u0641\u062A\u0627\u062D AES-GCM \u0645\u062D\u0641\u0648\u0638 \u0641\u064A Android Keystore. \u0627\u0644\u0645\u0639\u0627\u064A\u0646\u0629 \u0641\u064A \u0627\u0644\u0645\u062A\u0635\u0641\u062D \u0644\u064A\u0633\u062A \u0645\u062E\u0632\u0646\u064B\u0627 \u0622\u0645\u0646\u064B\u0627 \u0648\u0644\u0627 \u062A\u062D\u062A\u0641\u0638 \u0628\u0627\u0644\u0645\u0641\u062A\u0627\u062D \u0628\u0639\u062F \u0625\u064A\u0642\u0627\u0641 \u0627\u0644\u062E\u0627\u062F\u0645.", "info")}</div>`;
  }
  function renderSettingsAbout(state2) {
    return `${pageHeading("\u062D\u0648\u0644 MineBot AI", "\u0646\u0633\u062E\u0629 \u0645\u062D\u0644\u064A\u0629 \u0623\u0648\u0644\u064A\u0629 \u0645\u0646 \u062A\u0637\u0628\u064A\u0642 \u0625\u062F\u0627\u0631\u0629 Minecraft", backButton())}
    <section class="detail-hero"><div class="detail-head"><div class="brand-mark">${icon("cube")}</div><div><h2>MineBot AI</h2><p>\u0646\u0633\u062E\u0629 0.1.0 \xB7 Android source</p></div></div><div class="detail-stat-grid"><div class="detail-stat"><span>Build type</span><strong>Debug scaffold</strong></div><div class="detail-stat"><span>\u0627\u0644\u062A\u062E\u0632\u064A\u0646</span><strong>SQLite \u0645\u062D\u0644\u064A</strong></div><div class="detail-stat"><span>\u0627\u0644\u062A\u0631\u062E\u064A\u0635</span><strong>\u0627\u0644\u0645\u0635\u062F\u0631 \u0641\u064A \u0647\u0630\u0627 \u0627\u0644\u0645\u0633\u062A\u0648\u062F\u0639</strong></div><div class="detail-stat"><span>\u0627\u0644\u062E\u062F\u0645\u0629 \u0627\u0644\u0633\u062D\u0627\u0628\u064A\u0629</span><strong>OpenRouter \u0627\u062E\u062A\u064A\u0627\u0631\u064A \u0641\u0642\u0637</strong></div></div></section>
    <div class="section-title"><h2>\u0627\u0644\u0642\u064A\u0648\u062F \u0627\u0644\u062A\u0642\u0646\u064A\u0629 \u0627\u0644\u0645\u0639\u0631\u0648\u0641\u0629</h2></div>
    <div class="list-stack"><div class="log-row"><div class="log-symbol warning">${icon("alert")}</div><div class="log-copy"><p>\u0645\u062D\u0631\u0643 bots \u0644\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0648\u0627\u0644\u062D\u0631\u0643\u0629 \u0648Pathfinding \u0648\u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u0645\u0647\u0627\u0645 \u063A\u064A\u0631 \u0645\u062F\u0645\u062C. \u0644\u0627 \u062A\u0648\u062C\u062F \u062D\u0627\u0644\u0629 Bot \u0645\u0632\u064A\u0641\u0629.</p></div></div><div class="log-row"><div class="log-symbol warning">${icon("alert")}</div><div class="log-copy"><p>\u0627\u062E\u062A\u0628\u0627\u0631 Server Status Ping \u062D\u0642\u064A\u0642\u064A\u060C \u0644\u0643\u0646\u0647 \u0644\u0627 \u064A\u062B\u0628\u062A \u0646\u062C\u0627\u062D \u062A\u0633\u062C\u064A\u0644 \u062F\u062E\u0648\u0644 \u0644\u0627\u0639\u0628.</p></div></div><div class="log-row"><div class="log-symbol warning">${icon("alert")}</div><div class="log-copy"><p>\u062E\u0637\u0629 AI \u0627\u0642\u062A\u0631\u0627\u062D \u0645\u062D\u0641\u0648\u0638\u060C \u0648\u0644\u064A\u0633\u062A \u0623\u0648\u0627\u0645\u0631 \u0642\u0627\u0628\u0644\u0629 \u0644\u0644\u062A\u0646\u0641\u064A\u0630 \u062F\u0627\u062E\u0644 \u0627\u0644\u0644\u0639\u0628\u0629.</p></div></div></div>
    <div class="section-title"><h2>\u0627\u0644\u0645\u0635\u062F\u0631 \u0648\u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F\u0627\u062A</h2></div>${notice("\u0648\u0627\u062C\u0647\u0629 Android \u0645\u0628\u0646\u064A\u0629 \u0639\u0644\u0649 WebView \u0645\u062D\u0644\u064A\u060C \u0648\u0642\u0627\u0639\u062F\u0629 SQLite \u0648Android Keystore \u062A\u0633\u062A\u062E\u062F\u0645\u0627\u0646 \u0648\u0627\u062C\u0647\u0627\u062A Android \u0627\u0644\u0623\u0635\u0644\u064A\u0629 \u062F\u0648\u0646 Cloud \u0625\u0644\u0632\u0627\u0645\u064A. \u0644\u0627 \u062A\u0648\u062C\u062F \u062E\u0637\u0648\u0637 \u0623\u0648 \u0635\u0648\u0631 \u062E\u0627\u0631\u062C\u064A\u0629 \u0645\u062D\u0645\u0651\u0644\u0629 \u0645\u0646 \u0627\u0644\u0625\u0646\u062A\u0631\u0646\u062A.", "info")}<div class="mt-12">${button("\u062A\u0631\u0627\u062E\u064A\u0635 Open Source", "open-licenses", "secondary", { icon: "info", block: true })}</div>${state2.platformMode === "local-preview" ? `<div class="mt-8"><a class="btn btn-outline btn-block" href="/download/source.zip">${icon("download")}<span>\u062A\u062D\u0645\u064A\u0644 \u062D\u0632\u0645\u0629 \u0627\u0644\u0645\u0635\u062F\u0631 \u0645\u0628\u0627\u0634\u0631\u0629</span></a></div>` : ""}`;
  }
  function renderLogs(state2) {
    const filters = [["all", "\u0627\u0644\u0643\u0644"], ["info", "Info"], ["warning", "Warning"], ["error", "Error"], ["ai", "AI"], ["task", "Task"], ["connection", "Connection"]];
    let rows = [...state2.logs].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    if (state2.params.botId) rows = rows.filter((item) => item.botId === state2.params.botId);
    if (state2.logFilter !== "all") rows = rows.filter((item) => item.level === state2.logFilter || item.category === state2.logFilter);
    const logCards = rows.length ? `<div class="log-list">${rows.map((entry) => {
      const kind = entry.level === "error" ? "error" : entry.level === "warning" ? "warning" : entry.category === "ai" ? "ai" : entry.category === "task" ? "task" : "";
      const iconName = entry.level === "error" || entry.level === "warning" ? "alert" : entry.category === "ai" ? "spark" : entry.category === "task" ? "tasks" : entry.category === "connection" ? "plug" : "info";
      return `<div class="log-row"><div class="log-symbol ${kind}">${icon(iconName)}</div><div class="log-copy"><p>${escapeHtml(entry.message)}</p><div class="log-meta"><span>${formatDate(entry.createdAt, { time: true })}</span><span class="log-category">${escapeHtml(entry.category || "info")}</span><span>${escapeHtml(entry.level || "info")}</span></div></div></div>`;
    }).join("")}</div>` : emptyState({ icon: "logs", title: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0633\u062C\u0644\u0627\u062A \u0647\u0646\u0627", description: state2.logs.length ? "\u063A\u064A\u0651\u0631 \u0639\u0627\u0645\u0644 \u0627\u0644\u062A\u0635\u0641\u064A\u0629 \u0644\u0631\u0624\u064A\u0629 \u0627\u0644\u0633\u062C\u0644\u0627\u062A." : "\u062A\u0638\u0647\u0631 \u0647\u0646\u0627 \u0623\u062D\u062F\u0627\u062B \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u062D\u0642\u064A\u0642\u064A\u0629 \u0645\u062B\u0644 \u0627\u0644\u062D\u0641\u0638 \u0648\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0648\u0623\u062E\u0637\u0627\u0621 AI." });
    return `${pageHeading("\u0627\u0644\u0633\u062C\u0644\u0627\u062A", `${fmtNumber(state2.logs.length)} \u0633\u062C\u0644 \u0645\u062D\u0644\u064A`, backButton())}<div class="segmented log-filters">${filters.map(([value, label]) => `<button class="${state2.logFilter === value ? "is-active" : ""}" data-action="log-filter" data-value="${escapeHtml(value)}">${escapeHtml(label)}</button>`).join("")}</div>${logCards}`;
  }
  function renderSkins(state2) {
    const selected = state2.params.skinId || state2.selectedSkinId || "";
    const bot = state2.params.botId ? state2.bots.find((item) => item.id === state2.params.botId) : null;
    const skins = state2.skins;
    const card = (skin) => `<button class="skin-card ${selected === skin.id ? "selected" : ""}" data-action="select-skin" data-id="${escapeHtml(skin.id)}"><span class="skin-check">${selected === skin.id ? icon("check") : ""}</span><span class="skin-preview">${skin.filePath ? `<img src="${escapeHtml(skin.filePath)}" alt="\u0645\u0639\u0627\u064A\u0646\u0629 ${escapeHtml(skin.name)}" loading="lazy">` : `<span class="avatar-pixel"></span>`}</span><span class="skin-card-name">${escapeHtml(skin.name)}</span></button>`;
    return `${pageHeading("\u062A\u063A\u064A\u064A\u0631 \u0627\u0644\u0633\u0643\u0646", bot ? `\u062A\u0639\u064A\u064A\u0646 \u0633\u0643\u0646 \u0644\u0645\u0644\u0641 ${bot.name}` : "Skins \u062A\u062D\u0641\u0638 \u0641\u064A \u0645\u0633\u0627\u062D\u0629 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u0645\u062D\u0644\u064A\u0629", backButton())}
    <div class="form-card"><input id="skin-file" class="hidden" type="file" accept="image/png"><div class="btn-row"><button class="btn btn-primary" data-action="upload-skin" ${state2.busy === "skin" ? "disabled" : ""}>${state2.busy === "skin" ? '<span class="spinner"></span>' : icon("upload")}<span>${state2.busy === "skin" ? "\u062C\u0627\u0631 \u062D\u0641\u0638 \u0627\u0644\u0645\u0644\u0641\u2026" : "\u0631\u0641\u0639 \u0633\u0643\u0646 \u0645\u0646 \u0627\u0644\u0647\u0627\u062A\u0641"}</span></button></div><p class="help-copy">PNG \u0628\u064F\u0639\u062F\u0647 64\xD764 \u0623\u0648 64\xD732\u060C \u0628\u062D\u062F \u0623\u0642\u0635\u0649 2 MB. \u064A\u064F\u062D\u0641\u0638 \u0645\u062D\u0644\u064A\u064B\u0627\u061B \u0644\u0627 \u064A\u062A\u0645 \u0631\u0641\u0639\u0647 \u0625\u0644\u0649 Cloud.</p></div>
    <div class="section-title"><h2>Skins \u0627\u0644\u0645\u062D\u0641\u0648\u0638\u0629</h2><span class="section-hint">${fmtNumber(skins.length)} \u0645\u0644\u0641</span></div>
    ${skins.length ? `<div class="skin-grid">${skins.map(card).join("")}</div>` : emptyState({ icon: "skin", title: "\u0644\u0627 \u062A\u0648\u062C\u062F Skins \u0628\u0639\u062F", description: "\u0627\u0631\u0641\u0639 \u0645\u0644\u0641 \u0635\u0648\u0631\u0629 \u0645\u0646 \u062C\u0647\u0627\u0632\u0643 \u0644\u062A\u062E\u0632\u064A\u0646\u0647 \u0645\u062D\u0644\u064A\u064B\u0627. \u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0639\u0627\u064A\u0646\u0627\u062A \u062A\u062C\u0631\u064A\u0628\u064A\u0629." })}
    ${bot ? `<div class="form-actions"><button class="btn btn-primary btn-block" data-action="apply-skin" data-id="${escapeHtml(bot.id)}" ${selected ? "" : "disabled"}>${icon("check")}<span>\u062A\u0639\u064A\u064A\u0646 \u0627\u0644\u0633\u0643\u0646 \u0639\u0644\u0649 \u0645\u0644\u0641 \u0627\u0644\u0628\u0648\u062A</span></button></div><div class="mt-12">${notice("\u064A\u064F\u062D\u0641\u0638 \u0627\u062E\u062A\u064A\u0627\u0631 \u0627\u0644\u0633\u0643\u0646 \u0641\u064A \u0645\u0644\u0641 \u0627\u0644\u0628\u0648\u062A \u0627\u0644\u0645\u062D\u0644\u064A. \u0644\u0646 \u064A\u062A\u063A\u064A\u0631 \u0645\u0638\u0647\u0631 \u0644\u0627\u0639\u0628 \u062F\u0627\u062E\u0644 \u0627\u0644\u0633\u064A\u0631\u0641\u0631 \u062D\u062A\u0649 \u064A\u062A\u0648\u0641\u0631 \u062A\u0633\u062C\u064A\u0644 \u062F\u062E\u0648\u0644 \u0648\u0645\u062D\u0631\u0643 Minecraft.", "warning")}</div>` : ""}
    ${skins.length ? `<div class="section-title"><h2>\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0644\u0641</h2></div><button class="setting-item" data-action="delete-selected-skin" data-id="${escapeHtml(selected)}"><span class="setting-icon amber">${icon("trash")}</span><span class="setting-copy"><strong>\u062D\u0630\u0641 \u0627\u0644\u0633\u0643\u0646 \u0627\u0644\u0645\u062D\u062F\u062F</strong><small>\u064A\u062D\u0630\u0641 \u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0645\u062D\u0644\u064A \u0648\u0627\u0644\u0645\u0639\u0627\u064A\u0646\u0629</small></span><span class="setting-chevron">${icon("chevron")}</span></button>` : ""}`;
  }
  function renderInventory(state2) {
    const bot = state2.bots.find((item) => item.id === state2.params.id);
    return `${pageHeading("\u0627\u0644\u0645\u062E\u0632\u0648\u0646", bot ? bot.name : "", backButton())}${notice("\u0644\u0627 \u064A\u0648\u062C\u062F \u0627\u062A\u0635\u0627\u0644 Minecraft \u062D\u064A\u0651 \u0644\u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u0645\u062E\u0632\u0648\u0646. \u0644\u0627 \u0646\u0639\u0631\u0636 \u0639\u0646\u0627\u0635\u0631 \u0623\u0648 \u0643\u0645\u064A\u0627\u062A \u0627\u0641\u062A\u0631\u0627\u0636\u064A\u0629.", "warning", "\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629")}${emptyState({ icon: "inventory", title: "\u0627\u0644\u0645\u062E\u0632\u0648\u0646 \u063A\u064A\u0631 \u0645\u062A\u0635\u0644", description: "\u062A\u0638\u0647\u0631 \u0627\u0644\u0639\u0646\u0627\u0635\u0631 \u0627\u0644\u062D\u0642\u064A\u0642\u064A\u0629 \u0641\u0642\u0637 \u0628\u0639\u062F \u062A\u0633\u062C\u064A\u0644 \u062F\u062E\u0648\u0644 \u0627\u0644\u0628\u0648\u062A \u0648\u0627\u0633\u062A\u0642\u0628\u0627\u0644 \u0628\u064A\u0627\u0646\u0627\u062A Minecraft \u0645\u0646 \u0627\u0644\u0645\u062D\u0631\u0643." })}`;
  }
  function renderNotifications(state2) {
    const entries = state2.logs.filter((entry) => Number(entry.createdAt) > Date.now() - 7 * 864e5).slice(0, 8);
    return `${pageHeading("\u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A", "\u0623\u062D\u062F\u0627\u062B \u0645\u0646 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632", backButton())}${entries.length ? `<div class="log-list">${entries.map((entry) => `<div class="log-row"><div class="log-symbol ${entry.level === "warning" ? "warning" : ""}">${icon(entry.category === "task" ? "tasks" : entry.category === "ai" ? "spark" : "info")}</div><div class="log-copy"><p>${escapeHtml(entry.message)}</p><div class="log-meta"><span>${formatDate(entry.createdAt, { time: true })}</span></div></div></div>`).join("")}</div>` : emptyState({ icon: "bell", title: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0628\u0639\u062F", description: "\u062A\u0638\u0647\u0631 \u0647\u0646\u0627 \u0646\u062A\u0627\u0626\u062C \u0648\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0646\u0641\u0651\u0630\u062A\u0647\u0627 \u0628\u0646\u0641\u0633\u0643. \u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u064A\u0627\u0646\u0627\u062A \u0646\u0634\u0627\u0637 \u0645\u0648\u0644\u062F\u0629." })}`;
  }
  function renderPin(state2) {
    return `${pageHeading("\u0642\u0641\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642", "", backButton())}<div class="form-card"><p class="modal-message">\u0623\u062F\u062E\u0644 \u0631\u0645\u0632\u0643 \u0627\u0644\u0645\u062D\u0644\u064A \u0627\u0644\u0645\u0643\u0648\u0651\u0646 \u0645\u0646 6 \u0623\u0631\u0642\u0627\u0645.</p><form data-form="unlock"><div class="form-row"><label class="form-label" for="pin">\u0631\u0645\u0632 \u0627\u0644\u0642\u0641\u0644</label><input class="field" id="pin" name="pin" type="password" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" autocomplete="current-password" required></div><button class="btn btn-primary btn-block" type="submit">\u0641\u062A\u062D \u0627\u0644\u062A\u0637\u0628\u064A\u0642</button></form></div>`;
  }
  function renderRoute(state2) {
    switch (state2.route) {
      case "home":
        return renderHome(state2);
      case "servers":
        return renderServers(state2);
      case "server-form":
        return renderServerForm(state2);
      case "server-details":
        return renderServerDetails(state2);
      case "bots":
        return renderBots(state2);
      case "bot-form":
        return renderBotForm(state2);
      case "bot-details":
        return renderBotDetails(state2);
      case "tasks":
        return renderTasks(state2);
      case "task-form":
        return renderTaskForm(state2);
      case "task-details":
        return renderTaskDetails(state2);
      case "settings":
        return renderSettings(state2);
      case "settings-app":
        return renderSettingsApp(state2);
      case "settings-minecraft":
        return renderSettingsMinecraft(state2);
      case "settings-ai":
        return renderAiSettings(state2);
      case "settings-storage":
        return renderSettingsStorage(state2);
      case "settings-security":
        return renderSettingsSecurity(state2);
      case "settings-about":
        return renderSettingsAbout(state2);
      case "logs":
        return renderLogs(state2);
      case "skins":
        return renderSkins(state2);
      case "inventory":
        return renderInventory(state2);
      case "notifications":
        return renderNotifications(state2);
      case "unlock":
        return renderPin(state2);
      default:
        return renderHome(state2);
    }
  }

  // www/js/app.js
  var DEFAULT_SETTINGS = Object.freeze({
    id: "preferences",
    reduceMotion: false,
    notifications: false,
    defaultVersion: "1.20.4",
    defaultBehavior: "survival",
    reconnectAttempts: 5,
    connectionTimeout: 8,
    lockEnabled: false
  });
  var DEFAULT_AI = Object.freeze({ id: "main", automatic: true, model: "", dailyLimit: 30, maxTokens: 900, modelReliability: {} });
  var state = {
    route: "home",
    params: {},
    stack: [],
    search: "",
    taskTab: "active",
    logFilter: "all",
    servers: [],
    bots: [],
    tasks: [],
    taskHistory: [],
    logs: [],
    skins: [],
    locations: [],
    botStates: [],
    settings: { ...DEFAULT_SETTINGS },
    aiConfig: { ...DEFAULT_AI },
    aiConfigured: false,
    aiStorage: "",
    aiModels: [],
    platformMode: Platform.mode,
    pinging: /* @__PURE__ */ new Set(),
    busy: "",
    aiAttempt: null,
    selectedSkinId: "",
    modalConfirm: null,
    locked: false,
    loading: true,
    bootError: ""
  };
  var ai = new AIEngine({
    getConfig: async () => state.aiConfig,
    saveConfig: async (config) => {
      state.aiConfig = { ...DEFAULT_AI, ...config, id: "main" };
      await Platform.save("ai_config", state.aiConfig);
    },
    log: addLog,
    onAttempt: ({ model, index, total }) => {
      state.aiAttempt = { model, index, total };
      if (state.route === "task-details" || state.route === "settings-ai") render();
    }
  });
  function setIcons(root = document) {
    root.querySelectorAll("[data-icon]").forEach((element) => {
      element.innerHTML = icon(element.dataset.icon);
    });
  }
  async function loadAll() {
    const tables = ["servers", "bots", "tasks", "task_history", "logs", "skins", "locations", "bot_states", "settings", "ai_config"];
    const data = await Promise.all(tables.map((table) => Platform.list(table)));
    const byTable = Object.fromEntries(tables.map((table, index) => [table, data[index]]));
    state.servers = byTable.servers;
    state.bots = byTable.bots;
    state.tasks = byTable.tasks;
    state.taskHistory = byTable.task_history;
    state.logs = byTable.logs;
    state.skins = byTable.skins;
    state.locations = byTable.locations;
    state.botStates = byTable.bot_states;
    state.settings = { ...DEFAULT_SETTINGS, ...byTable.settings.find((item) => item.id === "preferences") || {} };
    state.aiConfig = { ...DEFAULT_AI, ...byTable.ai_config.find((item) => item.id === "main") || {} };
    if (!byTable.settings.some((item) => item.id === "preferences")) await Platform.save("settings", state.settings);
    if (!byTable.ai_config.some((item) => item.id === "main")) await Platform.save("ai_config", state.aiConfig);
    const aiStatus = await Platform.aiStatus();
    state.aiConfigured = Boolean(aiStatus.configured);
    state.aiStorage = aiStatus.storage || "";
    state.platformMode = Platform.mode;
    const pinStatus = await Platform.lock("status");
    if (state.settings.lockEnabled !== Boolean(pinStatus.enabled)) {
      state.settings = { ...state.settings, lockEnabled: Boolean(pinStatus.enabled), id: "preferences" };
      await Platform.save("settings", state.settings);
    }
    document.body.classList.toggle("reduce-motion", Boolean(state.settings.reduceMotion));
  }
  async function addLog({ level = "info", category = "info", message, botId = "", serverId = "", taskId = "" }) {
    const entry = { id: uid(), level, category, message: String(message || "").slice(0, 500), botId, serverId, taskId, createdAt: Date.now() };
    try {
      await Platform.save("logs", entry);
      state.logs = [entry, ...state.logs.filter((item) => item.id !== entry.id)];
    } catch {
    }
    return entry;
  }
  async function addTaskHistory(task, status, message) {
    const entry = { id: uid(), taskId: task.id, status, message, createdAt: Date.now() };
    await Platform.save("task_history", entry);
    state.taskHistory.push(entry);
    await addLog({ category: "task", level: status === "failed" ? "error" : "info", taskId: task.id, botId: task.botId || "", message });
  }
  function routeTab(route) {
    if (["home"].includes(route)) return "home";
    if (["bots", "bot-details", "bot-form", "inventory", "skins"].includes(route)) return "bots";
    if (["tasks", "task-form", "task-details"].includes(route)) return "tasks";
    if (["servers", "server-form", "server-details"].includes(route)) return "servers";
    if (route.startsWith("settings") || route === "logs" || route === "notifications") return "settings";
    return "home";
  }
  function render() {
    const screen = document.getElementById("screen");
    screen.innerHTML = renderRoute(state);
    screen.setAttribute("aria-busy", "false");
    screen.classList.remove("screen-refresh");
    requestAnimationFrame(() => screen.classList.add("screen-refresh"));
    const activeTab = routeTab(state.route);
    document.querySelectorAll("#bottom-nav [data-route]").forEach((button2) => button2.classList.toggle("is-active", button2.dataset.route === activeTab));
    const context = document.getElementById("top-context");
    if (context) context.textContent = Platform.isNative ? "\u062A\u062E\u0632\u064A\u0646 \u0645\u062D\u0644\u064A \u0622\u0645\u0646" : "\u0645\u0639\u0627\u064A\u0646\u0629 \u0645\u062D\u0644\u064A\u0629 \xB7 SQLite";
    const nav = document.getElementById("bottom-nav");
    if (nav) nav.classList.toggle("hidden", state.route === "unlock");
    document.body.classList.toggle("reduce-motion", Boolean(state.settings.reduceMotion));
    setIcons(document);
  }
  function navigate(route, params = {}, { root = false, replace = false } = {}) {
    if (state.locked && route !== "unlock") return;
    closeModal();
    if (root) state.stack = [];
    else if (!replace && (state.route !== route || JSON.stringify(state.params) !== JSON.stringify(params))) state.stack.push({ route: state.route, params: state.params });
    state.route = route;
    state.params = { ...params };
    state.search = "";
    state.aiAttempt = null;
    render();
    document.getElementById("screen").scrollTo({ top: 0, behavior: state.settings.reduceMotion ? "auto" : "smooth" });
  }
  function goBack() {
    if (state.locked) return;
    closeModal();
    const previous = state.stack.pop();
    if (previous) {
      state.route = previous.route;
      state.params = previous.params;
    } else {
      state.route = "home";
      state.params = {};
    }
    state.search = "";
    render();
  }
  function toast(message, tone = "info", duration = 3300) {
    const region = document.getElementById("toast-region");
    const element = document.createElement("div");
    element.className = `toast ${tone}`;
    element.textContent = message;
    region.append(element);
    setTimeout(() => element.remove(), duration);
  }
  function showModal({ title, description = "", body = "", actions = "", centered = false, closeable = true }) {
    const root = document.getElementById("overlay-root");
    root.innerHTML = `<div class="modal-backdrop ${centered ? "centered" : ""}" data-action="backdrop-close"><section class="modal-sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><div class="modal-grabber"></div><div class="modal-heading"><div><h2>${escapeHtml(title)}</h2>${description ? `<p>${escapeHtml(description)}</p>` : ""}</div>${closeable ? `<button class="modal-close" data-action="close-modal" aria-label="\u0625\u063A\u0644\u0627\u0642">\xD7</button>` : ""}</div>${body}${actions ? `<div class="dialog-actions">${actions}</div>` : ""}</section></div>`;
    setIcons(root);
    const first = root.querySelector("input,button,select,textarea");
    setTimeout(() => first?.focus(), 40);
  }
  function closeModal() {
    state.modalConfirm = null;
    const root = document.getElementById("overlay-root");
    if (root) root.innerHTML = "";
  }
  function showConfirm(title, message, onConfirm, { danger = true, confirmLabel = "\u062A\u0623\u0643\u064A\u062F \u0627\u0644\u062D\u0630\u0641" } = {}) {
    state.modalConfirm = onConfirm;
    showModal({
      title,
      centered: true,
      body: `<div class="confirm-icon">${icon(danger ? "trash" : "alert")}</div><p class="modal-message center">${escapeHtml(message)}</p>`,
      actions: `<button class="btn btn-secondary" data-action="close-modal">\u0625\u0644\u063A\u0627\u0621</button><button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-action="confirm-modal">${escapeHtml(confirmLabel)}</button>`
    });
  }
  function serverAddressValid(host, port) {
    const address = String(host || "").trim();
    const normalized = address.startsWith("[") && address.endsWith("]") ? address.slice(1, -1) : address;
    const p = Number(port);
    const labels = normalized.split(".");
    const ipv6ish = normalized.includes(":") && /^[0-9a-f:.%]+$/i.test(normalized);
    const domain = labels.length >= 1 && labels.every((label) => label.length > 0 && label.length <= 63 && /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label));
    if (!address || address.length > 253 || /[\s\/\\?#@]/.test(address) || !ipv6ish && !domain) return "\u0623\u062F\u062E\u0644 IP \u0623\u0648 \u0627\u0633\u0645 \u0646\u0637\u0627\u0642 \u0635\u0627\u0644\u062D\u064B\u0627.";
    if (!Number.isInteger(p) || p < 1 || p > 65535) return "\u0627\u0644\u0645\u0646\u0641\u0630 \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0631\u0642\u0645\u064B\u0627 \u0628\u064A\u0646 1 \u064865535.";
    return "";
  }
  function titleFromDescription(description) {
    const text = String(description || "").trim().replace(/\s+/g, " ");
    return text.length > 56 ? `${text.slice(0, 55)}\u2026` : text || "\u0645\u0647\u0645\u0629 \u062C\u062F\u064A\u062F\u0629";
  }
  function notify(title, message) {
    if (!state.settings.notifications) return;
    const body = String(message || "").slice(0, 180);
    try {
      if (Platform.isNative && window.MineBotNative?.notify) window.MineBotNative.notify(title, body);
      else if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body, icon: "/assets/icon.svg", silent: true });
    } catch {
    }
  }
  async function refreshAll({ renderAfter = true } = {}) {
    await loadAll();
    if (renderAfter) render();
  }
  async function testServer(serverId) {
    const server = state.servers.find((entry) => entry.id === serverId);
    if (!server || state.pinging.has(serverId)) return;
    state.pinging.add(serverId);
    render();
    const started = performance.now();
    try {
      const result = await Platform.pingServer(server.host, server.port, Number(state.settings.connectionTimeout || 8) * 1e3);
      const updated = { ...server, status: "online", playersOnline: result.playersOnline, playersMax: result.playersMax, lastPingVersion: result.version, lastCheckedAt: Date.now(), lastPingError: "", pingProtocol: result.protocol, pingLatencyMs: Math.round(performance.now() - started) };
      await Platform.save("servers", updated);
      await addLog({ category: "connection", level: "info", serverId, message: `\u0646\u062C\u062D \u0627\u062E\u062A\u0628\u0627\u0631 Minecraft Status Ping: ${server.host}:${server.port} \xB7 ${result.playersOnline}/${result.playersMax} \u0644\u0627\u0639\u0628.` });
      toast(`\u0627\u0644\u0633\u064A\u0631\u0641\u0631 \u0645\u062A\u0635\u0644 \xB7 ${result.playersOnline}/${result.playersMax} \u0644\u0627\u0639\u0628 \xB7 ${result.version}`, "success", 4200);
    } catch (error) {
      const safeMessage = String(error?.message || "\u0641\u0634\u0644 \u0627\u062E\u062A\u0628\u0627\u0631 \u0627\u0644\u0627\u062A\u0635\u0627\u0644.").slice(0, 180);
      await Platform.save("servers", { ...server, status: "offline", lastCheckedAt: Date.now(), lastPingError: safeMessage });
      await addLog({ category: "connection", level: "warning", serverId, message: `\u0641\u0634\u0644 \u0627\u062E\u062A\u0628\u0627\u0631 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0625\u0644\u0649 ${server.host}:${server.port}: ${safeMessage}` });
      toast(safeMessage, "error", 4600);
    } finally {
      state.pinging.delete(serverId);
      await refreshAll();
      if (state.route === "server-details") state.params = { ...state.params, id: serverId };
    }
  }
  async function generateTaskPlan(taskId) {
    const task = state.tasks.find((entry) => entry.id === taskId);
    if (!task || state.busy) return;
    state.busy = "planning";
    state.aiAttempt = null;
    render();
    try {
      const bot = state.bots.find((item) => item.id === task.botId);
      const server = bot ? state.servers.find((item) => item.id === bot.serverId) : null;
      const result = await ai.planTask(task.description, { botName: bot?.name || "", serverName: server?.name || "" });
      const current = state.tasks.find((entry) => entry.id === taskId);
      const planned = { ...current, name: result.plan.name || current.name, plan: result.plan, modelUsed: result.model, plannedAt: Date.now(), status: current.status === "pending_plan" ? "pending" : current.status, updatedAt: Date.now() };
      await Platform.save("tasks", planned);
      await addTaskHistory(planned, planned.status, `\u0623\u064F\u0646\u0634\u0626\u062A \u062E\u0637\u0629 \u0645\u0642\u062A\u0631\u062D\u0629 \u0645\u0646 ${result.model} (${result.plan.steps.length} \u062E\u0637\u0648\u0627\u062A). \u0644\u0645 \u064A\u0628\u062F\u0623 \u0627\u0644\u062A\u0646\u0641\u064A\u0630.`);
      await refreshAll({ renderAfter: false });
      state.busy = "";
      state.aiAttempt = null;
      state.route = "task-details";
      state.params = { id: taskId };
      render();
      toast(result.fallbackIndex ? `\u0646\u062C\u062D\u062A \u0627\u0644\u062E\u0637\u0629 \u0639\u0628\u0631 \u0646\u0645\u0648\u0630\u062C \u0628\u062F\u064A\u0644: ${result.model}` : `\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u062E\u0637\u0629 \u0628\u0648\u0627\u0633\u0637\u0629 ${result.model}`, "success", 4200);
      notify("\u0627\u0643\u062A\u0645\u0644\u062A \u062E\u0637\u0629 \u0627\u0644\u0645\u0647\u0645\u0629", "\u0627\u0644\u062E\u0637\u0629 \u0645\u062D\u0641\u0648\u0638\u0629 \u0645\u062D\u0644\u064A\u064B\u0627 \u0648\u062A\u0646\u062A\u0638\u0631 \u0645\u062D\u0631\u0643 Minecraft.");
    } catch (error) {
      state.busy = "";
      state.aiAttempt = null;
      render();
      toast(String(error?.message || "\u062A\u0639\u0630\u0631 \u0625\u0646\u0634\u0627\u0621 \u062E\u0637\u0629 \u0627\u0644\u0645\u0647\u0645\u0629."), "error", 5e3);
    }
  }
  function showServerMenu(serverId) {
    const server = state.servers.find((entry) => entry.id === serverId);
    if (!server) return;
    showModal({ title: server.name, description: `${server.host}:${server.port}`, body: `<div class="btn-row" style="flex-direction:column">${actionBtnHtml("edit-server", "\u062A\u0639\u062F\u064A\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0633\u064A\u0631\u0641\u0631", "secondary", "edit", `data-id="${escapeHtml(server.id)}"`)}${actionBtnHtml("ping-server", "\u0627\u062E\u062A\u0628\u0627\u0631 \u0627\u062A\u0635\u0627\u0644 \u0641\u0639\u0644\u064A", "outline", "wifi", `data-id="${escapeHtml(server.id)}"`)}${actionBtnHtml("delete-server", "\u062D\u0630\u0641 \u0627\u0644\u0633\u064A\u0631\u0641\u0631", "danger", "trash", `data-id="${escapeHtml(server.id)}"`)}</div>` });
  }
  function showBotMenu(botId) {
    const bot = state.bots.find((entry) => entry.id === botId);
    if (!bot) return;
    showModal({ title: bot.name, description: "\u0625\u062F\u0627\u0631\u0629 \u0645\u0644\u0641 \u0627\u0644\u0628\u0648\u062A \u0627\u0644\u0645\u062D\u0644\u064A", body: `<div class="btn-row" style="flex-direction:column">${actionBtnHtml("edit-bot", "\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A", "secondary", "edit", `data-id="${escapeHtml(bot.id)}"`)}${actionBtnHtml("bot-logs", "\u0633\u062C\u0644\u0627\u062A \u0647\u0630\u0627 \u0627\u0644\u0628\u0648\u062A", "outline", "logs", `data-id="${escapeHtml(bot.id)}"`)}${actionBtnHtml("delete-bot", "\u062D\u0630\u0641 \u0645\u0644\u0641 \u0627\u0644\u0628\u0648\u062A", "danger", "trash", `data-id="${escapeHtml(bot.id)}"`)}</div>` });
  }
  function actionBtnHtml(action, label, tone, iconName, attrs = "") {
    return `<button class="btn btn-${tone} btn-block" data-action="${action}" ${attrs}>${icon(iconName)}<span>${escapeHtml(label)}</span></button>`;
  }
  function showEngineInfo(botId) {
    const bot = state.bots.find((entry) => entry.id === botId);
    showModal({
      title: "\u0645\u062D\u0631\u0643 Minecraft \u063A\u064A\u0631 \u0645\u062A\u0627\u062D",
      centered: true,
      body: `<div class="confirm-icon">${icon("plug")}</div><p class="modal-message center">\u0644\u0645 \u064A\u064F\u0646\u0634\u0623 \u0623\u064A \u0627\u062A\u0635\u0627\u0644. \u064A\u0645\u0643\u0646 \u062D\u0641\u0638 \u0648\u0625\u062F\u0627\u0631\u0629 \u0645\u0644\u0641 <strong>${escapeHtml(bot?.name || "\u0627\u0644\u0628\u0648\u062A")}</strong> \u0648\u0627\u062E\u062A\u0628\u0627\u0631 \u062D\u0627\u0644\u0629 \u0627\u0644\u0633\u064A\u0631\u0641\u0631\u060C \u0644\u0643\u0646 \u062A\u0633\u062C\u064A\u0644 \u062F\u062E\u0648\u0644 \u0627\u0644\u0628\u0648\u062A \u0648Minecraft protocol \u0648\u0627\u0644\u062D\u0631\u0643\u0629 \u0648Pathfinding \u063A\u064A\u0631 \u0645\u062F\u0645\u062C\u0629 \u0628\u0639\u062F. \u0644\u0646 \u0646\u0639\u0631\u0636 \u062D\u0627\u0644\u0629 Online \u0623\u0648 \u0646\u0628\u062F\u0623 \u0645\u0647\u0645\u0629 \u0639\u0644\u0649 \u0623\u0646\u0647\u0627 \u062A\u0639\u0645\u0644.</p>`,
      actions: `<button class="btn btn-secondary" data-action="close-modal">\u062D\u0633\u0646\u064B\u0627</button><button class="btn btn-outline" data-action="open-logs">\u0639\u0631\u0636 \u0627\u0644\u0633\u062C\u0644\u0627\u062A</button>`
    });
  }
  function setFormBusy(form, busy, label = "\u062C\u0627\u0631 \u0627\u0644\u062D\u0641\u0638\u2026") {
    const submit = form?.querySelector('[type="submit"]');
    if (!submit) return;
    if (busy) {
      submit.dataset.originalLabel = submit.innerHTML;
      submit.disabled = true;
      submit.innerHTML = `<span class="spinner"></span><span>${escapeHtml(label)}</span>`;
    } else {
      submit.disabled = false;
      if (submit.dataset.originalLabel) submit.innerHTML = submit.dataset.originalLabel;
    }
  }
  async function saveServerForm(form) {
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const host = String(data.get("host") || "").trim();
    const port = Number(data.get("port"));
    const version = String(data.get("version") || "").trim();
    const error = serverAddressValid(host, port);
    if (name.length < 2 || name.length > 48) return toast("\u0627\u0633\u0645 \u0627\u0644\u0633\u064A\u0631\u0641\u0631 \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0628\u064A\u0646 \u062D\u0631\u0641\u064A\u0646 \u064848 \u062D\u0631\u0641\u064B\u0627.", "error");
    if (error) return toast(error, "error");
    if (!version) return toast("\u0627\u062E\u062A\u0631 \u0625\u0635\u062F\u0627\u0631 Minecraft.", "error");
    const previous = form.dataset.id ? state.servers.find((entry) => entry.id === form.dataset.id) : null;
    const addressChanged = previous && (previous.host !== host || Number(previous.port) !== port);
    const record = {
      ...previous || {},
      id: previous?.id || uid(),
      name,
      host,
      port,
      version,
      status: addressChanged ? "untested" : previous?.status || "untested",
      lastCheckedAt: addressChanged ? 0 : previous?.lastCheckedAt || 0,
      playersOnline: addressChanged ? 0 : previous?.playersOnline || 0,
      playersMax: addressChanged ? 0 : previous?.playersMax || 0,
      lastPingVersion: addressChanged ? "" : previous?.lastPingVersion || "",
      lastPingError: addressChanged ? "" : previous?.lastPingError || "",
      createdAt: previous?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    setFormBusy(form, true);
    try {
      await Platform.save("servers", record);
      await addLog({ category: "connection", level: "info", serverId: record.id, message: previous ? "\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0633\u064A\u0631\u0641\u0631 \u0645\u062D\u0644\u064A." : "\u062A\u0645 \u062D\u0641\u0638 \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0633\u064A\u0631\u0641\u0631 \u0645\u062D\u0644\u064A." });
      await refreshAll({ renderAfter: false });
      toast(previous ? "\u062A\u0645 \u062D\u0641\u0638 \u062A\u0639\u062F\u064A\u0644\u0627\u062A \u0627\u0644\u0633\u064A\u0631\u0641\u0631." : "\u062A\u0645 \u062D\u0641\u0638 \u0627\u0644\u0633\u064A\u0631\u0641\u0631 \u0645\u062D\u0644\u064A\u064B\u0627.", "success");
      navigate("servers", {}, { root: true });
    } catch (error2) {
      setFormBusy(form, false);
      toast(error2.message, "error");
    }
  }
  async function saveBotForm(form) {
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const username = String(data.get("username") || "").trim();
    const serverId = String(data.get("serverId") || "");
    const server = state.servers.find((entry) => entry.id === serverId);
    if (name.length < 2 || name.length > 40) return toast("\u0627\u0633\u0645 \u0627\u0644\u0628\u0648\u062A \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0628\u064A\u0646 \u062D\u0631\u0641\u064A\u0646 \u064840 \u062D\u0631\u0641\u064B\u0627.", "error");
    if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) return toast("\u0627\u0633\u0645 \u0627\u0644\u0644\u0627\u0639\u0628 \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0645\u0646 3 \u0625\u0644\u0649 16 \u062D\u0631\u0641\u064B\u0627 \u0625\u0646\u062C\u0644\u064A\u0632\u064A\u064B\u0627 \u0623\u0648 \u0631\u0642\u0645\u064B\u0627 \u0623\u0648 _ .", "error");
    if (!server) return toast("\u0627\u062E\u062A\u0631 \u0633\u064A\u0631\u0641\u0631\u064B\u0627 \u0645\u062D\u0641\u0648\u0638\u064B\u0627 \u0623\u0648\u0644\u064B\u0627.", "error");
    const previous = form.dataset.id ? state.bots.find((entry) => entry.id === form.dataset.id) : null;
    const record = {
      ...previous || {},
      id: previous?.id || uid(),
      name,
      username,
      serverId,
      version: String(data.get("version") || server.version || "1.20.4"),
      authMode: String(data.get("authMode") || "offline"),
      skinId: String(data.get("skinId") || ""),
      status: "configured",
      currentTaskId: previous?.currentTaskId || "",
      color: previous?.color || ["#27385b", "#4e3767", "#285f69", "#5a4733"][Math.floor(Math.random() * 4)],
      createdAt: previous?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    setFormBusy(form, true);
    try {
      await Platform.save("bots", record);
      await addLog({ category: "info", level: "info", botId: record.id, serverId, message: previous ? "\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0645\u0644\u0641 \u0628\u0648\u062A \u0645\u062D\u0644\u064A." : "\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0645\u0644\u0641 \u0628\u0648\u062A \u0645\u062D\u0644\u064A \u0648\u062D\u0641\u0638\u0647." });
      await refreshAll({ renderAfter: false });
      toast(previous ? "\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0645\u0644\u0641 \u0627\u0644\u0628\u0648\u062A." : "\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0645\u0644\u0641 \u0627\u0644\u0628\u0648\u062A \u0645\u062D\u0644\u064A\u064B\u0627\u061B \u0644\u0627 \u064A\u0648\u062C\u062F \u0627\u062A\u0635\u0627\u0644 \u062D\u064A\u0651.", "success", 4300);
      navigate("bot-details", { id: record.id }, { root: true });
    } catch (error) {
      setFormBusy(form, false);
      toast(error.message, "error");
    }
  }
  async function createTaskForm(form) {
    const data = new FormData(form);
    const description = String(data.get("description") || "").trim();
    const botId = String(data.get("botId") || "");
    const priority = String(data.get("priority") || "normal");
    const generate = data.get("generatePlan") === "on";
    if (description.length < 3 || description.length > 2e3) return toast("\u0627\u0643\u062A\u0628 \u0648\u0635\u0641\u064B\u0627 \u0628\u064A\u0646 3 \u06482000 \u062D\u0631\u0641.", "error");
    if (botId && !state.bots.some((bot) => bot.id === botId)) return toast("\u0627\u0644\u0628\u0648\u062A \u0627\u0644\u0645\u062D\u062F\u062F \u0644\u0645 \u064A\u0639\u062F \u0645\u0648\u062C\u0648\u062F\u064B\u0627.", "error");
    if (!["low", "normal", "high"].includes(priority)) return toast("\u0627\u0644\u0623\u0648\u0644\u0648\u064A\u0629 \u0627\u0644\u0645\u062D\u062F\u062F\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629.", "error");
    const task = { id: uid(), name: titleFromDescription(description), description, botId, priority, status: "pending_plan", progress: 0, plan: null, modelUsed: "", createdAt: Date.now(), updatedAt: Date.now() };
    setFormBusy(form, true, "\u062C\u0627\u0631 \u0627\u0644\u062D\u0641\u0638\u2026");
    try {
      await Platform.save("tasks", task);
      await addTaskHistory(task, "pending_plan", "\u062A\u0645 \u062D\u0641\u0638 \u0637\u0644\u0628 \u0627\u0644\u0645\u0647\u0645\u0629 \u0645\u062D\u0644\u064A\u064B\u0627\u061B \u0644\u0645 \u064A\u0628\u062F\u0623 \u062A\u0646\u0641\u064A\u0630\u0647.");
      await refreshAll({ renderAfter: false });
      state.route = "task-details";
      state.params = { id: task.id };
      state.stack = [];
      render();
      toast("\u062A\u0645 \u062D\u0641\u0638 \u0627\u0644\u0645\u0647\u0645\u0629 \u0645\u062D\u0644\u064A\u064B\u0627.", "success");
      if (generate) {
        if (state.aiConfigured) await generateTaskPlan(task.id);
        else toast("\u0627\u0644\u0645\u0647\u0645\u0629 \u0645\u062D\u0641\u0648\u0638\u0629. \u0623\u0636\u0641 \u0645\u0641\u062A\u0627\u062D OpenRouter \u0644\u0625\u0646\u0634\u0627\u0621 \u062E\u0637\u0629 AI.", "warning", 4300);
      }
    } catch (error) {
      setFormBusy(form, false);
      toast(error.message, "error");
    }
  }
  async function saveAiKeyForm(form) {
    const data = new FormData(form);
    const key = String(data.get("apiKey") || "").trim();
    if (key.length < 20 || key.length > 512 || /\s/.test(key)) return toast("\u0623\u062F\u062E\u0644 \u0645\u0641\u062A\u0627\u062D OpenRouter \u0635\u0627\u0644\u062D\u064B\u0627\u061B \u0644\u0627 \u062A\u064F\u0636\u0645\u0651\u0646 \u0645\u0633\u0627\u0641\u0627\u062A.", "error");
    setFormBusy(form, true, "\u062C\u0627\u0631 \u0627\u0644\u062A\u0634\u0641\u064A\u0631\u2026");
    try {
      const result = await Platform.setApiKey(key);
      state.aiConfigured = Boolean(result.configured);
      state.aiStorage = result.storage || "";
      ai.modelsCache = null;
      await addLog({ category: "ai", level: "info", message: "\u062A\u0645 \u062D\u0641\u0638 \u0645\u0641\u062A\u0627\u062D OpenRouter \u062F\u0648\u0646 \u062A\u0633\u062C\u064A\u0644 \u0642\u064A\u0645\u062A\u0647." });
      form.reset();
      render();
      toast(Platform.isNative ? "\u062A\u0645 \u062D\u0641\u0638 \u0627\u0644\u0645\u0641\u062A\u0627\u062D \u0627\u0644\u0645\u0634\u0641\u0631 \u0641\u064A Android Keystore." : "\u062A\u0645 \u0636\u0628\u0637 \u0627\u0644\u0645\u0641\u062A\u0627\u062D \u0641\u064A \u0630\u0627\u0643\u0631\u0629 \u0627\u0644\u0645\u0639\u0627\u064A\u0646\u0629 \u062D\u062A\u0649 \u0625\u063A\u0644\u0627\u0642 \u0627\u0644\u062E\u0627\u062F\u0645.", "success", 4500);
    } catch (error) {
      setFormBusy(form, false);
      toast(error.message, "error");
    }
  }
  async function saveMinecraftSettings(form) {
    const data = new FormData(form);
    const reconnectAttempts = Number(data.get("reconnectAttempts"));
    const connectionTimeout = Number(data.get("connectionTimeout"));
    if (!Number.isInteger(reconnectAttempts) || reconnectAttempts < 0 || reconnectAttempts > 30) return toast("\u0645\u062D\u0627\u0648\u0644\u0627\u062A \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 \u0645\u0646 0 \u0625\u0644\u0649 30.", "error");
    if (!Number.isInteger(connectionTimeout) || connectionTimeout < 2 || connectionTimeout > 60) return toast("\u0645\u0647\u0644\u0629 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 \u0628\u064A\u0646 2 \u064860 \u062B\u0627\u0646\u064A\u0629.", "error");
    state.settings = { ...state.settings, defaultVersion: String(data.get("defaultVersion") || "1.20.4"), defaultBehavior: String(data.get("defaultBehavior") || "survival"), reconnectAttempts, connectionTimeout, id: "preferences" };
    try {
      await Platform.save("settings", state.settings);
      toast("\u062A\u0645 \u062D\u0641\u0638 \u0625\u0639\u062F\u0627\u062F\u0627\u062A Minecraft \u0645\u062D\u0644\u064A\u064B\u0627.", "success");
      render();
    } catch (error) {
      toast(error.message, "error");
    }
  }
  function pinSetupModal() {
    showModal({
      title: "\u0625\u0639\u062F\u0627\u062F \u0642\u0641\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642",
      description: "\u0627\u062E\u062A\u0631 \u0631\u0645\u0632\u064B\u0627 \u0645\u062D\u0644\u064A\u064B\u0627 \u0645\u0646 6 \u0623\u0631\u0642\u0627\u0645.",
      centered: true,
      body: `<form data-form="pin-setup"><div class="form-row"><label class="form-label" for="pin1">\u0631\u0645\u0632 \u062C\u062F\u064A\u062F</label><input class="field" id="pin1" name="pin1" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="new-password" required></div><div class="form-row"><label class="form-label" for="pin2">\u062A\u0623\u0643\u064A\u062F \u0627\u0644\u0631\u0645\u0632</label><input class="field" id="pin2" name="pin2" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="new-password" required></div><p class="help-copy">\u0639\u0644\u0649 Android \u064A\u064F\u062E\u0632\u0651\u0646 \u062A\u062D\u0642\u0642 \u0627\u0644\u0631\u0645\u0632 \u0645\u062D\u0644\u064A\u064B\u0627 \u0628\u0634\u0643\u0644 \u0645\u0634\u062A\u0642\u061B \u0641\u064A \u0627\u0644\u0645\u0639\u0627\u064A\u0646\u0629 \u064A\u0628\u0642\u0649 \u062F\u0627\u062E\u0644 \u0630\u0627\u0643\u0631\u0629 \u0627\u0644\u062E\u0627\u062F\u0645 \u0641\u0642\u0637.</p><button class="btn btn-primary btn-block" type="submit">\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0642\u0641\u0644</button></form>`
    });
  }
  function pinChangeModal() {
    showModal({
      title: "\u062A\u063A\u064A\u064A\u0631 \u0623\u0648 \u0625\u0632\u0627\u0644\u0629 \u0627\u0644\u0642\u0641\u0644",
      description: "\u0623\u0643\u0651\u062F \u0627\u0644\u0631\u0645\u0632 \u0627\u0644\u062D\u0627\u0644\u064A \u0623\u0648\u0644\u064B\u0627.",
      centered: true,
      body: `<form data-form="pin-change"><div class="form-row"><label class="form-label" for="currentPin">\u0627\u0644\u0631\u0645\u0632 \u0627\u0644\u062D\u0627\u0644\u064A</label><input class="field" id="currentPin" name="currentPin" type="password" inputmode="numeric" maxlength="6" required></div><div class="form-row"><label class="form-label" for="newPin">\u0631\u0645\u0632 \u062C\u062F\u064A\u062F (\u0627\u062A\u0631\u0643\u0647 \u0641\u0627\u0631\u063A\u064B\u0627 \u0644\u0644\u0625\u0632\u0627\u0644\u0629)</label><input class="field" id="newPin" name="newPin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6"></div><button class="btn btn-primary btn-block" type="submit">\u062D\u0641\u0638</button></form>`
    });
  }
  function showLockOverlay() {
    if (!state.settings.lockEnabled || state.locked) return;
    state.locked = true;
    showModal({
      title: "MineBot AI \u0645\u0642\u0641\u0644",
      description: "\u0623\u062F\u062E\u0644 \u0631\u0645\u0632\u0643 \u0627\u0644\u0645\u062D\u0644\u064A \u0644\u0644\u0645\u062A\u0627\u0628\u0639\u0629.",
      centered: true,
      closeable: false,
      body: `<form data-form="unlock"><div class="form-row"><label class="form-label" for="unlockPin">\u0631\u0645\u0632 \u0627\u0644\u0642\u0641\u0644</label><input class="field" id="unlockPin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="current-password" required></div><div id="unlock-error" class="field-help" role="alert"></div><button class="btn btn-primary btn-block" type="submit">\u0641\u062A\u062D \u0627\u0644\u062A\u0637\u0628\u064A\u0642</button></form>`
    });
  }
  async function removeServer(id) {
    const server = state.servers.find((entry) => entry.id === id);
    if (!server) return;
    const attached = state.bots.filter((bot) => bot.serverId === id);
    showConfirm("\u062D\u0630\u0641 \u0627\u0644\u0633\u064A\u0631\u0641\u0631\u061F", `\u0633\u064A\u064F\u062D\u0630\u0641 ${server.name} \u0645\u0646 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632. ${attached.length ? `\u0645\u0644\u0641\u0627\u062A ${attached.length} \u0628\u0648\u062A \u0645\u0631\u062A\u0628\u0637\u0629 \u0628\u0647 \u0633\u062A\u0628\u0642\u0649 \u0644\u0643\u0646 \u0633\u062A\u0635\u0628\u062D \u0628\u0644\u0627 \u0633\u064A\u0631\u0641\u0631.` : ""}`, async () => {
      for (const bot of attached) await Platform.save("bots", { ...bot, serverId: "", status: "configured", updatedAt: Date.now() });
      await Platform.remove("servers", id);
      await addLog({ category: "connection", level: "warning", serverId: id, message: "\u062A\u0645 \u062D\u0630\u0641 \u0625\u0639\u062F\u0627\u062F \u0633\u064A\u0631\u0641\u0631 \u0645\u062D\u0644\u064A." });
      await refreshAll({ renderAfter: false });
      state.route = "servers";
      state.params = {};
      state.stack = [];
      render();
      toast("\u062A\u0645 \u062D\u0630\u0641 \u0627\u0644\u0633\u064A\u0631\u0641\u0631.", "success");
    });
  }
  async function removeBot(id) {
    const bot = state.bots.find((entry) => entry.id === id);
    if (!bot) return;
    showConfirm("\u062D\u0630\u0641 \u0645\u0644\u0641 \u0627\u0644\u0628\u0648\u062A\u061F", `\u0633\u064A\u064F\u062D\u0630\u0641 \u0645\u0644\u0641 ${bot.name}. \u0633\u062A\u0628\u0642\u0649 \u0627\u0644\u0645\u0647\u0627\u0645 \u0627\u0644\u0633\u0627\u0628\u0642\u0629 \u063A\u064A\u0631 \u0645\u0639\u064A\u0651\u0646\u0629. \u0644\u0627 \u064A\u0648\u062C\u062F \u0627\u062A\u0635\u0627\u0644 \u062D\u064A\u0651 \u0644\u064A\u062A\u0645 \u0625\u064A\u0642\u0627\u0641\u0647.`, async () => {
      for (const task of state.tasks.filter((entry) => entry.botId === id && !["completed", "failed", "cancelled"].includes(entry.status))) await Platform.save("tasks", { ...task, botId: "", updatedAt: Date.now() });
      await Platform.remove("bots", id);
      await addLog({ level: "warning", category: "info", botId: id, message: "\u062A\u0645 \u062D\u0630\u0641 \u0645\u0644\u0641 \u0628\u0648\u062A \u0645\u062D\u0644\u064A." });
      await refreshAll({ renderAfter: false });
      state.route = "bots";
      state.params = {};
      state.stack = [];
      render();
      toast("\u062A\u0645 \u062D\u0630\u0641 \u0645\u0644\u0641 \u0627\u0644\u0628\u0648\u062A.", "success");
    });
  }
  async function cancelTask(id) {
    const task = state.tasks.find((entry) => entry.id === id);
    if (!task || ["completed", "failed", "cancelled"].includes(task.status)) return;
    showConfirm("\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0645\u0647\u0645\u0629\u061F", "\u0633\u064A\u062A\u0645 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u0625\u0644\u063A\u0627\u0621 \u0641\u064A \u0627\u0644\u0633\u062C\u0644 \u0627\u0644\u0645\u062D\u0644\u064A. \u0644\u0646 \u064A\u064F\u0631\u0633\u0644 \u0623\u064A \u0623\u0645\u0631 \u0625\u0644\u0649 Minecraft.", async () => {
      const updated = transitionTask(task, "cancelled", { engineAvailable: false });
      await Platform.save("tasks", updated);
      await addTaskHistory(updated, "cancelled", "\u0623\u064F\u0644\u063A\u064A\u062A \u0627\u0644\u0645\u0647\u0645\u0629 \u0645\u062D\u0644\u064A\u064B\u0627 \u0628\u0648\u0627\u0633\u0637\u0629 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645.");
      await refreshAll({ renderAfter: false });
      state.route = "task-details";
      state.params = { id };
      state.stack = [];
      render();
      toast("\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0645\u0647\u0645\u0629 \u0645\u062D\u0644\u064A\u064B\u0627.", "success");
    }, { confirmLabel: "\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0645\u0647\u0645\u0629" });
  }
  async function selectFreeModel() {
    if (state.busy) return;
    state.busy = "models";
    state.aiModelsLoading = true;
    render();
    try {
      const result = await ai.selectBestFree({ force: true });
      state.aiModels = result.rank.slice(0, 50);
      state.aiConfigured = true;
      state.aiStorage = (await Platform.aiStatus()).storage || "";
      await addLog({ category: "ai", level: "info", message: `\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0646\u0645\u0627\u0630\u062C \u0648\u0627\u062E\u062A\u064A\u0627\u0631 ${result.model.id} \u0645\u0646 ${result.count} \u0646\u0645\u0648\u0630\u062C \u0645\u062C\u0627\u0646\u064A.` });
      toast(`\u0627\u0644\u0646\u0645\u0648\u0630\u062C \u0627\u0644\u0645\u062C\u0627\u0646\u064A \u0627\u0644\u0645\u062E\u062A\u0627\u0631: ${result.model.id}`, "success", 5e3);
    } catch (error) {
      toast(String(error?.message || "\u062A\u0639\u0630\u0631 \u0627\u062E\u062A\u064A\u0627\u0631 \u0646\u0645\u0648\u0630\u062C \u0645\u062C\u0627\u0646\u064A."), "error", 5e3);
    } finally {
      state.busy = "";
      state.aiModelsLoading = false;
      render();
    }
  }
  async function updateModels({ test = false } = {}) {
    if (state.busy) return;
    state.busy = "models";
    state.aiModelsLoading = true;
    render();
    try {
      const models = await ai.getModels({ force: true });
      const ranked = rankFreeModels(models, state.aiConfig.modelReliability || {});
      state.aiModels = ranked.slice(0, 60);
      state.aiConfigured = true;
      state.aiStorage = (await Platform.aiStatus()).storage || "";
      if (!ranked.length) throw new Error("\u0627\u062A\u0635\u0644\u062A OpenRouter\u060C \u0644\u0643\u0646 \u0644\u0645 \u062A\u064F\u0631\u062C\u0639 \u0646\u0645\u0648\u0630\u062C\u064B\u0627 \u0645\u062C\u0627\u0646\u064A\u064B\u0627 \u0628\u0633\u064A\u0627\u0642 \u0643\u0627\u0641\u064D.");
      if (test && state.aiConfig.automatic !== false) {
        const best = ranked[0];
        state.aiConfig = { ...state.aiConfig, model: best.id, automatic: true, lastModelCheck: Date.now() };
        await Platform.save("ai_config", state.aiConfig);
      }
      await addLog({ category: "ai", level: "info", message: `\u0627\u062A\u0635\u0627\u0644 OpenRouter \u0646\u0627\u062C\u062D\u061B ${ranked.length} \u0646\u0645\u0648\u0630\u062C\u064B\u0627 \u0645\u062C\u0627\u0646\u064A\u064B\u0627 \u0635\u0627\u0644\u062D\u064B\u0627 \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u062A\u0627\u062D\u0629.` });
      toast(`\u0646\u062C\u062D \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \xB7 ${ranked.length} \u0646\u0645\u0648\u0630\u062C \u0645\u062C\u0627\u0646\u064A \u0645\u062A\u0627\u062D`, "success", 4500);
    } catch (error) {
      const msg = String(error?.message || "\u0641\u0634\u0644 \u0627\u062A\u0635\u0627\u0644 OpenRouter.");
      await addLog({ category: "ai", level: "warning", message: `\u0641\u0634\u0644 \u0627\u062E\u062A\u0628\u0627\u0631 OpenRouter: ${msg}` });
      toast(msg, "error", 5e3);
    } finally {
      state.busy = "";
      state.aiModelsLoading = false;
      await refreshAll({ renderAfter: false });
      render();
    }
  }
  async function saveAiLimits() {
    const daily = Number(document.querySelector('[data-setting-input="dailyLimit"]')?.value);
    const maxTokens = Number(document.querySelector('[data-setting-input="maxTokens"]')?.value);
    if (!Number.isInteger(daily) || daily < 1 || daily > 500) return toast("\u0627\u0644\u062D\u062F \u0627\u0644\u064A\u0648\u0645\u064A \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0628\u064A\u0646 1 \u0648500 \u0637\u0644\u0628.", "error");
    if (!Number.isInteger(maxTokens) || maxTokens < 128 || maxTokens > 8192) return toast("\u062D\u062F \u0627\u0644\u0631\u0645\u0648\u0632 \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0628\u064A\u0646 128 \u06488192.", "error");
    state.aiConfig = { ...state.aiConfig, dailyLimit: daily, maxTokens, id: "main" };
    try {
      await Platform.save("ai_config", state.aiConfig);
      toast("\u062A\u0645 \u062D\u0641\u0638 \u062D\u062F\u0648\u062F AI \u0645\u062D\u0644\u064A\u064B\u0627.", "success");
      render();
    } catch (error) {
      toast(error.message, "error");
    }
  }
  async function toggleSetting(input) {
    const name = input.dataset.setting;
    if (name === "aiAutomatic") {
      state.aiConfig = { ...state.aiConfig, automatic: Boolean(input.checked), id: "main" };
      if (input.checked) state.aiConfig = { ...state.aiConfig, automatic: true };
      await Platform.save("ai_config", state.aiConfig);
      if (input.checked && state.aiConfigured && !state.aiConfig.model) await selectFreeModel();
      else {
        toast(input.checked ? "\u0633\u064A\u062A\u0645 \u062A\u0631\u0634\u064A\u062D \u0646\u0645\u0648\u0630\u062C \u0645\u062C\u0627\u0646\u064A \u062A\u0644\u0642\u0627\u0626\u064A\u064B\u0627." : "\u0627\u0644\u0648\u0636\u0639 \u0627\u0644\u064A\u062F\u0648\u064A: \u0627\u062E\u062A\u0631 \u0646\u0645\u0648\u0630\u062C\u064B\u0627 \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629.", "success");
        render();
      }
      return;
    }
    if (name === "reduceMotion") {
      state.settings = { ...state.settings, reduceMotion: input.checked, id: "preferences" };
      await Platform.save("settings", state.settings);
      render();
      toast(input.checked ? "\u062A\u0645 \u062A\u0642\u0644\u064A\u0644 \u0627\u0644\u062D\u0631\u0643\u0629." : "\u062A\u0645 \u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u062D\u0631\u0643\u0627\u062A \u0627\u0644\u0647\u0627\u062F\u0626\u0629.");
      return;
    }
    if (name === "notifications") {
      if (!input.checked) {
        state.settings = { ...state.settings, notifications: false, id: "preferences" };
        await Platform.save("settings", state.settings);
        render();
        return;
      }
      try {
        let permission = "granted";
        if (Platform.isNative && window.MineBotNative?.requestNotificationPermission) permission = window.MineBotNative.requestNotificationPermission();
        else if ("Notification" in window) permission = await Notification.requestPermission();
        else permission = "unsupported";
        if (permission === "pending") {
          state.settings = { ...state.settings, notifications: true, id: "preferences" };
          await Platform.save("settings", state.settings);
          toast("\u0627\u062E\u062A\u0631 \u0627\u0644\u0633\u0645\u0627\u062D \u0641\u064A \u0646\u0627\u0641\u0630\u0629 Android \u0644\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A.", "info");
        } else if (permission !== "granted" && permission !== "already-granted") {
          state.settings = { ...state.settings, notifications: false, id: "preferences" };
          await Platform.save("settings", state.settings);
          toast(permission === "denied" ? "\u0631\u0641\u0636 \u0627\u0644\u0646\u0638\u0627\u0645 \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A." : "\u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A \u063A\u064A\u0631 \u0645\u062F\u0639\u0648\u0645\u0629 \u0641\u064A \u0647\u0630\u0627 \u0627\u0644\u0645\u062A\u0635\u0641\u062D.", "warning");
        } else {
          state.settings = { ...state.settings, notifications: true, id: "preferences" };
          await Platform.save("settings", state.settings);
          toast("\u062A\u0645 \u062A\u0641\u0639\u064A\u0644 \u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0623\u062D\u062F\u0627\u062B \u0627\u0644\u062A\u0637\u0628\u064A\u0642.", "success");
        }
        render();
      } catch (error) {
        state.settings = { ...state.settings, notifications: false };
        render();
        toast(error.message, "error");
      }
    }
  }
  async function configureAppLock() {
    const status = await Platform.lock("status");
    if (status.enabled) pinChangeModal();
    else pinSetupModal();
  }
  async function savePinSetup(form) {
    const data = new FormData(form);
    const first = String(data.get("pin1") || "");
    const second = String(data.get("pin2") || "");
    if (!/^\d{6}$/.test(first)) return toast("\u0631\u0645\u0632 \u0627\u0644\u0642\u0641\u0644 \u064A\u062C\u0628 \u0623\u0646 \u064A\u062A\u0643\u0648\u0646 \u0645\u0646 6 \u0623\u0631\u0642\u0627\u0645.", "error");
    if (first !== second) return toast("\u0631\u0645\u0632\u0627 \u0627\u0644\u0642\u0641\u0644 \u063A\u064A\u0631 \u0645\u062A\u0637\u0627\u0628\u0642\u064A\u0646.", "error");
    const result = await Platform.lock("set", first);
    if (!result.enabled) throw new Error("\u062A\u0639\u0630\u0631 \u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0642\u0641\u0644.");
    state.settings = { ...state.settings, lockEnabled: true, id: "preferences" };
    await Platform.save("settings", state.settings);
    closeModal();
    render();
    toast("\u062A\u0645 \u062A\u0641\u0639\u064A\u0644 \u0642\u0641\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642.", "success");
  }
  async function savePinChange(form) {
    const data = new FormData(form);
    const current = String(data.get("currentPin") || "");
    const next = String(data.get("newPin") || "");
    const check = await Platform.lock("verify", current);
    if (!check.valid) return toast("\u0631\u0645\u0632 \u0627\u0644\u0642\u0641\u0644 \u0627\u0644\u062D\u0627\u0644\u064A \u063A\u064A\u0631 \u0635\u062D\u064A\u062D.", "error");
    if (next && !/^\d{6}$/.test(next)) return toast("\u0627\u0644\u0631\u0645\u0632 \u0627\u0644\u062C\u062F\u064A\u062F \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0645\u0646 6 \u0623\u0631\u0642\u0627\u0645.", "error");
    if (next) await Platform.lock("set", next);
    else await Platform.lock("clear");
    state.settings = { ...state.settings, lockEnabled: Boolean(next), id: "preferences" };
    await Platform.save("settings", state.settings);
    closeModal();
    render();
    toast(next ? "\u062A\u0645 \u062A\u063A\u064A\u064A\u0631 \u0631\u0645\u0632 \u0627\u0644\u0642\u0641\u0644." : "\u062A\u0645 \u0625\u0632\u0627\u0644\u0629 \u0642\u0641\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642.", "success");
  }
  async function exportBackup() {
    const tables = ["servers", "bots", "tasks", "task_history", "settings", "ai_config", "skins", "locations", "logs", "bot_states"];
    try {
      const entities = {};
      for (const table of tables) entities[table] = await Platform.list(table);
      if (entities.settings) entities.settings = entities.settings.map((item) => item.id === "preferences" ? { ...item, lockEnabled: false } : item);
      const result = await Platform.saveBackup({ format: "minebot-local-backup-v1", createdAt: Date.now(), entities });
      await addLog({ category: "info", level: "info", message: "\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0646\u0633\u062E\u0629 \u0627\u062D\u062A\u064A\u0627\u0637\u064A\u0629 \u0645\u062D\u0644\u064A\u0629\u061B \u0644\u0645 \u062A\u062A\u0636\u0645\u0646 \u0627\u0644\u0645\u0641\u0627\u062A\u064A\u062D \u0627\u0644\u0633\u0631\u064A\u0629." });
      if (result.downloadUrl) {
        const link = document.createElement("a");
        link.href = result.downloadUrl;
        link.download = result.filename || "minebot-backup.json";
        document.body.append(link);
        link.click();
        link.remove();
        toast("\u062A\u0645 \u062A\u0635\u062F\u064A\u0631 \u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637\u064A\u0629 \u0625\u0644\u0649 \u062A\u0646\u0632\u064A\u0644\u0627\u062A \u0627\u0644\u0645\u0639\u0627\u064A\u0646\u0629.", "success", 4300);
      } else toast(`\u062D\u064F\u0641\u0638\u062A \u0627\u0644\u0646\u0633\u062E\u0629 \u0641\u064A \u0645\u0633\u0627\u062D\u0629 \u0627\u0644\u062A\u0637\u0628\u064A\u0642: ${result.path || result.filename || "backups"}`, "success", 5500);
      await refreshAll();
    } catch (error) {
      toast(`\u062A\u0639\u0630\u0631 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0646\u0633\u062E\u0629: ${error.message}`, "error", 5e3);
    }
  }
  function importBackup() {
    document.getElementById("backup-file")?.click();
  }
  async function onBackupFile(file) {
    if (!file) return;
    if (file.size > 8e6) return toast("\u062D\u062C\u0645 \u0627\u0644\u0646\u0633\u062E\u0629 \u0623\u0643\u0628\u0631 \u0645\u0646 8 MB.", "error");
    try {
      const json = JSON.parse(await file.text());
      const entities = json?.entities;
      const tables = ["servers", "bots", "tasks", "task_history", "settings", "ai_config", "skins", "locations", "logs", "bot_states"];
      if (!entities || json.format !== "minebot-local-backup-v1" || !tables.some((table) => Array.isArray(entities[table]))) throw new Error("\u0635\u064A\u063A\u0629 \u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637\u064A\u0629 \u063A\u064A\u0631 \u0645\u062F\u0639\u0648\u0645\u0629.");
      for (const table of tables) if (entities[table] && (!Array.isArray(entities[table]) || entities[table].some((record) => !record || typeof record.id !== "string"))) throw new Error(`\u0628\u064A\u0627\u0646\u0627\u062A ${table} \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629.`);
      showConfirm("\u0627\u0633\u062A\u064A\u0631\u0627\u062F \u0646\u0633\u062E\u0629\u061F", "\u0633\u062A\u064F\u062F\u0645\u062C \u0627\u0644\u0633\u062C\u0644\u0627\u062A \u0630\u0627\u062A \u0627\u0644\u0645\u0639\u0631\u0651\u0641\u0627\u062A \u0627\u0644\u0645\u062A\u0637\u0627\u0628\u0642\u0629 \u0645\u0639 \u0628\u064A\u0627\u0646\u0627\u062A \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632. \u0627\u0644\u0645\u0641\u062A\u0627\u062D \u0627\u0644\u0633\u0631\u064A \u0644\u0627 \u064A\u064F\u0633\u062A\u0648\u0631\u062F\u060C \u0648\u0644\u0646 \u062A\u062A\u0635\u0644 \u0627\u0644\u0628\u0648\u062A\u0627\u062A \u062A\u0644\u0642\u0627\u0626\u064A\u064B\u0627.", async () => {
        for (const table of tables) {
          for (const record of entities[table] || []) {
            let normalized = record;
            if (table === "bots") normalized = { ...record, status: "configured" };
            if (table === "settings" && record.id === "preferences") normalized = { ...record, lockEnabled: state.settings.lockEnabled };
            await Platform.save(table, normalized);
          }
        }
        await addLog({ level: "info", category: "info", message: "\u062A\u0645 \u062F\u0645\u062C \u0646\u0633\u062E\u0629 \u0627\u062D\u062A\u064A\u0627\u0637\u064A\u0629 \u0645\u062D\u0644\u064A\u0629 \u062F\u0648\u0646 \u0627\u0633\u062A\u064A\u0631\u0627\u062F \u0623\u0633\u0631\u0627\u0631 \u0623\u0648 \u0645\u0641\u0627\u062A\u064A\u062D." });
        await refreshAll({ renderAfter: false });
        state.route = "settings-storage";
        state.params = {};
        state.stack = [];
        render();
        toast("\u0627\u0643\u062A\u0645\u0644 \u0627\u0633\u062A\u064A\u0631\u0627\u062F \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u062D\u0644\u064A\u0629.", "success");
      }, { danger: false, confirmLabel: "\u0627\u0633\u062A\u064A\u0631\u0627\u062F" });
    } catch (error) {
      toast(error.message || "\u062A\u0639\u0630\u0631 \u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u0646\u0633\u062E\u0629.", "error");
    }
  }
  async function uploadSkin(file) {
    if (!file) return;
    if (file.type !== "image/png") return toast("\u0627\u062E\u062A\u0631 \u0645\u0644\u0641 \u0633\u0643\u0646 Minecraft \u0628\u0635\u064A\u063A\u0629 PNG.", "error");
    if (file.size < 16 || file.size > 2e6) return toast("\u062D\u062C\u0645 \u0627\u0644\u0645\u0644\u0641 \u064A\u062C\u0628 \u0623\u0644\u0627 \u064A\u062A\u062C\u0627\u0648\u0632 2 MB.", "error");
    state.busy = "skin";
    render();
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("\u062A\u0639\u0630\u0631 \u0642\u0631\u0627\u0621\u0629 \u0645\u0644\u0641 \u0627\u0644\u0633\u0643\u0646."));
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      const dimensions = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error("\u0645\u0644\u0641 PNG \u063A\u064A\u0631 \u0635\u0627\u0644\u062D \u0623\u0648 \u0644\u0627 \u064A\u0645\u0643\u0646 \u0641\u0643 \u062A\u0631\u0645\u064A\u0632\u0647."));
        image.src = dataUrl;
      });
      if (dimensions.width !== 64 || ![32, 64].includes(dimensions.height)) throw new Error("\u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 \u0623\u0628\u0639\u0627\u062F \u0627\u0644\u0633\u0643\u0646 64\xD764 \u0623\u0648 64\xD732 \u0628\u0643\u0633\u0644.");
      const saved = await Platform.saveSkin(file.name, dataUrl);
      const record = { id: saved.id || uid(), name: file.name.replace(/[<>"'`]/g, "").slice(0, 64) || "Skin", filePath: saved.filePath || "", bytes: saved.bytes || file.size, mime: file.type, width: dimensions.width, height: dimensions.height, createdAt: Date.now() };
      await Platform.save("skins", record);
      state.selectedSkinId = record.id;
      await addLog({ category: "info", level: "info", message: "\u062A\u0645 \u062D\u0641\u0638 \u0645\u0644\u0641 \u0633\u0643\u0646 \u0645\u062D\u0644\u064A\u064B\u0627." });
      await refreshAll({ renderAfter: false });
      state.busy = "";
      render();
      toast("\u062A\u0645 \u062D\u0641\u0638 \u0627\u0644\u0633\u0643\u0646 \u0641\u064A \u0645\u0633\u0627\u062D\u0629 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u0645\u062D\u0644\u064A\u0629.", "success");
    } catch (error) {
      state.busy = "";
      render();
      toast(error.message, "error");
    }
  }
  async function deleteSkin(id) {
    const skin = state.skins.find((entry) => entry.id === id);
    if (!skin) return;
    showConfirm("\u062D\u0630\u0641 \u0627\u0644\u0633\u0643\u0646\u061F", `\u0633\u064A\u064F\u062D\u0630\u0641 \u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0645\u062D\u0644\u064A \xAB${skin.name}\xBB. \u0645\u0644\u0641\u0627\u062A \u0627\u0644\u0628\u0648\u062A \u0627\u0644\u062A\u064A \u062A\u0634\u064A\u0631 \u0625\u0644\u064A\u0647 \u0633\u062A\u0639\u0648\u062F \u0628\u0644\u0627 \u0633\u0643\u0646.`, async () => {
      try {
        if (Platform.isNative && window.MineBotNative?.deleteSkin) {
          const result = JSON.parse(window.MineBotNative.deleteSkin(id, skin.filePath) || "{}");
          if (!result.ok) throw new Error(result.error || "\u062A\u0639\u0630\u0631 \u062D\u0630\u0641 \u0645\u0644\u0641 \u0627\u0644\u0633\u0643\u0646.");
        } else if (!Platform.isNative) {
          const response = await fetch(`/api/skins/${encodeURIComponent(skin.filePath.split("/").pop() || id)}`, { method: "DELETE" });
          if (!response.ok) throw new Error("\u062A\u0639\u0630\u0631 \u062D\u0630\u0641 \u0645\u0644\u0641 \u0627\u0644\u0633\u0643\u0646.");
        }
        for (const bot of state.bots.filter((entry) => entry.skinId === id)) await Platform.save("bots", { ...bot, skinId: "", updatedAt: Date.now() });
        await Platform.remove("skins", id);
        await addLog({ category: "info", level: "warning", message: "\u062A\u0645 \u062D\u0630\u0641 \u0645\u0644\u0641 \u0633\u0643\u0646 \u0645\u062D\u0644\u064A." });
        state.selectedSkinId = "";
        await refreshAll({ renderAfter: false });
        state.route = "skins";
        render();
        toast("\u062A\u0645 \u062D\u0630\u0641 \u0627\u0644\u0633\u0643\u0646.", "success");
      } catch (error) {
        toast(error.message, "error");
      }
    });
  }
  function handleClick(event) {
    const nav = event.target.closest("[data-route]");
    if (nav) {
      if (nav.matches(".nav-item")) navigate(nav.dataset.route, {}, { root: true });
      else navigate(nav.dataset.route);
      return;
    }
    const element = event.target.closest("[data-action]");
    if (!element) return;
    const action = element.dataset.action;
    const id = element.dataset.id || "";
    event.preventDefault();
    void (async () => {
      switch (action) {
        case "go-home":
          navigate("home", {}, { root: true });
          break;
        case "settings":
          navigate("settings", {}, { root: true });
          break;
        case "retry-boot":
          await boot();
          break;
        case "open-ai":
          navigate("settings-ai");
          break;
        case "back":
          goBack();
          break;
        case "close-modal":
          closeModal();
          break;
        case "backdrop-close":
          if (event.target === element && !state.locked) closeModal();
          break;
        case "confirm-modal": {
          const actionFn = state.modalConfirm;
          state.modalConfirm = null;
          closeModal();
          if (actionFn) await actionFn();
          break;
        }
        case "add-server":
          navigate("server-form");
          break;
        case "add-bot":
          navigate("bot-form");
          break;
        case "add-task":
          navigate("task-form");
          break;
        case "add-task-for-bot":
          navigate("task-form", { botId: id });
          break;
        case "server-details":
          if (!event.target.closest("button")) navigate("server-details", { id });
          break;
        case "bot-details":
          if (!event.target.closest("button")) navigate("bot-details", { id });
          break;
        case "task-details":
          if (!event.target.closest("button")) navigate("task-details", { id });
          break;
        case "server-menu":
          showServerMenu(id);
          break;
        case "bot-menu":
          showBotMenu(id);
          break;
        case "edit-server":
          closeModal();
          navigate("server-form", { id });
          break;
        case "edit-bot":
          closeModal();
          navigate("bot-form", { id });
          break;
        case "delete-server":
          closeModal();
          await removeServer(id);
          break;
        case "delete-bot":
          closeModal();
          await removeBot(id);
          break;
        case "ping-server":
          closeModal();
          await testServer(id);
          break;
        case "engine-info":
          showEngineInfo(id);
          break;
        case "bot-tasks":
          navigate("tasks", { botId: id });
          break;
        case "open-inventory":
          navigate("inventory", { id });
          break;
        case "change-skin":
          state.selectedSkinId = state.bots.find((bot) => bot.id === id)?.skinId || "";
          navigate("skins", { botId: id, skinId: state.selectedSkinId });
          break;
        case "open-skins":
          navigate("skins");
          break;
        case "bot-logs":
          closeModal();
          navigate("logs", { botId: id });
          break;
        case "open-logs":
          closeModal();
          navigate("logs", { botId: id });
          break;
        case "task-tab":
          state.taskTab = element.dataset.value === "history" ? "history" : "active";
          render();
          break;
        case "log-filter":
          state.logFilter = element.dataset.value || "all";
          render();
          break;
        case "generate-task-plan":
          await generateTaskPlan(state.params.id);
          break;
        case "cancel-task":
          await cancelTask(id || state.params.id);
          break;
        case "test-ai":
          await updateModels({ test: true });
          break;
        case "update-models":
          await updateModels();
          break;
        case "select-free-model":
          await selectFreeModel();
          break;
        case "clear-ai-key":
          showConfirm("\u062D\u0630\u0641 \u0645\u0641\u062A\u0627\u062D OpenRouter\u061F", "\u0644\u0646 \u064A\u0645\u0643\u0646 \u0625\u0646\u0634\u0627\u0621 \u062E\u0637\u0637 AI \u062D\u062A\u0649 \u062A\u0636\u064A\u0641 \u0645\u0641\u062A\u0627\u062D\u064B\u0627 \u062C\u062F\u064A\u062F\u064B\u0627. \u0633\u062A\u064F\u062D\u0630\u0641 \u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0645\u0634\u0641\u0651\u0631\u0629 \u0641\u0642\u0637.", async () => {
            await Platform.clearApiKey();
            state.aiConfigured = false;
            ai.modelsCache = null;
            state.aiModels = [];
            await addLog({ category: "ai", level: "warning", message: "\u062D\u064F\u0630\u0641 \u0645\u0641\u062A\u0627\u062D OpenRouter \u0627\u0644\u0645\u062D\u0641\u0648\u0638\u061B \u0644\u0645 \u062A\u064F\u0633\u062C\u0644 \u0642\u064A\u0645\u062A\u0647." });
            await refreshAll();
            toast("\u062A\u0645 \u062D\u0630\u0641 \u0627\u0644\u0645\u0641\u062A\u0627\u062D.", "success");
          }, { confirmLabel: "\u062D\u0630\u0641 \u0627\u0644\u0645\u0641\u062A\u0627\u062D" });
          break;
        case "reveal-key": {
          const input = document.getElementById("apiKey");
          if (!input) break;
          input.type = input.type === "password" ? "text" : "password";
          element.innerHTML = icon(input.type === "password" ? "eye" : "eyeOff");
          break;
        }
        case "save-ai-limits":
          await saveAiLimits();
          break;
        case "configure-lock":
          await configureAppLock();
          break;
        case "clear-logs":
          showConfirm("\u0645\u0633\u062D \u0627\u0644\u0633\u062C\u0644\u0627\u062A\u061F", "\u0633\u064A\u062A\u0645 \u062D\u0630\u0641 \u0633\u062C\u0644\u0627\u062A \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0648\u0633\u062C\u0644 \u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0645\u0647\u0627\u0645 \u0641\u0642\u0637. \u0644\u0646 \u062A\u064F\u062D\u0630\u0641 \u0627\u0644\u0645\u0647\u0627\u0645 \u0623\u0648 \u0627\u0644\u0633\u064A\u0631\u0641\u0631\u0627\u062A \u0623\u0648 \u0627\u0644\u0628\u0648\u062A\u0627\u062A.", async () => {
            await Platform.clear("logs");
            await Platform.clear("task_history");
            await refreshAll();
            toast("\u062A\u0645 \u0645\u0633\u062D \u0627\u0644\u0633\u062C\u0644\u0627\u062A.", "success");
          }, { confirmLabel: "\u0645\u0633\u062D \u0627\u0644\u0633\u062C\u0644\u0627\u062A" });
          break;
        case "clear-cache":
          ai.modelsCache = null;
          ai.modelsFetchedAt = 0;
          state.aiModels = [];
          toast("\u062A\u0645 \u0645\u0633\u062D Cache \u0627\u0644\u0646\u0645\u0627\u0630\u062C \u0645\u0646 \u0627\u0644\u0630\u0627\u0643\u0631\u0629 \u0627\u0644\u0645\u0624\u0642\u062A\u0629.", "success");
          if (state.route === "settings-storage") render();
          break;
        case "export-backup":
          await exportBackup();
          break;
        case "import-backup":
          importBackup();
          break;
        case "upload-skin":
          document.getElementById("skin-file")?.click();
          break;
        case "select-skin":
          state.selectedSkinId = id;
          state.params = { ...state.params, skinId: id };
          render();
          break;
        case "apply-skin": {
          const bot = state.bots.find((entry) => entry.id === id);
          const skinId = state.params.skinId || state.selectedSkinId;
          if (!bot || !skinId) {
            toast("\u0627\u062E\u062A\u0631 \u0633\u0643\u0646\u064B\u0627 \u0623\u0648\u0644\u064B\u0627.", "warning");
            break;
          }
          await Platform.save("bots", { ...bot, skinId, updatedAt: Date.now() });
          await addLog({ level: "info", category: "info", botId: id, message: "\u062A\u0645 \u062A\u0639\u064A\u064A\u0646 \u0633\u0643\u0646 \u0639\u0644\u0649 \u0645\u0644\u0641 \u0627\u0644\u0628\u0648\u062A \u0627\u0644\u0645\u062D\u0644\u064A\u061B \u0644\u0645 \u064A\u064F\u0631\u0633\u0644 \u0625\u0644\u0649 Minecraft." });
          await refreshAll({ renderAfter: false });
          state.route = "bot-details";
          state.params = { id };
          state.stack = [];
          render();
          toast("\u062A\u0645 \u062D\u0641\u0638 \u0627\u062E\u062A\u064A\u0627\u0631 \u0627\u0644\u0633\u0643\u0646 \u0641\u064A \u0645\u0644\u0641 \u0627\u0644\u0628\u0648\u062A.", "success");
          break;
        }
        case "delete-selected-skin":
          await deleteSkin(id);
          break;
        case "open-notifications":
          navigate("notifications");
          break;
        case "open-licenses":
          showModal({ title: "\u062A\u0631\u0627\u062E\u064A\u0635 Open Source", description: "\u0645\u0644\u062E\u0635 \u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F\u0627\u062A \u0627\u0644\u0645\u0648\u0632\u0639\u0629 \u0645\u0639 \u0627\u0644\u0645\u0635\u062F\u0631", body: `<div class="log-list"><div class="log-row"><div class="log-symbol">${icon("info")}</div><div class="log-copy"><p><strong>Android Runtime</strong><br>\u064A\u0633\u062A\u062E\u062F\u0645 \u0648\u0627\u062C\u0647\u0627\u062A Android \u0627\u0644\u0646\u0638\u0627\u0645\u064A\u0629\u061B \u0644\u0627 \u062A\u064F\u0636\u0645\u0651\u0646 \u0645\u0643\u062A\u0628\u0627\u062A Android \u062E\u0627\u0631\u062C\u064A\u0629.</p></div></div><div class="log-row"><div class="log-symbol">${icon("info")}</div><div class="log-copy"><p><strong>esbuild \xB7 MIT</strong><br>\u0623\u062F\u0627\u0629 \u0628\u0646\u0627\u0621 Web \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u0629 \u0644\u062A\u062C\u0645\u064A\u0639 \u0645\u0644\u0641\u0627\u062A JavaScript.</p></div></div><div class="log-row"><div class="log-symbol">${icon("info")}</div><div class="log-copy"><p><strong>happy-dom \xB7 MIT</strong><br>\u0627\u0639\u062A\u0645\u0627\u062F \u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0648\u0627\u062C\u0647\u0629 \u0641\u0642\u0637\u060C \u0648\u0644\u0627 \u064A\u064F\u0634\u062D\u0646 \u0645\u0639 APK.</p></div></div><p class="help-copy">\u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644 \u0641\u064A mobile/THIRD-PARTY-NOTICES.md \u062F\u0627\u062E\u0644 \u0627\u0644\u0645\u0635\u062F\u0631.</p></div>` });
          break;
        case "add-server-from-bot":
          navigate("server-form");
          break;
        default:
          break;
      }
    })().catch((error) => toast(error.message || "\u062D\u062F\u062B \u062E\u0637\u0623 \u063A\u064A\u0631 \u0645\u062A\u0648\u0642\u0639.", "error"));
  }
  function handleSubmit(event) {
    const form = event.target.closest("form[data-form]");
    if (!form) return;
    event.preventDefault();
    const kind = form.dataset.form;
    void (async () => {
      try {
        switch (kind) {
          case "server":
            await saveServerForm(form);
            break;
          case "bot":
            await saveBotForm(form);
            break;
          case "task":
            await createTaskForm(form);
            break;
          case "ai-key":
            await saveAiKeyForm(form);
            break;
          case "minecraft-settings":
            await saveMinecraftSettings(form);
            break;
          case "pin-setup":
            await savePinSetup(form);
            break;
          case "pin-change":
            await savePinChange(form);
            break;
          case "unlock": {
            const pin = String(new FormData(form).get("pin") || "");
            const result = await Platform.lock("verify", pin);
            if (!result.valid) {
              const error = document.getElementById("unlock-error");
              if (error) error.textContent = "\u0627\u0644\u0631\u0645\u0632 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D. \u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649.";
              form.reset();
              document.getElementById("unlockPin")?.focus();
              break;
            }
            state.locked = false;
            closeModal();
            toast("\u062A\u0645 \u0641\u062A\u062D \u0627\u0644\u062A\u0637\u0628\u064A\u0642.", "success");
            break;
          }
          default:
            break;
        }
      } catch (error) {
        toast(error.message || "\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A.", "error");
      }
    })();
  }
  function handleChange(event) {
    const target = event.target;
    if (target.matches("[data-setting]")) {
      void toggleSetting(target).catch((error) => toast(error.message, "error"));
      return;
    }
    if (target.matches("#ai-model-select")) {
      state.aiConfig = { ...state.aiConfig, model: target.value, automatic: !target.value, id: "main" };
      void Platform.save("ai_config", state.aiConfig).then(() => {
        toast(target.value ? `\u062A\u0645 \u0627\u062E\u062A\u064A\u0627\u0631 ${target.value}` : "\u062A\u0645 \u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0627\u062E\u062A\u064A\u0627\u0631 \u0627\u0644\u062A\u0644\u0642\u0627\u0626\u064A.", "success");
        render();
      }).catch((error) => toast(error.message, "error"));
      return;
    }
    if (target.matches("#skin-file")) {
      void uploadSkin(target.files?.[0]);
      target.value = "";
      return;
    }
    if (target.matches("#backup-file")) {
      void onBackupFile(target.files?.[0]);
      target.value = "";
    }
  }
  var searchTimer;
  function handleInput(event) {
    const target = event.target;
    if (!target.matches("[data-search]")) return;
    state.search = target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const current = document.querySelector("[data-search]");
      const value = state.search;
      render();
      const next = document.querySelector("[data-search]");
      if (next) {
        next.value = value;
        next.focus();
        next.setSelectionRange(value.length, value.length);
      }
    }, 120);
  }
  function handleKeydown(event) {
    if (event.key === "Escape") {
      if (document.querySelector("#overlay-root .modal-backdrop") && !state.locked) closeModal();
      else goBack();
    }
    if (event.key === "Enter" && event.target.matches('.list-card[role="button"]')) {
      event.preventDefault();
      event.target.click();
    }
  }
  async function boot() {
    try {
      await loadAll();
      state.loading = false;
      render();
      if (state.settings.lockEnabled) showLockOverlay();
      document.getElementById("screen").setAttribute("aria-busy", "false");
    } catch (error) {
      state.loading = false;
      state.bootError = String(error?.message || "\u062A\u0639\u0630\u0631 \u0641\u062A\u062D \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u062D\u0644\u064A\u0629.");
      document.getElementById("screen").innerHTML = `<div class="empty-state"><div class="empty-icon">${icon("alert")}</div><h3>\u062A\u0639\u0630\u0631 \u0641\u062A\u062D \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u062D\u0644\u064A\u0629</h3><p>${escapeHtml(state.bootError)}</p><button class="btn btn-secondary" data-action="retry-boot">\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629</button></div>`;
    }
  }
  document.addEventListener("click", handleClick);
  document.addEventListener("submit", handleSubmit);
  document.addEventListener("change", handleChange);
  document.addEventListener("input", handleInput);
  document.addEventListener("keydown", handleKeydown);
  window.__minebotForeground = () => {
    if (state.settings.lockEnabled && !state.locked) showLockOverlay();
  };
  window.__minebotBack = () => goBack();
  window.__minebotPermissionResult = async (granted) => {
    state.settings = { ...state.settings, notifications: Boolean(granted), id: "preferences" };
    await Platform.save("settings", state.settings).catch(() => {
    });
    render();
    toast(granted ? "\u062A\u0645 \u062A\u0641\u0639\u064A\u0644 \u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0623\u062D\u062F\u0627\u062B \u0627\u0644\u062A\u0637\u0628\u064A\u0642." : "\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0633\u0645\u0627\u062D \u0628\u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A.", granted ? "success" : "warning");
  };
  var hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (state.settings.lockEnabled && hiddenAt && Date.now() - hiddenAt > 25e3) showLockOverlay();
  });
  window.__minebotAppReady = boot();
})();
