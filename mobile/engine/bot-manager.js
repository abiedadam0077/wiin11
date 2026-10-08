'use strict';

const { EventEmitter } = require('node:events');
const { Vec3 } = require('vec3');
const { BehaviorEngine } = require('./behavior-engine');
const { TaskEngine } = require('./task-engine');
const { ToolRegistry } = require('./tool-registry');

const CONTROL_STATES = new Set(['forward', 'back', 'left', 'right', 'jump', 'sneak', 'sprint']);
const AUTH_MODES = new Set(['offline', 'microsoft']);
const VERSION_PATTERN = /^(auto|1\.(?:8|9|10|11|12|13|14|15|16|17|18|19|20|21)(?:\.\d{1,2})?)$/;
const HOST_PATTERN = /^[a-zA-Z0-9._:-]+$/;
const MAX_DISTANCE = 6;

function validateBotConfig(input) {
  if (!input || typeof input !== 'object') throw new TypeError('إعداد اتصال البوت غير صالح.');
  const host = String(input.host || '').trim();
  const port = Number(input.port);
  const username = String(input.username || '').trim();
  const version = String(input.version || 'auto').trim();
  const auth = String(input.auth || 'offline').trim().toLowerCase();
  if (!host || host.length > 253 || !HOST_PATTERN.test(host)) throw new TypeError('عنوان السيرفر غير صالح.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new TypeError('منفذ السيرفر يجب أن يكون بين 1 و65535.');
  if (!AUTH_MODES.has(auth)) throw new TypeError('طريقة المصادقة يجب أن تكون offline أو microsoft.');
  if (auth === 'offline' && !/^[A-Za-z0-9_]{3,16}$/.test(username)) throw new TypeError('اسم مستخدم Offline يجب أن يكون من 3 إلى 16 حرفًا أو رقمًا أو _.');
  if (auth === 'microsoft' && (!username || username.length > 254 || /\s/.test(username))) throw new TypeError('أدخل معرّف حساب Microsoft دون مسافات؛ لن نطلب كلمة المرور.');
  if (!VERSION_PATTERN.test(version)) throw new TypeError('الإصدار يجب أن يكون auto أو إصدار Minecraft Java صالحًا.');
  return { host, port, username, version: version === 'auto' ? false : version, auth, reconnect: input.reconnect !== false, autoEat: input.autoEat !== false, autoRespawn: input.autoRespawn === true };
}

function safeError(error) {
  const text = String(error?.message || error || 'تعذر الاتصال بالسيرفر.')
    .replace(/(access[_ -]?token|refresh[_ -]?token|client[_ -]?token|authorization|bearer)\s*[:=]?\s*[^\s,;]+/ig, '$1=[مخفي]')
    .replace(/sk-or-[^\s"'<>]+/g, '[مفتاح مخفي]')
    .replace(/[\r\n\u0000-\u001f]/g, ' ')
    .trim();
  return text.slice(0, 320) || 'تعذر الاتصال بالسيرفر.';
}

function finitePosition(position) {
  if (!position || ![position.x, position.y, position.z].every(Number.isFinite)) return null;
  return { x: Number(position.x), y: Number(position.y), z: Number(position.z) };
}

function isPermanentKick(reason) {
  let text = '';
  try { text = typeof reason === 'string' ? reason : JSON.stringify(reason); }
  catch { text = String(reason || ''); }
  return /whitelist|not\s+white.?listed|ban(?:ned)?|invalid\s+(?:session|token|credentials)|authentication\s+(?:failed|error)|failed\s+to\s+verify|outdated\s+(?:client|server)|incompatible\s+(?:client|server)|unsupported\s+protocol|premium\s+account|required|already\s+connected|duplicate\s+login/i.test(text);
}

class BotManager extends EventEmitter {
  constructor({ mineflayer, pathfinder, minecraftData, authCacheDir, autoEat, collectBlock }) {
    super();
    this.mineflayer = mineflayer;
    this.pathfinder = pathfinder;
    this.minecraftData = minecraftData;
    this.authCacheDir = authCacheDir;
    this.autoEat = autoEat;
    this.collectBlock = collectBlock;
    this.bots = new Map();
    this.taskEngine = new TaskEngine(this);
    this.tools = new ToolRegistry(this.taskEngine);
    this.behavior = new BehaviorEngine(this);
  }

  emitEvent(type, botId, data = {}) {
    this.emit('event', { type, botId, at: Date.now(), ...data });
  }

  safeError(error) {
    return safeError(error);
  }

  async connect(botId, rawConfig) {
    const id = String(botId || '');
    if (!id || id.length > 128) throw new TypeError('معرّف البوت غير صالح.');
    const existing = this.bots.get(id);
    if (existing && !['DISCONNECTED', 'FAILED'].includes(existing.status)) throw new Error('ملف البوت لديه جلسة نشطة بالفعل.');
    const config = validateBotConfig(rawConfig);
    const state = {
      id,
      config,
      bot: null,
      status: 'DISCONNECTED',
      lastSnapshotAt: 0,
      lastError: '',
      task: null,
      pauseReason: '',
      reconnectEnabled: config.reconnect,
      spawnedAt: 0,
      reconnectAttempt: 0,
      reconnectTimer: null,
      userStopped: false,
      permanentKick: false,
      sessionGeneration: 0,
    };
    this.bots.set(id, state);
    state.userStopped = false;
    return this.startSession(state);
  }

  startSession(state) {
    const botId = state.id;
    state.status = state.config.auth === 'microsoft' ? 'AUTHENTICATING' : 'CONNECTING';
    state.permanentKick = false;
    state.spawnedAt = 0;
    const generation = ++state.sessionGeneration;
    this.emitEvent('bot_state', botId, {
      status: state.status,
      detail: state.config.auth === 'microsoft' ? 'بدء مصادقة Microsoft الرسمية.' : 'بدء اتصال Minecraft الحقيقي.',
    });
    try {
      const options = {
        host: state.config.host,
        port: state.config.port,
        username: state.config.username,
        auth: state.config.auth,
        hideErrors: true,
        viewDistance: 2,
        checkTimeoutInterval: 30_000,
        skipValidation: false,
        onMsaCode: (data) => {
          if (generation !== state.sessionGeneration) return;
          state.status = 'AUTHENTICATING';
          this.emitEvent('bot_state', botId, { status: 'AUTHENTICATING', detail: 'أدخل رمز الجهاز في صفحة Microsoft الرسمية.' });
          this.emitEvent('auth_code', botId, {
            verificationUri: String(data?.verification_uri || ''),
            userCode: String(data?.user_code || ''),
            expiresAt: Date.now() + Math.max(0, Number(data?.expires_in || 0)) * 1000,
          });
        },
      };
      if (state.config.version) options.version = state.config.version;
      if (this.authCacheDir) options.profilesFolder = this.authCacheDir;
      const bot = this.mineflayer.createBot(options);
      state.bot = bot;
      bot.loadPlugin(this.pathfinder.pathfinder);
      if (this.autoEat) bot.loadPlugin(this.autoEat);
      if (this.collectBlock) bot.loadPlugin(this.collectBlock);
      this.attach(botId, state, generation);
      return { accepted: true, status: state.status };
    } catch (error) {
      state.status = 'FAILED';
      state.lastError = safeError(error);
      this.emitEvent('bot_state', botId, { status: 'FAILED', reason: state.lastError });
      throw error;
    }
  }

  attach(botId, state, generation) {
    const bot = state.bot;
    let mcData = null;
    let movements = null;
    const isCurrentSession = () => generation === state.sessionGeneration && state.bot === bot;
    bot.on('login', () => {
      if (!isCurrentSession()) return;
      state.status = 'JOINING';
      this.emitEvent('bot_state', botId, { status: 'JOINING', detail: 'قبل Minecraft جلسة Login؛ ننتظر حزمة Spawn قبل تأكيد الدخول إلى العالم.' });
    });
    bot.once('spawn', () => {
      if (!isCurrentSession()) return;
      state.status = 'ONLINE';
      state.spawnedAt = Date.now();
      if (state.pauseReason === 'disconnected' && !state.task) state.pauseReason = '';
      if (state.stableTimer) clearTimeout(state.stableTimer);
      state.stableTimer = setTimeout(() => {
        if (generation === state.sessionGeneration && state.status === 'ONLINE') state.reconnectAttempt = 0;
      }, 60_000);
      state.stableTimer.unref?.();
      mcData = this.minecraftData(bot.version);
      movements = new this.pathfinder.Movements(bot, mcData);
      movements.canDig = true;
      movements.allow1by1towers = false;
      movements.allowParkour = false;
      movements.entityCost = 2;
      movements.allowFreeMotion = false;
      bot.pathfinder.setMovements(movements);
      if (state.config.autoEat && bot.autoEat?.setOpts && typeof bot.autoEat.enableAuto === 'function') {
        bot.autoEat.setOpts({ priority: 'saturation', minHunger: 8, minHealth: 8, returnToLastItem: true, bannedFood: ['rotten_flesh', 'pufferfish', 'poisonous_potato', 'spider_eye'] });
        bot.autoEat.enableAuto();
        bot.autoEat.on?.('eatStart', (data) => { if (isCurrentSession()) this.emitEvent('behavior', botId, { priority: 'SURVIVAL', action: 'EAT_STARTED', item: String(data?.food?.name || '').slice(0, 64) }); });
        bot.autoEat.on?.('eatFail', (error) => { if (isCurrentSession()) this.emitEvent('behavior', botId, { priority: 'SURVIVAL', action: 'EAT_FAILED', reason: safeError(error) }); });
      }
      this.emitEvent('bot_state', botId, { status: 'ONLINE', detail: 'وصلت حزمة Spawn من العالم؛ دخول البوت تأكد فعليًا.' });
      this.snapshot(botId, state, true);
      this.emitEvent('world', botId, {
        version: bot.version,
        dimension: bot.game?.dimension || null,
        gameMode: bot.game?.gameMode || null,
        difficulty: bot.game?.difficulty ?? null,
        entityId: bot.entity?.id ?? null,
      });
      this.behavior.onConnectionRestored(botId);
    });
    bot.on('health', () => {
      if (!isCurrentSession()) return;
      this.snapshot(botId, state, true);
      this.behavior.onFood(botId);
    });
    bot.on('food', () => {
      if (!isCurrentSession()) return;
      this.snapshot(botId, state, true);
      this.behavior.onFood(botId);
    });
    bot.on('death', () => {
      if (!isCurrentSession()) return;
      state.status = 'DEAD';
      this.emitEvent('bot_state', botId, { status: 'DEAD', detail: 'أبلغ Minecraft عن موت الكيان.' });
      this.behavior.onDeath(botId);
    });
    bot.on('respawn', () => {
      if (!isCurrentSession()) return;
      state.status = 'ONLINE';
      state.spawnedAt = Date.now();
      this.emitEvent('bot_state', botId, { status: 'ONLINE', detail: 'أبلغ Minecraft عن إعادة الظهور داخل العالم.' });
      this.snapshot(botId, state, true);
      this.behavior.onRespawn(botId);
    });
    bot.on('chat', (username, message) => {
      if (!isCurrentSession() || username === bot.username) return;
      this.emitEvent('chat_received', botId, { username: String(username || '').slice(0, 32), message: String(message || '').slice(0, 500) });
    });
    bot.on('playerJoined', (player) => { if (isCurrentSession()) this.emitEvent('player', botId, { event: 'joined', username: String(player?.username || '').slice(0, 32) }); });
    bot.on('playerLeft', (player) => { if (isCurrentSession()) this.emitEvent('player', botId, { event: 'left', username: String(player?.username || '').slice(0, 32) }); });
    bot.on('entitySpawn', (entity) => {
      if (isCurrentSession() && entity?.type && entity.type !== 'player') this.emitEvent('entity', botId, { event: 'spawn', entity: this.entityRecord(entity) });
    });
    bot.on('entityGone', (entity) => {
      if (isCurrentSession() && entity?.type && entity.type !== 'player') this.emitEvent('entity', botId, { event: 'gone', entityId: entity.id });
    });
    bot.on('windowOpen', (window) => { if (isCurrentSession()) this.emitEvent('window', botId, { event: 'open', title: String(window?.title || '').slice(0, 120), slotCount: Number(window?.slots?.length || 0) }); });
    bot.on('windowClose', () => { if (isCurrentSession()) this.emitEvent('window', botId, { event: 'close' }); });
    bot.on('kicked', (reason) => {
      if (!isCurrentSession()) return;
      state.lastError = safeError(typeof reason === 'string' ? reason : JSON.stringify(reason));
      state.permanentKick = isPermanentKick(reason);
      state.status = state.permanentKick ? 'FAILED' : 'RECONNECTING';
      this.emitEvent('bot_state', botId, {
        status: state.status,
        reason: state.lastError,
        detail: state.permanentKick ? 'رفض Minecraft الجلسة بسبب سبب يحتاج تدخل المستخدم.' : 'أغلق Minecraft الجلسة؛ ستبدأ إعادة اتصال متدرجة بعد حدث end.',
        retryable: !state.permanentKick,
        kickReason: true,
      });
    });
    bot.on('error', (error) => {
      if (!isCurrentSession()) return;
      state.lastError = safeError(error);
      this.emitEvent('bot_error', botId, { reason: state.lastError });
      if (['CONNECTING', 'AUTHENTICATING', 'JOINING'].includes(state.status)) {
        state.status = 'FAILED';
        this.emitEvent('bot_state', botId, { status: 'FAILED', reason: state.lastError, retryable: !state.permanentKick });
      }
    });
    bot.on('end', (reason) => {
      if (!isCurrentSession()) return;
      const previous = state.status;
      state.bot = null;
      state.lastError = safeError(reason || state.lastError || 'انتهت جلسة Minecraft.');
      if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
      if (state.stableTimer) clearTimeout(state.stableTimer);
      if (previous === 'ONLINE' || previous === 'DEAD' || state.task) this.behavior.onDisconnected(botId);
      if (state.userStopped || state.permanentKick || !state.reconnectEnabled) {
        state.status = state.permanentKick ? 'FAILED' : 'DISCONNECTED';
        this.emitEvent('bot_state', botId, { status: state.status, reason: state.lastError, retryable: false });
      } else {
        this.scheduleReconnect(state);
      }
    });
    bot.on('physicsTick', () => { if (isCurrentSession()) this.snapshot(botId, state, false); });
    this.emitEvent('auth', botId, { mode: state.config.auth, username: state.config.username });
    if (movements) bot.pathfinder.setMovements(movements);
  }

  scheduleReconnect(state) {
    if (state.userStopped || state.permanentKick || !state.reconnectEnabled) {
      state.status = state.permanentKick ? 'FAILED' : 'DISCONNECTED';
      this.emitEvent('bot_state', state.id, { status: state.status, reason: state.lastError, retryable: false });
      return;
    }
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    const delayMs = Math.min(300_000, 5_000 * (2 ** Math.min(state.reconnectAttempt, 6)));
    const attempt = ++state.reconnectAttempt;
    state.status = 'RECONNECTING';
    const retryAt = Date.now() + delayMs;
    this.emitEvent('bot_state', state.id, { status: 'RECONNECTING', reason: state.lastError, attempt, retryAt, retryable: true });
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      if (state.userStopped || state.permanentKick) return;
      try { this.startSession(state); }
      catch (error) {
        state.lastError = safeError(error);
        this.scheduleReconnect(state);
      }
    }, delayMs);
    state.reconnectTimer.unref?.();
  }

  entityRecord(entity) {
    const position = finitePosition(entity?.position);
    if (!position) return null;
    return {
      id: Number(entity.id),
      name: String(entity.name || entity.username || entity.mobType || entity.type || 'entity').slice(0, 48),
      kind: String(entity.type || 'unknown').slice(0, 24),
      username: entity.username ? String(entity.username).slice(0, 32) : null,
      position,
      health: Number.isFinite(entity.health) ? Number(entity.health) : null,
    };
  }

  snapshot(botId, state, force) {
    const bot = state.bot;
    if (!bot || state.status !== 'ONLINE') return;
    const now = Date.now();
    if (!force && now - state.lastSnapshotAt < 2500) return;
    state.lastSnapshotAt = now;
    const position = finitePosition(bot.entity?.position);
    const mcData = this.minecraftData(bot.version);
    const inventoryAvailable = Array.isArray(bot.inventory?.slots) && typeof bot.inventory?.items === 'function';
    const inventory = inventoryAvailable ? bot.inventory.items().map((item) => ({
      name: String(item.name || 'unknown'),
      displayName: String(item.displayName || mcData.itemsByName?.[item.name]?.displayName || item.name || 'unknown').slice(0, 80),
      count: Number(item.count) || 0,
      slot: Number(item.slot),
      type: Number(item.type),
      maxStackSize: Number(mcData.itemsByName?.[item.name]?.stackSize) || 64,
    })) : null;
    const inventorySlots = inventoryAvailable ? Array.from({ length: 36 }, (_, index) => {
      const slot = index + 9;
      const item = bot.inventory?.slots?.[slot];
      return item ? {
        slot,
        name: String(item.name || 'unknown'),
        displayName: String(item.displayName || mcData.itemsByName?.[item.name]?.displayName || item.name || 'unknown').slice(0, 48),
        count: Number(item.count) || 0,
        type: Number(item.type),
        maxStackSize: Number(mcData.itemsByName?.[item.name]?.stackSize) || 64,
      } : { slot, name: null, displayName: null, count: 0, type: null, maxStackSize: null };
    }) : null;
    const equipmentSlots = inventoryAvailable ? [5, 6, 7, 8, 45].map((slot) => {
      const item = bot.inventory?.slots?.[slot];
      return item ? {
        slot,
        name: String(item.name || 'unknown'),
        displayName: String(item.displayName || mcData.itemsByName?.[item.name]?.displayName || item.name || 'unknown').slice(0, 48),
        count: Number(item.count) || 0,
        type: Number(item.type),
        maxStackSize: Number(mcData.itemsByName?.[item.name]?.stackSize) || 64,
      } : { slot, name: null, displayName: null, count: 0, type: null, maxStackSize: null };
    }) : null;
    const players = Object.values(bot.players || {}).map((player) => ({
      username: String(player.username || '').slice(0, 32),
      position: finitePosition(player.entity?.position),
      ping: Number.isFinite(player.ping) ? Number(player.ping) : null,
    }));
    const entities = Object.values(bot.entities || {})
      .filter((entity) => entity && entity.id !== bot.entity?.id && entity.position && bot.entity?.position?.distanceTo(entity.position) <= 48)
      .slice(0, 150)
      .map((entity) => this.entityRecord(entity))
      .filter(Boolean);
    let lookTarget = null;
    try {
      const lookedAt = bot.blockAtCursor?.(12);
      if (lookedAt?.name && lookedAt.position) {
        lookTarget = {
          kind: 'block',
          name: `minecraft:${String(lookedAt.name)}`,
          position: finitePosition(lookedAt.position),
          distance: Number.isFinite(lookedAt.position.distanceTo?.(bot.entity.position))
            ? Number(lookedAt.position.distanceTo(bot.entity.position)) : null,
        };
      } else {
        const entity = bot.entityAtCursor?.(12);
        if (entity?.position) lookTarget = {
          kind: entity.username ? 'player' : 'entity',
          name: String(entity.username || entity.name || entity.type || 'entity').slice(0, 48),
          position: finitePosition(entity.position),
          distance: Number.isFinite(entity.position.distanceTo?.(bot.entity.position))
            ? Number(entity.position.distanceTo(bot.entity.position)) : null,
        };
      }
    } catch { /* A missing or unloaded ray target is represented as null, not guessed. */ }
    this.emitEvent('bot_snapshot', botId, {
      status: state.status,
      version: String(bot.version || ''),
      health: Number.isFinite(bot.health) ? Number(bot.health) : null,
      food: Number.isFinite(bot.food) ? Number(bot.food) : null,
      saturation: Number.isFinite(bot.foodSaturation) ? Number(bot.foodSaturation) : null,
      oxygen: Number.isFinite(bot.oxygenLevel) ? Number(bot.oxygenLevel) : null,
      position,
      yaw: Number.isFinite(bot.entity?.yaw) ? Number(bot.entity.yaw) : null,
      pitch: Number.isFinite(bot.entity?.pitch) ? Number(bot.entity.pitch) : null,
      lookTarget,
      dimension: bot.game?.dimension || null,
      gameMode: bot.game?.gameMode || null,
      difficulty: bot.game?.difficulty ?? null,
      pingMs: Number.isFinite(bot.players?.[bot.username]?.ping) ? Number(bot.players[bot.username].ping) : null,
      onlineSince: state.spawnedAt || null,
      uptimeMs: state.spawnedAt > 0 ? Math.max(0, now - state.spawnedAt) : null,
      inventoryAvailable,
      inventory,
      inventorySlots,
      equipmentSlots,
      selectedHotbarSlot: Number.isInteger(bot.quickBarSlot) && bot.quickBarSlot >= 0 && bot.quickBarSlot <= 8 ? bot.quickBarSlot : null,
      currentTask: state.task ? {
        id: state.task.id,
        type: state.task.type,
        blockName: state.task.namespacedBlockName || `minecraft:${state.task.blockName}`,
        outputItemName: state.task.outputItemName,
        count: state.task.count,
        verifiedCollected: state.task.collected,
        progress: Math.floor((state.task.collected / state.task.count) * 100),
        status: state.task.stage === 'INVENTORY_FULL' ? 'INVENTORY_FULL' : state.task.paused ? 'PAUSED' : 'RUNNING',
        stage: state.task.stage || 'RUNNING',
        startedAt: state.task.startedAt || null,
        durationMs: state.task.startedAt ? Math.max(0, now - state.task.startedAt) : null,
        currentAction: state.task.currentAction || null,
      } : null,
      players,
      entities: entities.slice(0, 60),
      observedAt: now,
    });
  }

  observeNearbyBlocks(botId) {
    const { bot } = this.getActive(botId);
    const blocks = bot.findBlocks({
      matching: (block) => Boolean(block && block.name !== 'air' && block.boundingBox !== 'empty'),
      maxDistance: 8,
      count: 36,
    }).map((position) => {
      const block = bot.blockAt(position);
      return block ? { name: String(block.name), position: finitePosition(position) } : null;
    }).filter(Boolean);
    const result = { position: finitePosition(bot.entity?.position), blocks, observedAt: Date.now() };
    this.emitEvent('nearby_blocks', botId, result);
    return result;
  }

  getActive(botId) {
    const state = this.bots.get(String(botId));
    if (!state?.bot || state.status !== 'ONLINE') throw new Error('لا توجد جلسة داخل عالم Minecraft؛ انتظر تأكيد Spawn الحقيقي.');
    return state;
  }

  ensureTaskIdle(state) {
    if (state?.task) throw new Error('هناك مهمة جمع نشطة لهذا البوت؛ أوقفها أو ألغها قبل تنفيذ حركة أو تعدين يدوي.');
  }

  async command(message) {
    const botId = String(message.botId || '');
    switch (message.action) {
      case 'connect': return this.connect(botId, message.config);
      case 'disconnect': return this.disconnect(botId);
      case 'chat': return this.chat(botId, message.text);
      case 'look': return this.look(botId, message.yaw, message.pitch);
      case 'control': return this.control(botId, message.states);
      case 'follow': return this.follow(botId, message.username, message.distance);
      case 'goto': return this.goto(botId, message.position, message.radius);
      case 'stop-navigation': return this.stopNavigation(botId);
      case 'dig': return this.dig(botId, message.position);
      case 'use-item': return this.useItem(botId);
      case 'interact-block': return this.interactBlock(botId, message.position);
      case 'respawn': return this.respawn(botId);
      case 'collect': return this.tools.execute('collect_block', { block_name: message.blockName, amount: message.count }, { botId, taskId: message.taskId, alreadyCollected: message.alreadyCollected || 0, initialInventoryCount: message.initialInventoryCount });
      case 'execute-tool': return this.tools.execute(message.toolName, message.arguments, { botId, taskId: message.taskId, alreadyCollected: message.alreadyCollected || 0, initialInventoryCount: message.initialInventoryCount });
      case 'observe-nearby-blocks': return this.observeNearbyBlocks(botId);
      case 'pause-task': return this.pauseTask(botId, message.taskId);
      case 'resume-task': return this.resumeTask(botId, message.taskId);
      case 'cancel-task': return this.cancelTask(botId, message.taskId);
      default: throw new TypeError('أمر Minecraft غير مدعوم.');
    }
  }

  async disconnect(botId) {
    const state = this.bots.get(String(botId));
    if (!state) return;
    state.userStopped = true;
    state.pauseReason = 'user';
    if (state.reconnectTimer) { clearTimeout(state.reconnectTimer); state.reconnectTimer = null; }
    if (state.task) {
      try { await this.taskEngine.cancel(state, 'أوقف المستخدم جلسة Minecraft؛ أُلغيت المهمة ولم نكملها.'); }
      catch { /* Disconnect remains authoritative; task state is still recorded as cancelled when possible. */ }
      state.pauseReason = 'user';
    }
    if (state.bot) state.bot.quit('Disconnected by MineBot AI user');
    else {
      state.status = 'DISCONNECTED';
      this.emitEvent('bot_state', state.id, { status: 'DISCONNECTED', detail: 'تم الإيقاف من المستخدم.' });
    }
  }

  chat(botId, rawText) {
    const state = this.getActive(botId);
    const text = String(rawText || '').trim();
    if (!text || text.length > 256 || /[\r\n\u0000-\u001f]/.test(text)) throw new TypeError('رسالة Minecraft فارغة أو أطول من المسموح.');
    state.bot.chat(text);
    this.emitEvent('chat_sent', botId, { message: text, at: Date.now() });
  }

  async look(botId, rawYaw, rawPitch) {
    const { bot } = this.getActive(botId);
    const yaw = Number(rawYaw);
    const pitch = Number(rawPitch);
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) throw new TypeError('زاوية النظر غير صالحة.');
    await bot.look(yaw * Math.PI / 180, Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch * Math.PI / 180)), true);
  }

  control(botId, rawStates) {
    const state = this.getActive(botId);
    this.ensureTaskIdle(state);
    const { bot } = state;
    if (!rawStates || typeof rawStates !== 'object' || Array.isArray(rawStates)) throw new TypeError('حالات الحركة غير صالحة.');
    for (const name of Object.keys(rawStates)) {
      if (!CONTROL_STATES.has(name)) throw new TypeError(`حالة حركة غير مسموحة: ${name}.`);
      bot.setControlState(name, Boolean(rawStates[name]));
    }
  }

  async follow(botId, username, rawDistance = 2) {
    const state = this.getActive(botId);
    this.ensureTaskIdle(state);
    const { bot } = state;
    const targetName = String(username || '').trim();
    const target = bot.players?.[targetName]?.entity;
    if (!target) throw new Error('اللاعب غير ظاهر في قائمة Minecraft الحالية.');
    const distance = Number(rawDistance);
    if (!Number.isFinite(distance) || distance < 1 || distance > 8) throw new TypeError('مسافة المتابعة يجب أن تكون بين 1 و8 كتل.');
    bot.pathfinder.setGoal(new this.pathfinder.goals.GoalFollow(target, distance), true);
  }

  async goto(botId, rawPosition, rawRadius = 1) {
    const state = this.getActive(botId);
    this.ensureTaskIdle(state);
    const { bot } = state;
    const position = rawPosition || {};
    const x = Number(position.x), y = Number(position.y), z = Number(position.z);
    const radius = Number(rawRadius);
    if (![x, y, z].every(Number.isSafeInteger) || Math.abs(x) > 30_000_000 || Math.abs(z) > 30_000_000 || y < -2048 || y > 2048) throw new TypeError('إحداثيات الهدف غير صالحة.');
    if (!Number.isFinite(radius) || radius < 0 || radius > 16) throw new TypeError('نصف قطر الهدف غير صالح.');
    bot.pathfinder.setGoal(new this.pathfinder.goals.GoalNear(x, y, z, radius), false);
  }

  async stopNavigation(botId) {
    const state = this.getActive(botId);
    if (state.task) {
      if (state.task.paused) return;
      return this.pauseTask(botId, state.task.id);
    }
    const { bot } = state;
    bot.pathfinder.setGoal(null);
    bot.clearControlStates();
  }

  async dig(botId, rawPosition) {
    const state = this.getActive(botId);
    this.ensureTaskIdle(state);
    const { bot } = state;
    const position = rawPosition || {};
    const coords = [Number(position.x), Number(position.y), Number(position.z)];
    if (!coords.every(Number.isSafeInteger)) throw new TypeError('إحداثيات الكتلة غير صالحة.');
    const target = new Vec3(...coords);
    if (bot.entity.position.distanceTo(target) > MAX_DISTANCE) throw new Error('الكتلة خارج نطاق التفاعل الآمن.');
    const block = bot.blockAt(target);
    if (!block || block.name === 'air' || !bot.canDigBlock(block)) throw new Error('لا توجد كتلة قابلة للتعدين في هذا الموضع.');
    await bot.dig(block, true);
    this.snapshot(botId, this.bots.get(botId), true);
  }

  async useItem(botId) {
    const state = this.getActive(botId);
    this.ensureTaskIdle(state);
    const { bot } = state;
    if (!bot.heldItem) throw new Error('لا يوجد عنصر ممسوك بيد البوت.');
    bot.activateItem();
  }

  async interactBlock(botId, rawPosition) {
    const state = this.getActive(botId);
    this.ensureTaskIdle(state);
    const { bot } = state;
    const position = rawPosition || {};
    const coords = [Number(position.x), Number(position.y), Number(position.z)];
    if (!coords.every(Number.isSafeInteger)) throw new TypeError('إحداثيات الكتلة غير صالحة.');
    const target = new Vec3(...coords);
    if (bot.entity.position.distanceTo(target) > MAX_DISTANCE) throw new Error('الكتلة خارج نطاق التفاعل.');
    const block = bot.blockAt(target);
    if (!block || block.name === 'air') throw new Error('لا توجد كتلة Minecraft معروفة في هذا الموضع.');
    await bot.activateBlock(block);
  }

  async respawn(botId) {
    const state = this.bots.get(String(botId));
    if (!state?.bot || state.status !== 'DEAD') throw new Error('البوت ليس في حالة موت مرصودة.');
    state.bot.respawn();
  }

  pauseTask(botId, taskId) {
    const state = this.bots.get(String(botId));
    if (!state?.task || (taskId && state.task.id !== taskId)) throw new Error('لا توجد مهمة حية مطابقة لهذا المعرّف.');
    if (state.pauseReason && state.pauseReason !== 'user') throw new Error('المهمة متوقفة بأولوية البقاء أو الاتصال؛ لا يمكن استبدال سبب التوقف يدويًا.');
    return this.taskEngine.pause(state, 'user', 'أوقف المستخدم المهمة مؤقتًا.');
  }

  resumeTask(botId, taskId) {
    const state = this.bots.get(String(botId));
    if (!state?.task || (taskId && state.task.id !== taskId)) throw new Error('لا توجد مهمة متوقفة مطابقة لهذا المعرّف.');
    return this.taskEngine.resume(state, 'استأنف المستخدم المهمة بعد إيقاف الجمع الجاري بأمان.');
  }

  cancelTask(botId, taskId) {
    const state = this.bots.get(String(botId));
    if (!state?.task || (taskId && state.task.id !== taskId)) throw new Error('لا توجد مهمة حية مطابقة لهذا المعرّف.');
    return this.taskEngine.cancel(state, 'ألغى المستخدم المهمة.');
  }

}

module.exports = { BotManager, CONTROL_STATES, AUTH_MODES, validateBotConfig, safeError, finitePosition, isPermanentKick };
