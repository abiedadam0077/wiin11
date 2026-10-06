const TABLES = new Set(['servers', 'bots', 'tasks', 'task_history', 'settings', 'ai_config', 'skins', 'locations', 'logs', 'bot_states']);
const native = typeof window !== 'undefined' && Boolean(window.MineBotNative);
const pending = new Map();
let sequence = 0;

if (typeof window !== 'undefined') window.__minebotNativeResult = (requestId, raw) => {
  const entry = pending.get(String(requestId));
  if (!entry) return;
  pending.delete(String(requestId));
  clearTimeout(entry.timeout);
  try {
    const result = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (result?.ok === false) entry.reject(new Error(result.error || 'تعذر إكمال العملية على الجهاز.'));
    else entry.resolve(result);
  } catch (error) {
    entry.reject(error instanceof Error ? error : new Error('استجابة محلية غير صالحة.'));
  }
};

function asyncNative(method, args = [], timeout = 30_000) {
  if (!native || typeof window.MineBotNative[method] !== 'function') return Promise.reject(new Error('هذه الوظيفة تتطلب إصدار Android.'));
  const requestId = `mb-${Date.now()}-${++sequence}`;
  return new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error('انتهت مهلة العملية. حاول مرة أخرى.'));
    }, timeout);
    pending.set(requestId, { resolve, reject, timeout: timeoutHandle });
    try { window.MineBotNative[method](...args, requestId); }
    catch (error) { clearTimeout(timeoutHandle); pending.delete(requestId); reject(error); }
  });
}

async function apiJson(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    cache: 'no-store',
  });
  let result;
  try { result = await response.json(); } catch { result = {}; }
  if (!response.ok) throw new Error(result.error || `فشل الطلب (${response.status}).`);
  return result;
}

export const Platform = Object.freeze({
  isNative: native,
  mode: native ? 'android' : 'local-preview',
  async list(table) {
    if (!TABLES.has(table)) throw new Error('نوع بيانات غير معروف.');
    if (native) {
      const raw = window.MineBotNative.readAll(table);
      const result = JSON.parse(raw || '[]');
      return Array.isArray(result) ? result : [];
    }
    const result = await apiJson(`/api/data/${encodeURIComponent(table)}`);
    return result.data || [];
  },
  async get(table, id) {
    const items = await this.list(table);
    return items.find((item) => item.id === id) || null;
  },
  async save(table, record) {
    if (!TABLES.has(table)) throw new Error('نوع بيانات غير معروف.');
    if (!record || typeof record.id !== 'string' || !record.id.trim()) throw new Error('المعرّف مطلوب.');
    if (native) {
      const result = JSON.parse(window.MineBotNative.upsert(table, JSON.stringify(record)) || '{}');
      if (!result.ok) throw new Error(result.error || 'تعذر حفظ البيانات في SQLite.');
      return record;
    }
    const result = await apiJson(`/api/data/${encodeURIComponent(table)}`, { method: 'POST', body: JSON.stringify(record) });
    return result.data;
  },
  async remove(table, id) {
    if (!TABLES.has(table)) throw new Error('نوع بيانات غير معروف.');
    if (native) {
      const result = JSON.parse(window.MineBotNative.remove(table, id) || '{}');
      if (!result.ok) throw new Error(result.error || 'تعذر حذف السجل من SQLite.');
      return Boolean(result.deleted);
    }
    const result = await apiJson(`/api/data/${encodeURIComponent(table)}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return Boolean(result.deleted);
  },
  async clear(table) {
    if (!TABLES.has(table)) throw new Error('نوع بيانات غير معروف.');
    if (native) {
      const result = JSON.parse(window.MineBotNative.clear(table) || '{}');
      if (!result.ok) throw new Error(result.error || 'تعذر مسح البيانات.');
      return;
    }
    await apiJson(`/api/data/${encodeURIComponent(table)}`, { method: 'DELETE' });
  },
  async pingServer(host, port, timeoutMs = 8000) {
    const timeout = Math.max(2000, Math.min(30_000, Number(timeoutMs) || 8000));
    if (native) {
      const result = await asyncNative('pingServer', [host, Number(port), timeout], timeout + 5000);
      if (!result.online) throw new Error(result.error || 'السيرفر غير متصل.');
      return result;
    }
    const result = await apiJson('/api/servers/ping', { method: 'POST', body: JSON.stringify({ host, port: Number(port), timeoutMs: timeout }) });
    if (!result.online) throw new Error(result.error || 'السيرفر غير متصل.');
    return result;
  },
  async aiStatus() {
    if (native) return { configured: Boolean(window.MineBotNative.hasApiKey()), storage: 'android-keystore' };
    return apiJson('/api/ai/status');
  },
  async setApiKey(key) {
    if (native) {
      const result = JSON.parse(window.MineBotNative.saveApiKey(key) || '{}');
      if (!result.ok) throw new Error(result.error || 'تعذر تخزين المفتاح الآمن.');
      return { configured: Boolean(result.configured), storage: 'android-keystore' };
    }
    const result = await apiJson('/api/ai/key', { method: 'POST', body: JSON.stringify({ key }) });
    return result;
  },
  async clearApiKey() {
    if (native) {
      const result = JSON.parse(window.MineBotNative.clearApiKey() || '{}');
      if (!result.ok) throw new Error(result.error || 'تعذر حذف المفتاح.');
      return { configured: false, storage: 'android-keystore' };
    }
    return apiJson('/api/ai/key', { method: 'POST', body: JSON.stringify({ key: '' }) });
  },
  async aiRequest(endpoint, method = 'GET', body = undefined) {
    if (!['/models', '/chat/completions'].includes(endpoint)) throw new Error('مسار OpenRouter غير مسموح.');
    if (native) {
      return asyncNative('openRouter', [endpoint, method, body ? JSON.stringify(body) : ''], endpoint === '/models' ? 25_000 : 50_000);
    }
    const options = { method };
    if (body !== undefined) options.body = JSON.stringify(body);
    return apiJson(`/api/ai${endpoint}`, options);
  },
  async saveSkin(fileName, dataUrl) {
    if (native) return asyncNative('saveSkin', [fileName, dataUrl], 18_000);
    return apiJson('/api/skins', { method: 'POST', body: JSON.stringify({ name: fileName, data: dataUrl }) });
  },
  async saveBackup(payload) {
    if (native) return asyncNative('saveBackup', [JSON.stringify(payload)], 18_000);
    return apiJson('/api/backups', { method: 'POST', body: JSON.stringify(payload) });
  },
  async lock(action, pin = '') {
    if (native) {
      if (action === 'status') return { enabled: Boolean(window.MineBotNative.hasPin()) };
      const method = action === 'set' ? 'savePin' : action === 'verify' ? 'verifyPin' : 'clearPin';
      if (action === 'verify') return JSON.parse(window.MineBotNative[method](pin) || '{}');
      const result = JSON.parse(window.MineBotNative[method](pin) || '{}');
      if (!result.ok) throw new Error(result.error || 'تعذر تحديث قفل التطبيق.');
      return result;
    }
    return apiJson('/api/security/pin', { method: 'POST', body: JSON.stringify({ action, pin }) });
  },
  async health() {
    if (native) return { ok: true, mode: 'android', native: true, sqlite: true };
    return apiJson('/api/health');
  },
});
