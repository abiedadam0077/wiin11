'use strict';

const MAX_BLOCK_DISTANCE = 48;
const MAX_TARGET_COUNT = 320;

function validateCollect(blockName, amount, initialCollected = 0) {
  const normalizedBlock = String(blockName || '').trim().toLowerCase();
  const requested = Number(amount);
  const alreadyCollected = Number(initialCollected);
  if (!/^[a-z0-9_]{1,64}$/.test(normalizedBlock)) throw new TypeError('اسم الكتلة غير صالح.');
  if (!Number.isInteger(requested) || requested < 1 || requested > MAX_TARGET_COUNT) throw new TypeError('العدد المطلوب يجب أن يكون بين 1 و320.');
  if (!Number.isInteger(alreadyCollected) || alreadyCollected < 0 || alreadyCollected > requested) throw new TypeError('التقدم المؤكد المحفوظ غير صالح.');
  return { blockName: normalizedBlock, count: requested, alreadyCollected };
}

class TaskEngine {
  constructor(manager) {
    this.manager = manager;
  }

  async executeCollect(botId, blockName, amount = 1, taskId = '', alreadyCollected = 0, initialInventoryCount = null) {
    const state = this.manager.getActive(botId);
    const request = validateCollect(blockName, amount, alreadyCollected);
    const mcData = this.manager.minecraftData(state.bot.version);
    const block = mcData.blocksByName[request.blockName];
    const item = mcData.itemsByName[request.blockName];
    if (!block || !item || !Array.isArray(block.drops) || !block.drops.includes(item.id)) {
      throw new TypeError('الكتلة غير مدعومة كجمع مباشر: بيانات Minecraft لا تؤكد إسقاط عنصر بالاسم نفسه.');
    }
    if (state.task) throw new Error('يوجد عمل حيّ آخر لهذا البوت. أوقفه أو ألغِه أولًا.');

    const observedInventoryCount = this.countItem(state.bot, request.blockName);
    const savedBaseline = initialInventoryCount == null ? null : Number(initialInventoryCount);
    if (savedBaseline !== null && (!Number.isSafeInteger(savedBaseline) || savedBaseline < 0)) throw new TypeError('خط أساس المخزون المحفوظ غير صالح.');
    if (request.alreadyCollected > 0 && savedBaseline === null) throw new Error('لا يمكن استئناف تقدم محفوظ دون خط أساس مخزون موثوق؛ أعد إنشاء المهمة بعد مراجعة العالم.');
    const baselineCount = savedBaseline === null ? observedInventoryCount : savedBaseline;
    if (observedInventoryCount < baselineCount + request.alreadyCollected) throw new Error('المخزون الحالي أقل من التقدم المحفوظ لهذه المهمة؛ راجع العناصر وأعد ضبط المهمة بدل ادعاء تقدم غير موجود.');

    const task = {
      initialInventoryCount: baselineCount,
      id: String(taskId || `collect-${Date.now()}`),
      type: 'collect',
      blockName: request.blockName,
      count: request.count,
      collected: request.alreadyCollected,
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
    this.emitTaskState(botId, task, 'RUNNING', 'تم بدء التحقق من العالم والمخزون.', 'جارٍ البحث عن الكتلة');
    let attempts = 0;

    try {
      while (task.collected < task.count) {
        await this.waitUntilRunnable(state, task);
        if (++attempts > (task.count - task.collected) * 3 + 20) throw new Error('توقفت المهمة بعد محاولات متكررة لم ينتج عنها تقدم مؤكد.');
        const active = this.manager.getActive(botId);
        const bot = active.bot;
        const target = bot.findBlock({
          matching: (candidate) => candidate?.name === task.blockName,
          maxDistance: MAX_BLOCK_DISTANCE,
        });
        if (!target) throw new Error(`لم يُعثر على كتلة ${task.blockName} ضمن ${MAX_BLOCK_DISTANCE} كتلة في العالم المحمّل.`);

        const before = this.countItem(bot, task.blockName);
        task.currentBot = bot;
        task.currentInventoryCountBefore = before;
        this.manager.emitEvent('task_progress', botId, {
          taskId: task.id,
          action: 'target-found',
          currentAction: 'تم العثور على الكتلة؛ يجري الوصول إليها وجمع إسقاطها.',
          blockName: task.blockName,
          position: { x: target.position.x, y: target.position.y, z: target.position.z },
          verifiedCollected: task.collected,
          at: Date.now(),
        });

        try {
          const collector = bot.collectBlock;
          if (!collector || typeof collector.collect !== 'function') throw new Error('ملحق الجمع الحقيقي غير جاهز لهذه الجلسة.');
          await collector.collect(target, { ignoreNoPath: false });
        } catch (error) {
          const stoppedForPause = task.currentCollectionStopRequested;
          await task.pausePromise.catch(() => {});
          const after = this.countItem(bot, task.blockName);
          const gained = Math.max(0, after - before);
          task.currentBot = null;
          task.currentInventoryCountBefore = null;
          task.currentCollectionStopRequested = false;
          if (task.cancelled) throw new Error('ألغى المستخدم المهمة.');
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

        if (task.cancelled) throw new Error('ألغى المستخدم المهمة.');
        const stoppedForPause = task.currentCollectionStopRequested;
        const after = this.countItem(bot, task.blockName);
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
          throw new Error('كسر المحرك الكتلة أو حاول جمعها، لكن مخزون Minecraft لم يتغير. تحقق من إسقاط الكتلة وإتاحة مساحة في المخزون؛ لم يُسجّل أي تقدم.');
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
      verifiedCollected: task.collected,
      priority: reason === 'user' ? 'USER_PAUSE' : 'BEHAVIOR',
    });
    return task.pausePromise;
  }

  async resume(state, detail = 'استأنف المستخدم المهمة.') {
    const task = state?.task;
    if (!task || task.cancelled) throw new Error('لا توجد مهمة قابلة للاستئناف لهذا البوت.');
    if (state.status !== 'ONLINE') throw new Error('يلزم اتصال Minecraft داخل العالم قبل الاستئناف.');
    if (state.pauseReason !== 'user') throw new Error('توقفت المهمة بسبب أولوية البقاء أو الاتصال؛ لا يمكن تجاوزها يدويًا.');
    if ((Number.isFinite(state.bot?.health) && state.bot.health <= 4) || (Number.isFinite(state.bot?.food) && state.bot.food <= 8)) {
      throw new Error('أولوية البقاء تمنع استئناف المهمة حتى تتعافى الصحة والطعام في Minecraft.');
    }
    try { await task.pausePromise; }
    catch { throw new Error('لم يؤكد محرك الجمع توقف الإجراء الحالي؛ تبقى المهمة متوقفة.'); }
    task.paused = false;
    state.pauseReason = '';
    this.emitTaskState(state.id, task, 'RUNNING', detail, 'تستأنف البحث عن الهدف');
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
      const gained = Math.max(0, this.countItem(activeBot, task.blockName) - activeBaseline);
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

  emitTaskState(botId, task, status, reason, currentAction, priority) {
    task.currentAction = currentAction;
    task.status = status;
    this.manager.emitEvent('task_state', botId, {
      taskId: task.id,
      status,
      goal: `اجمع ${task.count} من ${task.blockName}.`,
      blockName: task.blockName,
      count: task.count,
      initialInventoryCount: task.initialInventoryCount,
      progress: Math.floor(task.collected / task.count * 100),
      verifiedCollected: task.collected,
      verifiedBy: status === 'COMPLETED' ? 'inventory-delta' : undefined,
      currentAction,
      reason,
      priority,
      observedAt: Date.now(),
    });
  }

  countItem(bot, itemName) {
    return bot.inventory?.items?.().reduce((sum, item) => item.name === itemName ? sum + item.count : sum, 0) || 0;
  }
}

module.exports = { TaskEngine, validateCollect, MAX_BLOCK_DISTANCE, MAX_TARGET_COUNT };
