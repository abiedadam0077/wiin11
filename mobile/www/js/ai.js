import { Platform } from './platform.js';

const DEFAULT_SYSTEM = `You are a careful planning component for a Minecraft Java bot manager. Convert the user's request into a safe, concise task plan; do not claim the task has been executed. Do not invent observations about a world, inventory, server, or bot. Return exactly one JSON object with this schema: {"name":"short task name","summary":"one sentence","steps":[{"title":"action","details":"what the bot would need to do","done_when":"observable completion condition"}],"requires_confirmation":true,"risks":["short risk"]}. Make 2 to 8 ordered steps. If the request is ambiguous, include a clarification step. If it asks for a task that cannot be represented safely, explain that in summary and make a single clarification step. Keep names and descriptions in the user's language. No markdown fences.`;

const speedHints = ['flash', 'turbo', 'swift', 'instant', 'mini', '8b', 'small', 'fast'];
const reasoningHints = ['reason', 'r1', 'deepseek', 'qwq', 'thinking', 'o1', 'o3'];
const reliableVendors = ['google', 'anthropic', 'openai', 'deepseek', 'qwen', 'meta-llama'];

function priceIsZero(value) {
  if (value === undefined || value === null || value === '') return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed === 0;
}

export function isFreeModel(model) {
  if (!model || typeof model.id !== 'string') return false;
  const id = model.id.toLowerCase();
  if (id.endsWith(':free')) return true;
  const pricing = model.pricing;
  return Boolean(pricing && priceIsZero(pricing.prompt) && priceIsZero(pricing.completion));
}

export function scoreModel(model, reliability = {}) {
  const id = String(model?.id ?? '').toLowerCase();
  const context = Math.max(0, Number(model?.context_length) || 0);
  const parameters = Array.isArray(model?.supported_parameters) ? model.supported_parameters.map(String) : [];
  const toolSupport = parameters.includes('tools') || parameters.includes('tool_choice');
  const reasoningSupport = parameters.includes('reasoning') || reasoningHints.some((hint) => id.includes(hint));
  const speedSupport = speedHints.some((hint) => id.includes(hint));
  const stableProvider = reliableVendors.some((vendor) => id.startsWith(`${vendor}/`) || id.includes(`${vendor}/`));
  const calls = Number(reliability[id]?.calls) || 0;
  const failures = Number(reliability[id]?.failures) || 0;
  const recentReliability = calls ? Math.max(-25, Math.min(25, ((calls - failures) / calls) * 25)) : 0;
  const contextScore = context >= 128_000 ? 24 : context >= 64_000 ? 20 : context >= 32_000 ? 16 : context >= 16_000 ? 12 : context >= 8_000 ? 8 : context >= 4_000 ? 4 : 0;
  return contextScore + (toolSupport ? 19 : 0) + (reasoningSupport ? 13 : 0) + (speedSupport ? 8 : 0) + (stableProvider ? 6 : 0) + recentReliability;
}

export function rankFreeModels(models, reliability = {}) {
  return (Array.isArray(models) ? models : [])
    .filter((model) => isFreeModel(model) && Number(model.context_length || 0) >= 4096)
    .sort((a, b) => scoreModel(b, reliability) - scoreModel(a, reliability));
}

function getErrorMessage(error) {
  const message = String(error?.message || 'تعذر الاتصال بخدمة OpenRouter.');
  return message.replace(/\bsk-or-[^\s"'<>]+/gi, '[مفتاح مخفي]').slice(0, 230);
}

function parsePlan(content) {
  if (typeof content !== 'string') throw new Error('لم يُرجع النموذج خطة نصية.');
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('استجابة النموذج ليست JSON صالحًا.');
  let plan;
  try { plan = JSON.parse(content.slice(start, end + 1)); }
  catch { throw new Error('تعذر قراءة خطة النموذج.'); }
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.steps) || plan.steps.length < 1 || plan.steps.length > 12) throw new Error('تنسيق الخطة غير مكتمل.');
  const steps = plan.steps.slice(0, 8).map((step, index) => {
    if (!step || typeof step !== 'object') throw new Error('تحتوي الخطة على خطوة غير صالحة.');
    const title = String(step.title || '').trim();
    const details = String(step.details || '').trim();
    const doneWhen = String(step.done_when || '').trim();
    if (!title || !details) throw new Error(`الخطوة ${index + 1} ناقصة.`);
    return { id: `step-${index + 1}`, title: title.slice(0, 120), details: details.slice(0, 480), doneWhen: doneWhen.slice(0, 240), status: 'pending' };
  });
  return {
    name: String(plan.name || '').trim().slice(0, 80) || 'مهمة Minecraft',
    summary: String(plan.summary || '').trim().slice(0, 500),
    steps,
    requiresConfirmation: plan.requires_confirmation !== false,
    risks: Array.isArray(plan.risks) ? plan.risks.map((risk) => String(risk).slice(0, 160)).slice(0, 5) : [],
  };
}

export class AIEngine {
  constructor({ getConfig, saveConfig, log = async () => {}, onAttempt = () => {}, platform = Platform } = {}) {
    this.getConfig = getConfig || (async () => ({ id: 'main', automatic: true }));
    this.saveConfig = saveConfig || (async () => {});
    this.log = log;
    this.onAttempt = onAttempt;
    this.platform = platform;
    this.modelsCache = null;
    this.modelsFetchedAt = 0;
  }

  async getModels({ force = false } = {}) {
    if (!force && this.modelsCache && Date.now() - this.modelsFetchedAt < 90_000) return this.modelsCache;
    const response = await this.platform.aiRequest('/models');
    const models = Array.isArray(response?.data) ? response.data.filter((model) => model && typeof model.id === 'string') : [];
    if (!models.length) throw new Error('لم تُرجع OpenRouter أي نماذج متاحة.');
    this.modelsCache = models;
    this.modelsFetchedAt = Date.now();
    return models;
  }

  async selectBestFree({ force = false } = {}) {
    const models = await this.getModels({ force });
    const config = await this.getConfig();
    const ranked = rankFreeModels(models, config.modelReliability || {});
    if (!ranked.length) throw new Error('لم يُعثر على نموذج مجاني متاح بسياق لا يقل عن 4096 رمزًا.');
    const selected = ranked[0];
    await this.saveConfig({ ...config, id: 'main', model: selected.id, automatic: true, lastModelCheck: Date.now() });
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
    if (!isFreeModel(chosen)) throw new Error('النموذج المحدد غير مجاني؛ أوقفنا الطلب لتجنب أي استخدام مدفوع.');
    const rest = freeRanked.filter((model) => model.id !== chosen.id);
    return [chosen, ...rest.slice(0, 4)];
  }

  async planTask(prompt, { botName = '', serverName = '' } = {}) {
    const status = await this.platform.aiStatus();
    if (!status.configured) throw new Error('أضف مفتاح OpenRouter أولًا لإنشاء خطة بالذكاء الاصطناعي.');
    const config = await this.getConfig();
    const candidates = await this.candidateModels();
    if (!candidates.length) throw new Error('لم تتوفر نماذج مجانية صالحة. اختبر إعدادات OpenRouter وحاول مجددًا.');
    const today = new Date().toISOString().slice(0, 10);
    if (config.usageDate !== today) { config.usageDate = today; config.usageCount = 0; }
    const dailyLimit = Math.max(1, Math.min(500, Number(config.dailyLimit) || 30));
    if ((Number(config.usageCount) || 0) >= dailyLimit) throw new Error('تم بلوغ حد طلبات AI اليومي المحفوظ محليًا. يمكنك تعديل الحد من الإعدادات.');
    const errors = [];
    for (let index = 0; index < candidates.length; index += 1) {
      if ((Number(config.usageCount) || 0) >= dailyLimit) throw new Error('تم بلوغ حد طلبات AI اليومي المحفوظ محليًا أثناء إعادة المحاولة.');
      const model = candidates[index];
      this.onAttempt({ model: model.id, index: index + 1, total: candidates.length });
      config.usageCount = (Number(config.usageCount) || 0) + 1;
      await this.saveConfig({ ...config, id: 'main' });
      const userMessage = [
        `طلب المستخدم: ${String(prompt).slice(0, 2000)}`,
        botName ? `البوت المحدد: ${String(botName).slice(0, 80)}` : 'لم يحدد المستخدم بوتًا بعد.',
        serverName ? `السيرفر المحدد: ${String(serverName).slice(0, 80)}` : '',
        'أنشئ خطة مقترحة فقط. لا تفترض أن البوت متصل أو أن الموارد/المواقع موجودة.',
      ].filter(Boolean).join('\n');
      const body = {
        model: model.id,
        messages: [{ role: 'system', content: DEFAULT_SYSTEM }, { role: 'user', content: userMessage }],
        temperature: 0.2,
        max_tokens: Math.max(128, Math.min(8192, Number(config.maxTokens) || 900)),
      };
      try {
        const result = await this.platform.aiRequest('/chat/completions', 'POST', body);
        const content = result?.choices?.[0]?.message?.content;
        const plan = parsePlan(typeof content === 'string' ? content : Array.isArray(content) ? content.map((part) => part?.text || '').join('\n') : '');
        const usage = result?.usage || {};
        const reliability = { ...(config.modelReliability || {}) };
        const previous = reliability[model.id] || { calls: 0, failures: 0, successes: 0 };
        reliability[model.id] = { calls: (Number(previous.calls) || 0) + 1, failures: Number(previous.failures) || 0, successes: (Number(previous.successes) || 0) + 1, lastSuccess: Date.now() };
        const updatedConfig = { ...config, id: 'main', model: model.id, modelReliability: reliability, lastSuccessfulModel: model.id, lastModelCheck: Date.now() };
        await this.saveConfig(updatedConfig);
        await this.log({ level: 'info', category: 'ai', message: `تم إنشاء خطة مقترحة باستخدام ${model.id}.` });
        return { plan, model: model.id, usage: { promptTokens: Number(usage.prompt_tokens) || 0, completionTokens: Number(usage.completion_tokens) || 0 }, fallbackIndex: index };
      } catch (error) {
        errors.push(model.id);
        const reliability = { ...(config.modelReliability || {}) };
        const previous = reliability[model.id] || { calls: 0, failures: 0, successes: 0 };
        reliability[model.id] = { calls: (Number(previous.calls) || 0) + 1, failures: (Number(previous.failures) || 0) + 1, successes: Number(previous.successes) || 0, lastFailure: Date.now() };
        config.modelReliability = reliability;
        await this.saveConfig({ ...config, id: 'main', modelReliability: reliability }).catch(() => {});
        await this.log({ level: 'warning', category: 'ai', message: `فشل النموذج ${model.id}؛ جار تجربة نموذج مجاني آخر.` });
        if (index === candidates.length - 1) throw new Error(`تعذر إنشاء الخطة بعد تجربة ${errors.length} نموذجًا. ${getErrorMessage(error)}`);
      }
    }
    throw new Error('تعذر إنشاء خطة المهمة.');
  }
}
