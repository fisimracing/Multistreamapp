const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');

async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (res.status === 401) {
    showLogin();
    throw new Error('No autenticado');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Error de red');
  }
  return res.json();
}

function showLogin() {
  loginScreen.classList.remove('hidden');
  appScreen.classList.add('hidden');
}

function showApp() {
  loginScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  loadConnectionInfo();
  loadDestinations();
  loadStatus();
}

async function checkSession() {
  const s = await api('/api/session');
  if (s.authenticated) showApp();
  else showLogin();
}

document.getElementById('login-btn').addEventListener('click', async () => {
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  try {
    await api('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
    showApp();
  } catch (e) {
    errEl.textContent = 'Contraseña incorrecta';
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  showLogin();
});

async function loadConnectionInfo() {
  const el = document.getElementById('connection-info');
  try {
    const info = await api('/api/connection-info');
    el.innerHTML = `
      <p>Servidor: <code>${info.publicRtmpUrl || 'configurá PUBLIC_RTMP_URL'}</code></p>
      <p>Stream key: <code>${info.streamKey || 'configurá STREAM_KEY'}</code></p>
      <p class="muted">Pegá esto en OBS → Configuración → Emisión → Servidor personalizado.</p>
    `;
  } catch (e) {
    el.textContent = 'No se pudo cargar.';
  }
}

async function loadStatus() {
  const box = document.getElementById('status-box');
  try {
    const s = await api('/api/status');
    const badge = s.live
      ? `<span class="badge on">EN VIVO</span>`
      : `<span class="badge off">Sin señal</span>`;
    const dests = s.destinationsUsed.length
      ? s.destinationsUsed.map((d) => d.name).join(', ')
      : '—';
    box.innerHTML = `
      <p>${badge}</p>
      <p class="muted">Destinos activos: ${dests}</p>
      ${s.lastError ? `<p class="error">${s.lastError}</p>` : ''}
      <pre class="log">${s.logTail.join('\n') || 'Sin actividad reciente'}</pre>
    `;
    loadQuality(s.live);
  } catch (e) {
    box.textContent = 'No se pudo cargar el estado.';
  }
}

// --- Vista previa (HTTP-FLV) y calidad ---
let flvPlayer = null;
let previewStreamKey = null;

async function ensurePreviewKey() {
  if (previewStreamKey) return previewStreamKey;
  const info = await api('/api/connection-info');
  previewStreamKey = info.streamKey;
  return previewStreamKey;
}

function startPreview(key) {
  const video = document.getElementById('preview-video');
  const msg = document.getElementById('preview-msg');
  if (!window.flvjs || !flvjs.isSupported()) {
    msg.textContent = 'Tu navegador no soporta la vista previa (probá con Chrome/Edge).';
    return;
  }
  if (flvPlayer) return; // ya está corriendo
  flvPlayer = flvjs.createPlayer({
    type: 'flv',
    isLive: true,
    url: `/live/${key}.flv`,
  });
  flvPlayer.attachMediaElement(video);
  flvPlayer.load();
  flvPlayer.play().catch(() => {});
  msg.textContent = '';
  flvPlayer.on(flvjs.Events.ERROR, () => {
    msg.textContent = 'No se pudo cargar la vista previa todavía.';
    stopPreview();
  });
}

function stopPreview() {
  if (flvPlayer) {
    try {
      flvPlayer.pause();
      flvPlayer.unload();
      flvPlayer.detachMediaElement();
      flvPlayer.destroy();
    } catch (e) {
      /* ignore */
    }
    flvPlayer = null;
  }
  document.getElementById('preview-msg').textContent = 'Esperando señal…';
}

async function loadQuality(isLive) {
  const box = document.getElementById('quality-box');
  if (!isLive) {
    box.textContent = '';
    stopPreview();
    return;
  }
  const key = await ensurePreviewKey();
  if (key) startPreview(key);
  try {
    const q = await api('/api/quality');
    if (!q.live) {
      box.textContent = '';
      return;
    }
    const v = q.video || {};
    const a = q.audio || {};
    box.textContent = `Video: ${v.width || '?'}x${v.height || '?'} · ${v.fps || '?'} fps · ${v.codec || ''}   |   Audio: ${a.codec || ''} ${a.samplerate ? a.samplerate + 'Hz' : ''}`;
  } catch (e) {
    box.textContent = '';
  }
}

document.getElementById('refresh-status-btn').addEventListener('click', loadStatus);
document.getElementById('restart-relay-btn').addEventListener('click', async () => {
  await api('/api/relay/restart', { method: 'POST' });
  loadStatus();
});
document.getElementById('stop-relay-btn').addEventListener('click', async () => {
  await api('/api/relay/stop', { method: 'POST' });
  loadStatus();
});

async function loadDestinations() {
  const list = document.getElementById('destinations-list');
  const items = await api('/api/destinations');
  if (!items.length) {
    list.innerHTML = '<p class="muted">Todavía no agregaste destinos.</p>';
    return;
  }
  list.innerHTML = items
    .map(
      (d) => `
    <div class="dest-item" data-id="${d.id}">
      <div class="dest-meta">
        <div class="name">${d.name} <span class="badge ${d.enabled ? 'on' : 'off'}">${d.enabled ? 'ON' : 'OFF'}</span></div>
        <div class="url">${d.url}${d.streamKey ? '/' + d.streamKey : ''}</div>
      </div>
      <div class="dest-actions">
        <button class="ghost toggle-btn">${d.enabled ? 'Apagar' : 'Prender'}</button>
        <button class="danger delete-btn">Borrar</button>
      </div>
    </div>`
    )
    .join('');

  list.querySelectorAll('.toggle-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('.dest-item').dataset.id;
      const item = items.find((i) => i.id === id);
      await api(`/api/destinations/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !item.enabled }),
      });
      loadDestinations();
    });
  });

  list.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('.dest-item').dataset.id;
      if (!confirm('¿Borrar este destino?')) return;
      await api(`/api/destinations/${id}`, { method: 'DELETE' });
      loadDestinations();
    });
  });
}

document.getElementById('dest-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const data = {
    platform: form.platform.value,
    name: form.name.value,
    url: form.url.value,
    streamKey: form.streamKey.value,
    enabled: form.enabled.checked,
  };
  await api('/api/destinations', { method: 'POST', body: JSON.stringify(data) });
  form.reset();
  form.enabled.checked = true;
  loadDestinations();
});

checkSession();
setInterval(() => {
  if (!appScreen.classList.contains('hidden')) loadStatus();
}, 8000);
