const paths = {
  home: '<path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9M9 20v-6h6v6"/>',
  bot: '<rect x="5" y="7" width="14" height="13" rx="3"/><path d="M12 3v4M9 12h.01M15 12h.01M9 16h6M3 11v5M21 11v5"/>',
  tasks: '<path d="M8 5h11v15H5V5h2"/><path d="M9 3h6v4H9zM8 11h8M8 15h6"/><path d="m7 11 1 1 2-2"/>',
  server: '<rect x="4" y="4" width="16" height="7" rx="2"/><rect x="4" y="13" width="16" height="7" rx="2"/><path d="M8 7.5h.01M8 16.5h.01M12 7.5h4M12 16.5h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1 1.7-1.7 2.9-2-.5a8 8 0 0 1-1.8 1l-.4 2h-3.4l-.4-2a8 8 0 0 1-1.8-1l-2 .5-1.7-2.9 1-1.7a8 8 0 0 1 0-2L5.3 11l1.7-2.9 2 .5a8 8 0 0 1 1.8-1l.4-2h3.4l.4 2a8 8 0 0 1 1.8 1l2-.5 1.7 2.9-1 1.7a8 8 0 0 1-.1 2.3Z" transform="translate(-.2 -1.4) scale(.91)"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.6"/><path d="m16 16 4.5 4.5"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 8v6M23 11h-6"/>',
  player: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  cube: '<path d="m12 3 9 5v8l-9 5-9-5V8l9-5Z"/><path d="m3.5 8.3 8.5 4.8 8.5-4.8M12 13v8"/>',
  heart: '<path d="M20.8 8.7c0 5-8.8 10.1-8.8 10.1S3.2 13.7 3.2 8.7a4.7 4.7 0 0 1 8.8-2.3 4.7 4.7 0 0 1 8.8 2.3Z"/>',
  apple: '<path d="M12 8c-3.3-4-8.6-.8-8.6 4.7S6.2 21 9.6 21c1 0 1.7-.5 2.4-.5s1.4.5 2.4.5c3.4 0 6.2-2.8 6.2-8.3S15.3 4 12 8ZM12 7c0-2 1.4-3.5 4-4"/>',
  pin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  spark: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l1 2.2 2 1-2 1-1 2-1-2-2-1 2-1 1-2.2Z"/>',
  wand: '<path d="m15 4 5 5M4 20l12-12 4 4L8 24l-4-4ZM4 4l.8 2.2L7 7l-2.2.8L4 10l-.8-2.2L1 7l2.2-.8L4 4ZM19 16l.7 1.6L21 18l-1.3.5L19 20l-.7-1.5L17 18l1.3-.4L19 16Z"/>',
  shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
  plug: '<path d="M8 3v5M16 3v5M7 8h10v4a5 5 0 0 1-5 5v4M12 17v4"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 14h12l1-14M9 7V4h6v3"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a14 14 0 0 1-3.1 3.9M6.2 6.2C3.5 8 2 12 2 12s3.5 7 10 7a10.6 10.6 0 0 0 4-.8"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6.3L20 12M4 12l2 5.7A7 7 0 0 0 18.4 15"/>',
  play: '<path d="m8 5 11 7-11 7V5Z"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  reconnect: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6.3L20 12M4 12l2 5.7A7 7 0 0 0 18.4 15"/>',
  inventory: '<path d="M4 7h16v14H4zM4 7l2-4h12l2 4M9 12h6M10 7v4M14 7v4"/>',
  skin: '<path d="M12 3 20 7v10l-8 4-8-4V7l8-4Z"/><path d="m4.5 7.3 7.5 4.2 7.5-4.2M12 11.5V21M8 5l8 4.5"/>',
  logs: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  alert: '<path d="M10.3 4.3 2 18.5A2 2 0 0 0 3.7 21h16.6a2 2 0 0 0 1.7-2.5L13.7 4.3a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 18v2h16v-2"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18h1a2.3 2.3 0 0 0 1.5-4c-1-.9-.4-2.6 1-2.6H17A4 4 0 0 0 21 10c0-4-4-7-9-7Z"/><path d="M7 12h.01M9 8h.01M14 7h.01M17 10h.01"/>',
  moon: '<path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z"/>',
  notification: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  arrowRight: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6v6H9zM9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4"/>',
  wifi: '<path d="M5 12.5a11 11 0 0 1 14 0M8 15.5a6 6 0 0 1 8 0M11 18.5a2 2 0 0 1 2 0M2 9a16 16 0 0 1 20 0"/>',
  filter: '<path d="M4 7h16M7 12h10M10 17h4"/>',
  message: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8A8.5 8.5 0 0 1 12.5 20a8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3h.5a8.5 8.5 0 0 1 8 8v.5Z"/>',
};

export function icon(name, className = '') {
  const pathData = paths[name] || paths.info;
  const cls = className ? ` class="${escapeHtml(className)}"` : '';
  return `<svg${cls} viewBox="0 0 24 24" aria-hidden="true">${pathData}</svg>`;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export function uid() {
  return globalThis.crypto?.randomUUID?.() || `mb-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function formatDate(value, { time = false } = {}) {
  if (!value) return '—';
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar', time ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'medium' }).format(date);
}

export function statusPill(status, label = null) {
  const styles = {
    online: ['online', label || 'متصل'], offline: ['offline', label || 'غير متصل'],
    ready: ['purple', label || 'مُعدّ محليًا'], idle: ['idle', label || 'غير مختبر'],
    pending: ['pending', label || 'قيد الانتظار'], planned: ['pending', label || 'مخططة'],
    pending_plan: ['pending', label || 'بانتظار التخطيط'], completed: ['online', label || 'مكتملة'],
    failed: ['offline', label || 'فشلت'], paused: ['pending', label || 'متوقفة مؤقتًا'],
    cancelled: ['idle', label || 'أُلغيت'], running: ['online', label || 'تعمل'],
  };
  const [cls, text] = styles[status] || ['idle', label || 'غير معروف'];
  return `<span class="status-pill ${cls}">${escapeHtml(text)}</span>`;
}

export function pageHeading(title, subtitle = '', action = '') {
  return `<div class="page-heading"><div><h1>${escapeHtml(title)}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div>${action}</div>`;
}

export function notice(text, tone = 'info', heading = '') {
  const iconName = tone === 'warning' || tone === 'error' ? 'alert' : tone === 'success' ? 'check' : 'info';
  return `<div class="notice ${tone}"><span class="notice-icon">${icon(iconName)}</span><span>${heading ? `<strong>${escapeHtml(heading)} — </strong>` : ''}${escapeHtml(text)}</span></div>`;
}

export function emptyState({ icon: iconName = 'cube', title, description, actionLabel = '', action = '' }) {
  return `<div class="empty-state"><div class="empty-icon">${icon(iconName)}</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p>${actionLabel ? `<button class="btn btn-secondary btn-small" data-action="${escapeHtml(action)}">${icon('plus')}${escapeHtml(actionLabel)}</button>` : ''}</div>`;
}

export function button(label, action, kind = 'primary', { icon: iconName = '', attrs = '', size = '', block = false } = {}) {
  return `<button class="btn btn-${kind} ${size ? `btn-${size}` : ''} ${block ? 'btn-block' : ''}" data-action="${escapeHtml(action)}" ${attrs}>${iconName ? icon(iconName) : ''}<span>${escapeHtml(label)}</span></button>`;
}

export function fmtNumber(value) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat('ar').format(n);
}

export function timeAgo(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - Number(value || 0)) / 1000));
  if (seconds < 60) return 'الآن';
  if (seconds < 3600) return `قبل ${Math.floor(seconds / 60)} د`;
  if (seconds < 86400) return `قبل ${Math.floor(seconds / 3600)} س`;
  return `قبل ${Math.floor(seconds / 86400)} ي`;
}
