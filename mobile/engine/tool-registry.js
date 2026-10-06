'use strict';

const { validateCollect } = require('./task-engine');

const TOOL_DEFINITIONS = Object.freeze([
  Object.freeze({
    type: 'function',
    function: Object.freeze({
      name: 'collect_block',
      description: 'Collect one supported Minecraft block type using the live Mineflayer session, Pathfinder, tool selection and verified inventory changes. This starts no work until the user confirms the saved task.',
      parameters: Object.freeze({
        type: 'object',
        additionalProperties: false,
        properties: Object.freeze({
          block_name: Object.freeze({ type: 'string', pattern: '^[a-z0-9_]{1,64}$', description: 'Exact Minecraft block identifier, for example oak_log.' }),
          amount: Object.freeze({ type: 'integer', minimum: 1, maximum: 320, description: 'Number of matching items to collect.' }),
        }),
        required: Object.freeze(['block_name', 'amount']),
      }),
    }),
  }),
]);

class ToolRegistry {
  constructor(taskEngine) {
    this.taskEngine = taskEngine;
    this.handlers = new Map([['collect_block', (context) => this.executeCollect(context)]]);
  }

  definitions() {
    return JSON.parse(JSON.stringify(TOOL_DEFINITIONS));
  }

  validateCall(name, rawArguments) {
    const handler = this.handlers.get(String(name || ''));
    if (!handler) throw new TypeError('طلب النموذج أداة غير مسجلة في محرك Minecraft.');
    let args = rawArguments;
    if (typeof args === 'string') {
      try { args = JSON.parse(args); } catch { throw new TypeError('وسائط أداة Minecraft ليست JSON صالحًا.'); }
    }
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new TypeError('وسائط أداة Minecraft غير صالحة.');
    const keys = Object.keys(args).sort();
    if (keys.length !== 2 || keys[0] !== 'amount' || keys[1] !== 'block_name') throw new TypeError('وسائط collect_block لا تطابق المخطط المسموح.');
    if (typeof args.block_name !== 'string' || !/^[a-z0-9_]{1,64}$/.test(args.block_name)) throw new TypeError('اسم الكتلة لا يطابق مخطط collect_block.');
    if (typeof args.amount !== 'number' || !Number.isInteger(args.amount)) throw new TypeError('عدد عناصر collect_block يجب أن يكون عددًا صحيحًا.');
    const normalized = validateCollect(args.block_name, args.amount, 0);
    return { name: 'collect_block', arguments: { block_name: normalized.blockName, amount: normalized.count } };
  }

  async execute(name, rawArguments, context = {}) {
    const call = this.validateCall(name, rawArguments);
    return this.handlers.get(call.name)({ ...context, arguments: call.arguments });
  }

  executeCollect(context) {
    const args = context.arguments;
    return this.taskEngine.executeCollect(
      context.botId,
      args.block_name,
      args.amount,
      context.taskId,
      context.alreadyCollected,
      context.initialInventoryCount,
    );
  }
}

module.exports = { ToolRegistry, TOOL_DEFINITIONS };
