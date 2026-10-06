import { icon, escapeHtml as h, fmtNumber, formatDate, pageHeading, statusPill, notice, emptyState, button, timeAgo } from './ui.js';

const actionButton = (name, label, style, iconName = '', extra = '') => `<button class="btn btn-${style} btn-small" data-action="${name}" ${extra}>${iconName ? icon(iconName) : ''}<span>${h(label)}</span></button>`;
const plusButton = (action, label = 'إضافة') => `<button class="heading-action" data-action="${action}" aria-label="${h(label)}">${icon('plus')}</button>`;
const backButton = () => `<button class="heading-action" data-action="back" aria-label="رجوع" style="background:rgba(29,42,69,.76);border-color:rgba(137,160,213,.17);box-shadow:none">${icon('arrowRight')}</button>`;
const field = (label, name, value = '', { placeholder = '', type = 'text', required = false, help = '', max = '', attrs = '' } = {}) => `<div class="form-row"><label class="form-label" for="${h(name)}">${h(label)}${required ? '<small>مطلوب</small>' : ''}</label><input class="field" id="${h(name)}" name="${h(name)}" type="${h(type)}" value="${h(value)}" placeholder="${h(placeholder)}" ${required ? 'required' : ''} ${max ? `maxlength="${h(max)}"` : ''} ${attrs}>${help ? `<div class="field-help">${h(help)}</div>` : ''}</div>`;
const selectField = (label, name, choices, value, { help = '', required = false, disabled = false } = {}) => `<div class="form-row"><label class="form-label" for="${h(name)}">${h(label)}${required ? '<small>مطلوب</small>' : ''}</label><select class="field field-select" id="${h(name)}" name="${h(name)}" ${required ? 'required' : ''} ${disabled ? 'disabled' : ''}>${choices.map((choice) => `<option value="${h(choice.value)}" ${choice.value === value ? 'selected' : ''}>${h(choice.label)}</option>`).join('')}</select>${help ? `<div class="field-help">${h(help)}</div>` : ''}</div>`;
const switchMarkup = (name, checked, label = '') => `<label class="switch" aria-label="${h(label)}"><input type="checkbox" data-setting="${h(name)}" ${checked ? 'checked' : ''}><span class="switch-track"></span></label>`;
const settingItem = ({ icon: iconName, color = '', title, subtitle, route = '', action = '', control = '' }) => `<button class="setting-item" ${route ? `data-route="${h(route)}"` : `data-action="${h(action)}"`}> <span class="setting-icon ${color}">${icon(iconName)}</span><span class="setting-copy"><strong>${h(title)}</strong><small>${h(subtitle)}</small></span>${control || `<span class="setting-chevron">${icon('chevron')}</span>`}</button>`;
const group = (title, items) => `<section class="setting-group"><h2 class="setting-group-title">${h(title)}</h2>${items}</section>`;

function heroArt() {
  return `<div class="hero-orb" aria-hidden="true"><span class="hero-spark spark-a">✦</span><span class="hero-spark spark-b">✧</span><span class="hero-spark spark-c">✦</span><div class="bot-figure"><div class="bot-head"></div><div class="bot-arm arm-l"></div><div class="bot-arm arm-r"></div><div class="bot-body"></div><div class="bot-leg leg-l"></div><div class="bot-leg leg-r"></div></div></div>`;
}

function statCard(iconName, tone, label, value, detail = '') {
  return `<div class="stat-card"><div class="stat-icon ${tone}">${icon(iconName)}</div><div class="stat-copy"><span>${h(label)}</span><strong>${h(value)}</strong>${detail ? `<small>${h(detail)}</small>` : ''}</div></div>`;
}

function quickCard(iconName, tone, title, subtitle, action) {
  return `<button class="quick-card ${tone}" data-action="${h(action)}"><span class="quick-icon">${icon(iconName)}</span><span><strong>${h(title)}</strong><small>${h(subtitle)}</small></span><span class="quick-arrow">‹</span></button>`;
}

function renderHome(state) {
  const online = state.bots.filter((bot) => bot.status === 'online').length;
  const completed = state.tasks.filter((task) => task.status === 'completed').length;
  const activeTasks = state.tasks.filter((task) => ['pending_plan', 'pending', 'running', 'paused'].includes(task.status)).length;
  const botDetail = state.bots.length ? `${fmtNumber(online)} متصل فعليًا` : 'ابدأ بإعداد أول بوت';
  const aiLabel = state.aiConfigured ? 'المفتاح محفوظ' : 'يحتاج إعداد المفتاح';
  const recentTasks = [...state.tasks].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).slice(0, 2);
  const recentBots = [...state.bots].slice(0, 2);
  return `
    <section class="hero-card"><div class="hero-copy"><div class="hero-greeting"><span class="tiny-avatar">M</span><span>مرحبًا بك في مساحة التحكم</span></div><h1>عالمك، <span>بإدارتك.</span></h1><p>إدارة محلية لسيرفراتك وبوتاتك وخطط مهامك — بدون بيانات تجريبية.</p></div>${heroArt()}</section>
    <div class="section-title"><h2>نظرة عامة</h2><span class="section-hint">بيانات محفوظة على هذا الجهاز</span></div>
    <div class="stats-grid">
      ${statCard('bot', 'purple', 'إجمالي البوتات', fmtNumber(state.bots.length), botDetail)}
      ${statCard('server', 'cyan', 'السيرفرات', fmtNumber(state.servers.length), 'سيرفرات محفوظة محليًا')}
      ${statCard('wifi', 'green', 'Bots Online', fmtNumber(online), online ? 'اتصال حيّ' : 'لا توجد جلسة بوت حيّة')}
      ${statCard('plug', 'amber', 'Bots Offline', fmtNumber(state.bots.length - online), 'ملفات مُعدة غير متصلة')}
      ${statCard('tasks', 'blue', 'المهام النشطة', fmtNumber(activeTasks), 'بانتظار التخطيط أو التنفيذ')}
      ${statCard('check', 'green', 'المهام المكتملة', fmtNumber(completed), 'سجل محلي فقط')}
    </div>
    <div class="section-title"><h2>إجراءات سريعة</h2></div>
    <div class="quick-grid">
      ${quickCard('server', 'purple', 'إضافة سيرفر', 'اختبار اتصال Minecraft', 'add-server')}
      ${quickCard('bot', 'green', 'إضافة بوت', 'حفظ إعداداته محليًا', 'add-bot')}
      ${quickCard('tasks', 'cyan', 'إنشاء مهمة', 'خططها بواسطة AI', 'add-task')}
      ${quickCard('spark', 'violet', 'إعدادات AI', 'OpenRouter والنماذج', 'open-ai')}
    </div>
    <div class="section-title"><h2>حالة الذكاء الاصطناعي</h2><button class="text-action" data-action="open-ai">الإعدادات</button></div>
    <div class="status-strip"><div><div class="strip-title">OpenRouter</div><div class="strip-subtitle">${state.aiConfigured ? 'مفتاح محفوظ في التخزين الآمن' : 'لا يوجد مفتاح محفوظ'}</div></div>${statusPill(state.aiConfigured ? 'ready' : 'idle', aiLabel)}</div>
    <div class="section-title"><h2>بوتاتي</h2><button class="text-action" data-route="bots">عرض الكل</button></div>
    ${recentBots.length ? `<div class="list-stack">${recentBots.map((bot) => botCard(bot, state.servers)).join('')}</div>` : emptyState({ icon: 'bot', title: 'لا توجد بوتات بعد', description: 'أنشئ ملف بوت واربطه بسيرفر محفوظ. سيبقى غير متصل حتى يتوفر محرك Minecraft فعلي.', actionLabel: 'إضافة بوت', action: 'add-bot' })}
    <div class="section-title"><h2>المهام الأخيرة</h2><button class="text-action" data-route="tasks">عرض الكل</button></div>
    ${recentTasks.length ? `<div class="list-stack">${recentTasks.map((task) => taskCard(task, state.bots)).join('')}</div>` : emptyState({ icon: 'tasks', title: 'مساحة المهام جاهزة', description: 'أضف طلبًا واحفظه محليًا، ثم أنشئ له خطة عبر نموذج OpenRouter مجاني عند إعداد المفتاح.', actionLabel: 'إضافة مهمة', action: 'add-task' })}
  `;
}

function serverCard(server, state) {
  const bots = state.bots.filter((bot) => bot.serverId === server.id && bot.status === 'online').length;
  const isOnline = server.status === 'online';
  const status = isOnline ? statusPill('online') : server.status === 'offline' ? statusPill('offline') : statusPill('idle', 'غير مختبر');
  const players = isOnline ? `${fmtNumber(server.playersOnline || 0)}/${fmtNumber(server.playersMax || 0)}` : '—';
  const version = server.lastPingVersion || server.version || 'غير محدد';
  const checking = state.pinging.has(server.id);
  return `<article class="list-card" data-action="server-details" data-id="${h(server.id)}" tabindex="0" role="button" aria-label="تفاصيل السيرفر ${h(server.name)}">
    <div class="tile-art server-art">${icon('cube')}</div>
    <div class="list-content"><div class="list-topline"><strong>${h(server.name)}</strong>${status}</div><div class="secondary">${h(server.host)}:${h(server.port)}</div><div class="list-meta"><span>${icon('cube')}${h(version)}</span><span>${icon('users')}${players}</span><span>${icon('bot')}${fmtNumber(bots)}</span></div></div>
    <div class="card-trailing"><button class="more-button" data-action="server-menu" data-id="${h(server.id)}" aria-label="خيارات">⋮</button><button class="mini-action" data-action="ping-server" data-id="${h(server.id)}" ${checking ? 'disabled' : ''}>${checking ? '<span class="spinner"></span>' : 'اختبار'}</button></div>
  </article>`;
}

function botCard(bot, servers) {
  const server = servers.find((item) => item.id === bot.serverId);
  const statePill = bot.status === 'online' ? statusPill('online') : statusPill('ready', 'مُعدّ');
  const avatar = `<span class="avatar-pixel" style="--avatar-hair:${h(bot.color || '#293454')}"></span>`;
  return `<article class="list-card bot-card" data-action="bot-details" data-id="${h(bot.id)}" tabindex="0" role="button" aria-label="تفاصيل البوت ${h(bot.name)}">
    <div class="tile-art bot-art">${avatar}</div><div class="list-content"><div class="list-topline"><strong>${h(bot.name)}</strong>${statePill}</div><div class="secondary">${h(server?.name || 'لا يوجد سيرفر مرتبط')}</div><div class="list-meta"><span>${icon('server')}${h(server?.host || 'غير محدد')}</span><span>${icon('skin')}${bot.skinId ? 'سكن محدد' : 'بدون سكن'}</span></div></div>
    <div class="card-trailing"><button class="more-button" data-action="bot-menu" data-id="${h(bot.id)}" aria-label="خيارات">⋮</button><span class="muted" style="font-size:9px">${bot.status === 'online' ? 'اتصال حي' : 'غير متصل'}</span></div>
  </article>`;
}

function taskStatus(task) {
  if (task.status === 'pending_plan') return statusPill('pending_plan');
  if (task.status === 'pending') return statusPill('planned', task.plan?.steps?.length ? 'مخططة · معلّقة' : 'معلّقة');
  return statusPill(task.status);
}

function taskCard(task, bots) {
  const bot = bots.find((item) => item.id === task.botId);
  const progress = Math.min(100, Math.max(0, Number(task.progress) || 0));
  return `<article class="glass-card task-card" data-action="task-details" data-id="${h(task.id)}" role="button" tabindex="0">
    <div class="task-head"><div class="task-main"><div class="task-name">${h(task.name || task.description || 'مهمة جديدة')}</div><div class="task-description">${h(task.description || '')}</div></div>${taskStatus(task)}</div>
    <div class="task-progress-row"><div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div><b>${task.status === 'completed' ? '100%' : `${fmtNumber(progress)}%`}</b></div>
    <div class="task-foot"><span>${icon('bot')} ${h(bot?.name || 'غير معيّنة')}</span><span class="priority ${h(task.priority || 'normal')}">${({ high: 'عالية', normal: 'عادية', low: 'منخفضة' })[task.priority] || 'عادية'}</span><span>${timeAgo(task.createdAt)}</span></div>
  </article>`;
}

function searchBox(placeholder) {
  return `<label class="search-wrap">${icon('search')}<input class="search-input" type="search" data-search placeholder="${h(placeholder)}" autocomplete="off"></label>`;
}

function renderServers(state) {
  const query = state.search.trim().toLocaleLowerCase();
  const servers = state.servers.filter((server) => !query || `${server.name} ${server.host} ${server.version}`.toLocaleLowerCase().includes(query));
  const rows = servers.length ? `<div class="list-stack">${servers.map((server) => serverCard(server, state)).join('')}</div>` : emptyState({ icon: 'server', title: query ? 'لا توجد نتائج' : 'أضف أول سيرفر', description: query ? 'جرّب اسمًا أو عنوانًا مختلفًا.' : 'أدخل عنوان Java Edition حقيقيًا. اختبار الاتصال يرسل Minecraft status ping فعليًا.', actionLabel: query ? '' : 'إضافة سيرفر', action: 'add-server' });
  return `${pageHeading('سيرفراتي', `${fmtNumber(state.servers.length)} سيرفر محفوظ محليًا`, plusButton('add-server', 'إضافة سيرفر'))}${searchBox('ابحث عن سيرفر...')}${rows}`;
}

function renderServerForm(state) {
  const id = state.params.id;
  const current = id ? state.servers.find((server) => server.id === id) : null;
  const editing = Boolean(current);
  const defaults = state.settings.defaultVersion || '1.20.4';
  const statusInfo = current?.status === 'online' ? notice(`آخر اختبار ناجح: ${formatDate(current.lastCheckedAt, { time: true })}.`, 'success') : '';
  return `${pageHeading(editing ? 'تعديل السيرفر' : 'إضافة سيرفر', 'اتصال Minecraft Java Edition', backButton())}
    <form class="form-card" data-form="server" data-id="${h(current?.id || '')}">
      ${field('اسم السيرفر', 'name', current?.name || '', { placeholder: 'مثال: Survival World', required: true, max: 48 })}
      <div class="form-row"><label class="form-label" for="host">عنوان IP أو النطاق<small>Java Edition</small></label><input class="field" id="host" name="host" type="text" dir="ltr" inputmode="url" autocapitalize="none" spellcheck="false" required maxlength="253" placeholder="play.example.com" value="${h(current?.host || '')}"><div class="field-help">لا تدعم هذه النسخة عناوين SRV أو Bedrock. يمكن إدخال IP أو اسم نطاق مع المنفذ.</div></div>
      <div class="field-inline">${field('المنفذ', 'port', current?.port ?? 25565, { type: 'number', required: true, attrs: 'min="1" max="65535" inputmode="numeric"' })}${selectField('النسخة', 'version', ['1.21.8','1.21.6','1.21.4','1.21.1','1.20.6','1.20.4','1.20.1','1.19.4','1.18.2','أخرى'].map((value) => ({ value, label: value === 'أخرى' ? 'أخرى' : value })), current?.version || defaults)}</div>
      ${statusInfo}
      ${notice('اختبار الاتصال يستخدم Minecraft Server List Ping عبر TCP من الهاتف/المعاينة؛ لا يحتاج حسابًا ولا يرسل بيانات الدخول.', 'info')}
      <div class="form-actions"><button class="btn btn-primary" type="submit">${icon(editing ? 'check' : 'plus')}<span>${editing ? 'حفظ التغييرات' : 'حفظ السيرفر'}</span></button><button class="btn btn-secondary" type="button" data-action="back">إلغاء</button></div>
    </form>`;
}

function renderServerDetails(state) {
  const server = state.servers.find((item) => item.id === state.params.id);
  if (!server) return `${pageHeading('السيرفر', '', backButton())}${emptyState({ icon: 'server', title: 'السيرفر غير موجود', description: 'قد يكون حُذف من التخزين المحلي.' })}`;
  const bots = state.bots.filter((bot) => bot.serverId === server.id);
  const onlineBots = bots.filter((bot) => bot.status === 'online').length;
  const status = server.status === 'online' ? statusPill('online') : server.status === 'offline' ? statusPill('offline') : statusPill('idle', 'لم يُختبر');
  const pingLabel = state.pinging.has(server.id) ? 'جار الاختبار…' : 'اختبار الاتصال';
  return `${pageHeading('تفاصيل السيرفر', '', backButton())}
    <section class="detail-hero"><div class="detail-head"><div class="tile-art server-art">${icon('cube')}</div><div style="min-width:0;flex:1"><div class="list-topline"><h2>${h(server.name)}</h2>${status}</div><p class="ltr">${h(server.host)}:${h(server.port)}</p></div><button class="more-button" data-action="server-menu" data-id="${h(server.id)}" aria-label="خيارات">⋮</button></div>
      <div class="detail-stat-grid"><div class="detail-stat"><span>الإصدار المطلوب</span><strong>${h(server.version || 'غير محدد')}</strong></div><div class="detail-stat"><span>الإصدار المُعلن</span><strong>${h(server.lastPingVersion || 'لم يُختبر')}</strong></div><div class="detail-stat"><span>اللاعبون</span><strong>${server.status === 'online' ? `${fmtNumber(server.playersOnline || 0)} / ${fmtNumber(server.playersMax || 0)}` : 'غير متاح'}</strong></div><div class="detail-stat"><span>بوتات على هذا السيرفر</span><strong>${fmtNumber(onlineBots)} متصلة من ${fmtNumber(bots.length)}</strong></div></div>
    </section>
    <div class="btn-row mt-12">${actionButton('ping-server', pingLabel, 'primary', 'wifi', `data-id="${h(server.id)}" ${state.pinging.has(server.id) ? 'disabled' : ''}`)}${actionButton('edit-server', 'تعديل', 'secondary', 'edit', `data-id="${h(server.id)}"`)}${actionButton('delete-server', 'حذف', 'danger', 'trash', `data-id="${h(server.id)}"`)}</div>
    ${server.lastPingError ? `<div class="mt-12">${notice(server.lastPingError, 'warning', 'آخر نتيجة')}</div>` : ''}
    <div class="section-title"><h2>البوتات المرتبطة</h2><button class="text-action" data-action="add-bot">إضافة بوت</button></div>
    ${bots.length ? `<div class="list-stack">${bots.map((bot) => botCard(bot, state.servers)).join('')}</div>` : emptyState({ icon: 'bot', title: 'لا توجد بوتات مرتبطة', description: 'ملفات البوتات التي تنشئها ستظهر هنا. لا يتم تشغيل اتصال وهمي.' })}`;
}

function renderBots(state) {
  const query = state.search.trim().toLocaleLowerCase();
  const bots = state.bots.filter((bot) => !query || `${bot.name} ${bot.username || ''}`.toLocaleLowerCase().includes(query));
  const rows = bots.length ? `<div class="list-stack">${bots.map((bot) => botCard(bot, state.servers)).join('')}</div>` : emptyState({ icon: 'bot', title: query ? 'لا توجد نتائج' : 'لا توجد بوتات محفوظة', description: query ? 'غيّر عبارة البحث.' : 'أنشئ ملفًا محليًا لكل حساب/بوت. سيتم إظهار حالة مُعدّ، وليس اتصالًا، إلى أن يتوفر محرك Minecraft حقيقي.', actionLabel: query ? '' : 'إضافة بوت', action: 'add-bot' });
  const engine = notice('محرك اتصال وتوجيه البوتات غير مدمج في هذه النسخة؛ لن نعرض ملفات البوت على أنها متصلة ولن نبدأ مهمة مزيفة.', 'warning', 'شفافية حالة الاتصال');
  return `${pageHeading('بوتاتي', `${fmtNumber(state.bots.length)} ملف بوت محلي`, plusButton('add-bot', 'إضافة بوت'))}${engine}${searchBox('ابحث عن بوت...')}${rows}`;
}

function renderBotForm(state) {
  const current = state.params.id ? state.bots.find((bot) => bot.id === state.params.id) : null;
  const editing = Boolean(current);
  const serverChoices = state.servers.map((server) => ({ value: server.id, label: `${server.name} · ${server.host}:${server.port}` }));
  const savedSkins = state.skins.map((skin) => ({ value: skin.id, label: skin.name }));
  return `${pageHeading(editing ? 'تعديل البوت' : 'إضافة بوت', 'احفظ ملف الإعدادات على هذا الجهاز', backButton())}
    ${state.servers.length ? '' : `<div class="mb-12">${notice('يلزم حفظ سيرفر أولًا لربط ملف البوت. أضف سيرفرًا ثم ارجع إلى هذه الصفحة.', 'warning')}<div class="mt-8">${actionButton('add-server', 'إضافة سيرفر', 'secondary', 'plus')}</div></div>`}
    <form class="form-card" data-form="bot" data-id="${h(current?.id || '')}">
      ${field('اسم البوت', 'name', current?.name || '', { placeholder: 'مثال: MinerBot', required: true, max: 40 })}
      ${field('اسم اللاعب / Username', 'username', current?.username || '', { placeholder: 'Minecraft username', required: true, max: 16, attrs: 'dir="ltr" autocapitalize="none" spellcheck="false" pattern="[A-Za-z0-9_]{3,16}"' })}
      ${selectField('السيرفر', 'serverId', serverChoices.length ? serverChoices : [{ value: '', label: 'أضف سيرفرًا أولًا' }], current?.serverId || serverChoices[0]?.value || '', { required: true, disabled: !serverChoices.length })}
      ${selectField('Minecraft Version', 'version', ['1.21.8','1.21.6','1.21.4','1.21.1','1.20.6','1.20.4','1.20.1','1.19.4','1.18.2'].map((value) => ({ value, label: value })), current?.version || state.settings.defaultVersion || '1.20.4')}
      ${selectField('نوع المصادقة', 'authMode', [{ value: 'offline', label: 'Offline — خادم خاص فقط' }, { value: 'microsoft', label: 'Microsoft — يتطلب تسجيلًا غير متاح' }], current?.authMode || 'offline')}
      <div class="form-row"><label class="form-label" for="skinId">السكن</label><div class="field-inline"><select class="field field-select" id="skinId" name="skinId"><option value="">بدون سكن محدد</option>${savedSkins.map((skin) => `<option value="${h(skin.value)}" ${current?.skinId === skin.value ? 'selected' : ''}>${h(skin.label)}</option>`).join('')}</select><button class="btn btn-secondary btn-small" type="button" data-action="open-skins">إدارة السكن</button></div></div>
      ${notice('حفظ الملف لا ينشئ اتصالًا. المصادقة عبر Microsoft ومحرك Minecraft للحركة والتنفيذ غير متاحين في هذا الإصدار؛ لا تدخل كلمة مرور حسابك هنا.', 'warning')}
      <div class="form-actions"><button class="btn btn-primary" type="submit" ${!state.servers.length ? 'disabled' : ''}>${icon(editing ? 'check' : 'plus')}<span>${editing ? 'حفظ التغييرات' : 'حفظ ملف البوت'}</span></button><button class="btn btn-secondary" type="button" data-action="back">إلغاء</button></div>
    </form>`;
}

function renderBotDetails(state) {
  const bot = state.bots.find((item) => item.id === state.params.id);
  if (!bot) return `${pageHeading('تفاصيل البوت', '', backButton())}${emptyState({ icon: 'bot', title: 'البوت غير موجود', description: 'قد يكون حُذف من التخزين المحلي.' })}`;
  const server = state.servers.find((item) => item.id === bot.serverId);
  const task = state.tasks.find((item) => item.id === bot.currentTaskId && !['completed', 'cancelled', 'failed'].includes(item.status));
  const skin = state.skins.find((item) => item.id === bot.skinId);
  const avatar = `<span class="avatar-pixel" style="--avatar-hair:${h(bot.color || '#293454')}"></span>`;
  return `${pageHeading('تفاصيل البوت', '', backButton())}
    <section class="detail-hero"><div class="detail-head"><div class="tile-art bot-art">${avatar}</div><div style="min-width:0;flex:1"><div class="list-topline"><h2>${h(bot.name)}</h2>${statusPill('ready', 'مُعدّ محليًا')}</div><p>${h(bot.username || 'اسم مستخدم غير محدد')}</p></div><button class="more-button" data-action="bot-menu" data-id="${h(bot.id)}" aria-label="خيارات">⋮</button></div>
      <div class="detail-stat-grid"><div class="detail-stat"><span>حالة الاتصال</span><strong>غير متصل — لم يبدأ أي اتصال</strong></div><div class="detail-stat"><span>السيرفر</span><strong>${h(server?.name || 'غير مرتبط')}</strong></div><div class="detail-stat"><span>Health / Food</span><strong>غير متاح قبل اتصال المحرك</strong></div><div class="detail-stat"><span>Position / Uptime</span><strong>غير متاح قبل اتصال المحرك</strong></div><div class="detail-stat"><span>المهمة الحالية</span><strong>${h(task?.name || 'لا توجد مهمة قيد التنفيذ')}</strong></div><div class="detail-stat"><span>السكن</span><strong>${h(skin?.name || 'بدون سكن')}</strong></div></div>
    </section>
    <div class="detail-actions">
      <button class="detail-action primary" data-action="engine-info" data-id="${h(bot.id)}">${icon('play')}<span>تشغيل</span></button>
      <button class="detail-action" data-action="engine-info" data-id="${h(bot.id)}">${icon('stop')}<span>إيقاف</span></button>
      <button class="detail-action" data-action="engine-info" data-id="${h(bot.id)}">${icon('refresh')}<span>إعادة اتصال</span></button>
      <button class="detail-action" data-action="bot-tasks" data-id="${h(bot.id)}">${icon('tasks')}<span>المهام</span></button>
      <button class="detail-action" data-action="open-inventory" data-id="${h(bot.id)}">${icon('inventory')}<span>المخزون</span></button>
      <button class="detail-action" data-action="change-skin" data-id="${h(bot.id)}">${icon('skin')}<span>السكن</span></button>
      <button class="detail-action" data-action="bot-logs" data-id="${h(bot.id)}">${icon('logs')}<span>السجلات</span></button>
      <button class="detail-action" data-action="edit-bot" data-id="${h(bot.id)}">${icon('settings')}<span>الإعدادات</span></button>
    </div>
    ${notice(`إعداد الاتصال: ${bot.authMode === 'microsoft' ? 'Microsoft — لم يتم تسجيل الدخول' : 'Offline mode — لا يعمل إلا على خوادم تسمح بذلك'}. ملف البوت محفوظ، لكن لا توجد جلسة أو إحصاءات حيّة.`, 'warning', 'محرك البوت')}
    <div class="section-title"><h2>المهام المسندة</h2><button class="text-action" data-action="add-task-for-bot" data-id="${h(bot.id)}">إضافة مهمة</button></div>
    ${state.tasks.filter((item) => item.botId === bot.id).length ? `<div class="list-stack">${state.tasks.filter((item) => item.botId === bot.id).slice(0, 4).map((item) => taskCard(item, state.bots)).join('')}</div>` : emptyState({ icon: 'tasks', title: 'لا توجد مهام لهذا البوت', description: 'أنشئ خطة محلية واربطها بالبوت. تنفيذ الخطة يحتاج محركًا فعليًا.' })}`;
}

function renderTasks(state) {
  const query = state.search.trim().toLocaleLowerCase();
  let tasks = [...state.tasks];
  if (state.params.botId) tasks = tasks.filter((task) => task.botId === state.params.botId);
  tasks = tasks.filter((task) => !query || `${task.name} ${task.description}`.toLocaleLowerCase().includes(query));
  const isHistory = state.taskTab === 'history';
  tasks = tasks.filter((task) => isHistory ? ['completed', 'failed', 'cancelled'].includes(task.status) : !['completed', 'failed', 'cancelled'].includes(task.status));
  tasks.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  const rows = tasks.length ? `<div class="list-stack">${tasks.map((task) => taskCard(task, state.bots)).join('')}</div>` : emptyState({ icon: 'tasks', title: isHistory ? 'لا يوجد سجل مهام بعد' : (query ? 'لا توجد نتائج' : 'لا توجد مهام نشطة'), description: isHistory ? 'ستظهر هنا المهام التي تنتهي أو تُلغى.' : 'أضف وصفًا، واحفظه كطلب معلّق، ثم أرسل الطلب إلى OpenRouter لإنشاء خطة. لا يتم الادعاء بتنفيذها تلقائيًا.', actionLabel: isHistory || query ? '' : 'إضافة مهمة', action: 'add-task' });
  const activeCount = state.tasks.filter((task) => !['completed', 'failed', 'cancelled'].includes(task.status)).length;
  return `${pageHeading(state.params.botId ? 'مهام البوت' : 'المهام', `${fmtNumber(activeCount)} مهمة معلّقة أو قيد المراجعة`, plusButton('add-task', 'إضافة مهمة'))}
    <div class="segmented"><button data-action="task-tab" data-value="active" class="${isHistory ? '' : 'is-active'}">المهام الحالية</button><button data-action="task-tab" data-value="history" class="${isHistory ? 'is-active' : ''}">السجل</button></div>
    ${searchBox('ابحث في المهام...')}${notice('إنشاء الخطة وإدارة حالتها محليان. لا يبدأ التنفيذ ولا تتغير المهمة إلى «قيد التنفيذ» دون محرك Minecraft فعلي.', 'info')}
    <div class="mt-12">${rows}</div>`;
}

function renderTaskForm(state) {
  const bots = state.bots.map((bot) => ({ value: bot.id, label: `${bot.name} · ${bot.username || 'بدون اسم لاعب'}` }));
  const selectedBot = state.params.botId || '';
  const planChecked = state.aiConfigured ? 'checked' : '';
  return `${pageHeading('إضافة مهمة جديدة', 'اكتب ما تريد من البوت فعله', backButton())}
    <div class="form-card"><form data-form="task">
      <div class="form-row"><label class="form-label" for="description">وصف المهمة<small>حتى 2000 حرف</small></label><textarea class="field field-textarea" id="description" name="description" maxlength="2000" required placeholder="مثال: اجمع 5 stacks من الخشب وخزنهم في الصندوق."></textarea><div class="field-help">وصف واضح يساعد النموذج على إعداد خطة مقترحة. لا تُرسل مفاتيح أو بيانات دخول ضمن وصف المهمة.</div></div>
      ${selectField('البوت', 'botId', [{ value: '', label: 'غير معيّنة — اختر لاحقًا' }, ...bots], selectedBot)}
      ${selectField('الأولوية', 'priority', [{ value: 'high', label: 'عالية' }, { value: 'normal', label: 'عادية' }, { value: 'low', label: 'منخفضة' }], 'normal')}
      <div class="form-row"><label class="checkbox-row"><input type="checkbox" name="generatePlan" ${planChecked}><span>أنشئ خطة باستخدام OpenRouter بعد الحفظ</span></label><div class="field-help">${state.aiConfigured ? 'ستُجرّب النماذج المجانية المتاحة بالتتابع إذا فشل أحدها.' : 'لا يوجد مفتاح AI محفوظ؛ سيُحفظ الطلب دون ادعاء وجود خطة.'}</div></div>
      ${notice('عند تفعيل إنشاء الخطة، يُرسل وصف المهمة واسم البوت/السيرفر إلى OpenRouter عبر HTTPS. لا تُضمّن كلمة مرور أو مفتاحًا في الوصف.', 'info')}
      <div class="mt-8">${notice('الخطة الناتجة اقتراح من AI محفوظ محليًا. كل خطوة تبقى غير منفذة حتى يتوفر محرك Minecraft.', 'warning')}</div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">${icon('plus')}<span>حفظ المهمة</span></button><button class="btn btn-secondary" type="button" data-action="back">إلغاء</button></div>
    </form></div>`;
}

function renderTaskDetails(state) {
  const task = state.tasks.find((item) => item.id === state.params.id);
  if (!task) return `${pageHeading('تفاصيل المهمة', '', backButton())}${emptyState({ icon: 'tasks', title: 'المهمة غير موجودة', description: 'قد تكون حُذفت من التخزين المحلي.' })}`;
  const bot = state.bots.find((item) => item.id === task.botId);
  const plan = task.plan;
  const history = state.taskHistory.filter((entry) => entry.taskId === task.id).sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
  const planMarkup = plan?.steps?.length ? `<div class="section-title"><h2>خطة مقترحة · ${h(task.modelUsed || 'OpenRouter')}</h2></div><div class="list-stack">${plan.steps.map((step, index) => `<div class="glass-card" style="display:flex;gap:11px;padding:12px"><div class="stat-icon purple" style="width:29px;height:29px;min-width:29px;border-radius:10px;font-size:10px">${fmtNumber(index + 1)}</div><div style="min-width:0"><strong style="font-size:10px">${h(step.title)}</strong><p class="muted" style="margin:5px 0 0;font-size:9px;line-height:1.65">${h(step.details)}</p>${step.doneWhen ? `<p style="margin:5px 0 0;color:#79bfff;font-size:8px">شرط الاكتمال: ${h(step.doneWhen)}</p>` : ''}</div></div>`).join('')}</div>${plan.summary ? `<div class="mt-12">${notice(plan.summary, 'info', 'ملخص AI')}</div>` : ''}${plan.risks?.length ? `<div class="mt-8">${notice(plan.risks.join(' · '), 'warning', 'تنبيهات')}</div>` : ''}` : `<div class="section-title"><h2>خطة المهمة</h2></div>${emptyState({ icon: 'spark', title: 'لم تُنشأ خطة بعد', description: 'يمكن إنشاء خطة من وصفك عبر نموذج مجاني متاح في OpenRouter.', actionLabel: 'إنشاء خطة AI', action: 'generate-task-plan' })}`;
  const canCancel = !['completed', 'failed', 'cancelled'].includes(task.status);
  const planning = state.busy === 'planning';
  const planningNotice = planning ? `<div class="status-strip mb-12"><div><div class="strip-title">جار إعداد الخطة</div><div class="strip-subtitle ltr">${h(state.aiAttempt?.model || 'جاري اختيار نموذج مجاني')}</div></div><span class="spinner"></span></div>` : '';
  return `${pageHeading('تفاصيل المهمة', '', backButton())}
    ${planningNotice}
    <section class="detail-hero"><div class="task-head"><div class="task-main"><div class="eyebrow">${({ high: 'أولوية عالية', normal: 'أولوية عادية', low: 'أولوية منخفضة' })[task.priority] || 'أولوية عادية'}</div><h2 style="margin:5px 0 0;font-size:16px">${h(task.name || 'مهمة جديدة')}</h2></div>${taskStatus(task)}</div><p style="font-size:10px;color:#a3b2ca;line-height:1.7;margin:11px 0 0">${h(task.description || '')}</p><div class="detail-stat-grid"><div class="detail-stat"><span>البوت</span><strong>${h(bot?.name || 'غير معيّنة')}</strong></div><div class="detail-stat"><span>تاريخ الإنشاء</span><strong>${formatDate(task.createdAt, { time: true })}</strong></div><div class="detail-stat"><span>التقدم الفعلي</span><strong>${task.status === 'completed' ? '100%' : '0% — لا يوجد تنفيذ حيّ'}</strong></div><div class="detail-stat"><span>حالة الخطة</span><strong>${plan?.steps?.length ? `${fmtNumber(plan.steps.length)} خطوات مقترحة` : 'لم تُنشأ'}</strong></div></div></section>
    <div class="btn-row mt-12">${!plan?.steps?.length ? actionButton('generate-task-plan', planning ? 'جار التخطيط…' : 'إنشاء خطة AI', 'primary', 'spark', planning ? 'disabled' : '') : actionButton('generate-task-plan', planning ? 'جار التخطيط…' : 'إعادة التخطيط', 'secondary', 'refresh', planning ? 'disabled' : '')}${canCancel && !planning ? actionButton('cancel-task', 'إلغاء المهمة', 'danger', 'close', `data-id="${h(task.id)}"`) : ''}</div>
    <div class="mt-12">${notice('هذه حالة محلية للطلب والخطة. لا توجد حركة أو تنفيذ في العالم حتى يتوفر محرك Minecraft؛ لا تستخدم الخطة كإثبات على إنجاز المهمة.', 'warning', 'غير منفذة')}</div>
    ${planMarkup}
    <div class="section-title"><h2>سجل المهمة</h2></div>
    ${history.length ? `<div class="log-list">${history.map((entry) => `<div class="log-row"><div class="log-symbol task">${icon('tasks')}</div><div class="log-copy"><p>${h(entry.message)}</p><div class="log-meta"><span>${formatDate(entry.createdAt, { time: true })}</span><span>${h(entry.status || '')}</span></div></div></div>`).join('')}</div>` : emptyState({ icon: 'logs', title: 'لا توجد أحداث بعد', description: 'ستظهر هنا عمليات إنشاء الخطة أو تعديل حالة المهمة.' })}`;
}

function renderAiSettings(state) {
  const config = state.aiConfig || {};
  const selected = config.model || '';
  const models = state.aiModels || [];
  const options = models.map((model) => `<option value="${h(model.id)}" ${selected === model.id ? 'selected' : ''}>${h(model.name || model.id)}${model.id.toLowerCase().endsWith(':free') ? ' · مجاني' : ''}</option>`).join('');
  const modelDisplay = selected ? selected : 'لم يتم اختيار نموذج بعد';
  return `${pageHeading('إعدادات الذكاء الاصطناعي', 'مفتاحك لا يُحفظ بنص واضح على Android', backButton())}
    <div class="center" style="padding:8px 0 13px"><div class="ai-orb" style="width:58px;height:58px;margin:auto;border-radius:20px">${icon('spark')}</div><div class="eyebrow mt-8">OpenRouter · AI Provider</div></div>
    <form class="form-card" data-form="ai-key">
      <div class="form-row"><label class="form-label" for="apiKey">مفتاح API</label><div class="field-icon-wrap"><input class="field" id="apiKey" name="apiKey" type="password" autocomplete="new-password" dir="ltr" spellcheck="false" placeholder="sk-or-v1-… (لن يظهر بعد الحفظ)" maxlength="512"><button type="button" class="reveal" data-action="reveal-key" aria-label="إظهار المفتاح">${icon('eye')}</button></div><div class="field-help">يُرسل فقط إلى OpenRouter عبر TLS. في APK يُشفّر باستخدام Android Keystore؛ في المعاينة المحلية يبقى في ذاكرة عملية الخادم فقط ويُمحى عند إغلاقها.</div></div>
      <div class="status-strip"><div><div class="strip-title">حالة المفتاح</div><div class="strip-subtitle">${state.aiConfigured ? (state.aiStorage === 'android-keystore' ? 'محفوظ بتشفير الجهاز' : 'مضبوط مؤقتًا للمعاينة') : 'لا يوجد مفتاح مضبوط'}</div></div>${statusPill(state.aiConfigured ? 'ready' : 'idle', state.aiConfigured ? 'مُعدّ' : 'غير مُعدّ')}</div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">${icon('lock')}<span>${state.aiConfigured ? 'تحديث المفتاح' : 'حفظ المفتاح'}</span></button><button class="btn btn-secondary" type="button" data-action="test-ai">اختبار الاتصال</button></div>
      ${state.aiConfigured ? `<div class="mt-8">${actionButton('clear-ai-key', 'حذف المفتاح المحفوظ', 'danger', 'trash')}</div>` : ''}
    </form>
    <div class="section-title"><h2>اختيار النموذج</h2><button class="text-action" data-action="update-models">${state.aiModelsLoading ? 'جار التحميل…' : 'تحديث القائمة'}</button></div>
    <div class="ai-model-card"><div class="ai-orb">${icon('spark')}</div><div class="ai-model-copy"><strong>النموذج الحالي</strong><small class="ltr">${h(modelDisplay)}</small></div>${config.automatic !== false ? statusPill('ready', 'تلقائي') : statusPill('purple', 'يدوي')}</div>
    <div class="form-card mt-12">
      <label class="checkbox-row"><input type="checkbox" data-setting="aiAutomatic" ${config.automatic !== false ? 'checked' : ''}><span>اختيار أفضل نموذج مجاني تلقائيًا</span></label>
      <p class="help-copy">يفلتر النماذج المجانية المتاحة، ثم يوازن سياق النموذج ودعم الأدوات/الاستدلال ومؤشرات السرعة وسجل نجاحه. عند الفشل يُجرّب نموذجًا مجانيًا آخر.</p>
      ${models.length ? `<div class="form-row mt-12"><label class="form-label" for="ai-model-select">النموذج اليدوي</label><select class="field field-select" id="ai-model-select" data-action="choose-ai-model"><option value="">اختر نموذجًا</option>${options}</select></div>` : `<div class="mt-12">${notice('تحقق من المفتاح لجلب قائمة النماذج الحقيقية من OpenRouter.', 'info')}</div>`}
      <div class="mt-12">${actionButton('select-free-model', 'اعثر على أفضل نموذج مجاني الآن', 'secondary', 'spark', state.aiModelsLoading ? 'disabled' : '')}</div>
    </div>
    <div class="section-title"><h2>حدود الاستخدام</h2></div>
    <div class="form-card"><div class="form-grid-two">${field('الحد اليومي للطلبات', 'aiDailyLimit', config.dailyLimit ?? 30, { type: 'number', attrs: 'min="1" max="500" data-setting-input="dailyLimit"' })}${field('حد الرموز للطلب', 'aiMaxTokens', config.maxTokens ?? 900, { type: 'number', attrs: 'min="128" max="8192" data-setting-input="maxTokens"' })}</div><div class="form-actions"><button class="btn btn-secondary btn-block" type="button" data-action="save-ai-limits">حفظ الحدود</button></div></div>
    <div class="mt-12">${notice('يتم طلب قائمة النماذج الفعلية من OpenRouter. لا توجد مفاتيح افتراضية أو بيانات نماذج ثابتة داخل التطبيق.', 'info')}</div>`;
}

function renderTasksShortcut(state) {
  return state.tasks.length ? `<div class="list-stack">${state.tasks.slice(0, 4).map((task) => taskCard(task, state.bots)).join('')}</div>` : emptyState({ icon: 'tasks', title: 'لا توجد مهام لهذا البوت', description: 'أضف طلبًا واربطه بهذا البوت.', actionLabel: 'إضافة مهمة', action: 'add-task' });
}

function renderSettings(state) {
  const localCount = state.servers.length + state.bots.length + state.tasks.length;
  return `${pageHeading('الإعدادات', 'خصص MineBot AI وبياناتك المحلية')}
    ${group('التطبيق', settingItem({ icon: 'settings', title: 'إعدادات التطبيق', subtitle: 'اللغة، المظهر، الإشعارات والحركة', route: 'settings-app', color: 'blue' }))}
    ${group('Minecraft', settingItem({ icon: 'cube', title: 'إعدادات Minecraft', subtitle: 'النسخة الافتراضية وسلوك البوت والاتصال', route: 'settings-minecraft', color: 'green' }))}
    ${group('الذكاء الاصطناعي', settingItem({ icon: 'spark', title: 'إعدادات الذكاء الاصطناعي', subtitle: 'OpenRouter والنموذج المجاني والحدود', route: 'settings-ai', color: 'purple' }))}
    ${group('البيانات والأمان', settingItem({ icon: 'database', title: 'التخزين والنسخ الاحتياطي', subtitle: `${fmtNumber(localCount)} سجل محفوظ في SQLite محليًا`, route: 'settings-storage', color: 'cyan' }) + settingItem({ icon: 'shield', title: 'الأمان وقفل التطبيق', subtitle: 'مفتاح API مشفر وإعداد رمز قفل محلي', route: 'settings-security', color: 'amber' }))}
    ${group('معلومات', settingItem({ icon: 'info', title: 'حول التطبيق', subtitle: 'الإصدار، المصدر والقيود التقنية', route: 'settings-about', color: 'purple' }))}`;
}

function renderSettingsApp(state) {
  return `${pageHeading('إعدادات التطبيق', 'مظهر هادئ وإشعارات محلية', backButton())}
    <div class="form-card">
      <div class="kv-row"><span>اللغة</span><strong class="rtl-value">العربية</strong></div>
      <div class="kv-row"><span>المظهر</span><strong class="rtl-value">داكن · أساسي</strong></div>
      <div class="setting-item" style="margin:12px -1px 0;border:1px solid var(--line);border-radius:14px"><span class="setting-icon purple">${icon('spark')}</span><span class="setting-copy"><strong>تقليل الحركة</strong><small>خفض الانتقالات والحركة الدقيقة</small></span>${switchMarkup('reduceMotion', state.settings.reduceMotion, 'تقليل الحركة')}</div>
      <div class="setting-item" style="margin:8px -1px 0;border:1px solid var(--line);border-radius:14px"><span class="setting-icon green">${icon('bell')}</span><span class="setting-copy"><strong>الإشعارات المحلية</strong><small>تظهر للأحداث التي ينشئها التطبيق فقط</small></span>${switchMarkup('notifications', state.settings.notifications, 'الإشعارات')}</div>
      <p class="help-copy">لا توجد خدمة خلفية أو جلسات بوت لتوليد إشعارات اتصال/مهام في هذه النسخة.</p>
    </div>
    <div class="mt-12">${notice('لا يمكن تغيير اللغة أو المظهر الفاتح في هذا الإصدار؛ الواجهة العربية الداكنة هي هوية التصميم المرجعي.', 'info')}</div>`;
}

function renderSettingsMinecraft(state) {
  const behavior = state.settings.defaultBehavior || 'survival';
  return `${pageHeading('إعدادات Minecraft', 'سياسة محلية؛ التنفيذ يتطلب محركًا', backButton())}
    <form class="form-card" data-form="minecraft-settings">
      ${selectField('النسخة الافتراضية', 'defaultVersion', ['1.21.8','1.21.6','1.21.4','1.21.1','1.20.6','1.20.4','1.20.1','1.19.4','1.18.2'].map((value) => ({ value, label: value })), state.settings.defaultVersion || '1.20.4')}
      ${selectField('سلوك البوت الافتراضي', 'defaultBehavior', [{ value: 'survival', label: 'بقاء — أولوية السلامة' }, { value: 'balanced', label: 'متوازن' }, { value: 'follow', label: 'اتباع اللاعب' }], behavior)}
      ${field('محاولات إعادة الاتصال', 'reconnectAttempts', state.settings.reconnectAttempts ?? 5, { type: 'number', attrs: 'min="0" max="30"' })}
      ${field('مهلة الاتصال (ثانية)', 'connectionTimeout', state.settings.connectionTimeout ?? 8, { type: 'number', attrs: 'min="2" max="60"' })}
      <div class="form-actions"><button class="btn btn-primary btn-block" type="submit">حفظ الإعدادات</button></div>
    </form>
    <div class="section-title"><h2>ترتيب Behavior Engine</h2></div>
    <div class="form-card"><div class="kv-list" style="padding:0">${[['طوارئ','استعادة بعد الموت أو خطر حرج'],['بقاء','الطعام والصحة؛ تعليق المهمة مؤقتًا'],['أمر المستخدم','الأوامر الصريحة'],['المهمة الحالية','الخطة المحفوظة'],['إدارة الموارد','تنظيم الموارد'],['انتظار','عند عدم وجود عمل']].map(([title, text], i) => `<div class="kv-row"><span>${fmtNumber(i + 1)} · ${h(title)}</span><strong class="rtl-value">${h(text)}</strong></div>`).join('')}</div><p class="help-copy">هذه سياسة أولوية منفصلة ومختبرة كمنطق نطاق. لا تتلقى حالة صحة أو طعام فعلية لأن محرك Minecraft غير مدمج.</p></div>`;
}

function renderSettingsStorage(state) {
  const count = state.servers.length + state.bots.length + state.tasks.length + state.logs.length + state.skins.length;
  return `${pageHeading('التخزين والنسخ الاحتياطي', 'قاعدة SQLite محلية · لا توجد Cloud', backButton())}
    <section class="detail-hero"><div class="detail-head"><div class="setting-icon" style="width:43px;height:43px">${icon('database')}</div><div><h2>قاعدة البيانات</h2><p>SQLite داخل مساحة التطبيق الخاصة</p></div></div><div class="detail-stat-grid"><div class="detail-stat"><span>السجلات</span><strong>${fmtNumber(count)}</strong></div><div class="detail-stat"><span>وضع التخزين</span><strong>${state.platformMode === 'android' ? 'SQLite · Android' : 'SQLite · معاينة محلية'}</strong></div></div></section>
    <div class="section-title"><h2>بيانات التطبيق</h2></div>
    <div class="form-card"><div class="kv-row"><span>سيرفرات</span><strong>${fmtNumber(state.servers.length)}</strong></div><div class="kv-row"><span>بوتات</span><strong>${fmtNumber(state.bots.length)}</strong></div><div class="kv-row"><span>مهام</span><strong>${fmtNumber(state.tasks.length)}</strong></div><div class="kv-row"><span>سجلات / سجلات المهام</span><strong>${fmtNumber(state.logs.length + state.taskHistory.length)}</strong></div><div class="kv-row"><span>Skins</span><strong>${fmtNumber(state.skins.length)}</strong></div><div class="kv-row"><span>Cache النماذج</span><strong class="rtl-value">${state.aiModels.length ? `${fmtNumber(state.aiModels.length)} نموذج مؤقت` : 'غير محمّل'}</strong></div>
    <div class="form-actions"><button class="btn btn-secondary" type="button" data-action="export-backup">${icon('download')}<span>تصدير نسخة</span></button><button class="btn btn-outline" type="button" data-action="import-backup">${icon('upload')}<span>استيراد</span></button></div>
    <div class="btn-row mt-8">${actionButton('clear-cache', 'مسح Cache النماذج', 'secondary', 'refresh')}${actionButton('clear-logs', 'مسح السجلات', 'danger', 'trash')}</div></div>
    <input id="backup-file" class="hidden" type="file" accept="application/json,.json">
    <div class="mt-12">${notice('النسخة الاحتياطية تضم بيانات التطبيق والسجلات فقط؛ مفاتيح API والأسرار مستثناة. خزّن النسخة في مكان آمن.', 'warning')}</div>`;
}

function renderSettingsSecurity(state) {
  return `${pageHeading('الأمان', 'حماية البيانات الحساسة على الجهاز', backButton())}
    <div class="form-card"><div class="kv-row"><span>OpenRouter API Key</span><strong class="rtl-value">${state.aiConfigured ? (state.aiStorage === 'android-keystore' ? 'Android Keystore · مشفّر' : 'ذاكرة مؤقتة للمعاينة') : 'غير مضبوط'}</strong></div><div class="kv-row"><span>تسجيل الدخول وكلمات المرور</span><strong class="rtl-value">لا نخزنها</strong></div><div class="kv-row"><span>قفل التطبيق</span><strong class="rtl-value">${state.settings.lockEnabled ? 'مفعّل' : 'غير مفعّل'}</strong></div><div class="form-actions"><button class="btn ${state.settings.lockEnabled ? 'btn-danger' : 'btn-primary'} btn-block" data-action="configure-lock">${icon('lock')}<span>${state.settings.lockEnabled ? 'تغيير أو إزالة رمز القفل' : 'إعداد رمز قفل من 6 أرقام'}</span></button></div></div>
    <div class="mt-12">${notice('على Android، مفتاح AI يُشفّر بمفتاح AES-GCM محفوظ في Android Keystore. المعاينة في المتصفح ليست مخزنًا آمنًا ولا تحتفظ بالمفتاح بعد إيقاف الخادم.', 'info')}</div>`;
}

function renderSettingsAbout(state) {
  return `${pageHeading('حول MineBot AI', 'نسخة محلية أولية من تطبيق إدارة Minecraft', backButton())}
    <section class="detail-hero"><div class="detail-head"><div class="brand-mark">${icon('cube')}</div><div><h2>MineBot AI</h2><p>نسخة 0.1.0 · Android source</p></div></div><div class="detail-stat-grid"><div class="detail-stat"><span>Build type</span><strong>Debug scaffold</strong></div><div class="detail-stat"><span>التخزين</span><strong>SQLite محلي</strong></div><div class="detail-stat"><span>الترخيص</span><strong>المصدر في هذا المستودع</strong></div><div class="detail-stat"><span>الخدمة السحابية</span><strong>OpenRouter اختياري فقط</strong></div></div></section>
    <div class="section-title"><h2>القيود التقنية المعروفة</h2></div>
    <div class="list-stack"><div class="log-row"><div class="log-symbol warning">${icon('alert')}</div><div class="log-copy"><p>محرك bots لتسجيل الدخول والحركة وPathfinding وتنفيذ المهام غير مدمج. لا توجد حالة Bot مزيفة.</p></div></div><div class="log-row"><div class="log-symbol warning">${icon('alert')}</div><div class="log-copy"><p>اختبار Server Status Ping حقيقي، لكنه لا يثبت نجاح تسجيل دخول لاعب.</p></div></div><div class="log-row"><div class="log-symbol warning">${icon('alert')}</div><div class="log-copy"><p>خطة AI اقتراح محفوظ، وليست أوامر قابلة للتنفيذ داخل اللعبة.</p></div></div></div>
    <div class="section-title"><h2>المصدر والاعتمادات</h2></div>${notice('واجهة Android مبنية على WebView محلي، وقاعدة SQLite وAndroid Keystore تستخدمان واجهات Android الأصلية دون Cloud إلزامي. لا توجد خطوط أو صور خارجية محمّلة من الإنترنت.', 'info')}<div class="mt-12">${button('تراخيص Open Source', 'open-licenses', 'secondary', { icon: 'info', block: true })}</div>${state.platformMode === 'local-preview' ? `<div class="mt-8"><a class="btn btn-outline btn-block" href="/download/source.zip">${icon('download')}<span>تحميل حزمة المصدر مباشرة</span></a></div>` : ''}`;
}

function renderLogs(state) {
  const filters = [['all','الكل'],['info','Info'],['warning','Warning'],['error','Error'],['ai','AI'],['task','Task'],['connection','Connection']];
  let rows = [...state.logs].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  if (state.params.botId) rows = rows.filter((item) => item.botId === state.params.botId);
  if (state.logFilter !== 'all') rows = rows.filter((item) => item.level === state.logFilter || item.category === state.logFilter);
  const logCards = rows.length ? `<div class="log-list">${rows.map((entry) => {
    const kind = entry.level === 'error' ? 'error' : entry.level === 'warning' ? 'warning' : entry.category === 'ai' ? 'ai' : entry.category === 'task' ? 'task' : '';
    const iconName = entry.level === 'error' || entry.level === 'warning' ? 'alert' : entry.category === 'ai' ? 'spark' : entry.category === 'task' ? 'tasks' : entry.category === 'connection' ? 'plug' : 'info';
    return `<div class="log-row"><div class="log-symbol ${kind}">${icon(iconName)}</div><div class="log-copy"><p>${h(entry.message)}</p><div class="log-meta"><span>${formatDate(entry.createdAt, { time: true })}</span><span class="log-category">${h(entry.category || 'info')}</span><span>${h(entry.level || 'info')}</span></div></div></div>`;
  }).join('')}</div>` : emptyState({ icon: 'logs', title: 'لا توجد سجلات هنا', description: state.logs.length ? 'غيّر عامل التصفية لرؤية السجلات.' : 'تظهر هنا أحداث التطبيق الحقيقية مثل الحفظ واختبارات الاتصال وأخطاء AI.' });
  return `${pageHeading('السجلات', `${fmtNumber(state.logs.length)} سجل محلي`, backButton())}<div class="segmented log-filters">${filters.map(([value, label]) => `<button class="${state.logFilter === value ? 'is-active' : ''}" data-action="log-filter" data-value="${h(value)}">${h(label)}</button>`).join('')}</div>${logCards}`;
}

function renderSkins(state) {
  const selected = state.params.skinId || state.selectedSkinId || '';
  const bot = state.params.botId ? state.bots.find((item) => item.id === state.params.botId) : null;
  const skins = state.skins;
  const card = (skin) => `<button class="skin-card ${selected === skin.id ? 'selected' : ''}" data-action="select-skin" data-id="${h(skin.id)}"><span class="skin-check">${selected === skin.id ? icon('check') : ''}</span><span class="skin-preview">${skin.filePath ? `<img src="${h(skin.filePath)}" alt="معاينة ${h(skin.name)}" loading="lazy">` : `<span class="avatar-pixel"></span>`}</span><span class="skin-card-name">${h(skin.name)}</span></button>`;
  return `${pageHeading('تغيير السكن', bot ? `تعيين سكن لملف ${bot.name}` : 'Skins تحفظ في مساحة التطبيق المحلية', backButton())}
    <div class="form-card"><input id="skin-file" class="hidden" type="file" accept="image/png"><div class="btn-row"><button class="btn btn-primary" data-action="upload-skin" ${state.busy === 'skin' ? 'disabled' : ''}>${state.busy === 'skin' ? '<span class="spinner"></span>' : icon('upload')}<span>${state.busy === 'skin' ? 'جار حفظ الملف…' : 'رفع سكن من الهاتف'}</span></button></div><p class="help-copy">PNG بُعده 64×64 أو 64×32، بحد أقصى 2 MB. يُحفظ محليًا؛ لا يتم رفعه إلى Cloud.</p></div>
    <div class="section-title"><h2>Skins المحفوظة</h2><span class="section-hint">${fmtNumber(skins.length)} ملف</span></div>
    ${skins.length ? `<div class="skin-grid">${skins.map(card).join('')}</div>` : emptyState({ icon: 'skin', title: 'لا توجد Skins بعد', description: 'ارفع ملف صورة من جهازك لتخزينه محليًا. لا توجد معاينات تجريبية.' })}
    ${bot ? `<div class="form-actions"><button class="btn btn-primary btn-block" data-action="apply-skin" data-id="${h(bot.id)}" ${selected ? '' : 'disabled'}>${icon('check')}<span>تعيين السكن على ملف البوت</span></button></div><div class="mt-12">${notice('يُحفظ اختيار السكن في ملف البوت المحلي. لن يتغير مظهر لاعب داخل السيرفر حتى يتوفر تسجيل دخول ومحرك Minecraft.', 'warning')}</div>` : ''}
    ${skins.length ? `<div class="section-title"><h2>إدارة الملف</h2></div><button class="setting-item" data-action="delete-selected-skin" data-id="${h(selected)}"><span class="setting-icon amber">${icon('trash')}</span><span class="setting-copy"><strong>حذف السكن المحدد</strong><small>يحذف الملف المحلي والمعاينة</small></span><span class="setting-chevron">${icon('chevron')}</span></button>` : ''}`;
}

function renderInventory(state) {
  const bot = state.bots.find((item) => item.id === state.params.id);
  return `${pageHeading('المخزون', bot ? bot.name : '', backButton())}${notice('لا يوجد اتصال Minecraft حيّ لقراءة المخزون. لا نعرض عناصر أو كميات افتراضية.', 'warning', 'بيانات غير متاحة')}${emptyState({ icon: 'inventory', title: 'المخزون غير متصل', description: 'تظهر العناصر الحقيقية فقط بعد تسجيل دخول البوت واستقبال بيانات Minecraft من المحرك.' })}`;
}

function renderNotifications(state) {
  const entries = state.logs.filter((entry) => Number(entry.createdAt) > Date.now() - 7 * 86400_000).slice(0, 8);
  return `${pageHeading('الإشعارات', 'أحداث من هذا الجهاز', backButton())}${entries.length ? `<div class="log-list">${entries.map((entry) => `<div class="log-row"><div class="log-symbol ${entry.level === 'warning' ? 'warning' : ''}">${icon(entry.category === 'task' ? 'tasks' : entry.category === 'ai' ? 'spark' : 'info')}</div><div class="log-copy"><p>${h(entry.message)}</p><div class="log-meta"><span>${formatDate(entry.createdAt, { time: true })}</span></div></div></div>`).join('')}</div>` : emptyState({ icon: 'bell', title: 'لا توجد إشعارات بعد', description: 'تظهر هنا نتائج واختبارات نفّذتها بنفسك. لا توجد بيانات نشاط مولدة.' })}`;
}

function renderPin(state) {
  return `${pageHeading('قفل التطبيق', '', backButton())}<div class="form-card"><p class="modal-message">أدخل رمزك المحلي المكوّن من 6 أرقام.</p><form data-form="unlock"><div class="form-row"><label class="form-label" for="pin">رمز القفل</label><input class="field" id="pin" name="pin" type="password" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" autocomplete="current-password" required></div><button class="btn btn-primary btn-block" type="submit">فتح التطبيق</button></form></div>`;
}

export function renderRoute(state) {
  switch (state.route) {
    case 'home': return renderHome(state);
    case 'servers': return renderServers(state);
    case 'server-form': return renderServerForm(state);
    case 'server-details': return renderServerDetails(state);
    case 'bots': return renderBots(state);
    case 'bot-form': return renderBotForm(state);
    case 'bot-details': return renderBotDetails(state);
    case 'tasks': return renderTasks(state);
    case 'task-form': return renderTaskForm(state);
    case 'task-details': return renderTaskDetails(state);
    case 'settings': return renderSettings(state);
    case 'settings-app': return renderSettingsApp(state);
    case 'settings-minecraft': return renderSettingsMinecraft(state);
    case 'settings-ai': return renderAiSettings(state);
    case 'settings-storage': return renderSettingsStorage(state);
    case 'settings-security': return renderSettingsSecurity(state);
    case 'settings-about': return renderSettingsAbout(state);
    case 'logs': return renderLogs(state);
    case 'skins': return renderSkins(state);
    case 'inventory': return renderInventory(state);
    case 'notifications': return renderNotifications(state);
    case 'unlock': return renderPin(state);
    default: return renderHome(state);
  }
}
