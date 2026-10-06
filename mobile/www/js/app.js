import { Platform } from './platform.js';
import { AIEngine, rankFreeModels } from './ai.js';
import { TASK_STATUSES, transitionTask } from './task-engine.js';
import { evaluateBehavior, BEHAVIOR_ORDER } from './behavior-engine.js';
import { renderRoute } from './views.js';
import { icon, escapeHtml as h, uid, formatDate, timeAgo } from './ui.js';

const DEFAULT_SETTINGS = Object.freeze({
  id: 'preferences', reduceMotion: false, notifications: false, defaultVersion: '1.20.4',
  defaultBehavior: 'survival', reconnectAttempts: 5, connectionTimeout: 8, lockEnabled: false,
});
const DEFAULT_AI = Object.freeze({ id: 'main', automatic: true, model: '', dailyLimit: 30, maxTokens: 900, modelReliability: {} });
const state = {
  route: 'home', params: {}, stack: [], search: '', taskTab: 'active', logFilter: 'all',
  servers: [], bots: [], tasks: [], taskHistory: [], logs: [], skins: [], locations: [], botStates: [],
  settings: { ...DEFAULT_SETTINGS }, aiConfig: { ...DEFAULT_AI }, aiConfigured: false, aiStorage: '', aiModels: [],
  platformMode: Platform.mode, pinging: new Set(), busy: '', aiAttempt: null, selectedSkinId: '', modalConfirm: null,
  locked: false, loading: true, bootError: '',
};

const ai = new AIEngine({
  getConfig: async () => state.aiConfig,
  saveConfig: async (config) => {
    state.aiConfig = { ...DEFAULT_AI, ...config, id: 'main' };
    await Platform.save('ai_config', state.aiConfig);
  },
  log: addLog,
  onAttempt: ({ model, index, total }) => {
    state.aiAttempt = { model, index, total };
    if (state.route === 'task-details' || state.route === 'settings-ai') render();
  },
});

function setIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((element) => { element.innerHTML = icon(element.dataset.icon); });
}

async function loadAll() {
  const tables = ['servers', 'bots', 'tasks', 'task_history', 'logs', 'skins', 'locations', 'bot_states', 'settings', 'ai_config'];
  const data = await Promise.all(tables.map((table) => Platform.list(table)));
  const byTable = Object.fromEntries(tables.map((table, index) => [table, data[index]]));
  state.servers = byTable.servers;
  state.bots = byTable.bots;
  state.tasks = byTable.tasks;
  state.taskHistory = byTable.task_history;
  state.logs = byTable.logs;
  state.skins = byTable.skins;
  state.locations = byTable.locations;
  state.botStates = byTable.bot_states;
  state.settings = { ...DEFAULT_SETTINGS, ...(byTable.settings.find((item) => item.id === 'preferences') || {}) };
  state.aiConfig = { ...DEFAULT_AI, ...(byTable.ai_config.find((item) => item.id === 'main') || {}) };
  if (!byTable.settings.some((item) => item.id === 'preferences')) await Platform.save('settings', state.settings);
  if (!byTable.ai_config.some((item) => item.id === 'main')) await Platform.save('ai_config', state.aiConfig);
  const aiStatus = await Platform.aiStatus();
  state.aiConfigured = Boolean(aiStatus.configured);
  state.aiStorage = aiStatus.storage || '';
  state.platformMode = Platform.mode;
  const pinStatus = await Platform.lock('status');
  if (state.settings.lockEnabled !== Boolean(pinStatus.enabled)) {
    state.settings = { ...state.settings, lockEnabled: Boolean(pinStatus.enabled), id: 'preferences' };
    await Platform.save('settings', state.settings);
  }
  document.body.classList.toggle('reduce-motion', Boolean(state.settings.reduceMotion));
}

async function addLog({ level = 'info', category = 'info', message, botId = '', serverId = '', taskId = '' }) {
  const entry = { id: uid(), level, category, message: String(message || '').slice(0, 500), botId, serverId, taskId, createdAt: Date.now() };
  try {
    await Platform.save('logs', entry);
    state.logs = [entry, ...state.logs.filter((item) => item.id !== entry.id)];
  } catch { /* logging must never break the primary action */ }
  return entry;
}

async function addTaskHistory(task, status, message) {
  const entry = { id: uid(), taskId: task.id, status, message, createdAt: Date.now() };
  await Platform.save('task_history', entry);
  state.taskHistory.push(entry);
  await addLog({ category: 'task', level: status === 'failed' ? 'error' : 'info', taskId: task.id, botId: task.botId || '', message });
}

function routeTab(route) {
  if (['home'].includes(route)) return 'home';
  if (['bots', 'bot-details', 'bot-form', 'inventory', 'skins'].includes(route)) return 'bots';
  if (['tasks', 'task-form', 'task-details'].includes(route)) return 'tasks';
  if (['servers', 'server-form', 'server-details'].includes(route)) return 'servers';
  if (route.startsWith('settings') || route === 'logs' || route === 'notifications') return 'settings';
  return 'home';
}

function render() {
  const screen = document.getElementById('screen');
  screen.innerHTML = renderRoute(state);
  screen.setAttribute('aria-busy', 'false');
  screen.classList.remove('screen-refresh');
  requestAnimationFrame(() => screen.classList.add('screen-refresh'));
  const activeTab = routeTab(state.route);
  document.querySelectorAll('#bottom-nav [data-route]').forEach((button) => button.classList.toggle('is-active', button.dataset.route === activeTab));
  const context = document.getElementById('top-context');
  if (context) context.textContent = Platform.isNative ? 'تخزين محلي آمن' : 'معاينة محلية · SQLite';
  const nav = document.getElementById('bottom-nav');
  if (nav) nav.classList.toggle('hidden', state.route === 'unlock');
  document.body.classList.toggle('reduce-motion', Boolean(state.settings.reduceMotion));
  setIcons(document);
}

function navigate(route, params = {}, { root = false, replace = false } = {}) {
  if (state.locked && route !== 'unlock') return;
  closeModal();
  if (root) state.stack = [];
  else if (!replace && (state.route !== route || JSON.stringify(state.params) !== JSON.stringify(params))) state.stack.push({ route: state.route, params: state.params });
  state.route = route;
  state.params = { ...params };
  state.search = '';
  state.aiAttempt = null;
  render();
  document.getElementById('screen').scrollTo({ top: 0, behavior: state.settings.reduceMotion ? 'auto' : 'smooth' });
}

function goBack() {
  if (state.locked) return;
  closeModal();
  const previous = state.stack.pop();
  if (previous) {
    state.route = previous.route;
    state.params = previous.params;
  } else {
    state.route = 'home';
    state.params = {};
  }
  state.search = '';
  render();
}

function toast(message, tone = 'info', duration = 3300) {
  const region = document.getElementById('toast-region');
  const element = document.createElement('div');
  element.className = `toast ${tone}`;
  element.textContent = message;
  region.append(element);
  setTimeout(() => element.remove(), duration);
}

function showModal({ title, description = '', body = '', actions = '', centered = false, closeable = true }) {
  const root = document.getElementById('overlay-root');
  root.innerHTML = `<div class="modal-backdrop ${centered ? 'centered' : ''}" data-action="backdrop-close"><section class="modal-sheet" role="dialog" aria-modal="true" aria-label="${h(title)}"><div class="modal-grabber"></div><div class="modal-heading"><div><h2>${h(title)}</h2>${description ? `<p>${h(description)}</p>` : ''}</div>${closeable ? `<button class="modal-close" data-action="close-modal" aria-label="إغلاق">×</button>` : ''}</div>${body}${actions ? `<div class="dialog-actions">${actions}</div>` : ''}</section></div>`;
  setIcons(root);
  const first = root.querySelector('input,button,select,textarea');
  setTimeout(() => first?.focus(), 40);
}

function closeModal() {
  state.modalConfirm = null;
  const root = document.getElementById('overlay-root');
  if (root) root.innerHTML = '';
}

function showConfirm(title, message, onConfirm, { danger = true, confirmLabel = 'تأكيد الحذف' } = {}) {
  state.modalConfirm = onConfirm;
  showModal({
    title, centered: true,
    body: `<div class="confirm-icon">${icon(danger ? 'trash' : 'alert')}</div><p class="modal-message center">${h(message)}</p>`,
    actions: `<button class="btn btn-secondary" data-action="close-modal">إلغاء</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="confirm-modal">${h(confirmLabel)}</button>`,
  });
}

function serverAddressValid(host, port) {
  const address = String(host || '').trim();
  const normalized = address.startsWith('[') && address.endsWith(']') ? address.slice(1, -1) : address;
  const p = Number(port);
  const labels = normalized.split('.');
  const ipv6ish = normalized.includes(':') && /^[0-9a-f:.%]+$/i.test(normalized);
  const domain = labels.length >= 1 && labels.every((label) => label.length > 0 && label.length <= 63 && /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label));
  if (!address || address.length > 253 || /[\s\/\\?#@]/.test(address) || (!ipv6ish && !domain)) return 'أدخل IP أو اسم نطاق صالحًا.';
  if (!Number.isInteger(p) || p < 1 || p > 65535) return 'المنفذ يجب أن يكون رقمًا بين 1 و65535.';
  return '';
}

function titleFromDescription(description) {
  const text = String(description || '').trim().replace(/\s+/g, ' ');
  return text.length > 56 ? `${text.slice(0, 55)}…` : (text || 'مهمة جديدة');
}

function notify(title, message) {
  if (!state.settings.notifications) return;
  const body = String(message || '').slice(0, 180);
  try {
    if (Platform.isNative && window.MineBotNative?.notify) window.MineBotNative.notify(title, body);
    else if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body, icon: '/assets/icon.svg', silent: true });
  } catch { /* notifications are optional */ }
}

async function refreshAll({ renderAfter = true } = {}) {
  await loadAll();
  if (renderAfter) render();
}

async function testServer(serverId) {
  const server = state.servers.find((entry) => entry.id === serverId);
  if (!server || state.pinging.has(serverId)) return;
  state.pinging.add(serverId);
  render();
  const started = performance.now();
  try {
    const result = await Platform.pingServer(server.host, server.port, Number(state.settings.connectionTimeout || 8) * 1000);
    const updated = { ...server, status: 'online', playersOnline: result.playersOnline, playersMax: result.playersMax, lastPingVersion: result.version, lastCheckedAt: Date.now(), lastPingError: '', pingProtocol: result.protocol, pingLatencyMs: Math.round(performance.now() - started) };
    await Platform.save('servers', updated);
    await addLog({ category: 'connection', level: 'info', serverId, message: `نجح اختبار Minecraft Status Ping: ${server.host}:${server.port} · ${result.playersOnline}/${result.playersMax} لاعب.` });
    toast(`السيرفر متصل · ${result.playersOnline}/${result.playersMax} لاعب · ${result.version}`, 'success', 4200);
  } catch (error) {
    const safeMessage = String(error?.message || 'فشل اختبار الاتصال.').slice(0, 180);
    await Platform.save('servers', { ...server, status: 'offline', lastCheckedAt: Date.now(), lastPingError: safeMessage });
    await addLog({ category: 'connection', level: 'warning', serverId, message: `فشل اختبار الاتصال إلى ${server.host}:${server.port}: ${safeMessage}` });
    toast(safeMessage, 'error', 4600);
  } finally {
    state.pinging.delete(serverId);
    await refreshAll();
    if (state.route === 'server-details') state.params = { ...state.params, id: serverId };
  }
}

async function generateTaskPlan(taskId) {
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task || state.busy) return;
  state.busy = 'planning';
  state.aiAttempt = null;
  render();
  try {
    const bot = state.bots.find((item) => item.id === task.botId);
    const server = bot ? state.servers.find((item) => item.id === bot.serverId) : null;
    const result = await ai.planTask(task.description, { botName: bot?.name || '', serverName: server?.name || '' });
    const current = state.tasks.find((entry) => entry.id === taskId);
    const planned = { ...current, name: result.plan.name || current.name, plan: result.plan, modelUsed: result.model, plannedAt: Date.now(), status: current.status === 'pending_plan' ? 'pending' : current.status, updatedAt: Date.now() };
    await Platform.save('tasks', planned);
    await addTaskHistory(planned, planned.status, `أُنشئت خطة مقترحة من ${result.model} (${result.plan.steps.length} خطوات). لم يبدأ التنفيذ.`);
    await refreshAll({ renderAfter: false });
    state.busy = '';
    state.aiAttempt = null;
    state.route = 'task-details';
    state.params = { id: taskId };
    render();
    toast(result.fallbackIndex ? `نجحت الخطة عبر نموذج بديل: ${result.model}` : `تم إنشاء الخطة بواسطة ${result.model}`, 'success', 4200);
    notify('اكتملت خطة المهمة', 'الخطة محفوظة محليًا وتنتظر محرك Minecraft.');
  } catch (error) {
    state.busy = '';
    state.aiAttempt = null;
    render();
    toast(String(error?.message || 'تعذر إنشاء خطة المهمة.'), 'error', 5000);
  }
}

function showServerMenu(serverId) {
  const server = state.servers.find((entry) => entry.id === serverId);
  if (!server) return;
  showModal({ title: server.name, description: `${server.host}:${server.port}`, body: `<div class="btn-row" style="flex-direction:column">${actionBtnHtml('edit-server', 'تعديل بيانات السيرفر', 'secondary', 'edit', `data-id="${h(server.id)}"`)}${actionBtnHtml('ping-server', 'اختبار اتصال فعلي', 'outline', 'wifi', `data-id="${h(server.id)}"`)}${actionBtnHtml('delete-server', 'حذف السيرفر', 'danger', 'trash', `data-id="${h(server.id)}"`)}</div>` });
}

function showBotMenu(botId) {
  const bot = state.bots.find((entry) => entry.id === botId);
  if (!bot) return;
  showModal({ title: bot.name, description: 'إدارة ملف البوت المحلي', body: `<div class="btn-row" style="flex-direction:column">${actionBtnHtml('edit-bot', 'تعديل الإعدادات', 'secondary', 'edit', `data-id="${h(bot.id)}"`)}${actionBtnHtml('bot-logs', 'سجلات هذا البوت', 'outline', 'logs', `data-id="${h(bot.id)}"`)}${actionBtnHtml('delete-bot', 'حذف ملف البوت', 'danger', 'trash', `data-id="${h(bot.id)}"`)}</div>` });
}

function actionBtnHtml(action, label, tone, iconName, attrs = '') {
  return `<button class="btn btn-${tone} btn-block" data-action="${action}" ${attrs}>${icon(iconName)}<span>${h(label)}</span></button>`;
}

function showEngineInfo(botId) {
  const bot = state.bots.find((entry) => entry.id === botId);
  showModal({
    title: 'محرك Minecraft غير متاح', centered: true,
    body: `<div class="confirm-icon">${icon('plug')}</div><p class="modal-message center">لم يُنشأ أي اتصال. يمكن حفظ وإدارة ملف <strong>${h(bot?.name || 'البوت')}</strong> واختبار حالة السيرفر، لكن تسجيل دخول البوت وMinecraft protocol والحركة وPathfinding غير مدمجة بعد. لن نعرض حالة Online أو نبدأ مهمة على أنها تعمل.</p>`,
    actions: `<button class="btn btn-secondary" data-action="close-modal">حسنًا</button><button class="btn btn-outline" data-action="open-logs">عرض السجلات</button>`,
  });
}

function setFormBusy(form, busy, label = 'جار الحفظ…') {
  const submit = form?.querySelector('[type="submit"]');
  if (!submit) return;
  if (busy) {
    submit.dataset.originalLabel = submit.innerHTML;
    submit.disabled = true;
    submit.innerHTML = `<span class="spinner"></span><span>${h(label)}</span>`;
  } else {
    submit.disabled = false;
    if (submit.dataset.originalLabel) submit.innerHTML = submit.dataset.originalLabel;
  }
}

async function saveServerForm(form) {
  const data = new FormData(form);
  const name = String(data.get('name') || '').trim();
  const host = String(data.get('host') || '').trim();
  const port = Number(data.get('port'));
  const version = String(data.get('version') || '').trim();
  const error = serverAddressValid(host, port);
  if (name.length < 2 || name.length > 48) return toast('اسم السيرفر يجب أن يكون بين حرفين و48 حرفًا.', 'error');
  if (error) return toast(error, 'error');
  if (!version) return toast('اختر إصدار Minecraft.', 'error');
  const previous = form.dataset.id ? state.servers.find((entry) => entry.id === form.dataset.id) : null;
  const addressChanged = previous && (previous.host !== host || Number(previous.port) !== port);
  const record = {
    ...(previous || {}), id: previous?.id || uid(), name, host, port, version,
    status: addressChanged ? 'untested' : (previous?.status || 'untested'),
    lastCheckedAt: addressChanged ? 0 : (previous?.lastCheckedAt || 0),
    playersOnline: addressChanged ? 0 : (previous?.playersOnline || 0), playersMax: addressChanged ? 0 : (previous?.playersMax || 0),
    lastPingVersion: addressChanged ? '' : (previous?.lastPingVersion || ''), lastPingError: addressChanged ? '' : (previous?.lastPingError || ''),
    createdAt: previous?.createdAt || Date.now(), updatedAt: Date.now(),
  };
  setFormBusy(form, true);
  try {
    await Platform.save('servers', record);
    await addLog({ category: 'connection', level: 'info', serverId: record.id, message: previous ? 'تم تحديث إعدادات سيرفر محلي.' : 'تم حفظ إعدادات سيرفر محلي.' });
    await refreshAll({ renderAfter: false });
    toast(previous ? 'تم حفظ تعديلات السيرفر.' : 'تم حفظ السيرفر محليًا.', 'success');
    navigate('servers', {}, { root: true });
  } catch (error) { setFormBusy(form, false); toast(error.message, 'error'); }
}

async function saveBotForm(form) {
  const data = new FormData(form);
  const name = String(data.get('name') || '').trim();
  const username = String(data.get('username') || '').trim();
  const serverId = String(data.get('serverId') || '');
  const server = state.servers.find((entry) => entry.id === serverId);
  if (name.length < 2 || name.length > 40) return toast('اسم البوت يجب أن يكون بين حرفين و40 حرفًا.', 'error');
  if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) return toast('اسم اللاعب يجب أن يكون من 3 إلى 16 حرفًا إنجليزيًا أو رقمًا أو _ .', 'error');
  if (!server) return toast('اختر سيرفرًا محفوظًا أولًا.', 'error');
  const previous = form.dataset.id ? state.bots.find((entry) => entry.id === form.dataset.id) : null;
  const record = {
    ...(previous || {}), id: previous?.id || uid(), name, username, serverId,
    version: String(data.get('version') || server.version || '1.20.4'), authMode: String(data.get('authMode') || 'offline'),
    skinId: String(data.get('skinId') || ''), status: 'configured', currentTaskId: previous?.currentTaskId || '',
    color: previous?.color || ['#27385b', '#4e3767', '#285f69', '#5a4733'][Math.floor(Math.random() * 4)],
    createdAt: previous?.createdAt || Date.now(), updatedAt: Date.now(),
  };
  setFormBusy(form, true);
  try {
    await Platform.save('bots', record);
    await addLog({ category: 'info', level: 'info', botId: record.id, serverId, message: previous ? 'تم تحديث ملف بوت محلي.' : 'تم إنشاء ملف بوت محلي وحفظه.' });
    await refreshAll({ renderAfter: false });
    toast(previous ? 'تم تحديث ملف البوت.' : 'تم إنشاء ملف البوت محليًا؛ لا يوجد اتصال حيّ.', 'success', 4300);
    navigate('bot-details', { id: record.id }, { root: true });
  } catch (error) { setFormBusy(form, false); toast(error.message, 'error'); }
}

async function createTaskForm(form) {
  const data = new FormData(form);
  const description = String(data.get('description') || '').trim();
  const botId = String(data.get('botId') || '');
  const priority = String(data.get('priority') || 'normal');
  const generate = data.get('generatePlan') === 'on';
  if (description.length < 3 || description.length > 2000) return toast('اكتب وصفًا بين 3 و2000 حرف.', 'error');
  if (botId && !state.bots.some((bot) => bot.id === botId)) return toast('البوت المحدد لم يعد موجودًا.', 'error');
  if (!['low', 'normal', 'high'].includes(priority)) return toast('الأولوية المحددة غير صالحة.', 'error');
  const task = { id: uid(), name: titleFromDescription(description), description, botId, priority, status: 'pending_plan', progress: 0, plan: null, modelUsed: '', createdAt: Date.now(), updatedAt: Date.now() };
  setFormBusy(form, true, 'جار الحفظ…');
  try {
    await Platform.save('tasks', task);
    await addTaskHistory(task, 'pending_plan', 'تم حفظ طلب المهمة محليًا؛ لم يبدأ تنفيذه.');
    await refreshAll({ renderAfter: false });
    state.route = 'task-details';
    state.params = { id: task.id };
    state.stack = [];
    render();
    toast('تم حفظ المهمة محليًا.', 'success');
    if (generate) {
      if (state.aiConfigured) await generateTaskPlan(task.id);
      else toast('المهمة محفوظة. أضف مفتاح OpenRouter لإنشاء خطة AI.', 'warning', 4300);
    }
  } catch (error) { setFormBusy(form, false); toast(error.message, 'error'); }
}

async function saveAiKeyForm(form) {
  const data = new FormData(form);
  const key = String(data.get('apiKey') || '').trim();
  if (key.length < 20 || key.length > 512 || /\s/.test(key)) return toast('أدخل مفتاح OpenRouter صالحًا؛ لا تُضمّن مسافات.', 'error');
  setFormBusy(form, true, 'جار التشفير…');
  try {
    const result = await Platform.setApiKey(key);
    state.aiConfigured = Boolean(result.configured);
    state.aiStorage = result.storage || '';
    ai.modelsCache = null;
    await addLog({ category: 'ai', level: 'info', message: 'تم حفظ مفتاح OpenRouter دون تسجيل قيمته.' });
    form.reset();
    render();
    toast(Platform.isNative ? 'تم حفظ المفتاح المشفر في Android Keystore.' : 'تم ضبط المفتاح في ذاكرة المعاينة حتى إغلاق الخادم.', 'success', 4500);
  } catch (error) { setFormBusy(form, false); toast(error.message, 'error'); }
}

async function saveMinecraftSettings(form) {
  const data = new FormData(form);
  const reconnectAttempts = Number(data.get('reconnectAttempts'));
  const connectionTimeout = Number(data.get('connectionTimeout'));
  if (!Number.isInteger(reconnectAttempts) || reconnectAttempts < 0 || reconnectAttempts > 30) return toast('محاولات إعادة الاتصال يجب أن تكون من 0 إلى 30.', 'error');
  if (!Number.isInteger(connectionTimeout) || connectionTimeout < 2 || connectionTimeout > 60) return toast('مهلة الاتصال يجب أن تكون بين 2 و60 ثانية.', 'error');
  state.settings = { ...state.settings, defaultVersion: String(data.get('defaultVersion') || '1.20.4'), defaultBehavior: String(data.get('defaultBehavior') || 'survival'), reconnectAttempts, connectionTimeout, id: 'preferences' };
  try { await Platform.save('settings', state.settings); toast('تم حفظ إعدادات Minecraft محليًا.', 'success'); render(); }
  catch (error) { toast(error.message, 'error'); }
}

function pinSetupModal() {
  showModal({
    title: 'إعداد قفل التطبيق', description: 'اختر رمزًا محليًا من 6 أرقام.', centered: true,
    body: `<form data-form="pin-setup"><div class="form-row"><label class="form-label" for="pin1">رمز جديد</label><input class="field" id="pin1" name="pin1" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="new-password" required></div><div class="form-row"><label class="form-label" for="pin2">تأكيد الرمز</label><input class="field" id="pin2" name="pin2" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="new-password" required></div><p class="help-copy">على Android يُخزّن تحقق الرمز محليًا بشكل مشتق؛ في المعاينة يبقى داخل ذاكرة الخادم فقط.</p><button class="btn btn-primary btn-block" type="submit">تفعيل القفل</button></form>`,
  });
}

function pinChangeModal() {
  showModal({
    title: 'تغيير أو إزالة القفل', description: 'أكّد الرمز الحالي أولًا.', centered: true,
    body: `<form data-form="pin-change"><div class="form-row"><label class="form-label" for="currentPin">الرمز الحالي</label><input class="field" id="currentPin" name="currentPin" type="password" inputmode="numeric" maxlength="6" required></div><div class="form-row"><label class="form-label" for="newPin">رمز جديد (اتركه فارغًا للإزالة)</label><input class="field" id="newPin" name="newPin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6"></div><button class="btn btn-primary btn-block" type="submit">حفظ</button></form>`,
  });
}

function showLockOverlay() {
  if (!state.settings.lockEnabled || state.locked) return;
  state.locked = true;
  showModal({
    title: 'MineBot AI مقفل', description: 'أدخل رمزك المحلي للمتابعة.', centered: true, closeable: false,
    body: `<form data-form="unlock"><div class="form-row"><label class="form-label" for="unlockPin">رمز القفل</label><input class="field" id="unlockPin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="current-password" required></div><div id="unlock-error" class="field-help" role="alert"></div><button class="btn btn-primary btn-block" type="submit">فتح التطبيق</button></form>`,
  });
}

async function removeServer(id) {
  const server = state.servers.find((entry) => entry.id === id);
  if (!server) return;
  const attached = state.bots.filter((bot) => bot.serverId === id);
  showConfirm('حذف السيرفر؟', `سيُحذف ${server.name} من هذا الجهاز. ${attached.length ? `ملفات ${attached.length} بوت مرتبطة به ستبقى لكن ستصبح بلا سيرفر.` : ''}`, async () => {
    for (const bot of attached) await Platform.save('bots', { ...bot, serverId: '', status: 'configured', updatedAt: Date.now() });
    await Platform.remove('servers', id);
    await addLog({ category: 'connection', level: 'warning', serverId: id, message: 'تم حذف إعداد سيرفر محلي.' });
    await refreshAll({ renderAfter: false });
    state.route = 'servers'; state.params = {}; state.stack = [];
    render(); toast('تم حذف السيرفر.', 'success');
  });
}

async function removeBot(id) {
  const bot = state.bots.find((entry) => entry.id === id);
  if (!bot) return;
  showConfirm('حذف ملف البوت؟', `سيُحذف ملف ${bot.name}. ستبقى المهام السابقة غير معيّنة. لا يوجد اتصال حيّ ليتم إيقافه.`, async () => {
    for (const task of state.tasks.filter((entry) => entry.botId === id && !['completed', 'failed', 'cancelled'].includes(entry.status))) await Platform.save('tasks', { ...task, botId: '', updatedAt: Date.now() });
    await Platform.remove('bots', id);
    await addLog({ level: 'warning', category: 'info', botId: id, message: 'تم حذف ملف بوت محلي.' });
    await refreshAll({ renderAfter: false });
    state.route = 'bots'; state.params = {}; state.stack = [];
    render(); toast('تم حذف ملف البوت.', 'success');
  });
}

async function cancelTask(id) {
  const task = state.tasks.find((entry) => entry.id === id);
  if (!task || ['completed', 'failed', 'cancelled'].includes(task.status)) return;
  showConfirm('إلغاء المهمة؟', 'سيتم تسجيل الإلغاء في السجل المحلي. لن يُرسل أي أمر إلى Minecraft.', async () => {
    const updated = transitionTask(task, 'cancelled', { engineAvailable: false });
    await Platform.save('tasks', updated);
    await addTaskHistory(updated, 'cancelled', 'أُلغيت المهمة محليًا بواسطة المستخدم.');
    await refreshAll({ renderAfter: false });
    state.route = 'task-details'; state.params = { id }; state.stack = [];
    render(); toast('تم إلغاء المهمة محليًا.', 'success');
  }, { confirmLabel: 'إلغاء المهمة' });
}

async function selectFreeModel() {
  if (state.busy) return;
  state.busy = 'models'; state.aiModelsLoading = true; render();
  try {
    const result = await ai.selectBestFree({ force: true });
    state.aiModels = result.rank.slice(0, 50);
    state.aiConfigured = true;
    state.aiStorage = (await Platform.aiStatus()).storage || '';
    await addLog({ category: 'ai', level: 'info', message: `تم تحديث قائمة النماذج واختيار ${result.model.id} من ${result.count} نموذج مجاني.` });
    toast(`النموذج المجاني المختار: ${result.model.id}`, 'success', 5000);
  } catch (error) { toast(String(error?.message || 'تعذر اختيار نموذج مجاني.'), 'error', 5000); }
  finally { state.busy = ''; state.aiModelsLoading = false; render(); }
}

async function updateModels({ test = false } = {}) {
  if (state.busy) return;
  state.busy = 'models'; state.aiModelsLoading = true; render();
  try {
    const models = await ai.getModels({ force: true });
    const ranked = rankFreeModels(models, state.aiConfig.modelReliability || {});
    state.aiModels = ranked.slice(0, 60);
    state.aiConfigured = true;
    state.aiStorage = (await Platform.aiStatus()).storage || '';
    if (!ranked.length) throw new Error('اتصلت OpenRouter، لكن لم تُرجع نموذجًا مجانيًا بسياق كافٍ.');
    if (test && state.aiConfig.automatic !== false) {
      const best = ranked[0];
      state.aiConfig = { ...state.aiConfig, model: best.id, automatic: true, lastModelCheck: Date.now() };
      await Platform.save('ai_config', state.aiConfig);
    }
    await addLog({ category: 'ai', level: 'info', message: `اتصال OpenRouter ناجح؛ ${ranked.length} نموذجًا مجانيًا صالحًا من القائمة المتاحة.` });
    toast(`نجح الاتصال · ${ranked.length} نموذج مجاني متاح`, 'success', 4500);
  } catch (error) {
    const msg = String(error?.message || 'فشل اتصال OpenRouter.');
    await addLog({ category: 'ai', level: 'warning', message: `فشل اختبار OpenRouter: ${msg}` });
    toast(msg, 'error', 5000);
  } finally { state.busy = ''; state.aiModelsLoading = false; await refreshAll({ renderAfter: false }); render(); }
}

async function saveAiLimits() {
  const daily = Number(document.querySelector('[data-setting-input="dailyLimit"]')?.value);
  const maxTokens = Number(document.querySelector('[data-setting-input="maxTokens"]')?.value);
  if (!Number.isInteger(daily) || daily < 1 || daily > 500) return toast('الحد اليومي يجب أن يكون بين 1 و500 طلب.', 'error');
  if (!Number.isInteger(maxTokens) || maxTokens < 128 || maxTokens > 8192) return toast('حد الرموز يجب أن يكون بين 128 و8192.', 'error');
  state.aiConfig = { ...state.aiConfig, dailyLimit: daily, maxTokens, id: 'main' };
  try { await Platform.save('ai_config', state.aiConfig); toast('تم حفظ حدود AI محليًا.', 'success'); render(); }
  catch (error) { toast(error.message, 'error'); }
}

async function toggleSetting(input) {
  const name = input.dataset.setting;
  if (name === 'aiAutomatic') {
    state.aiConfig = { ...state.aiConfig, automatic: Boolean(input.checked), id: 'main' };
    if (input.checked) state.aiConfig = { ...state.aiConfig, automatic: true };
    await Platform.save('ai_config', state.aiConfig);
    if (input.checked && state.aiConfigured && !state.aiConfig.model) await selectFreeModel();
    else { toast(input.checked ? 'سيتم ترشيح نموذج مجاني تلقائيًا.' : 'الوضع اليدوي: اختر نموذجًا من القائمة.', 'success'); render(); }
    return;
  }
  if (name === 'reduceMotion') {
    state.settings = { ...state.settings, reduceMotion: input.checked, id: 'preferences' };
    await Platform.save('settings', state.settings);
    render(); toast(input.checked ? 'تم تقليل الحركة.' : 'تم تفعيل الحركات الهادئة.');
    return;
  }
  if (name === 'notifications') {
    if (!input.checked) {
      state.settings = { ...state.settings, notifications: false, id: 'preferences' };
      await Platform.save('settings', state.settings); render(); return;
    }
    try {
      let permission = 'granted';
      if (Platform.isNative && window.MineBotNative?.requestNotificationPermission) permission = window.MineBotNative.requestNotificationPermission();
      else if ('Notification' in window) permission = await Notification.requestPermission();
      else permission = 'unsupported';
      if (permission === 'pending') {
        state.settings = { ...state.settings, notifications: true, id: 'preferences' };
        await Platform.save('settings', state.settings);
        toast('اختر السماح في نافذة Android لتفعيل الإشعارات.', 'info');
      } else if (permission !== 'granted' && permission !== 'already-granted') {
        state.settings = { ...state.settings, notifications: false, id: 'preferences' };
        await Platform.save('settings', state.settings);
        toast(permission === 'denied' ? 'رفض النظام الإشعارات.' : 'الإشعارات غير مدعومة في هذا المتصفح.', 'warning');
      } else {
        state.settings = { ...state.settings, notifications: true, id: 'preferences' };
        await Platform.save('settings', state.settings);
        toast('تم تفعيل إشعارات أحداث التطبيق.', 'success');
      }
      render();
    } catch (error) { state.settings = { ...state.settings, notifications: false }; render(); toast(error.message, 'error'); }
  }
}

async function configureAppLock() {
  const status = await Platform.lock('status');
  if (status.enabled) pinChangeModal();
  else pinSetupModal();
}

async function savePinSetup(form) {
  const data = new FormData(form);
  const first = String(data.get('pin1') || '');
  const second = String(data.get('pin2') || '');
  if (!/^\d{6}$/.test(first)) return toast('رمز القفل يجب أن يتكون من 6 أرقام.', 'error');
  if (first !== second) return toast('رمزا القفل غير متطابقين.', 'error');
  const result = await Platform.lock('set', first);
  if (!result.enabled) throw new Error('تعذر تفعيل القفل.');
  state.settings = { ...state.settings, lockEnabled: true, id: 'preferences' };
  await Platform.save('settings', state.settings);
  closeModal(); render(); toast('تم تفعيل قفل التطبيق.', 'success');
}

async function savePinChange(form) {
  const data = new FormData(form);
  const current = String(data.get('currentPin') || '');
  const next = String(data.get('newPin') || '');
  const check = await Platform.lock('verify', current);
  if (!check.valid) return toast('رمز القفل الحالي غير صحيح.', 'error');
  if (next && !/^\d{6}$/.test(next)) return toast('الرمز الجديد يجب أن يكون من 6 أرقام.', 'error');
  if (next) await Platform.lock('set', next);
  else await Platform.lock('clear');
  state.settings = { ...state.settings, lockEnabled: Boolean(next), id: 'preferences' };
  await Platform.save('settings', state.settings);
  closeModal(); render(); toast(next ? 'تم تغيير رمز القفل.' : 'تم إزالة قفل التطبيق.', 'success');
}

async function exportBackup() {
  const tables = ['servers', 'bots', 'tasks', 'task_history', 'settings', 'ai_config', 'skins', 'locations', 'logs', 'bot_states'];
  try {
    const entities = {};
    for (const table of tables) entities[table] = await Platform.list(table);
    if (entities.settings) entities.settings = entities.settings.map((item) => item.id === 'preferences' ? { ...item, lockEnabled: false } : item);
    const result = await Platform.saveBackup({ format: 'minebot-local-backup-v1', createdAt: Date.now(), entities });
    await addLog({ category: 'info', level: 'info', message: 'تم إنشاء نسخة احتياطية محلية؛ لم تتضمن المفاتيح السرية.' });
    if (result.downloadUrl) {
      const link = document.createElement('a'); link.href = result.downloadUrl; link.download = result.filename || 'minebot-backup.json'; document.body.append(link); link.click(); link.remove();
      toast('تم تصدير النسخة الاحتياطية إلى تنزيلات المعاينة.', 'success', 4300);
    } else toast(`حُفظت النسخة في مساحة التطبيق: ${result.path || result.filename || 'backups'}`, 'success', 5500);
    await refreshAll();
  } catch (error) { toast(`تعذر إنشاء النسخة: ${error.message}`, 'error', 5000); }
}

function importBackup() {
  document.getElementById('backup-file')?.click();
}

async function onBackupFile(file) {
  if (!file) return;
  if (file.size > 8_000_000) return toast('حجم النسخة أكبر من 8 MB.', 'error');
  try {
    const json = JSON.parse(await file.text());
    const entities = json?.entities;
    const tables = ['servers', 'bots', 'tasks', 'task_history', 'settings', 'ai_config', 'skins', 'locations', 'logs', 'bot_states'];
    if (!entities || json.format !== 'minebot-local-backup-v1' || !tables.some((table) => Array.isArray(entities[table]))) throw new Error('صيغة النسخة الاحتياطية غير مدعومة.');
    for (const table of tables) if (entities[table] && (!Array.isArray(entities[table]) || entities[table].some((record) => !record || typeof record.id !== 'string'))) throw new Error(`بيانات ${table} غير صالحة.`);
    showConfirm('استيراد نسخة؟', 'ستُدمج السجلات ذات المعرّفات المتطابقة مع بيانات هذا الجهاز. المفتاح السري لا يُستورد، ولن تتصل البوتات تلقائيًا.', async () => {
      for (const table of tables) {
        for (const record of entities[table] || []) {
          let normalized = record;
          if (table === 'bots') normalized = { ...record, status: 'configured' };
          if (table === 'settings' && record.id === 'preferences') normalized = { ...record, lockEnabled: state.settings.lockEnabled };
          await Platform.save(table, normalized);
        }
      }
      await addLog({ level: 'info', category: 'info', message: 'تم دمج نسخة احتياطية محلية دون استيراد أسرار أو مفاتيح.' });
      await refreshAll({ renderAfter: false }); state.route = 'settings-storage'; state.params = {}; state.stack = []; render(); toast('اكتمل استيراد البيانات المحلية.', 'success');
    }, { danger: false, confirmLabel: 'استيراد' });
  } catch (error) { toast(error.message || 'تعذر قراءة النسخة.', 'error'); }
}

async function uploadSkin(file) {
  if (!file) return;
  if (file.type !== 'image/png') return toast('اختر ملف سكن Minecraft بصيغة PNG.', 'error');
  if (file.size < 16 || file.size > 2_000_000) return toast('حجم الملف يجب ألا يتجاوز 2 MB.', 'error');
  state.busy = 'skin';
  render();
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onerror = () => reject(new Error('تعذر قراءة ملف السكن.')); reader.onload = () => resolve(reader.result); reader.readAsDataURL(file);
    });
    const dimensions = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('ملف PNG غير صالح أو لا يمكن فك ترميزه.'));
      image.src = dataUrl;
    });
    if (dimensions.width !== 64 || ![32, 64].includes(dimensions.height)) throw new Error('يجب أن تكون أبعاد السكن 64×64 أو 64×32 بكسل.');
    const saved = await Platform.saveSkin(file.name, dataUrl);
    const record = { id: saved.id || uid(), name: file.name.replace(/[<>"'`]/g, '').slice(0, 64) || 'Skin', filePath: saved.filePath || '', bytes: saved.bytes || file.size, mime: file.type, width: dimensions.width, height: dimensions.height, createdAt: Date.now() };
    await Platform.save('skins', record);
    state.selectedSkinId = record.id;
    await addLog({ category: 'info', level: 'info', message: 'تم حفظ ملف سكن محليًا.' });
    await refreshAll({ renderAfter: false });
    state.busy = '';
    render(); toast('تم حفظ السكن في مساحة التطبيق المحلية.', 'success');
  } catch (error) { state.busy = ''; render(); toast(error.message, 'error'); }
}

async function deleteSkin(id) {
  const skin = state.skins.find((entry) => entry.id === id);
  if (!skin) return;
  showConfirm('حذف السكن؟', `سيُحذف الملف المحلي «${skin.name}». ملفات البوت التي تشير إليه ستعود بلا سكن.`, async () => {
    try {
      if (Platform.isNative && window.MineBotNative?.deleteSkin) {
        const result = JSON.parse(window.MineBotNative.deleteSkin(id, skin.filePath) || '{}');
        if (!result.ok) throw new Error(result.error || 'تعذر حذف ملف السكن.');
      } else if (!Platform.isNative) {
        const response = await fetch(`/api/skins/${encodeURIComponent(skin.filePath.split('/').pop() || id)}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('تعذر حذف ملف السكن.');
      }
      for (const bot of state.bots.filter((entry) => entry.skinId === id)) await Platform.save('bots', { ...bot, skinId: '', updatedAt: Date.now() });
      await Platform.remove('skins', id);
      await addLog({ category: 'info', level: 'warning', message: 'تم حذف ملف سكن محلي.' });
      state.selectedSkinId = '';
      await refreshAll({ renderAfter: false }); state.route = 'skins'; render(); toast('تم حذف السكن.', 'success');
    } catch (error) { toast(error.message, 'error'); }
  });
}

function handleClick(event) {
  const nav = event.target.closest('[data-route]');
  if (nav) {
    if (nav.matches('.nav-item')) navigate(nav.dataset.route, {}, { root: true });
    else navigate(nav.dataset.route);
    return;
  }
  const element = event.target.closest('[data-action]');
  if (!element) return;
  const action = element.dataset.action;
  const id = element.dataset.id || '';
  event.preventDefault();
  void (async () => {
    switch (action) {
      case 'go-home': navigate('home', {}, { root: true }); break;
      case 'settings': navigate('settings', {}, { root: true }); break;
      case 'retry-boot': await boot(); break;
      case 'open-ai': navigate('settings-ai'); break;
      case 'back': goBack(); break;
      case 'close-modal': closeModal(); break;
      case 'backdrop-close': if (event.target === element && !state.locked) closeModal(); break;
      case 'confirm-modal': {
        const actionFn = state.modalConfirm; state.modalConfirm = null; closeModal(); if (actionFn) await actionFn(); break;
      }
      case 'add-server': navigate('server-form'); break;
      case 'add-bot': navigate('bot-form'); break;
      case 'add-task': navigate('task-form'); break;
      case 'add-task-for-bot': navigate('task-form', { botId: id }); break;
      case 'server-details': if (!event.target.closest('button')) navigate('server-details', { id }); break;
      case 'bot-details': if (!event.target.closest('button')) navigate('bot-details', { id }); break;
      case 'task-details': if (!event.target.closest('button')) navigate('task-details', { id }); break;
      case 'server-menu': showServerMenu(id); break;
      case 'bot-menu': showBotMenu(id); break;
      case 'edit-server': closeModal(); navigate('server-form', { id }); break;
      case 'edit-bot': closeModal(); navigate('bot-form', { id }); break;
      case 'delete-server': closeModal(); await removeServer(id); break;
      case 'delete-bot': closeModal(); await removeBot(id); break;
      case 'ping-server': closeModal(); await testServer(id); break;
      case 'engine-info': showEngineInfo(id); break;
      case 'bot-tasks': navigate('tasks', { botId: id }); break;
      case 'open-inventory': navigate('inventory', { id }); break;
      case 'change-skin': state.selectedSkinId = state.bots.find((bot) => bot.id === id)?.skinId || ''; navigate('skins', { botId: id, skinId: state.selectedSkinId }); break;
      case 'open-skins': navigate('skins'); break;
      case 'bot-logs': closeModal(); navigate('logs', { botId: id }); break;
      case 'open-logs': closeModal(); navigate('logs', { botId: id }); break;
      case 'task-tab': state.taskTab = element.dataset.value === 'history' ? 'history' : 'active'; render(); break;
      case 'log-filter': state.logFilter = element.dataset.value || 'all'; render(); break;
      case 'generate-task-plan': await generateTaskPlan(state.params.id); break;
      case 'cancel-task': await cancelTask(id || state.params.id); break;
      case 'test-ai': await updateModels({ test: true }); break;
      case 'update-models': await updateModels(); break;
      case 'select-free-model': await selectFreeModel(); break;
      case 'clear-ai-key': showConfirm('حذف مفتاح OpenRouter؟', 'لن يمكن إنشاء خطط AI حتى تضيف مفتاحًا جديدًا. ستُحذف القيمة المشفّرة فقط.', async () => {
        await Platform.clearApiKey(); state.aiConfigured = false; ai.modelsCache = null; state.aiModels = []; await addLog({ category: 'ai', level: 'warning', message: 'حُذف مفتاح OpenRouter المحفوظ؛ لم تُسجل قيمته.' }); await refreshAll(); toast('تم حذف المفتاح.', 'success');
      }, { confirmLabel: 'حذف المفتاح' }); break;
      case 'reveal-key': {
        const input = document.getElementById('apiKey'); if (!input) break;
        input.type = input.type === 'password' ? 'text' : 'password';
        element.innerHTML = icon(input.type === 'password' ? 'eye' : 'eyeOff'); break;
      }
      case 'save-ai-limits': await saveAiLimits(); break;
      case 'configure-lock': await configureAppLock(); break;
      case 'clear-logs': showConfirm('مسح السجلات؟', 'سيتم حذف سجلات التطبيق وسجل تاريخ المهام فقط. لن تُحذف المهام أو السيرفرات أو البوتات.', async () => {
        await Platform.clear('logs'); await Platform.clear('task_history'); await refreshAll(); toast('تم مسح السجلات.', 'success');
      }, { confirmLabel: 'مسح السجلات' }); break;
      case 'clear-cache': ai.modelsCache = null; ai.modelsFetchedAt = 0; state.aiModels = []; toast('تم مسح Cache النماذج من الذاكرة المؤقتة.', 'success'); if (state.route === 'settings-storage') render(); break;
      case 'export-backup': await exportBackup(); break;
      case 'import-backup': importBackup(); break;
      case 'upload-skin': document.getElementById('skin-file')?.click(); break;
      case 'select-skin': state.selectedSkinId = id; state.params = { ...state.params, skinId: id }; render(); break;
      case 'apply-skin': {
        const bot = state.bots.find((entry) => entry.id === id);
        const skinId = state.params.skinId || state.selectedSkinId;
        if (!bot || !skinId) { toast('اختر سكنًا أولًا.', 'warning'); break; }
        await Platform.save('bots', { ...bot, skinId, updatedAt: Date.now() });
        await addLog({ level: 'info', category: 'info', botId: id, message: 'تم تعيين سكن على ملف البوت المحلي؛ لم يُرسل إلى Minecraft.' });
        await refreshAll({ renderAfter: false }); state.route = 'bot-details'; state.params = { id }; state.stack = []; render(); toast('تم حفظ اختيار السكن في ملف البوت.', 'success'); break;
      }
      case 'delete-selected-skin': await deleteSkin(id); break;
      case 'open-notifications': navigate('notifications'); break;
      case 'open-licenses': showModal({ title: 'تراخيص Open Source', description: 'ملخص الاعتمادات الموزعة مع المصدر', body: `<div class="log-list"><div class="log-row"><div class="log-symbol">${icon('info')}</div><div class="log-copy"><p><strong>Android Runtime</strong><br>يستخدم واجهات Android النظامية؛ لا تُضمّن مكتبات Android خارجية.</p></div></div><div class="log-row"><div class="log-symbol">${icon('info')}</div><div class="log-copy"><p><strong>esbuild · MIT</strong><br>أداة بناء Web المستخدمة لتجميع ملفات JavaScript.</p></div></div><div class="log-row"><div class="log-symbol">${icon('info')}</div><div class="log-copy"><p><strong>happy-dom · MIT</strong><br>اعتماد اختبارات واجهة فقط، ولا يُشحن مع APK.</p></div></div><p class="help-copy">التفاصيل في mobile/THIRD-PARTY-NOTICES.md داخل المصدر.</p></div>` }); break;
      case 'add-server-from-bot': navigate('server-form'); break;
      default: break;
    }
  })().catch((error) => toast(error.message || 'حدث خطأ غير متوقع.', 'error'));
}

function handleSubmit(event) {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const kind = form.dataset.form;
  void (async () => {
    try {
      switch (kind) {
        case 'server': await saveServerForm(form); break;
        case 'bot': await saveBotForm(form); break;
        case 'task': await createTaskForm(form); break;
        case 'ai-key': await saveAiKeyForm(form); break;
        case 'minecraft-settings': await saveMinecraftSettings(form); break;
        case 'pin-setup': await savePinSetup(form); break;
        case 'pin-change': await savePinChange(form); break;
        case 'unlock': {
          const pin = String(new FormData(form).get('pin') || '');
          const result = await Platform.lock('verify', pin);
          if (!result.valid) { const error = document.getElementById('unlock-error'); if (error) error.textContent = 'الرمز غير صحيح. حاول مرة أخرى.'; form.reset(); document.getElementById('unlockPin')?.focus(); break; }
          state.locked = false; closeModal(); toast('تم فتح التطبيق.', 'success'); break;
        }
        default: break;
      }
    } catch (error) { toast(error.message || 'تعذر حفظ البيانات.', 'error'); }
  })();
}

function handleChange(event) {
  const target = event.target;
  if (target.matches('[data-setting]')) { void toggleSetting(target).catch((error) => toast(error.message, 'error')); return; }
  if (target.matches('#ai-model-select')) {
    state.aiConfig = { ...state.aiConfig, model: target.value, automatic: !target.value, id: 'main' };
    void Platform.save('ai_config', state.aiConfig).then(() => { toast(target.value ? `تم اختيار ${target.value}` : 'تم تفعيل الاختيار التلقائي.', 'success'); render(); }).catch((error) => toast(error.message, 'error'));
    return;
  }
  if (target.matches('#skin-file')) { void uploadSkin(target.files?.[0]); target.value = ''; return; }
  if (target.matches('#backup-file')) { void onBackupFile(target.files?.[0]); target.value = ''; }
}

let searchTimer;
function handleInput(event) {
  const target = event.target;
  if (!target.matches('[data-search]')) return;
  state.search = target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const current = document.querySelector('[data-search]');
    const value = state.search;
    render();
    const next = document.querySelector('[data-search]');
    if (next) { next.value = value; next.focus(); next.setSelectionRange(value.length, value.length); }
  }, 120);
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    if (document.querySelector('#overlay-root .modal-backdrop') && !state.locked) closeModal();
    else goBack();
  }
  if (event.key === 'Enter' && event.target.matches('.list-card[role="button"]')) {
    event.preventDefault(); event.target.click();
  }
}

async function boot() {
  try {
    await loadAll();
    state.loading = false;
    render();
    if (state.settings.lockEnabled) showLockOverlay();
    document.getElementById('screen').setAttribute('aria-busy', 'false');
  } catch (error) {
    state.loading = false;
    state.bootError = String(error?.message || 'تعذر فتح قاعدة البيانات المحلية.');
    document.getElementById('screen').innerHTML = `<div class="empty-state"><div class="empty-icon">${icon('alert')}</div><h3>تعذر فتح البيانات المحلية</h3><p>${h(state.bootError)}</p><button class="btn btn-secondary" data-action="retry-boot">إعادة المحاولة</button></div>`;
  }
}

document.addEventListener('click', handleClick);
document.addEventListener('submit', handleSubmit);
document.addEventListener('change', handleChange);
document.addEventListener('input', handleInput);
document.addEventListener('keydown', handleKeydown);
window.__minebotForeground = () => { if (state.settings.lockEnabled && !state.locked) showLockOverlay(); };
window.__minebotBack = () => goBack();
window.__minebotPermissionResult = async (granted) => {
  state.settings = { ...state.settings, notifications: Boolean(granted), id: 'preferences' };
  await Platform.save('settings', state.settings).catch(() => {});
  render();
  toast(granted ? 'تم تفعيل إشعارات أحداث التطبيق.' : 'لم يتم السماح بالإشعارات.', granted ? 'success' : 'warning');
};
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (state.settings.lockEnabled && hiddenAt && Date.now() - hiddenAt > 25_000) showLockOverlay();
});
window.__minebotAppReady = boot();
