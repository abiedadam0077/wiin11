'use strict';

const FOOD_PAUSE_AT = 8;
const FOOD_RESUME_AT = 12;
const CRITICAL_HEALTH = 4;

class BehaviorEngine {
  constructor(manager) {
    this.manager = manager;
    this.respawnTimers = new Map();
  }

  onFood(botId) {
    const state = this.manager.bots.get(String(botId));
    if (!state?.bot || state.status !== 'ONLINE' || state.pauseReason === 'user') return;
    if (Number.isFinite(state.bot.health) && state.bot.health <= CRITICAL_HEALTH) {
      this.pause(state, 'emergency_health', 'أولوية طوارئ: الصحة منخفضة. أوقفت الحركة حتى تتعافى الحالة.');
      return;
    }
    if (Number.isFinite(state.bot.food) && state.bot.food <= FOOD_PAUSE_AT) {
      this.pause(state, 'survival_food', 'أولوية بقاء: الطعام منخفض. أوقفنا المهمة مؤقتًا؛ المحرك قد يأكل فقط مما في المخزون.');
      return;
    }
    if (['survival_food', 'emergency_health'].includes(state.pauseReason)
      && Number.isFinite(state.bot.food) && state.bot.food >= FOOD_RESUME_AT
      && Number.isFinite(state.bot.health) && state.bot.health > CRITICAL_HEALTH) {
      void this.resume(state, 'تعافت الصحة وارتفع الطعام وفق بيانات Minecraft الحقيقية.');
    }
  }

  onDeath(botId) {
    const state = this.manager.bots.get(String(botId));
    if (!state?.bot) return;
    if (state.pauseReason !== 'user') this.pause(state, 'death', 'مات البوت وفق حدث Minecraft؛ أوقفت المهمة والحركة.');
    const previous = this.respawnTimers.get(state.id);
    if (previous) clearTimeout(previous);
    if (!state.config.autoRespawn) {
      this.manager.emitEvent('behavior', state.id, { priority: 'EMERGENCY', action: 'RESPAWN_WAITING_FOR_USER', source: 'minecraft-death-event' });
      return;
    }
    const timer = setTimeout(() => {
      this.respawnTimers.delete(state.id);
      if (state.status === 'DEAD' && state.bot) {
        try {
          state.bot.respawn();
          this.manager.emitEvent('behavior', state.id, { priority: 'EMERGENCY', action: 'RESPAWN_REQUESTED', source: 'minecraft-death-event' });
        } catch (error) {
          this.manager.emitEvent('behavior', state.id, { priority: 'EMERGENCY', action: 'RESPAWN_FAILED', reason: this.manager.safeError(error).slice(0, 240) });
        }
      }
    }, 1200);
    timer.unref?.();
    this.respawnTimers.set(state.id, timer);
  }

  onRespawn(botId) {
    const state = this.manager.bots.get(String(botId));
    if (!state) return;
    const timer = this.respawnTimers.get(state.id);
    if (timer) clearTimeout(timer);
    this.respawnTimers.delete(state.id);
    if (state.pauseReason === 'user') return;
    if (Number.isFinite(state.bot?.health) && state.bot.health <= CRITICAL_HEALTH) {
      this.pause(state, 'emergency_health', 'عاد البوت إلى العالم لكن صحته حرجة؛ تبقى المهمة متوقفة.');
      return;
    }
    if (Number.isFinite(state.bot?.food) && state.bot.food <= FOOD_PAUSE_AT) {
      this.pause(state, 'survival_food', 'عاد البوت إلى العالم لكن الطعام منخفض؛ تبقى المهمة متوقفة.');
      return;
    }
    void this.resume(state, 'أكّد Minecraft عودة البوت إلى العالم.');
  }

  onDisconnected(botId) {
    const state = this.manager.bots.get(String(botId));
    if (!state || state.pauseReason === 'user') return;
    this.pause(state, 'disconnected', 'انقطع اتصال Minecraft؛ أوقفنا المهمة حتى يتأكد Spawn من جديد.');
  }

  onConnectionRestored(botId) {
    const state = this.manager.bots.get(String(botId));
    if (!state || state.status !== 'ONLINE' || state.pauseReason === 'user') return;
    if (state.bot && ((Number.isFinite(state.bot.health) && state.bot.health <= CRITICAL_HEALTH)
      || (Number.isFinite(state.bot.food) && state.bot.food <= FOOD_PAUSE_AT))) {
      this.onFood(botId);
      return;
    }
    if (state.pauseReason === 'disconnected' || state.pauseReason === 'death') {
      void this.resume(state, 'تأكدت عودة اتصال Minecraft وSpawn من العالم.');
    }
  }

  pause(state, reason, detail) {
    if (state.pauseReason === 'user' || state.pauseReason === reason) return;
    state.pauseReason = reason;
    if (state.bot?.pathfinder) state.bot.pathfinder.setGoal(null);
    state.bot?.clearControlStates?.();
    if (state.task) {
      void this.manager.taskEngine.pause(state, reason, detail).catch((error) => {
        this.manager.emitEvent('task_state', state.id, {
          taskId: state.task?.id,
          status: 'PAUSED',
          reason: `تعذر إيقاف إجراء الجمع بأمان: ${this.manager.safeError(error).slice(0, 180)}`,
          verifiedCollected: state.task?.collected || 0,
        });
      });
    }
    this.manager.emitEvent('behavior', state.id, {
      priority: reason === 'survival_food' || reason === 'emergency_health' ? 'SURVIVAL' : 'EMERGENCY',
      action: 'PAUSE_CURRENT_TASK',
      reason: detail,
    });
  }

  async resume(state, detail) {
    const previous = state.pauseReason;
    if (!previous || previous === 'user' || state.status !== 'ONLINE') return;
    const task = state.task;
    if (task) {
      try { await task.pausePromise; }
      catch (error) {
        this.manager.emitEvent('behavior', state.id, {
          priority: 'EMERGENCY',
          action: 'RESUME_BLOCKED_UNCONFIRMED_STOP',
          reason: this.manager.safeError(error).slice(0, 180),
        });
        return;
      }
    }
    if (state.pauseReason !== previous || state.status !== 'ONLINE') return;
    state.pauseReason = '';
    if (task && state.task === task && !task.cancelled) {
      task.paused = false;
      task.resumeResolver?.();
      this.manager.emitEvent('task_state', state.id, {
        taskId: task.id,
        status: 'RUNNING',
        verifiedCollected: task.collected,
        reason: detail,
        priority: 'CURRENT_TASK',
      });
    }
    this.manager.emitEvent('behavior', state.id, { priority: 'CURRENT_TASK', action: 'RESUME_AFTER_RECOVERY', recoveredFrom: previous, detail });
  }
}

module.exports = { BehaviorEngine, FOOD_PAUSE_AT, FOOD_RESUME_AT, CRITICAL_HEALTH };
