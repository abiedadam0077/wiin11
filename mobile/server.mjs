import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.join(ROOT, 'www');
const TABLES = new Set(['servers', 'bots', 'tasks', 'task_history', 'settings', 'ai_config', 'skins', 'locations', 'logs', 'bot_states']);
const MAX_JSON_BYTES = 10 * 1024 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json; charset=utf-8',
};

export function validateServerAddress(host, port) {
  const address = String(host ?? '').trim();
  const portNumber = Number(port);
  if (!address || address.length > 253 || /[\s\/\\?#@]/.test(address)) return { ok: false, error: 'أدخل عنوان سيرفر صالحًا بدون مسافات.' };
  const unwrapped = address.startsWith('[') && address.endsWith(']') ? address.slice(1, -1) : address;
  const isIp = net.isIP(unwrapped) !== 0;
  const labels = unwrapped.split('.');
  const isDomain = labels.length >= 1 && labels.every((label) => label.length >= 1 && label.length <= 63 && /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label));
  if (!isIp && !isDomain) return { ok: false, error: 'صيغة عنوان السيرفر غير صحيحة.' };
  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) return { ok: false, error: 'المنفذ يجب أن يكون رقمًا بين 1 و65535.' };
  return { ok: true, host: unwrapped, port: portNumber };
}

export function encodeVarInt(value) {
  let number = Number(value) >>> 0;
  const bytes = [];
  do {
    let byte = number & 0x7f;
    number >>>= 7;
    if (number !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (number !== 0);
  return Buffer.from(bytes);
}

function encodeString(value) {
  const bytes = Buffer.from(String(value), 'utf8');
  return Buffer.concat([encodeVarInt(bytes.length), bytes]);
}

function makePacket(payload) {
  return Buffer.concat([encodeVarInt(payload.length), payload]);
}

export function makeStatusHandshake(host, port, protocolVersion = 765) {
  const packet = Buffer.concat([
    encodeVarInt(0), encodeVarInt(protocolVersion), encodeString(host),
    Buffer.from([(port >>> 8) & 0xff, port & 0xff]), encodeVarInt(1),
  ]);
  const statusRequest = makePacket(encodeVarInt(0));
  return Buffer.concat([makePacket(packet), statusRequest]);
}

class SocketReader {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.waiters = [];
    this.failure = null;
    socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.flush();
    });
    socket.on('error', (error) => this.fail(error));
    socket.on('end', () => this.fail(new Error('انتهى الاتصال قبل اكتمال استجابة السيرفر.')));
    socket.on('close', () => {
      if (this.waiters.length) this.fail(new Error('أغلق السيرفر الاتصال قبل اكتمال الاستجابة.'));
    });
  }
  flush() {
    while (this.waiters.length && this.buffer.length >= this.waiters[0].size) {
      const waiter = this.waiters.shift();
      const chunk = this.buffer.subarray(0, waiter.size);
      this.buffer = this.buffer.subarray(waiter.size);
      waiter.resolve(chunk);
    }
  }
  fail(error) {
    if (this.failure) return;
    this.failure = error;
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
  }
  read(size) {
    if (size < 0 || size > 1024 * 1024) return Promise.reject(new Error('حجم استجابة غير صالح.'));
    if (this.buffer.length >= size) {
      const result = this.buffer.subarray(0, size);
      this.buffer = this.buffer.subarray(size);
      return Promise.resolve(result);
    }
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      this.waiters.push({ size, resolve, reject });
      this.flush();
    });
  }
  async varInt() {
    let result = 0;
    let position = 0;
    let byte;
    do {
      if (position > 28) throw new Error('استجابة Minecraft تحتوي على VarInt غير صالح.');
      byte = (await this.read(1))[0];
      result |= (byte & 0x7f) << position;
      position += 7;
    } while (byte & 0x80);
    return result >>> 0;
  }
}

function textFromChat(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textFromChat).join('');
  if (!value || typeof value !== 'object') return '';
  return `${value.text ?? ''}${textFromChat(value.extra ?? [])}`;
}

export function pingMinecraftServer(host, port, { timeoutMs = 6500, protocolVersion = 765 } = {}) {
  const checked = validateServerAddress(host, port);
  if (!checked.ok) return Promise.reject(new Error(checked.error));
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: checked.host, port: checked.port });
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      fn(value);
    };
    socket.setTimeout(timeoutMs, () => finish(reject, new Error('انتهت مهلة الاتصال. تحقق من العنوان والمنفذ.')));
    socket.once('error', (error) => finish(reject, new Error(`تعذّر الاتصال: ${error.code === 'ECONNREFUSED' ? 'رفض السيرفر الاتصال.' : error.code === 'ENOTFOUND' ? 'تعذر العثور على عنوان السيرفر.' : error.message}`)));
    socket.once('connect', async () => {
      try {
        const reader = new SocketReader(socket);
        socket.write(makeStatusHandshake(checked.host, checked.port, protocolVersion));
        const packetLength = await reader.varInt();
        if (packetLength < 1 || packetLength > 1_000_000) throw new Error('حجم استجابة السيرفر غير صالح.');
        const packetId = await reader.varInt();
        if (packetId !== 0) throw new Error('أرسل السيرفر حزمة حالة غير متوقعة.');
        const stringLength = await reader.varInt();
        if (stringLength < 2 || stringLength > packetLength) throw new Error('بيانات حالة السيرفر غير صالحة.');
        const json = JSON.parse((await reader.read(stringLength)).toString('utf8'));
        finish(resolve, {
          online: true,
          host: checked.host,
          port: checked.port,
          version: String(json.version?.name ?? 'غير معروف').slice(0, 80),
          protocol: Number.isFinite(Number(json.version?.protocol)) ? Number(json.version.protocol) : null,
          playersOnline: Math.max(0, Number(json.players?.online) || 0),
          playersMax: Math.max(0, Number(json.players?.max) || 0),
          description: textFromChat(json.description).slice(0, 300),
          checkedAt: Date.now(),
        });
      } catch (error) {
        finish(reject, error instanceof Error ? error : new Error('تعذر قراءة حالة السيرفر.'));
      }
    });
  });
}

export class LocalDatabase {
  constructor(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.sqlite = new DatabaseSync(filePath);
    this.sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    for (const table of TABLES) {
      this.sqlite.exec(`CREATE TABLE IF NOT EXISTS "${table}" (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)`);
      this.sqlite.exec(`CREATE INDEX IF NOT EXISTS "idx_${table}_updated" ON "${table}"(updated_at DESC)`);
    }
  }
  list(table) {
    this.assertTable(table);
    return this.sqlite.prepare(`SELECT payload FROM "${table}" ORDER BY updated_at DESC`).all().map((row) => JSON.parse(row.payload));
  }
  get(table, id) {
    this.assertTable(table);
    const row = this.sqlite.prepare(`SELECT payload FROM "${table}" WHERE id = ?`).get(String(id));
    return row ? JSON.parse(row.payload) : null;
  }
  upsert(table, record) {
    this.assertTable(table);
    if (!record || typeof record !== 'object' || Array.isArray(record) || typeof record.id !== 'string' || !record.id || record.id.length > 128) throw new Error('المعرّف غير صالح.');
    const payload = JSON.stringify(record);
    if (Buffer.byteLength(payload) > 1_000_000) throw new Error('حجم السجل أكبر من الحد المسموح.');
    this.sqlite.prepare(`INSERT INTO "${table}" (id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`).run(record.id, payload, Date.now());
    return record;
  }
  remove(table, id) {
    this.assertTable(table);
    return Number(this.sqlite.prepare(`DELETE FROM "${table}" WHERE id = ?`).run(String(id)).changes) > 0;
  }
  clear(table) {
    this.assertTable(table);
    this.sqlite.prepare(`DELETE FROM "${table}"`).run();
  }
  assertTable(table) {
    if (!TABLES.has(table)) throw new Error('نوع بيانات غير مسموح.');
  }
  close() { this.sqlite.close(); }
}

async function readJson(request, limit = MAX_JSON_BYTES) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > limit) throw Object.assign(new Error('حجم الطلب أكبر من الحد المسموح.'), { status: 413 });
    chunks.push(chunk);
  }
  if (!length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('صيغة JSON غير صالحة.'), { status: 400 }); }
}

function json(response, status, data) {
  const body = JSON.stringify(data);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
}

function createApiClient(getKey) {
  return async (request, response, route) => {
    const key = getKey();
    if (!key) return json(response, 401, { error: 'أضف مفتاح OpenRouter من إعدادات الذكاء الاصطناعي.' });
    if (route === '/api/ai/models' && request.method === 'GET') {
      const upstream = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${key}`, 'X-Title': 'MineBot AI' }, signal: AbortSignal.timeout(20_000),
      });
      if (!upstream.ok) {
        const errorText = upstream.status === 401 ? 'مفتاح OpenRouter مرفوض؛ تحقّق من المفتاح.' : upstream.status === 429 ? 'تم تجاوز حد OpenRouter؛ حاول لاحقًا.' : `أعاد OpenRouter خطأ HTTP ${upstream.status}.`;
        return json(response, upstream.status, { error: errorText });
      }
      const body = await upstream.text();
      response.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(body);
      return;
    }
    if (route === '/api/ai/chat/completions' && request.method === 'POST') {
      const body = await readJson(request, 1_000_000);
      if (typeof body.model !== 'string' || !body.model || body.model.length > 160 || !Array.isArray(body.messages)) return json(response, 400, { error: 'طلب نموذج غير صالح.' });
      const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'MineBot AI' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(45_000),
      });
      if (!upstream.ok) {
        const errorText = upstream.status === 401 ? 'مفتاح OpenRouter مرفوض؛ تحقّق من المفتاح.' : upstream.status === 429 ? 'تم تجاوز حد OpenRouter؛ حاول لاحقًا.' : `أعاد OpenRouter خطأ HTTP ${upstream.status}.`;
        return json(response, upstream.status, { error: errorText });
      }
      const text = await upstream.text();
      response.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(text);
      return;
    }
    json(response, 404, { error: 'مسار AI غير معروف.' });
  };
}

export function createMineBotServer({ dataDir = path.join(ROOT, '.data'), webRoot = WEB_ROOT } = {}) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = new LocalDatabase(path.join(dataDir, 'minebot.sqlite'));
  const skinsDir = path.join(dataDir, 'skins');
  const backupsDir = path.join(dataDir, 'backups');
  fs.mkdirSync(skinsDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(backupsDir, { recursive: true, mode: 0o700 });
  let previewKey = null; // intentionally process-memory-only; never written to SQLite, files, or logs
  let pinHash = null; // preview-only app-lock verifier, not persisted to disk
  let pinFailures = 0;
  let pinBlockedUntil = 0;
  const aiHandler = createApiClient(() => previewKey);

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const route = url.pathname;
    try {
      if (route === '/api/health' && request.method === 'GET') return json(response, 200, { ok: true, mode: 'local-preview', native: false, sqlite: true, uptime: Math.floor(process.uptime()) });

      const dataMatch = route.match(/^\/api\/data\/([a-z_]+)(?:\/([^/]+))?$/);
      if (dataMatch) {
        const [, table, rawId] = dataMatch;
        if (!TABLES.has(table)) return json(response, 404, { error: 'نوع بيانات غير معروف.' });
        if (request.method === 'GET' && !rawId) return json(response, 200, { data: db.list(table) });
        if (request.method === 'POST' && !rawId) {
          const record = await readJson(request, 1_000_000);
          return json(response, 200, { data: db.upsert(table, record) });
        }
        if (request.method === 'DELETE' && rawId) {
          const id = decodeURIComponent(rawId);
          return json(response, 200, { deleted: db.remove(table, id) });
        }
        if (request.method === 'DELETE' && !rawId) { db.clear(table); return json(response, 200, { deleted: true }); }
        return json(response, 405, { error: 'طريقة الطلب غير مدعومة.' });
      }

      if (route === '/api/servers/ping' && request.method === 'POST') {
        const body = await readJson(request, 2048);
        const requestedTimeout = Number(body.timeoutMs) || 8000;
        const result = await pingMinecraftServer(body.host, body.port, { timeoutMs: Math.max(2000, Math.min(30_000, requestedTimeout)) });
        return json(response, 200, result);
      }

      if (route === '/api/ai/key' && request.method === 'POST') {
        const body = await readJson(request, 4096);
        const key = String(body.key ?? '').trim();
        if (key && (key.length < 20 || key.length > 512 || /\s/.test(key))) return json(response, 400, { error: 'صيغة المفتاح غير صالحة. تحقق من مفتاح OpenRouter.' });
        previewKey = key || null;
        return json(response, 200, { configured: Boolean(previewKey), storage: 'memory-only' });
      }
      if (route === '/api/ai/status' && request.method === 'GET') return json(response, 200, { configured: Boolean(previewKey), storage: 'memory-only' });
      if (route.startsWith('/api/ai/')) return await aiHandler(request, response, route);

      if (route === '/api/security/pin' && request.method === 'POST') {
        const body = await readJson(request, 2048);
        if (body.action === 'status') return json(response, 200, { enabled: Boolean(pinHash) });
        if (body.action === 'set') {
          const pin = String(body.pin ?? '');
          if (!/^\d{6}$/.test(pin)) return json(response, 400, { error: 'رمز القفل يجب أن يتكون من 6 أرقام.' });
          const salt = crypto.randomBytes(16);
          pinHash = `${salt.toString('hex')}:${crypto.scryptSync(pin, salt, 32).toString('hex')}`;
          pinFailures = 0; pinBlockedUntil = 0;
          return json(response, 200, { enabled: true });
        }
        if (body.action === 'verify') {
          const pin = String(body.pin ?? '');
          if (!pinHash) return json(response, 200, { valid: true });
          const now = Date.now();
          if (now < pinBlockedUntil) return json(response, 200, { valid: false, retryAfterMs: pinBlockedUntil - now });
          if (!/^\d{6}$/.test(pin)) {
            pinFailures += 1;
            if (pinFailures >= 5) { pinFailures = 0; pinBlockedUntil = now + 30_000; }
            return json(response, 200, { valid: false, retryAfterMs: Math.max(0, pinBlockedUntil - now) });
          }
          const [saltHex, hashHex] = pinHash.split(':');
          const candidate = crypto.scryptSync(pin, Buffer.from(saltHex, 'hex'), 32);
          const valid = crypto.timingSafeEqual(candidate, Buffer.from(hashHex, 'hex'));
          if (valid) { pinFailures = 0; pinBlockedUntil = 0; }
          else { pinFailures += 1; if (pinFailures >= 5) { pinFailures = 0; pinBlockedUntil = now + 30_000; } }
          return json(response, 200, { valid, retryAfterMs: Math.max(0, pinBlockedUntil - now) });
        }
        if (body.action === 'clear') { pinHash = null; pinFailures = 0; pinBlockedUntil = 0; return json(response, 200, { enabled: false }); }
        return json(response, 400, { error: 'عملية قفل غير معروفة.' });
      }

      if (route === '/api/skins' && request.method === 'POST') {
        const body = await readJson(request, 3_000_000);
        const data = String(body.data ?? '');
        const match = data.match(/^data:image\/png;base64,([a-z\d+/=]+)$/i);
        if (!match) return json(response, 400, { error: 'اختر ملف PNG صالحًا.' });
        const bytes = Buffer.from(match[1], 'base64');
        if (bytes.length > 2_000_000) return json(response, 413, { error: 'حجم صورة السكن أكبر من 2 ميغابايت.' });
        if (bytes.length < 33) return json(response, 400, { error: 'ملف PNG غير صالح.' });
        const signatureOk = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.subarray(12, 16).toString('ascii') === 'IHDR';
        if (!signatureOk) return json(response, 400, { error: 'محتوى الملف لا يطابق صيغة PNG.' });
        const width = bytes.readUInt32BE(16);
        const height = bytes.readUInt32BE(20);
        if (width !== 64 || ![32, 64].includes(height)) return json(response, 400, { error: 'أبعاد السكن يجب أن تكون 64×64 أو 64×32 بكسل.' });
        if (bytes.indexOf(Buffer.from('IDAT')) < 0 || bytes.indexOf(Buffer.from('IEND')) < 0) return json(response, 400, { error: 'ملف PNG غير مكتمل.' });
        const id = crypto.randomUUID();
        const ext = 'png';
        const filename = `${id}.${ext}`;
        fs.writeFileSync(path.join(skinsDir, filename), bytes, { mode: 0o600, flag: 'wx' });
        return json(response, 201, { id, filePath: `/api/skins/file/${filename}`, bytes: bytes.length });
      }
      const skinFile = route.match(/^\/api\/skins\/file\/([a-f\d-]{36}\.(?:png|jpg|webp))$/i);
      if (skinFile && request.method === 'GET') {
        const file = path.join(skinsDir, skinFile[1]);
        if (!fs.existsSync(file)) return json(response, 404, { error: 'ملف السكن غير موجود.' });
        response.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
        return fs.createReadStream(file).pipe(response);
      }
      const skinDelete = route.match(/^\/api\/skins\/([a-f\d-]{36}\.(?:png|jpg|webp))$/i);
      if (skinDelete && request.method === 'DELETE') {
        const file = path.join(skinsDir, skinDelete[1]);
        if (fs.existsSync(file)) fs.unlinkSync(file);
        return json(response, 200, { deleted: true });
      }

      if (route === '/api/backups' && request.method === 'POST') {
        const body = await readJson(request, 8_000_000);
        if (!body || typeof body !== 'object' || !body.entities || typeof body.entities !== 'object') return json(response, 400, { error: 'ملف النسخة الاحتياطية غير صالح.' });
        const filename = `minebot-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        fs.writeFileSync(path.join(backupsDir, filename), JSON.stringify({ format: 'minebot-local-backup-v1', createdAt: Date.now(), entities: body.entities }), { mode: 0o600, flag: 'wx' });
        return json(response, 201, { filename, downloadUrl: `/api/backups/${encodeURIComponent(filename)}` });
      }
      const backup = route.match(/^\/api\/backups\/(minebot-backup-[\dTZ-]+\.json)$/);
      if (backup && request.method === 'GET') {
        const file = path.join(backupsDir, backup[1]);
        if (!fs.existsSync(file)) return json(response, 404, { error: 'النسخة الاحتياطية غير موجودة.' });
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${backup[1]}"`, 'X-Content-Type-Options': 'nosniff' });
        return fs.createReadStream(file).pipe(response);
      }

      if (route === '/download/source.zip' && request.method === 'GET') {
        const archive = path.join(ROOT, 'MineBot-AI-source.zip');
        if (!fs.existsSync(archive)) return json(response, 404, { error: 'حزمة المصدر غير موجودة في هذه المعاينة.' });
        response.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Length': fs.statSync(archive).size,
          'Content-Disposition': 'attachment; filename="MineBot-AI-source.zip"',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        return fs.createReadStream(archive).pipe(response);
      }

      if (route.startsWith('/api/')) return json(response, 404, { error: 'مسار غير معروف.' });
      const requestedPath = route === '/' ? '/index.html' : decodeURIComponent(route);
      const file = path.resolve(webRoot, `.${requestedPath}`);
      if (!file.startsWith(path.resolve(webRoot) + path.sep) && file !== path.join(path.resolve(webRoot), 'index.html')) return json(response, 403, { error: 'المسار مرفوض.' });
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return json(response, 404, { error: 'الملف غير موجود.' });
      response.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
        'Cache-Control': path.extname(file) === '.html' ? 'no-cache' : 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'self' data: blob: file:; img-src 'self' data: blob: file:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      });
      fs.createReadStream(file).pipe(response);
    } catch (error) {
      if (response.headersSent) { response.destroy(); return; }
      const status = Number(error?.status) || (error?.name === 'AbortError' || error?.name === 'TimeoutError' ? 504 : 500);
      json(response, status, { error: error?.message || 'حدث خطأ محلي غير متوقع.' });
    }
  });
  server.minebot = { db, dataDir, close() { previewKey = null; pinHash = null; db.close(); } };
  return server;
}

const calledDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (calledDirectly) {
  const port = Math.min(65535, Math.max(1, Number(process.env.PORT) || 4173));
  const server = createMineBotServer({ dataDir: process.env.MINEBOT_DATA_DIR || path.join(ROOT, '.data') });
  server.listen(port, '0.0.0.0', () => {
    console.log(`MineBot AI local preview listening on 0.0.0.0:${port}`);
    console.log(`SQLite data directory: ${path.join(ROOT, '.data')}`);
    console.log('OpenRouter keys are held in process memory only in this development preview; never logged or written to disk.');
  });
  const shutdown = () => server.close(() => { server.minebot.close(); process.exit(0); });
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
