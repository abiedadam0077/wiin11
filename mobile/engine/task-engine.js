'use strict';

const MAX_BLOCK_DISTANCE = 48;
const MAX_TARGET_COUNT = 320;

function validateCollect(blockName, amount, initialCollected = 0) {
  const rawBlockName = String(blockName || '').trim().toLowerCase();
  const match = /^(?:minecraft:)?([a-z0-9_]{1,64})$/.exec(rawBlockName);
  const requested = Number(amount);
  const alreadyCollected = Number(initialCollected);
  if (!match) throw new TypeError('أدخل معرف كتلة Minecraft صالحًا مثل minecraft:dirt.');
  if (!Number.isInteger(requested) || requested < 1 || requested > MAX_TARGET_COUNT) throw new TypeError('العدد المطلوب يجب أن يكون بين 1 و320.');
  if (!Number.isInteger(alreadyCollected) || alreadyCollected < 0 || alreadyCollected > requested) throw new TypeError('التقدم المؤكد المحفوظ غير صالح.');
  return { blockName: match[1], namespacedBlockName: `minecraft:${match[1]}`, count: requested, alreadyCollected };
}

function resolveExpectedDrop(blockName, mcData) {
  const block = mcData?.blocksByName?.[blockName];
  if (!block) throw new TypeError(`الكتلة minecraft:${blockName} غير موجودة في بيانات إصدار Minecraft المتصل.`);
  const dropIds = Array.isArray(block.drops) ? [...new Set(block.drops.map((drop) => {
    if (Number.isSafeInteger(drop)) return drop;
    if (drop && typeof drop === 'object') return Number(drop.drop ?? drop.item ?? drop.id);
    return NaN;
  }).filter(Number.isSafeInteger))] : [];
  if (dropIds.length === 0) {
    throw new TypeError(`لا تملك minecraft:${blockName} إسقاطًا ثابتًا مسجلاً لهذا الإصدار. لم يبدأ التعدين.`);
  }
  if (dropIds.length !== 1) {
    throw new TypeError(`إسقاط minecraft:${blockName} عشوائي أو متعدد (${dropIds.length} احتمالات)؛ لا يمكن عدّه بدقة كهدف واحد. لم يبدأ التعدين.`);
  }
  const item = mcData.items?.[dropIds[0]]
    || Object.values(mcData.itemsByName || {}).find((candidate) => candidate?.id === dropIds[0]);
  if (!item?.name) {
    throw new TypeError(`لا يوجد معرف عنصر صالح لإسقاط minecraft:${blockName} في بيانات الإصدار الحالي.`);
  }
  return { block, dropItem: item, blockName: `minecraft:${blockName}`, outputItemName: String(item.name) };
}

function emptyPlayerSlotCount(bot) {
  const inventory = bot?.inventory;
  if (typeof inventory?.emptySlotCount === 'function') {
    const count = inventory.emptySlotCount();
    return Number.isSafeInteger(count) && count >= 0 ? count : null;
  }
  if (Array.isArray(inventory?.slots)) return inventory.slots.slice(9, 45).filter((item) => item == null).length;
  return null;
}

function isInventoryCapacityError(error) {
  const text = String(error?.name || '') + ' ' + String(error?.message || error || '');
  return /NoChests|no defined chest locations|all chests are full/i.test(text);
}

class TaskEngine {
  constructor(manager) {
    this.manager = manager;
  }

  async executeCollect(botId, blockName, amount = 1, taskId = '', alreadyCollected = 0, initialInventoryCount = null) {
    const state = this.manager.getActive(botId);
    const request = validateCollect(blockName, amount, alreadyCollected);
    const mcData = this.manager.minecraftData(state.bot.version);
    const resolved = resolveExpectedDrop(request.blockName, mcData);
    if (state.task) throw new Error('يوجد عمل حيّ آخر لهذا البوت. أوقفه أو ألغِه أولًا.');

    const outputItemName = resolved.outputItemName;
    const observedInventoryCount = this.countItem(state.bot, outputItemName);
    const savedBaseline = initialInventoryCount == null ? null : Number(initialInventoryCount);
    if (savedBaseline !== null && (!Number.isSafeInteger(savedBaseline) || savedBaseline < 0)) throw new TypeError('خط أساس المخزون المحفوظ غير صالح.');
    if (request.alreadyCollected > 0 && savedBaseline === null) throw new Error('لا يمكن استئناف تقدم محفوظ دون خط أساس مخزون موثوق؛ أعد إنشاء المهمة بعد مراجعة العالم.');
    const baselineCount = savedBaseline === null ? observedInventoryCount : savedBaseline;
    if (observedInventoryCount < baselineCount + request.alreadyCollected) throw new Error('المخزون الحالي أقل من التقدم المحفوظ لهذه المهمة؛ راجع العناصر وأعد ضبط المهمة بدل ادعاء تقدم غير موجود.');

    const startedAt = Date.now();
    const task = {
      initialInventoryCount: baselineCount,
      outputItemName,
      id: String(taskId || `collect-${Date.now()}`),
      type: 'collect',
      blockName: request.blockName,
      namespacedBlockName: request.namespacedBlockName,
      count: request.count,
      collected: request.alreadyCollected,
      startedAt,
      stage: 'IN_WORLD',
      currentAction: 'أكد Minecraft دخول البوت إلى العالم بعد Spawn.',
      paused: false,
      cancelled: false,
      currentBot: null,
      currentInventoryCountBefore: null,
      currentCollectionStopRequested: false,
      pausePromise: Promise.resolve(),
      resumeResolver: null,
    };
    if (task.id.length > 128) throw new TypeError('معرّف المهمة غير صالح.');
    state.task = task;
    if (task.collected >= task.count) {
      this.emitTaskState(botId, task, 'COMPLETED', 'كان التقدم المؤكد المحفوظ يساوي العدد المطلوب؛ لم يُنفذ جمع إضافي.', 'اكتمل العدد المؤكد سابقًا');
      state.task = null;
      return { taskId: task.id, verifiedCollected: task.collected, status: 'COMPLETED' };
    }
    this.emitTaskState(botId, task, 'RUNNING', 'تم بدء التحقق من العالم والمخزون.', 'جارٍ البحث عن الكتلة', 'CURRENT_TASK', 'SEARCHING');
    let attempts = 0;

    try {
      while (task.collected < task.count) {
        await this.waitUntilRunnable(state, task);
        if (++attempts > (task.count - task.collected) * 3 + 20) throw new Error('توقفت المهمة بعد محاولات متكررة لم ينتج عنها تقدم مؤكد.');
        const active = this.manager.getActive(botId);
        const bot = active.bot;
        const emptySlots = emptyPlayerSlotCount(bot);
        if (emptySlots === null) throw new Error('تعذر قراءة خانات مخزون Minecraft؛ لم يبدأ إجراء الجمع ولم نفترض توفر مساحة.');
        if (emptySlots <= 0) {
          task.paused = true;
          task.stage = 'INVENTORY_FULL';
          task.currentAction = 'لا توجد خانة فارغة في مخزون Minecraft؛ أفرغ خانة ثم استأنف.';
          state.pauseReason = 'inventory_full';
          this.emitTaskState(botId, task, 'INVENTORY_FULL', 'لا توجد خانة فارغة في مخزون البوت. يتطلب ملحق الجمع خانة فارغة حتى إن وُجدت مساحة في رزمة جزئية؛ أفرغ خانة ثم استأنف المهمة.', task.currentAction, 'INVENTORY_FULL', 'INVENTORY_FULL');
          continue;
        }
        this.emitTaskProgress(botId, task, 'SEARCHING', 'جارٍ البحث عن الكتلة ضمن النطاق المحمّل.');
        const target = bot.findBlock({
          matching: (candidate) => candidate?.name === task.blockName,
          maxDistance: MAX_BLOCK_DISTANCE,
        });
        if (!target) throw new Error(`لم يُعثر على كتلة minecraft:${task.blockName} ضمن ${MAX_BLOCK_DISTANCE} كتلة في العالم المحمّل. تأكد من Spawn وتحميل المنطقة وقرب البوت من الكتلة.`);

        const before = this.countItem(bot, outputItemName);
        task.currentBot = bot;
        task.currentInventoryCountBefore = before;
        this.emitTaskProgress(botId, task, 'TARGET_FOUND', `عُثر على minecraft:${task.blockName} عند ${target.position.x}, ${target.position.y}, ${target.position.z}.`, target.position);
        const removeActivityListeners = this.watchCollectionActivity(botId, task, bot, target);

        try {
          const collector = bot.collectBlock;
          if (!collector || typeof collector.collect !== 'function') throw new Error('ملحق الجمع Mineflayer غير جاهز لهذه الجلسة.');
          await collector.collect(target, { ignoreNoPath: false });
        } catch (error) {
          const stoppedForPause = task.currentCollectionStopRequested;
          await task.pausePromise.catch(() => {});
          const after = this.countItem(bot, outputItemName);
          const gained = Math.max(0, after - before);
          removeActivityListeners();
          task.currentBot = null;
          task.currentInventoryCountBefore = null;
          task.currentCollectionStopRequested = false;
          if (task.cancelled) throw new Error('ألغى المستخدم المهمة.');
          if (isInventoryCapacityError(error) && emptyPlayerSlotCount(bot) === 0) {
            if (gained > 0) task.collected = Math.min(task.count, task.collected + gained);
            task.paused = true;
            state.pauseReason = 'inventory_full';
            task.stage = 'INVENTORY_FULL';
            const detail = `لم توجد خانة فارغة في المخزون قبل التقاط ${outputItemName}. تم احتساب زيادة فعلية مقدارها ${gained} فقط؛ أفرغ خانة ثم استأنف.`;
            this.emitTaskState(botId, task, 'INVENTORY_FULL', detail, 'المخزون ممتلئ؛ أفرغ خانة ثم استأنف.', 'INVENTORY_FULL', 'INVENTORY_FULL');
            continue;
          }
          if (stoppedForPause) {
            if (gained > 0) {
              task.collected = Math.min(task.count, task.collected + gained);
              const completed = task.collected >= task.count;
              const paused = task.paused || Boolean(state.pauseReason);
              this.emitTaskState(botId, task, completed ? 'COMPLETED' : paused ? 'PAUSED' : 'RUNNING',
                `تأكدت زيادة مخزون Minecraft بمقدار ${gained} قبل توقف الجمع.`,
                completed ? 'اكتمل العدد المطلوب' : paused ? 'توقفت بعد التحقق من العنصر' : 'استؤنف البحث بعد التوقف');
            } else if (task.paused || state.pauseReason) {
              this.emitTaskState(botId, task, 'PAUSED', 'أوقف Mineflayer الإجراء الحالي دون تأكيد عنصر جديد.', 'متوقفة مؤقتًا');
            } else {
              this.emitTaskState(botId, task, 'RUNNING', 'أُوقف الإجراء الجاري دون زيادة مخزون؛ سيُعاد البحث بأمان.', 'إعادة البحث عن الهدف');
            }
            continue;
          }
          if (task.paused || state.pauseReason || state.status === 'RECONNECTING' || state.status === 'DEAD') continue;
          throw error;
        }

        if (task.cancelled) { removeActivityListeners(); throw new Error('ألغى المستخدم المهمة.'); }
        const stoppedForPause = task.currentCollectionStopRequested;
        const after = this.countItem(bot, outputItemName);
        removeActivityListeners();
        task.currentBot = null;
        task.currentInventoryCountBefore = null;
        task.currentCollectionStopRequested = false;
        const gained = Math.max(0, after - before);
        if (gained > 0) {
          task.collected = Math.min(task.count, task.collected + gained);
          const completed = task.collected >= task.count;
          const paused = task.paused || Boolean(state.pauseReason);
          this.emitTaskState(
            botId,
            task,
            completed ? 'COMPLETED' : paused ? 'PAUSED' : 'RUNNING',
            `تأكدت زيادة مخزون Minecraft بمقدار ${gained}.`,
            completed ? 'اكتمل العدد المطلوب' : paused ? 'توقفت بعد التحقق من العنصر' : 'تم التقاط العنصر؛ متابعة البحث',
          );
        } else if (task.paused || state.pauseReason || state.status === 'RECONNECTING' || state.status === 'DEAD') {
          this.emitTaskState(botId, task, 'PAUSED', 'أوقفت أولوية المستخدم أو البقاء المهمة قبل تأكيد عنصر جديد.', 'متوقفة مؤقتًا');
        } else if (stoppedForPause) {
          this.emitTaskState(botId, task, 'RUNNING', 'أوقف طلب الإيقاف الإجراء الجاري؛ سيُعاد البحث دون احتساب تقدم.', 'إعادة البحث عن الهدف');
          continue;
        } else {
          throw new Error(`أكمل ملحق Mineflayer محاولة minecraft:${task.blockName}، لكن عدد ${outputItemName} لم يزد في المخزون. لم يُسجّل تقدم؛ افحص أداة التعدين أو إسقاط الخادم أو التقاط العنصر.`);
        }
      }
      return { taskId: task.id, verifiedCollected: task.collected, status: 'COMPLETED' };
    } catch (error) {
      if (!task.cancelled) {
        const terminalDisconnect = ['FAILED', 'DISCONNECTED'].includes(state.status)
          && (state.userStopped || state.permanentKick || !state.reconnectEnabled);
        const paused = !terminalDisconnect
          && Boolean(task.paused || state.pauseReason || state.status === 'RECONNECTING' || state.status === 'DEAD');
        if (paused) {
          this.emitTaskState(botId, task, 'PAUSED', 'توقفت المهمة مؤقتًا؛ سيبقى التقدم مقتصرًا على العناصر المؤكدة.', 'متوقفة مؤقتًا');
        } else {
          if (terminalDisconnect) {
            task.paused = false;
            state.pauseReason = '';
          }
          this.emitTaskState(botId, task, 'FAILED', this.manager.safeError(error), 'فشلت المهمة دون زيادة تقدم غير مؤكدة.');
        }
      }
      throw error;
    } finally {
      task.currentBot = null;
      task.currentInventoryCountBefore = null;
      task.currentCollectionStopRequested = false;
      if (state.task === task && (task.cancelled || task.collected >= task.count || (!task.paused && !state.pauseReason))) state.task = null;
      if (state.status === 'ONLINE' && state.bot) this.manager.snapshot(botId, state, true);
    }
  }

  pause(state, reason = 'user', detail = 'أوقف المستخدم المهمة مؤقتًا.') {
    const task = state?.task;
    if (!task || task.cancelled) return Promise.resolve();
    task.paused = true;
    task.stage = 'PAUSED';
    state.pauseReason = reason;
    if (task.currentBot) task.currentCollectionStopRequested = true;
    task.pausePromise = this.cancelCurrentCollection(task).catch((error) => {
      this.emitTaskState(state.id, task, 'PAUSED', `لم يؤكد محرك Minecraft إيقاف الجمع: ${this.manager.safeError(error)}`, 'الإيقاف غير مؤكد؛ المهمة تبقى معلقة', 'BEHAVIOR');
      throw error;
    });
    task.resumeResolver?.();
    this.manager.emitEvent('task_state', state.id, {
      taskId: task.id,
      status: 'PAUSED',
      reason: detail,
      currentAction: 'متوقفة مؤقتًا',
      stage: 'PAUSED',
      startedAt: task.startedAt,
      outputItemName: task.outputItemName,
      verifiedCollected: task.collected,
      priority: reason === 'user' ? 'USER_PAUSE' : 'BEHAVIOR',
    });
    return task.pausePromise;
  }

  async resume(state, detail = 'استأنف المستخدم المهمة.') {
    const task = state?.task;
    if (!task || task.cancelled) throw new Error('لا توجد مهمة قابلة للاستئناف لهذا البوت.');
    if (state.status !== 'ONLINE') throw new Error('يلزم اتصال Minecraft داخل العالم قبل الاستئناف.');
    if (!['user', 'inventory_full'].includes(state.pauseReason)) throw new Error('توقفت المهمة بسبب أولوية البقاء أو الاتصال؛ لا يمكن تجاوزها يدويًا.');
    if (state.pauseReason === 'inventory_full') {
      const emptySlots = emptyPlayerSlotCount(state.bot);
      if (emptySlots === null) throw new Error('لا يمكن قراءة خانات مخزون Minecraft الآن؛ لم نستأنف المهمة ولم نفترض وجود مساحة.');
      if (emptySlots <= 0) throw new Error('لا يمكن الاستئناف حتى تتوفر خانة فارغة حقيقية في مخزون Minecraft.');
    }
    if ((Number.isFinite(state.bot?.health) && state.bot.health <= 4) || (Number.isFinite(state.bot?.food) && state.bot.food <= 8)) {
      throw new Error('أولوية البقاء تمنع استئناف المهمة حتى تتعافى الصحة والطعام في Minecraft.');
    }
    try { await task.pausePromise; }
    catch { throw new Error('لم يؤكد محرك الجمع توقف الإجراء الحالي؛ تبقى المهمة متوقفة.'); }
    task.paused = false;
    task.stage = 'SEARCHING';
    state.pauseReason = '';
    this.emitTaskState(state.id, task, 'RUNNING', detail, 'تستأنف البحث عن الهدف', 'CURRENT_TASK', 'SEARCHING');
    task.resumeResolver?.();
  }

  async cancel(state, detail = 'ألغى المستخدم المهمة.') {
    const task = state?.task;
    if (!task || task.cancelled) throw new Error('لا توجد مهمة حية مطابقة لهذا المعرّف.');
    const activeBot = task.currentBot;
    const activeBaseline = task.currentInventoryCountBefore;
    const collectedBeforeCancel = task.collected;
    task.paused = true;
    state.pauseReason = 'cancelling';
    try {
      await this.cancelCurrentCollection(task);
    } catch (error) {
      state.pauseReason = 'cancel_failed';
      task.paused = true;
      this.emitTaskState(state.id, task, 'PAUSED', `لم يؤكد محرك Minecraft إيقاف الجمع: ${this.manager.safeError(error)}`, 'الإيقاف غير مؤكد؛ المهمة ما زالت متوقفة', 'BEHAVIOR');
      task.resumeResolver?.();
      throw new Error('تعذر تأكيد إيقاف المهمة؛ تُركت متوقفة ولم نعلن إلغاءها.');
    }
    if (activeBot && Number.isSafeInteger(activeBaseline)) {
      const gained = Math.max(0, this.countItem(activeBot, task.outputItemName) - activeBaseline);
      task.collected = Math.min(task.count, Math.max(task.collected, collectedBeforeCancel + gained));
    }
    const completedDuringStop = task.collected >= task.count;
    task.cancelled = true;
    task.paused = false;
    task.resumeResolver?.();
    if (state.task === task) state.task = null;
    state.pauseReason = '';
    activeBot?.clearControlStates?.();
    this.emitTaskState(
      state.id,
      task,
      completedDuringStop ? 'COMPLETED' : 'CANCELLED',
      completedDuringStop ? 'تحقق العدد المطلوب من المخزون أثناء إيقاف الجمع.' : detail,
      completedDuringStop ? 'اكتمل العدد المطلوب' : 'أُلغيت المهمة بعد إيقاف الجمع الحالي.',
    );
  }

  async waitUntilRunnable(state, task) {
    const started = Date.now();
    while (true) {
      await task.pausePromise.catch(() => {});
      if (task.cancelled || state.task !== task) throw new Error('ألغى المستخدم المهمة.');
      if (state.status === 'ONLINE' && !task.paused && !state.pauseReason && state.bot) return;
      if (['FAILED', 'DISCONNECTED'].includes(state.status)
        && (state.userStopped || state.permanentKick || !state.reconnectEnabled)) {
        throw new Error(state.lastError || 'انقطع اتصال Minecraft قبل إتمام المهمة.');
      }
      if (Date.now() - started > 600_000) throw new Error('بقيت المهمة متوقفة أكثر من 10 دقائق؛ أوقفنا الانتظار دون ادعاء إكمالها.');
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 250);
        task.resumeResolver = () => { clearTimeout(timer); resolve(); };
      });
      task.resumeResolver = null;
    }
  }

  async cancelCurrentCollection(task) {
    const bot = task.currentBot;
    if (!bot) return;
    if (typeof bot.collectBlock?.cancelTask === 'function') {
      try {
        await bot.collectBlock.cancelTask();
        return;
      } catch (error) {
        bot.pathfinder?.stop?.();
        bot.pathfinder?.setGoal?.(null);
        bot.clearControlStates?.();
        throw error;
      }
    }
    bot.pathfinder?.stop?.();
    bot.pathfinder?.setGoal?.(null);
    bot.clearControlStates?.();
  }

  emitTaskProgress(botId, task, stage, currentAction, position = null) {
    task.stage = stage;
    task.currentAction = currentAction;
    this.manager.emitEvent('task_progress', botId, {
      taskId: task.id,
      stage,
      blockName: task.namespacedBlockName,
      outputItemName: task.outputItemName,
      count: task.count,
      currentAction,
      position: position ? { x: Number(position.x), y: Number(position.y), z: Number(position.z) } : undefined,
      verifiedCollected: task.collected,
      progress: Math.floor(task.collected / task.count * 100),
      startedAt: task.startedAt,
      durationMs: Math.max(0, Date.now() - task.startedAt),
      observedAt: Date.now(),
    });
  }

  watchCollectionActivity(botId, task, bot, target) {
    const listeners = [];
    const nearTarget = (position) => position?.distanceTo?.(target.position.offset(0.5, 0.5, 0.5)) <= 2.25;
    const listen = (name, handler) => {
      bot.on(name, handler);
      listeners.push([name, handler]);
    };
    listen('path_update', (result) => {
      if (result?.status === 'noPath') this.emitTaskProgress(botId, task, 'PATH_BLOCKED', 'تعذر إيجاد مسار قابل للتنفيذ إلى الهدف.', target.position);
      else if (result?.status === 'success' && Array.isArray(result.path) && result.path.length > 0) this.emitTaskProgress(botId, task, 'MOVING', 'يتحرك Pathfinder فعليًا إلى موقع الكتلة.', target.position);
    });
    let diggingTarget = false;
    listen('physicsTick', () => {
      const current = bot.targetDigBlock?.position;
      const isTarget = Boolean(current && current.distanceTo(target.position) <= 1);
      if (isTarget && !diggingTarget) this.emitTaskProgress(botId, task, 'BREAKING', `Mineflayer يضرب الكتلة المستهدفة فعليًا: minecraft:${task.blockName}.`, target.position);
      diggingTarget = isTarget;
    });
    listen('diggingCompleted', (block) => {
      if (!block?.position || block.position.distanceTo(target.position) <= 1) this.emitTaskProgress(botId, task, 'COLLECTING', 'تغيرت حالة الكتلة في Minecraft؛ يجري انتظار الإسقاط/التقاطه.', target.position);
    });
    listen('itemDrop', (entity) => {
      if (nearTarget(entity?.position)) this.emitTaskProgress(botId, task, 'COLLECTING', `رصد Minecraft إسقاطًا قرب ${task.blockName}; لم يُحتسب قبل تأكيد المخزون.`, target.position);
    });
    listen('playerCollect', (collector) => {
      if (collector?.id === bot.entity?.id) this.emitTaskProgress(botId, task, 'VERIFYING_INVENTORY', 'أبلغ Minecraft عن التقاط عنصر؛ يجري فحص فرق المخزون الحقيقي.', target.position);
    });
    return () => {
      for (const [name, handler] of listeners) bot.removeListener(name, handler);
    };
  }

  emitTaskState(botId, task, status, reason, currentAction, priority, stage) {
    task.currentAction = currentAction;
    if (stage) task.stage = stage;
    else if (['COMPLETED', 'FAILED', 'CANCELLED', 'PAUSED'].includes(status)) task.stage = status;
    task.status = status;
    this.manager.emitEvent('task_state', botId, {
      taskId: task.id,
      status,
      goal: `اجمع ${task.count} من ${task.namespacedBlockName || `minecraft:${task.blockName}`}؛ العنصر الناتج ${task.outputItemName}.`,
      blockName: task.namespacedBlockName || `minecraft:${task.blockName}`,
      outputItemName: task.outputItemName,
      count: task.count,
      initialInventoryCount: task.initialInventoryCount,
      progress: Math.floor(task.collected / task.count * 100),
      verifiedCollected: task.collected,
      verifiedBy: status === 'COMPLETED' ? 'inventory-delta' : undefined,
      currentAction,
      stage: task.stage || stage || status,
      startedAt: task.startedAt,
      durationMs: Math.max(0, Date.now() - task.startedAt),
      reason,
      priority,
      observedAt: Date.now(),
    });
  }

  countItem(bot, itemName) {
    const items = bot?.inventory?.items?.();
    return Array.isArray(items)
      ? items.reduce((sum, item) => item?.name === itemName && Number.isSafeInteger(item.count) && item.count > 0 ? sum + item.count : sum, 0)
      : 0;
  }
}

module.exports = { TaskEngine, validateCollect, resolveExpectedDrop, emptyPlayerSlotCount, MAX_BLOCK_DISTANCE, MAX_TARGET_COUNT };
