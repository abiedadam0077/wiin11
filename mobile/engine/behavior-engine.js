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
    if (!state?.bot || state.status !== 'ONLINE') return;
    if (Number.isFinite(state.bot.health) && state.bot.health <= CRITICAL_HEALTH) {
      this.pause(state, 'emergency_health', 'أولوية طوارئ: الصحة منخفضة. أوقفت الحركة حتى تتعافى الحالة.');
      return;
    }
    if (Number.isFinite(state.bot.food) && state.bot.food <= FOOD_PAUSE_AT) {
      this.pause(state, 'survival_food', 'أولوية بقاء: الطعام منخفض. أوقفنا المهمة مؤقتًا؛ المحرك قد يأكل فقط مما في المخزون.');
      return;
    }
    if (state.pauseReason === 'survival_food' && Number.isFinite(state.bot.food) && state.bot.food >= FOOD_RESUME_AT) {
      this.resume(state, 'ارتفع الطعام حسب بيانات Minecraft الحقيقية.');
    }
  }

  onDeath(botId) {
    const state = this.manager.bots.get(String(botId));
    if (!state?.bot) return;
    this.pause(state, 'death', 'مات البوت وفق حدث Minecraft؛ أوقفت المهمة والحركة.');
    const previous = this.respawnTimers.get(state.id);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      this.respawnTimers.delete(state.id);
      if (state.status === 'DEAD' && state.bot) {
        try {
          state.bot.respawn();
          this.manager.emitEvent('behavior', state.id, { priority: 'EMERGENCY', action: 'RESPAWN_REQUESTED', source: 'minecraft-death-event' });
        } catch (error) {
          this.manager.emitEvent('behavior', state.id, { priority: 'EMERGENCY', action: 'RESPAWN_FAILED', reason: String(error?.message || error).slice(0, 240) });
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
    if (Number.isFinite(state.bot?.food) && state.bot.food <= FOOD_PAUSE_AT) {
      state.pauseReason = 'survival_food';
      this.manager.emitEvent('behavior', state.id, { priority: 'SURVIVAL', action: 'RECOVERY_WAITING_FOR_FOOD', food: state.bot.food });
      return;
    }
    this.resume(state, 'أكّد Minecraft عودة البوت إلى العالم.');
  }

  onDisconnected(botId) {
    const state = this.manager.bots.get(String(botId));
    if (!state?.task) return;
    state.pauseReason = 'disconnected';
    state.task.paused = true;
    state.bot?.pathfinder?.setGoal(null);
    this.manager.emitEvent('task_state', botId, { taskId: state.task.id, status: 'PAUSED', reason: 'انقطع اتصال Minecraft؛ لا نحدّث التقدم دون تأكيد من العالم.' });
  }

  onConnectionRestored(botId) {
    const state = this.manager.bots.get(String(botId));
    if (state?.pauseReason === 'disconnected' && state.status === 'ONLINE') this.resume(state, 'تأكدت عودة اتصال Minecraft من حدث Spawn.');
  }

  pause(state, reason, detail) {
    if (state.pauseReason === reason) return;
    state.pauseReason = reason;
    if (state.bot?.pathfinder) state.bot.pathfinder.setGoal(null);
    state.bot?.clearControlStates?.();
    if (state.task) {
      state.task.paused = true;
      this.manager.emitEvent('task_state', state.id, { taskId: state.task.id, status: 'PAUSED', reason: detail, priority: reason === 'survival_food' || reason === 'emergency_health' ? 'SURVIVAL' : 'EMERGENCY' });
    }
    this.manager.emitEvent('behavior', state.id, { priority: reason === 'survival_food' || reason === 'emergency_health' ? 'SURVIVAL' : 'EMERGENCY', action: 'PAUSE_CURRENT_TASK', reason: detail });
  }

  resume(state, detail) {
    if (!state.pauseReason || state.pauseReason === 'user') return;
    const previous = state.pauseReason;
    state.pauseReason = '';
    if (state.task) {
      state.task.paused = false;
      this.manager.emitEvent('task_state', state.id, { taskId: state.task.id, status: 'RUNNING', reason: detail, priority: 'CURRENT_TASK' });
    }
    this.manager.emitEvent('behavior', state.id, { priority: 'CURRENT_TASK', action: 'RESUME_AFTER_RECOVERY', recoveredFrom: previous, detail });
  }
}

module.exports = { BehaviorEngine, FOOD_PAUSE_AT, FOOD_RESUME_AT, CRITICAL_HEALTH };
