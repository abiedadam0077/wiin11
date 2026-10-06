'use strict';

const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const minecraftData = require('minecraft-data');
const { loader: autoEat } = require('mineflayer-auto-eat');
const { plugin: collectBlock } = require('mineflayer-collectblock');
const { BotManager, safeError } = require('./bot-manager');

function parseArguments(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = String(argv[i] || '').replace(/^--/, '');
    if (!['port', 'token', 'project-dir', 'auth-dir'].includes(key)) throw new Error('Unknown native runtime argument.');
    args[key] = String(argv[i + 1] || '');
  }
  const port = Number(args.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !/^[a-f0-9]{64}$/.test(args.token || '')) throw new Error('Native bridge configuration is invalid.');
  return { port, token: args.token, projectDir: args['project-dir'], authDir: args['auth-dir'] };
}

function startEngine({ port, token, authDir }) {
  fs.mkdirSync(authDir, { recursive: true, mode: 0o700 });
  const bridge = net.createConnection({ host: '127.0.0.1', port });
  bridge.setNoDelay(true);
  bridge.setKeepAlive(true, 10_000);
  let buffer = '';
  let ready = false;
  let manager;
  let heartbeatTimer;
  const write = (message) => {
    if (bridge.destroyed || !bridge.writable) return false;
    const line = `${JSON.stringify(message)}\n`;
    if (Buffer.byteLength(line) > 1_000_000) return false;
    return bridge.write(line);
  };

  const connectManager = () => {
    manager = new BotManager({ mineflayer, pathfinder: { pathfinder, Movements, goals }, minecraftData, authCacheDir: authDir, autoEat, collectBlock });
    manager.on('event', (event) => write({ channel: 'event', ...event }));
  };
  connectManager();

  bridge.on('connect', () => {
    write({ channel: 'hello', token, runtime: process.version, mobile: process.versions.mobile || null });
  });
  bridge.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    if (buffer.length > 2_000_000) {
      bridge.destroy(new Error('Native command buffer exceeded limit.'));
      return;
    }
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let message;
      try { message = JSON.parse(line); }
      catch { write({ channel: 'protocol_error', error: 'Native command was not valid JSON.' }); continue; }
      if (!ready) {
        if (message.action !== 'ready' || message.token !== token) {
          bridge.destroy(new Error('Native bridge authentication failed.'));
          return;
        }
        ready = true;
        write({ channel: 'engine_ready', runtime: process.version, mineflayer: require('mineflayer/package.json').version });
        heartbeatTimer = setInterval(() => write({ channel: 'heartbeat', runtime: process.version, at: Date.now() }), 3_000);
        heartbeatTimer.unref?.();
        continue;
      }
      if (message.action === 'shutdown') {
        Promise.allSettled([...manager.bots.keys()].map((id) => manager.disconnect(id))).finally(() => bridge.end());
        continue;
      }
      Promise.resolve(manager.command(message)).then(() => {
        if (message.requestId) write({ channel: 'command_result', requestId: message.requestId, ok: true });
      }).catch((error) => {
        if (message.requestId) write({
          channel: 'command_result',
          requestId: message.requestId,
          action: String(message.action || '').slice(0, 48),
          botId: String(message.botId || '').slice(0, 128),
          taskId: String(message.taskId || '').slice(0, 128),
          ok: false,
          error: safeError(error),
        });
      });
    }
  });
  bridge.on('error', () => { /* Never forward raw socket errors, tokens, or request bodies to logs. */ });
  bridge.on('close', () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (manager) Promise.allSettled([...manager.bots.keys()].map((id) => manager.disconnect(id)));
    setTimeout(() => process.exit(0), 50).unref?.();
  });
  return bridge;
}

try {
  const config = parseArguments(process.argv);
  if (!path.isAbsolute(config.projectDir) || !path.isAbsolute(config.authDir)) throw new Error('Native runtime paths must be absolute.');
  process.chdir(config.projectDir);
  startEngine(config);
} catch {
  // Avoid writing exception objects: authentication libraries may include sensitive fields.
  process.exitCode = 1;
}
