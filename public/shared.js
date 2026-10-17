// Gemeinsame Helfer für Steuerung und Overlay.

const EVENT_INFO = {
  follow: { icon: '❤️', label: 'Follow' },
  bits: { icon: '💎', label: 'Bits' },
  dono: { icon: '💶', label: 'Dono' },
  sub: { icon: '⭐', label: 'Sub' },
  subgift: { icon: '🎁', label: 'Subgift' },
  raid: { icon: '🚨', label: 'Raid' },
  manual: { icon: '✋', label: 'Manuell' },
  system: { icon: '⚙️', label: 'System' },
};

const TIER_INFO = {
  leicht: { label: 'Leicht', color: '#5fd068' },
  mittel: { label: 'Mittel', color: '#f5c542' },
  schwer: { label: 'Schwer', color: '#ff5a4f' },
  raid: { label: 'Raid', color: '#b76cff' },
};

function tierInfo(tier) {
  return TIER_INFO[tier] || { label: tier, color: '#9aa4b2' };
}

function eventLine(ev) {
  if (!ev) return '';
  const info = EVENT_INFO[ev.type] || { icon: '•', label: ev.type };
  let amount = '';
  if (ev.amount) {
    if (ev.type === 'bits') amount = ` ${ev.amount} Bits`;
    else if (ev.type === 'dono') amount = ` ${String(ev.amount).replace('.', ',')} €`;
    else if (ev.type === 'subgift') amount = ` ×${ev.amount}`;
    else if (ev.type === 'raid') amount = ` (${ev.amount})`;
  }
  return `${info.icon} ${ev.user || info.label}${amount}`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Verbindet sich mit dem Server und baut die Verbindung bei Abbruch automatisch neu auf.
function connectStream(handlers) {
  let es;
  const open = () => {
    es = new EventSource('/api/stream');
    for (const [name, fn] of Object.entries(handlers)) {
      if (name === 'status') continue;
      es.addEventListener(name, e => fn(JSON.parse(e.data)));
    }
    es.onopen = () => handlers.status && handlers.status(true);
    es.onerror = () => {
      handlers.status && handlers.status(false);
      es.close();
      setTimeout(open, 2000);
    };
  };
  open();
}

async function api(action, params = {}) {
  const res = await fetch(`/api/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}
