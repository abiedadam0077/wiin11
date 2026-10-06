export const BEHAVIOR_ORDER = Object.freeze(['emergency', 'survival', 'user_command', 'current_task', 'resource_management', 'idle']);

/** Pure priority policy. It chooses an intent only from observed inputs; it does not execute Minecraft packets. */
export function evaluateBehavior(context = {}) {
  if (context.dead === true) return { priority: 'emergency', action: 'recover_after_death', pauseTask: true, resumeAfter: 'recovery_complete' };
  if (context.emergency === true || (Number.isFinite(context.health) && context.health <= 2)) return { priority: 'emergency', action: 'escape_or_respawn', pauseTask: true, resumeAfter: 'emergency_clear' };
  if (Number.isFinite(context.food) && context.food <= 6 && context.hasFood === true) return { priority: 'survival', action: 'eat', pauseTask: true, resumeAfter: 'food_safe' };
  if (context.userCommand) return { priority: 'user_command', action: 'run_user_command', pauseTask: false, resumeAfter: null };
  if (context.currentTask) return { priority: 'current_task', action: 'continue_task', pauseTask: false, resumeAfter: null };
  if (context.resourceNeed) return { priority: 'resource_management', action: 'manage_resources', pauseTask: false, resumeAfter: null };
  return { priority: 'idle', action: 'wait', pauseTask: false, resumeAfter: null };
}

export function behaviorLabel(priority) {
  return ({ emergency: 'طوارئ', survival: 'بقاء', user_command: 'أمر المستخدم', current_task: 'المهمة الحالية', resource_management: 'إدارة الموارد', idle: 'انتظار' })[priority] || 'غير معروف';
}
