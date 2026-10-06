import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Window } from 'happy-dom';
import { createMineBotServer } from '../server.mjs';

const waitFor = async (predicate, timeout = 6000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error('UI action timed out.');
};

async function createUiHarness(t, seed = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minebot-ui-test-'));
  const server = createMineBotServer({ dataDir });
  for (const [table, rows] of Object.entries(seed)) for (const row of rows) server.minebot.db.upsert(table, row);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const fetchBase = globalThis.fetch;
  const html = await (await fetchBase(`${origin}/`)).text();
  const window = new Window({ url: `${origin}/`, settings: { disableCSSFileLoading: true, disableComputedStyleRendering: true, disableJavaScriptFileLoading: true } });
  window.document.write(html);
  window.document.close();
  window.fetch = (resource, options) => fetchBase(new URL(resource, origin).href, options);
  window.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
  const bundle = await (await fetchBase(`${origin}/bundle.js`)).text();
  window.eval(bundle);
  await window.__minebotAppReady;
  t.after(async () => {
    window.happyDOM.abort();
    await new Promise((resolve) => server.close(resolve));
    server.minebot.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  return { window, server };
}

function submit(window, form) {
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
}

function click(window, selector) {
  const element = window.document.querySelector(selector);
  assert.ok(element, `Expected UI element ${selector}`);
  element.click();
}

test('local app opens the designed dashboard without seeded bot/server data', async (t) => {
  const { window } = await createUiHarness(t);
  assert.equal(window.document.querySelector('#screen h1')?.textContent, 'عالمك، بإدارتك.');
  assert.equal(window.document.querySelectorAll('.stat-card').length, 6);
  assert.equal(window.document.querySelectorAll('.nav-item').length, 5);
  assert.equal(window.document.querySelectorAll('.list-card').length, 0);
  assert.match(window.document.querySelector('#screen').textContent, /لا توجد بوتات بعد/);
});

test('UI saves server, bot, and task locally and does not show an offline-mode profile as online', async (t) => {
  const { window, server } = await createUiHarness(t);
  click(window, '[data-action="add-server"]');
  let form = window.document.querySelector('form[data-form="server"]');
  assert.ok(form);
  form.elements.name.value = 'Local Test';
  form.elements.host.value = '127.0.0.1';
  form.elements.port.value = '25565';
  form.elements.version.value = '1.20.4';
  submit(window, form);
  await waitFor(() => server.minebot.db.list('servers').length === 1);
  await waitFor(() => window.document.querySelector('#screen h1')?.textContent === 'سيرفراتي');
  const serverRecord = server.minebot.db.list('servers')[0];
  assert.equal(serverRecord.status, 'untested');

  click(window, '#bottom-nav [data-route="bots"]');
  click(window, '[data-action="add-bot"]');
  form = window.document.querySelector('form[data-form="bot"]');
  form.elements.name.value = 'Miner';
  form.elements.username.value = 'Miner_01';
  form.elements.serverId.value = serverRecord.id;
  submit(window, form);
  await waitFor(() => server.minebot.db.list('bots').length === 1);
  const bot = server.minebot.db.list('bots')[0];
  await waitFor(() => window.document.querySelector('#screen h1')?.textContent === 'تفاصيل البوت');
  assert.equal(bot.status, 'configured');
  assert.equal(window.document.querySelector('#screen .status-pill')?.textContent, 'مُعدّ محليًا');
  click(window, '[data-action="engine-info"]');
  assert.match(window.document.querySelector('#overlay-root').textContent, /لم يُنشأ أي اتصال/);
  click(window, '[data-action="close-modal"]');

  click(window, '#bottom-nav [data-route="tasks"]');
  click(window, '[data-action="add-task"]');
  form = window.document.querySelector('form[data-form="task"]');
  form.elements.description.value = 'اجمع خمس قطع خشب';
  form.elements.botId.value = bot.id;
  submit(window, form);
  await waitFor(() => server.minebot.db.list('tasks').length === 1);
  const task = server.minebot.db.list('tasks')[0];
  assert.equal(task.botId, bot.id);
  assert.equal(task.status, 'pending_plan');
  assert.equal(task.progress, 0);
  assert.equal(task.plan, null);
  assert.match(window.document.querySelector('#screen').textContent, /لا يوجد تنفيذ حيّ|غير منفذة/);

  click(window, '#bottom-nav [data-route="bots"]');
  click(window, '[data-action="bot-details"]');
  click(window, '[data-action="bot-menu"]');
  click(window, '[data-action="delete-bot"]');
  click(window, '[data-action="confirm-modal"]');
  await waitFor(() => server.minebot.db.get('bots', bot.id) === null);
  await waitFor(() => server.minebot.db.get('tasks', task.id)?.botId === '');
});

test('server edit/delete and task cancellation update persistent rows and history', async (t) => {
  const now = Date.now();
  const { window, server } = await createUiHarness(t, {
    servers: [{ id: 's-test', name: 'Test Realm', host: '127.0.0.1', port: 25565, version: '1.20.4', status: 'untested', createdAt: now }],
    bots: [{ id: 'b-test', name: 'Scout', username: 'Scout_01', serverId: 's-test', version: '1.20.4', authMode: 'offline', status: 'configured', createdAt: now }],
    tasks: [{ id: 't-test', name: 'جمع الخشب', description: 'اجمع الخشب', botId: 'b-test', priority: 'normal', status: 'pending_plan', progress: 0, createdAt: now }],
    task_history: [{ id: 'h-test', taskId: 't-test', status: 'pending_plan', message: 'تم الحفظ', createdAt: now }],
  });

  click(window, '#bottom-nav [data-route="servers"]');
  click(window, '[data-action="server-details"]');
  click(window, '[data-action="edit-server"]');
  const edit = window.document.querySelector('form[data-form="server"]');
  assert.equal(edit.elements.port.value, '25565');
  edit.elements.port.value = '25566';
  submit(window, edit);
  await waitFor(() => server.minebot.db.get('servers', 's-test')?.port === 25566);

  click(window, '#bottom-nav [data-route="tasks"]');
  click(window, '[data-action="task-details"]');
  click(window, '[data-action="cancel-task"]');
  click(window, '[data-action="confirm-modal"]');
  await waitFor(() => server.minebot.db.get('tasks', 't-test')?.status === 'cancelled');
  await waitFor(() => server.minebot.db.list('task_history').some((item) => item.taskId === 't-test' && item.status === 'cancelled'));

  click(window, '#bottom-nav [data-route="servers"]');
  click(window, '[data-action="server-details"]');
  click(window, '[data-action="delete-server"]');
  click(window, '[data-action="confirm-modal"]');
  await waitFor(() => server.minebot.db.get('servers', 's-test') === null);
  assert.equal(server.minebot.db.get('bots', 'b-test').serverId, '');
});
