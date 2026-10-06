import test from 'node:test';
import assert from 'node:assert/strict';
import { AIEngine } from '../www/js/ai.js';

const availableModels = [
  { id: 'test/first:free', name: 'First free', context_length: 16_000, pricing: { prompt: '0', completion: '0' }, supported_parameters: [] },
  { id: 'test/backup:free', name: 'Backup free', context_length: 32_000, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools', 'reasoning'] },
  { id: 'test/paid', name: 'Paid model', context_length: 128_000, pricing: { prompt: '0.1', completion: '0.2' }, supported_parameters: ['tools'] },
];
const planJson = JSON.stringify({ name: 'جمع الخشب', summary: 'خطة مقترحة غير منفذة.', steps: [{ title: 'استكشف المنطقة', details: 'تحقق من وجود أشجار قريبة.', done_when: 'تم العثور على شجرة.' }], requires_confirmation: true, risks: [] });

function platform(requestModel) {
  return {
    async aiStatus() { return { configured: true }; },
    async aiRequest(path, method, body) {
      if (path === '/models') return { data: availableModels };
      if (path === '/chat/completions') return requestModel(body.model, body);
      throw new Error('unexpected endpoint');
    },
  };
}

test('AIEngine retries another available free model after a model-specific failure', async () => {
  let config = { id: 'main', automatic: false, model: 'test/first:free', dailyLimit: 20, maxTokens: 700, modelReliability: {} };
  const attempts = [];
  const logs = [];
  const requests = [];
  const engine = new AIEngine({
    platform: platform(async (model, body) => {
      requests.push({ model, body });
      if (model === 'test/first:free') throw new Error('model unavailable');
      return { choices: [{ message: { content: planJson } }], usage: { prompt_tokens: 100, completion_tokens: 80 } };
    }),
    getConfig: async () => config,
    saveConfig: async (next) => { config = next; },
    log: async (entry) => logs.push(entry),
    onAttempt: (entry) => attempts.push(entry),
  });
  const result = await engine.planTask('اجمع خمس قطع خشب');
  assert.equal(result.model, 'test/backup:free');
  assert.equal(result.fallbackIndex, 1);
  assert.equal(result.plan.steps.length, 1);
  assert.deepEqual(requests.map((entry) => entry.model), ['test/first:free', 'test/backup:free']);
  assert.equal(config.lastSuccessfulModel, 'test/backup:free');
  assert.equal(config.modelReliability['test/first:free'].failures, 1);
  assert.equal(attempts.length, 2);
  assert.ok(logs.some((entry) => entry.level === 'warning'));
  assert.ok(logs.some((entry) => entry.category === 'ai' && entry.level === 'info'));
});

test('AIEngine never sends a completion for a manually selected paid model', async () => {
  let requests = 0;
  const engine = new AIEngine({
    platform: platform(async () => { requests += 1; return { choices: [] }; }),
    getConfig: async () => ({ id: 'main', automatic: false, model: 'test/paid', dailyLimit: 20 }),
    saveConfig: async () => {},
  });
  await assert.rejects(engine.planTask('ابن مزرعة'), /غير مجاني/);
  assert.equal(requests, 0);
});

test('AIEngine enforces a persisted daily request limit before sending a completion', async () => {
  let requests = 0;
  const engine = new AIEngine({
    platform: platform(async () => { requests += 1; throw new Error('should not run'); }),
    getConfig: async () => ({ id: 'main', automatic: true, dailyLimit: 1, usageDate: new Date().toISOString().slice(0, 10), usageCount: 1 }),
    saveConfig: async () => {},
  });
  await assert.rejects(engine.planTask('اجمع الخشب'), /حد طلبات AI اليومي/);
  assert.equal(requests, 0);
});
