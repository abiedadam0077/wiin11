'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { Vec3 } = require('vec3');
const { BotManager, isPermanentKick } = require('../bot-manager');
const { resolveExpectedDrop } = require('../task-engine');
const minecraftData = require('minecraft-data')('1.21.4');

class MockBot extends EventEmitter {
  constructor(collectOverride = null) {
    super();
    this.version = '1.21.4';
    this.username = 'MineBot';
    this.health = 20;
    this.food = 20;
    this.foodSaturation = 5;
    this.oxygenLevel = 300;
    this.game = { dimension: 'overworld', gameMode: 'survival', difficulty: 'normal' };
    this.entity = { id: 7, position: new Vec3(0, 64, 0), yaw: 0, pitch: 0 };
    this.inventoryItems = [];
    this.inventorySlots = new Array(46).fill(null);
    this.quickBarSlot = 4;
    this.players = {};
    this.entities = {};
    this.inventory = { items: () => this.inventoryItems, slots: this.inventorySlots, emptySlotCount: () => this.inventorySlots.slice(9, 45).filter((item) => item == null).length };
    this.controlStates = {};
    this.collectCalls = 0;
    this.cancelCalls = 0;
    this.cancelPending = null;
    this.collectOverride = collectOverride;
    this.block = { name: 'oak_log', position: new Vec3(1, 64, 0), boundingBox: 'block' };
    this.pathfinder = {
      goals: [],
      setMovements() {},
      setGoal(goal) { this.goals.push(goal); },
      stop() {},
    };
    this.collectBlock = {
      collect: async (target, options) => {
        this.collectCalls++;
        if (this.collectOverride) return this.collectOverride(this, target, options);
        return this.collectOne(target);
      },
      cancelTask: async () => {
        this.cancelCalls++;
        const reject = this.cancelPending;
        this.cancelPending = null;
        if (reject) reject(new Error('collection cancelled by Pathfinder'));
      },
    };
  }

  loadPlugin() {}
  setControlState(name, value) { this.controlStates[name] = value; }
  clearControlStates() { this.controlStates = {}; }
  findBlock() { return this.block; }
  findBlocks() { return [this.block.position]; }
  blockAt() { return this.block; }
  canDigBlock() { return true; }
  async collectOne(target = this.block) {
    const outputName = ({
      dirt: 'dirt', coarse_dirt: 'coarse_dirt', grass_block: 'dirt', oak_log: 'oak_log',
      stone: 'cobblestone', coal_ore: 'coal', iron_ore: 'raw_iron', gold_ore: 'raw_gold',
      diamond_ore: 'diamond', copper_ore: 'raw_copper',
    })[target?.name] || target?.name || 'oak_log';
    const count = this.inventoryItems.reduce((sum, item) => item.name === outputName ? sum + item.count : sum, 0) + 1;
    const metadata = minecraftData.itemsByName[outputName];
    const item = { name: outputName, displayName: metadata?.displayName || outputName, count, slot: 9, type: metadata?.id || 17 };
    this.inventoryItems = [item];
    this.inventorySlots[9] = item;
  }
  quit() { this.emit('end', 'user disconnect'); }
  respawn() {}
}

function makeManager({ collect } = {}) {
  let bot;
  const events = [];
  class Movements { constructor() {} }
  const manager = new BotManager({
    mineflayer: { createBot: () => { bot = new MockBot(collect || null); return bot; } },
    pathfinder: { pathfinder() {}, Movements, goals: {} },
    minecraftData: () => minecraftData,
    authCacheDir: null,
    autoEat: null,
    collectBlock: () => {},
  });
  manager.on('event', (event) => events.push(event));
  return { manager, events, get bot() { return bot; } };
}

async function spawn(managerHarness) {
  await managerHarness.manager.connect('bot-1', {
    host: '127.0.0.1', port: 25565, username: 'MineBot', auth: 'offline', version: '1.21.4', reconnect: false,
  });
  managerHarness.bot.emit('login');
  managerHarness.bot.emit('spawn');
  return managerHarness.bot;
}

function waitForEvent(manager, predicate, timeoutMs = 2_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      manager.removeListener('event', listener);
      reject(new Error('Timed out waiting for expected engine event.'));
    }, timeoutMs);
    const listener = (event) => {
      if (!predicate(event)) return;
      clearTimeout(timer);
      manager.removeListener('event', listener);
      resolve(event);
    };
    manager.on('event', listener);
  });
}

test('picker catalogue suggestions are generated from exactly the engine drop rules', () => {
  const cataloguePath = path.join(__dirname, '../../assets/minecraft/collect_targets_1.21.4.json');
  const catalogue = JSON.parse(fs.readFileSync(cataloguePath, 'utf8'));
  assert.equal(catalogue.catalogueVersion, '1.21.4');
  assert.ok(catalogue.targets.length > 800);
  for (const option of catalogue.targets) {
    const blockName = option.blockName.replace(/^minecraft:/, '');
    const resolved = resolveExpectedDrop(blockName, minecraftData);
    assert.equal(resolved.outputItemName, option.outputItemName, `Picker drop mismatch for ${option.blockName}`);
  }
  assert.equal(catalogue.targets.find((row) => row.blockName === 'minecraft:stone').outputItemName, 'cobblestone');
  assert.equal(catalogue.targets.find((row) => row.blockName === 'minecraft:grass_block').outputItemName, 'dirt');
  assert.equal(catalogue.targets.some((row) => row.blockName === 'minecraft:oak_leaves'), false);
});

test('ONLINE and world snapshots require a real Spawn event, not only login', async () => {
  const harness = makeManager();
  await harness.manager.connect('bot-1', {
    host: '127.0.0.1', port: 25565, username: 'MineBot', auth: 'offline', version: '1.21.4', reconnect: false,
  });
  assert.equal(harness.manager.bots.get('bot-1').status, 'CONNECTING');
  harness.bot.emit('login');
  assert.equal(harness.manager.bots.get('bot-1').status, 'JOINING');
  assert.equal(harness.events.some((event) => event.type === 'bot_snapshot'), false);
  harness.bot.emit('spawn');
  assert.equal(harness.manager.bots.get('bot-1').status, 'ONLINE');
  assert.ok(harness.events.some((event) => event.type === 'bot_state' && event.status === 'CONNECTING'));
  assert.ok(harness.events.some((event) => event.type === 'bot_state' && event.status === 'JOINING'));
  assert.ok(harness.events.some((event) => event.type === 'bot_state' && event.status === 'ONLINE' && event.detail.includes('Spawn')));
  const snapshot = harness.events.findLast((event) => event.type === 'bot_snapshot');
  assert.equal(snapshot.status, 'ONLINE');
  assert.equal(snapshot.inventoryAvailable, true);
  assert.equal(snapshot.selectedHotbarSlot, 4);
  assert.deepEqual(snapshot.position, { x: 0, y: 64, z: 0 });
  assert.deepEqual(snapshot.inventory, []);
  assert.equal(snapshot.inventorySlots.length, 36);
  assert.deepEqual(snapshot.inventorySlots[0], { slot: 9, name: null, displayName: null, count: 0, type: null, maxStackSize: null });

  await harness.manager.command({ action: 'control', botId: 'bot-1', states: { forward: true } });
  assert.equal(harness.bot.controlStates.forward, true);
  await harness.manager.disconnect('bot-1');
  assert.equal(harness.manager.bots.get('bot-1').status, 'DISCONNECTED');
});

test('collect_block is the only registered tool and progress requires an inventory delta', async () => {
  const harness = makeManager();
  const bot = await spawn(harness);
  const definitions = harness.manager.tools.definitions();
  assert.deepEqual(definitions.map((tool) => tool.function.name), ['collect_block']);
  await assert.rejects(harness.manager.command({ action: 'execute-tool', botId: 'bot-1', toolName: 'dig_anything', arguments: {} }), /أداة غير مسجلة/);
  await assert.rejects(harness.manager.command({ action: 'execute-tool', botId: 'bot-1', toolName: 'collect_block', arguments: { block_name: 'oak_log', amount: 1, extra: true } }), /مخطط/);
  await assert.rejects(harness.manager.command({ action: 'execute-tool', botId: 'bot-1', toolName: 'collect_block', arguments: { block_name: 'oak_log', amount: '1' } }), /عدد عناصر/);

  await harness.manager.command({ action: 'execute-tool', botId: 'bot-1', toolName: 'collect_block', arguments: { block_name: 'minecraft:oak_log', amount: 1 }, taskId: 'task-42' });
  assert.equal(bot.collectCalls, 1);
  const taskEvents = harness.events.filter((event) => event.type === 'task_state' && event.taskId === 'task-42');
  assert.equal(taskEvents[0].status, 'RUNNING');
  const completed = taskEvents.find((event) => event.status === 'COMPLETED');
  assert.equal(completed.progress, 100);
  assert.equal(completed.verifiedCollected, 1);
  assert.equal(completed.initialInventoryCount, 0);
  assert.equal(completed.verifiedBy, 'inventory-delta');
  assert.equal(harness.manager.bots.get('bot-1').task, null);
  assert.equal(harness.events.findLast((event) => event.type === 'bot_snapshot').inventory[0].count, 1);
});

test('collect does not record completion when Mineflayer inventory did not change', async () => {
  const harness = makeManager({ collect: async () => {} });
  await spawn(harness);
  await assert.rejects(
    harness.manager.command({ action: 'collect', botId: 'bot-1', blockName: 'oak_log', count: 1, taskId: 'no-drop' }),
    /لم يزد في المخزون/,
  );
  assert.equal(harness.events.some((event) => event.type === 'task_state' && event.status === 'COMPLETED'), false);
  assert.ok(harness.events.some((event) => event.type === 'task_state' && event.status === 'FAILED' && event.taskId === 'no-drop'));
});

test('missing player-slot data is reported as unavailable instead of fabricated as empty space', async () => {
  const harness = makeManager();
  const bot = await spawn(harness);
  bot.inventory = { items: () => [] };
  harness.manager.snapshot('bot-1', harness.manager.bots.get('bot-1'), true);
  const snapshot = harness.events.findLast((event) => event.type === 'bot_snapshot');
  assert.equal(snapshot.inventoryAvailable, false);
  assert.equal(snapshot.inventory, null);
  assert.equal(snapshot.inventorySlots, null);
  await assert.rejects(harness.manager.command({ action: 'collect', botId: 'bot-1', blockName: 'dirt', count: 1 }), /تعذر قراءة خانات/);
  assert.equal(bot.collectCalls, 0);
});

test('saved task progress resumes only when the current inventory satisfies its baseline', async () => {
  const harness = makeManager();
  const bot = await spawn(harness);
  bot.inventoryItems = [{ name: 'oak_log', displayName: 'Oak Log', count: 3, slot: 9, type: 17 }];
  bot.inventorySlots[9] = bot.inventoryItems[0];
  await harness.manager.command({
    action: 'execute-tool', botId: 'bot-1', toolName: 'collect_block', taskId: 'resume-ok',
    arguments: { block_name: 'oak_log', amount: 3 }, alreadyCollected: 1, initialInventoryCount: 2,
  });
  const complete = harness.events.findLast((event) => event.type === 'task_state' && event.taskId === 'resume-ok' && event.status === 'COMPLETED');
  assert.equal(complete.verifiedCollected, 3);
  assert.equal(complete.initialInventoryCount, 2);

  await assert.rejects(harness.manager.command({
    action: 'execute-tool', botId: 'bot-1', toolName: 'collect_block', taskId: 'resume-stale',
    arguments: { block_name: 'oak_log', amount: 3 }, alreadyCollected: 2, initialInventoryCount: 5,
  }), /المخزون الحالي أقل/);
  await assert.rejects(harness.manager.command({
    action: 'execute-tool', botId: 'bot-1', toolName: 'collect_block', taskId: 'resume-no-baseline',
    arguments: { block_name: 'oak_log', amount: 3 }, alreadyCollected: 1,
  }), /خط أساس/);
});

test('pause waits for the real collectBlock cancellation and resume starts from confirmed inventory', async () => {
  const harness = makeManager({ collect: (bot) => {
    if (bot.collectCalls === 1) return new Promise((resolve, reject) => { bot.cancelPending = reject; });
    return bot.collectOne();
  } });
  const bot = await spawn(harness);
  const collection = harness.manager.command({ action: 'collect', botId: 'bot-1', blockName: 'oak_log', count: 1, taskId: 'task-pause' });
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(harness.manager.command({ action: 'control', botId: 'bot-1', states: { forward: true } }), /مهمة جمع نشطة/);
  await harness.manager.pauseTask('bot-1', 'task-pause');
  assert.equal(harness.manager.bots.get('bot-1').task.paused, true);
  assert.equal(bot.cancelCalls, 1);
  await harness.manager.resumeTask('bot-1', 'task-pause');
  await collection;
  assert.equal(bot.collectCalls, 2);
  assert.ok(harness.events.some((event) => event.type === 'task_state' && event.status === 'PAUSED' && event.taskId === 'task-pause'));
  assert.ok(harness.events.some((event) => event.type === 'task_state' && event.status === 'RUNNING' && event.taskId === 'task-pause'));
});

test('cancel requests cancellation in Mineflayer and never leaves a live task behind', async () => {
  const harness = makeManager({ collect: (bot) => new Promise((resolve, reject) => { bot.cancelPending = reject; }) });
  const bot = await spawn(harness);
  const collection = harness.manager.command({ action: 'collect', botId: 'bot-1', blockName: 'oak_log', count: 2, taskId: 'task-cancel' });
  await new Promise((resolve) => setImmediate(resolve));
  await harness.manager.cancelTask('bot-1', 'task-cancel');
  await assert.rejects(collection, /ألغى المستخدم المهمة/);
  assert.equal(bot.cancelCalls, 1);
  assert.ok(harness.events.some((event) => event.type === 'task_state' && event.status === 'CANCELLED' && event.taskId === 'task-cancel'));
  assert.equal(harness.manager.bots.get('bot-1').task, null);
});

test('a permanent Minecraft kick fails and clears an active collection instead of leaving it paused', async () => {
  const harness = makeManager({ collect: (bot) => new Promise((resolve, reject) => { bot.cancelPending = reject; }) });
  const bot = await spawn(harness);
  const collection = harness.manager.command({ action: 'collect', botId: 'bot-1', blockName: 'oak_log', count: 1, taskId: 'task-kicked' });
  await new Promise((resolve) => setImmediate(resolve));
  bot.emit('kicked', 'Server kicked this session');
  bot.emit('end', 'Connection closed');
  await assert.rejects(collection, /Connection closed/);
  assert.equal(harness.manager.bots.get('bot-1').task, null);
  assert.ok(harness.events.some((event) => event.type === 'task_state' && event.status === 'FAILED' && event.taskId === 'task-kicked'));
});

test('a pause with an unconfirmed Mineflayer stop cannot be resumed', async () => {
  const harness = makeManager({ collect: (bot) => new Promise((resolve, reject) => { bot.cancelPending = reject; }) });
  const bot = await spawn(harness);
  const collection = harness.manager.command({ action: 'collect', botId: 'bot-1', blockName: 'oak_log', count: 1, taskId: 'pause-unconfirmed' });
  await new Promise((resolve) => setImmediate(resolve));
  const cancelTask = bot.collectBlock.cancelTask;
  bot.collectBlock.cancelTask = async () => { throw new Error('stop not confirmed'); };
  await assert.rejects(harness.manager.pauseTask('bot-1', 'pause-unconfirmed'), /stop not confirmed/);
  assert.equal(harness.manager.bots.get('bot-1').task.paused, true);
  await assert.rejects(harness.manager.resumeTask('bot-1', 'pause-unconfirmed'), /لم يؤكد محرك الجمع/);
  assert.equal(harness.manager.bots.get('bot-1').pauseReason, 'user');
  bot.collectBlock.cancelTask = cancelTask;
  await harness.manager.cancelTask('bot-1', 'pause-unconfirmed');
  await assert.rejects(collection, /ألغى المستخدم المهمة/);
});

test('survival behavior pauses and resumes only after observed recovery', async () => {
  const harness = makeManager();
  const bot = await spawn(harness);
  const state = harness.manager.bots.get('bot-1');
  state.task = { id: 'task-survival', type: 'collect', count: 1, blockName: 'oak_log', collected: 0, paused: false, cancelled: false, pausePromise: Promise.resolve() };
  bot.food = 7;
  harness.manager.behavior.onFood('bot-1');
  assert.equal(state.pauseReason, 'survival_food');
  assert.equal(state.task.paused, true);
  assert.ok(harness.events.some((event) => event.type === 'behavior' && event.priority === 'SURVIVAL'));
  bot.food = 12;
  harness.manager.behavior.onFood('bot-1');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state.pauseReason, '');
  assert.equal(state.task.paused, false);
  assert.ok(harness.events.some((event) => event.type === 'task_state' && event.status === 'RUNNING' && event.taskId === 'task-survival'));
});

test('user actions cannot override a survival pause or resume with unsafe vitals', async () => {
  const harness = makeManager();
  const bot = await spawn(harness);
  const state = harness.manager.bots.get('bot-1');
  state.task = { id: 'task-safety', type: 'collect', count: 1, blockName: 'oak_log', collected: 0, paused: true, cancelled: false, pausePromise: Promise.resolve() };
  state.pauseReason = 'survival_food';
  bot.food = 7;
  assert.throws(() => harness.manager.pauseTask('bot-1', 'task-safety'), /أولوية البقاء/);
  await assert.rejects(harness.manager.resumeTask('bot-1', 'task-safety'), /أولوية البقاء/);
  assert.equal(state.pauseReason, 'survival_food');
});

test('stale events from an older connection generation cannot replace the current bot', async () => {
  const harness = makeManager();
  const oldBot = await spawn(harness);
  const state = harness.manager.bots.get('bot-1');
  state.bot = null;
  state.status = 'DISCONNECTED';
  const result = harness.manager.startSession(state);
  assert.equal(result.accepted, true);
  const currentBot = harness.bot;
  oldBot.emit('login');
  oldBot.emit('death');
  oldBot.emit('chat', 'OtherPlayer', 'late message from old session');
  oldBot.emit('end', 'late old-session end event');
  assert.equal(state.bot, currentBot);
  assert.equal(state.status, 'CONNECTING');
  assert.equal(harness.events.some((event) => event.type === 'chat_received' && event.message === 'late message from old session'), false);
});

test('block targets verify the actual Minecraft drop, including ores and stone', async () => {
  const harness = makeManager();
  const bot = await spawn(harness);
  for (const [blockName, expectedItem] of [['stone', 'cobblestone'], ['coal_ore', 'coal'], ['iron_ore', 'raw_iron'], ['diamond_ore', 'diamond']]) {
    bot.block = { name: blockName, position: new Vec3(1, 64, 0), boundingBox: 'block' };
    await harness.manager.command({ action: 'collect', botId: 'bot-1', blockName: `minecraft:${blockName}`, count: 1, taskId: `collect-${blockName}` });
    assert.equal(bot.inventoryItems[0].name, expectedItem);
    const completed = harness.events.findLast((event) => event.type === 'task_state' && event.taskId === `collect-${blockName}` && event.status === 'COMPLETED');
    assert.equal(completed.verifiedCollected, 1);
    assert.equal(completed.outputItemName, expectedItem);
  }
  bot.block = { name: 'oak_leaves', position: new Vec3(1, 64, 0), boundingBox: 'block' };
  await assert.rejects(harness.manager.command({ action: 'collect', botId: 'bot-1', blockName: 'oak_leaves', count: 1 }), /إسقاطًا ثابتًا/);
  bot.block = { name: 'unknown_mod_block', position: new Vec3(1, 64, 0), boundingBox: 'block' };
  await assert.rejects(harness.manager.command({ action: 'collect', botId: 'bot-1', blockName: 'unknown_mod_block', count: 1 }), /غير موجودة/);
  assert.equal(harness.events.some((event) => event.type === 'task_state' && event.status === 'COMPLETED' && event.taskId === 'collect-oak_leaves'), false);
  harness.manager.bots.get('bot-1').status = 'JOINING';
  assert.throws(() => harness.manager.getActive('bot-1'), /Spawn الحقيقي/);
});

test('dirt x20 progresses only by the real mocked inventory delta for each block', async () => {
  const harness = makeManager();
  const bot = await spawn(harness);
  bot.block = { name: 'dirt', position: new Vec3(1, 64, 0), boundingBox: 'block' };
  const result = await harness.manager.command({ action: 'collect', botId: 'bot-1', blockName: 'minecraft:dirt', count: 20, taskId: 'dirt-20' });
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.verifiedCollected, 20);
  assert.equal(bot.collectCalls, 20);
  assert.equal(bot.inventoryItems[0].name, 'dirt');
  assert.equal(bot.inventoryItems[0].count, 20);
  const progress = harness.events.filter((event) => event.type === 'task_state' && event.taskId === 'dirt-20' && event.status === 'RUNNING');
  assert.ok(progress.some((event) => event.verifiedCollected === 12));
  assert.equal(harness.events.findLast((event) => event.type === 'task_state' && event.taskId === 'dirt-20').verifiedCollected, 20);
});

test('a full inventory pauses collection and can resume only after a real slot opens', async () => {
  const harness = makeManager();
  const bot = await spawn(harness);
  bot.block = { name: 'dirt', position: new Vec3(1, 64, 0), boundingBox: 'block' };
  for (let slot = 9; slot <= 44; slot++) bot.inventorySlots[slot] = { name: `stone_${slot}`, count: 64, slot };
  const inventoryFull = waitForEvent(harness.manager, (event) => event.type === 'task_state' && event.taskId === 'inventory-full' && event.status === 'INVENTORY_FULL');
  const run = harness.manager.command({ action: 'collect', botId: 'bot-1', blockName: 'dirt', count: 1, taskId: 'inventory-full' });
  await inventoryFull;
  assert.equal(bot.collectCalls, 0);
  await assert.rejects(harness.manager.resumeTask('bot-1', 'inventory-full'), /خانة فارغة/);
  bot.inventorySlots[44] = null;
  await harness.manager.resumeTask('bot-1', 'inventory-full');
  const result = await run;
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.verifiedCollected, 1);
  assert.equal(harness.manager.bots.get('bot-1').task, null);
});

test('transient disconnects are retryable, while explicit policy/auth kicks need user action', () => {
  assert.equal(isPermanentKick('You are not whitelisted on this server'), true);
  assert.equal(isPermanentKick('Outdated client'), true);
  assert.equal(isPermanentKick('Server is restarting'), false);
  assert.equal(isPermanentKick('read ECONNRESET'), false);
  assert.equal(isPermanentKick('socketClosed'), false);
});
