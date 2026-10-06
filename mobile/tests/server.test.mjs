import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { deflateSync } from 'node:zlib';
import {
  createMineBotServer, LocalDatabase, encodeVarInt, makeStatusHandshake, validateServerAddress, pingMinecraftServer,
} from '../server.mjs';
import { rankFreeModels } from '../www/js/ai.js';
import { evaluateBehavior } from '../www/js/behavior-engine.js';
import { transitionTask } from '../www/js/task-engine.js';

function temporaryDirectory() { return fs.mkdtempSync(path.join(os.tmpdir(), 'minebot-test-')); }

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(name, data) {
  const type = Buffer.from(name, 'ascii');
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([length, type, data, crc]);
}

function makePng(width, height) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const pixels = deflateSync(Buffer.alloc(height * (width * 4 + 1)));
  return Buffer.concat([signature, pngChunk('IHDR', header), pngChunk('IDAT', pixels), pngChunk('IEND', Buffer.alloc(0))]);
}

async function withServer(t) {
  const dataDir = temporaryDirectory();
  const server = createMineBotServer({ dataDir });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    server.minebot.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  return { server, origin, dataDir };
}

async function jsonFetch(origin, route, options = {}) {
  const response = await fetch(`${origin}${route}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const body = await response.json();
  return { response, body };
}

test('Minecraft server address validation accepts host/domain/IPv4 and rejects bad ports', () => {
  assert.deepEqual(validateServerAddress('play.example.org', 25565), { ok: true, host: 'play.example.org', port: 25565 });
  assert.equal(validateServerAddress('127.0.0.1', 25565).ok, true);
  assert.equal(validateServerAddress('[::1]', 25565).ok, true);
  assert.equal(validateServerAddress('bad host', 25565).ok, false);
  assert.equal(validateServerAddress('example.org', 65536).ok, false);
  assert.equal(validateServerAddress('', 25565).ok, false);
});

test('Minecraft status handshake packet uses protocol VarInts and status state', () => {
  assert.deepEqual([...encodeVarInt(0)], [0]);
  assert.deepEqual([...encodeVarInt(127)], [127]);
  assert.deepEqual([...encodeVarInt(128)], [128, 1]);
  assert.deepEqual([...encodeVarInt(765)], [253, 5]);
  const packet = makeStatusHandshake('mc.example.org', 25565, 765);
  assert.ok(packet.length > 20);
  const handshakeLength = packet[0];
  assert.equal(packet[1 + handshakeLength], 1); // one-byte status-request frame length
  assert.equal(packet.at(-1), 0); // status request packet id
});

test('Minecraft status client performs a real TCP status handshake and parses players/version', async () => {
  const fixture = net.createServer((socket) => {
    socket.once('data', () => {
      const json = Buffer.from(JSON.stringify({ version: { name: '1.20.4', protocol: 765 }, players: { online: 2, max: 20 }, description: { text: 'Local test server' } }));
      const payload = Buffer.concat([Buffer.from([0]), encodeVarInt(json.length), json]);
      socket.end(Buffer.concat([encodeVarInt(payload.length), payload]));
    });
  });
  await new Promise((resolve, reject) => { fixture.once('error', reject); fixture.listen(0, '127.0.0.1', resolve); });
  try {
    const result = await pingMinecraftServer('127.0.0.1', fixture.address().port, { timeoutMs: 1000 });
    assert.equal(result.online, true);
    assert.equal(result.version, '1.20.4');
    assert.equal(result.playersOnline, 2);
    assert.equal(result.playersMax, 20);
    assert.equal(result.description, 'Local test server');
  } finally { await new Promise((resolve) => fixture.close(resolve)); }
});

test('SQLite repository performs isolated CRUD using stable ids', () => {
  const dataDir = temporaryDirectory();
  const db = new LocalDatabase(path.join(dataDir, 'test.sqlite'));
  try {
    db.upsert('servers', { id: 's1', name: 'Home', host: '127.0.0.1', port: 25565 });
    db.upsert('servers', { id: 's1', name: 'Home edited', host: '127.0.0.1', port: 25566 });
    db.upsert('bots', { id: 'b1', name: 'Miner' });
    assert.equal(db.list('servers').length, 1);
    assert.equal(db.get('servers', 's1').name, 'Home edited');
    assert.equal(db.list('bots').length, 1);
    assert.equal(db.remove('servers', 's1'), true);
    assert.equal(db.remove('servers', 'missing'), false);
    assert.equal(db.list('servers').length, 0);
  } finally {
    db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('preview HTTP API persists data in local SQLite and returns no secret value', async (t) => {
  const { origin } = await withServer(t);
  let result = await jsonFetch(origin, '/api/health');
  assert.equal(result.response.status, 200);
  assert.equal(result.body.sqlite, true);
  assert.equal(result.body.native, false);

  result = await jsonFetch(origin, '/api/data/servers', { method: 'POST', body: JSON.stringify({ id: 'server-a', name: 'Solo', host: '127.0.0.1', port: 25565 }) });
  assert.equal(result.response.status, 200);
  result = await jsonFetch(origin, '/api/data/servers');
  assert.equal(result.body.data.length, 1);
  assert.equal(result.body.data[0].host, '127.0.0.1');
  result = await jsonFetch(origin, '/api/data/unsupported');
  assert.equal(result.response.status, 404);
  result = await jsonFetch(origin, '/api/data/servers/server-a', { method: 'DELETE' });
  assert.equal(result.body.deleted, true);
  result = await jsonFetch(origin, '/api/data/servers');
  assert.equal(result.body.data.length, 0);

  const sourceDownload = await fetch(`${origin}/download/source.zip`);
  assert.equal(sourceDownload.status, 200);
  assert.match(sourceDownload.headers.get('content-disposition') || '', /MineBot-AI-source\.zip/);
  assert.equal((await sourceDownload.arrayBuffer()).byteLength > 1000, true);

  result = await jsonFetch(origin, '/api/ai/status');
  assert.equal(result.body.configured, false);
  const secret = `sk-or-v1-${'a'.repeat(44)}`;
  result = await jsonFetch(origin, '/api/ai/key', { method: 'POST', body: JSON.stringify({ key: secret }) });
  assert.equal(result.body.configured, true);
  assert.equal(result.body.storage, 'memory-only');
  assert.equal(JSON.stringify(result.body).includes(secret), false);
  result = await jsonFetch(origin, '/api/ai/status');
  assert.equal(result.body.configured, true);
  result = await jsonFetch(origin, '/api/ai/key', { method: 'POST', body: JSON.stringify({ key: 'bad' }) });
  assert.equal(result.response.status, 400);
});

test('preview local app lock validates six digits without persisting a raw PIN', async (t) => {
  const { origin } = await withServer(t);
  let result = await jsonFetch(origin, '/api/security/pin', { method: 'POST', body: JSON.stringify({ action: 'status' }) });
  assert.equal(result.body.enabled, false);
  result = await jsonFetch(origin, '/api/security/pin', { method: 'POST', body: JSON.stringify({ action: 'set', pin: '123456' }) });
  assert.equal(result.body.enabled, true);
  result = await jsonFetch(origin, '/api/security/pin', { method: 'POST', body: JSON.stringify({ action: 'verify', pin: '123456' }) });
  assert.equal(result.body.valid, true);
  for (let attempt = 0; attempt < 5; attempt += 1) result = await jsonFetch(origin, '/api/security/pin', { method: 'POST', body: JSON.stringify({ action: 'verify', pin: '000000' }) });
  assert.equal(result.body.valid, false);
  assert.ok(result.body.retryAfterMs > 0);
  result = await jsonFetch(origin, '/api/security/pin', { method: 'POST', body: JSON.stringify({ action: 'verify', pin: '123456' }) });
  assert.equal(result.body.valid, false);
  result = await jsonFetch(origin, '/api/security/pin', { method: 'POST', body: JSON.stringify({ action: 'set', pin: 'not-a-pin' }) });
  assert.equal(result.response.status, 400);
  result = await jsonFetch(origin, '/api/security/pin', { method: 'POST', body: JSON.stringify({ action: 'clear' }) });
  assert.equal(result.body.enabled, false);
});

test('skin upload rejects spoofed MIME and accepts private local PNG bytes', async (t) => {
  const { origin, dataDir } = await withServer(t);
  let result = await jsonFetch(origin, '/api/skins', { method: 'POST', body: JSON.stringify({ data: `data:image/png;base64,${Buffer.from('not an image file').toString('base64')}` }) });
  assert.equal(result.response.status, 400);
  const pngSkin = makePng(64, 64);
  result = await jsonFetch(origin, '/api/skins', { method: 'POST', body: JSON.stringify({ data: `data:image/png;base64,${pngSkin.toString('base64')}` }) });
  assert.equal(result.response.status, 201);
  assert.ok(fs.existsSync(path.join(dataDir, 'skins', `${result.body.id}.png`)));
  const image = await fetch(`${origin}${result.body.filePath}`);
  assert.equal(image.status, 200);
  const deleted = await jsonFetch(origin, `/api/skins/${result.body.id}.png`, { method: 'DELETE' });
  assert.equal(deleted.body.deleted, true);
});

test('backup route writes app data under a local backup directory', async (t) => {
  const { origin, dataDir } = await withServer(t);
  const result = await jsonFetch(origin, '/api/backups', { method: 'POST', body: JSON.stringify({ format: 'minebot-local-backup-v1', entities: { servers: [{ id: 's1' }] } }) });
  assert.equal(result.response.status, 201);
  assert.ok(fs.existsSync(path.join(dataDir, 'backups', result.body.filename)));
  const download = await fetch(`${origin}${result.body.downloadUrl}`);
  assert.equal(download.status, 200);
  const payload = await download.json();
  assert.equal(payload.entities.servers[0].id, 's1');
});

test('AI auto ranking filters to free available models with sufficient context', () => {
  const models = [
    { id: 'provider/tiny:free', context_length: 2048, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'] },
    { id: 'provider/large:free', context_length: 128000, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools', 'reasoning'] },
    { id: 'provider/paid', context_length: 200000, pricing: { prompt: '0.0001', completion: '0.0002' }, supported_parameters: ['tools'] },
  ];
  const ranked = rankFreeModels(models);
  assert.deepEqual(ranked.map((model) => model.id), ['provider/large:free']);
});

test('Behavior Engine preserves emergency and survival priority above user tasks', () => {
  assert.deepEqual(evaluateBehavior({ dead: true, currentTask: 'mine' }), { priority: 'emergency', action: 'recover_after_death', pauseTask: true, resumeAfter: 'recovery_complete' });
  assert.equal(evaluateBehavior({ food: 4, hasFood: true, currentTask: 'mine' }).action, 'eat');
  assert.equal(evaluateBehavior({ userCommand: 'follow', currentTask: 'mine' }).priority, 'user_command');
  assert.equal(evaluateBehavior({ currentTask: 'mine' }).priority, 'current_task');
});

test('Task Engine refuses to mark local plans running/completed without a real engine', () => {
  const task = { id: 't1', status: 'pending', progress: 0 };
  assert.throws(() => transitionTask(task, 'running'), /محرك Minecraft/);
  assert.throws(() => transitionTask(task, 'completed'), /لا يمكن نقل المهمة/);
  const cancelled = transitionTask(task, 'cancelled');
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.progress, 0);
  const running = transitionTask(task, 'running', { engineAvailable: true });
  assert.equal(running.status, 'running');
  assert.throws(() => transitionTask(running, 'completed'), /محرك Minecraft/);
});
