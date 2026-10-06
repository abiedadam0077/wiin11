export const TASK_STATUSES = Object.freeze(['pending_plan', 'pending', 'running', 'paused', 'completed', 'failed', 'cancelled']);
const allowed = Object.freeze({
  pending_plan: new Set(['pending', 'cancelled', 'failed']),
  pending: new Set(['running', 'cancelled', 'failed']),
  running: new Set(['paused', 'completed', 'failed', 'cancelled']),
  paused: new Set(['running', 'cancelled', 'failed']),
  completed: new Set(), failed: new Set(), cancelled: new Set(),
});

export function transitionTask(task, nextStatus, { engineAvailable = false, progress = undefined } = {}) {
  if (!task || !TASK_STATUSES.includes(task.status) || !TASK_STATUSES.includes(nextStatus)) throw new Error('حالة مهمة غير صالحة.');
  if (!allowed[task.status].has(nextStatus)) throw new Error(`لا يمكن نقل المهمة من ${task.status} إلى ${nextStatus}.`);
  if (['running', 'completed'].includes(nextStatus) && !engineAvailable) throw new Error('يتطلب تشغيل المهمة محرك Minecraft متصلًا؛ لم تتغير الحالة.');
  const updated = { ...task, status: nextStatus, updatedAt: Date.now() };
  if (progress !== undefined) updated.progress = Math.max(0, Math.min(100, Number(progress) || 0));
  if (nextStatus === 'completed') updated.progress = 100;
  if (nextStatus === 'cancelled') updated.progress = Math.max(0, Math.min(99, Number(task.progress) || 0));
  return updated;
}

export function activeTaskCount(tasks = []) {
  return tasks.filter((task) => ['pending_plan', 'pending', 'running', 'paused'].includes(task.status)).length;
}
