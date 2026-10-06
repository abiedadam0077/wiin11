'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Vec3 } = require('vec3');
const { BotManager } = require('../bot-manager');

class MockBot extends EventEmitter {
  constructor() {
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
    this.players = {};
    this.entities = {};
    this.inventory = { items: () => this.inventoryItems };
    this.controlStates = {};
    this.digCalls = 0;
    this.block = { name: 'oak_log', position: new Vec3(1, 64, 0) };
    this.pathfinder = {
      goals: [],
      setMovements() {},
      setGoal(goal) { this.goals.push(goal); },
      goto: async () => {},
    };
  }

  loadPlugin() {}
  setControlState(name, value) { this.controlStates[name] = value; }
  clearControlStates() { this.controlStates = {}; }
  findBlock() { return { name: this.block.name, position: this.block.position }; }
  blockAt() { return this.block; }
  canDigBlock() { return true; }
  async dig() {
    this.digCalls++;
    const count = this.inventoryItems.reduce((sum, item) => sum + item.count, 0) + 1;
    this.inventoryItems = [{ name: 'oak_log', displayName: 'Oak Log', count, slot: 9, type: 17 }];
  }
  quit() { this.emit('end', 'user disconnect'); }
  respawn() {}
}

function makeManager({ goto } = {}) {
  let bot;
  const events = [];
  class Movements { constructor() {} }
  class GoalGetToBlock { constructor(position) { this.position = position; } }
  const manager = new BotManager({
    mineflayer: { createBot: () => { bot = new MockBot(); if (goto) bot.pathfinder.goto = goto; return bot; } },
    pathfinder: { pathfinder() {}, Movements, goals: { GoalGetToBlock } },
    minecraftData: () => ({
      blocksByName: { oak_log: { id: 17 } },
      itemsByName: { oak_log: { id: 17 } },
    }),
    authCacheDir: null,
    autoEat: null,
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

test('a real session becomes ONLINE only after spawn and snapshot data is protocol-derived', async () => {
  const harness = makeManager();
  const bot = await spawn(harness);
  assert.equal(harness.manager.bots.get('bot-1').status, 'ONLINE');
  assert.ok(harness.events.some((event) => event.type === 'bot_state' && event.status === 'CONNECTING'));
  assert.ok(harness.events.some((event) => event.type === 'bot_state' && event.status === 'JOINING'));
  const snapshot = harness.events.findLast((event) => event.type === 'bot_snapshot');
  assert.equal(snapshot.status, 'ONLINE');
  assert.deepEqual(snapshot.position, { x: 0, y: 64, z: 0 });
  assert.deepEqual(snapshot.inventory, []);

  await harness.manager.command({ action: 'control', botId: 'bot-1', states: { forward: true } });
  assert.equal(bot.controlStates.forward, true);
  await harness.manager.disconnect('bot-1');
  assert.equal(harness.manager.bots.get('bot-1').status, 'DISCONNECTED');
});

test('collect progress is emitted only after inventory count increases', async () => {
  const harness = makeManager();
  const bot = await spawn(harness);
  await harness.manager.collect('bot-1', 'oak_log', 1, 'task-42');
  assert.equal(bot.digCalls, 1);
  const taskEvents = harness.events.filter((event) => event.type === 'task_state' && event.taskId === 'task-42');
  assert.equal(taskEvents[0].status, 'RUNNING');
  const completed = taskEvents.find((event) => event.status === 'COMPLETED');
  assert.equal(completed.progress, 100);
  assert.equal(completed.verifiedCollected, 1);
  assert.equal(completed.verifiedBy, 'inventory-delta');
  assert.equal(harness.manager.bots.get('bot-1').task, null);
});

test('pause, resume, and cancel remain independent task state transitions', async () => {
  let releaseGoto;
  const waitingForPathfinder = new Promise((resolve) => { releaseGoto = resolve; });
  const harness = makeManager({ goto: () => waitingForPathfinder });
  await spawn(harness);

  const collection = harness.manager.collect('bot-1', 'oak_log', 1, 'task-pause');
  await new Promise((resolve) => setImmediate(resolve));
  harness.manager.pauseTask('bot-1', 'task-pause');
  assert.equal(harness.manager.bots.get('bot-1').task.paused, true);
  harness.manager.resumeTask('bot-1', 'task-pause');
  assert.equal(harness.manager.bots.get('bot-1').task.paused, false);
  releaseGoto();
  await collection;
  assert.ok(harness.events.some((event) => event.type === 'task_state' && event.status === 'PAUSED'));
  assert.ok(harness.events.some((event) => event.type === 'task_state' && event.status === 'RUNNING'));

  let releaseSecondGoto;
  const secondWait = new Promise((resolve) => { releaseSecondGoto = resolve; });
  harness.bot.pathfinder.goto = () => secondWait;
  const cancelled = harness.manager.collect('bot-1', 'oak_log', 2, 'task-cancel');
  await new Promise((resolve) => setImmediate(resolve));
  harness.manager.cancelTask('bot-1', 'task-cancel');
  releaseSecondGoto();
  await assert.rejects(cancelled, /ألغى المستخدم المهمة/);
  assert.ok(harness.events.some((event) => event.type === 'task_state' && event.status === 'CANCELLED' && event.taskId === 'task-cancel'));
  assert.equal(harness.manager.bots.get('bot-1').task, null);
});

test('survival behavior pauses on low food and resumes only after observed recovery', async () => {
  const harness = makeManager();
  const bot = await spawn(harness);
  const state = harness.manager.bots.get('bot-1');
  state.task = { id: 'task-survival', paused: false };
  bot.food = 7;
  harness.manager.behavior.onFood('bot-1');
  assert.equal(state.pauseReason, 'survival_food');
  assert.equal(state.task.paused, true);
  assert.ok(harness.events.some((event) => event.type === 'behavior' && event.priority === 'SURVIVAL'));
  bot.food = 12;
  harness.manager.behavior.onFood('bot-1');
  assert.equal(state.pauseReason, '');
  assert.equal(state.task.paused, false);
  assert.ok(harness.events.some((event) => event.type === 'task_state' && event.status === 'RUNNING' && event.taskId === 'task-survival'));
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

test('collection rejects unsupported blocks and does not emit completed progress', async () => {
  const harness = makeManager();
  await spawn(harness);
  await assert.rejects(harness.manager.collect('bot-1', 'diamond_ore', 1, 'unsupported'), /تدعم مهمة الجمع/);
  assert.equal(harness.events.some((event) => event.type === 'task_state' && event.status === 'COMPLETED'), false);
});
