'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateBotConfig, safeError, finitePosition } = require('../bot-manager');
const { Authflow } = require('prismarine-auth');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');


test('Microsoft device-code auth stack initializes with the locked security override', () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minebot-auth-smoke-'));
  try {
    const flow = new Authflow('account@example.test', cacheDir, {
      flow: 'msal',
      authTitle: '00000000-0000-0000-0000-000000000000',
    }, () => {});
    assert.ok(flow);
    assert.equal(typeof flow.msa.msalApp.acquireTokenByDeviceCode, 'function');
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
});

test('connection configuration validates Java host, port, username, auth, and version', () => {
  assert.deepEqual(validateBotConfig({ host: 'play.example.net', port: 25565, username: 'MineBot_01', auth: 'offline', version: 'auto' }), {
    host: 'play.example.net', port: 25565, username: 'MineBot_01', auth: 'offline', version: false, reconnect: true, autoEat: true, autoRespawn: false,
  });
  assert.equal(validateBotConfig({ host: 'mc.example.net', port: 25566, username: 'player@example.net', auth: 'microsoft', version: '1.21.11' }).version, '1.21.11');
  assert.throws(() => validateBotConfig({ host: 'mc.example.net', port: 25565, username: 'bad account@example.net', auth: 'microsoft' }), /دون مسافات/);
  assert.equal(validateBotConfig({ host: 'mc.example.net', port: 25565, username: 'player@example.net', auth: 'microsoft', autoEat: false, autoRespawn: true }).autoRespawn, true);
  for (const config of [
    { host: '', port: 25565, username: 'ValidName' },
    { host: 'bad host', port: 25565, username: 'ValidName' },
    { host: 'example.net', port: 0, username: 'ValidName' },
    { host: 'example.net', port: 25565, username: 'x' },
    { host: 'example.net', port: 25565, username: 'ValidName', auth: 'password' },
    { host: 'example.net', port: 25565, username: 'ValidName', version: '1.22.99' },
  ]) assert.throws(() => validateBotConfig(config));
});

test('engine error strings redact known credential-shaped material and are bounded', () => {
  const value = safeError(new Error('Microsoft access_token: top-secret-value; details available'));
  assert.doesNotMatch(value, /top-secret-value/);
  assert.match(value, /\[مخفي\]/);
  assert.equal(safeError('x'.repeat(1000)).length, 320);
});

test('only finite world positions are emitted as observed values', () => {
  assert.deepEqual(finitePosition({ x: 1.5, y: -60, z: 90 }), { x: 1.5, y: -60, z: 90 });
  assert.equal(finitePosition({ x: NaN, y: 64, z: 0 }), null);
  assert.equal(finitePosition(null), null);
});
