const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');

const store = require('./store');
const relay = require('./relay');
const { requireAuth } = require('./auth');
const rtmpServer = require('./rtmp-server');

const app = express();
const PORT = process.env.PORT || 3000;
const NMS_HTTP_PORT = process.env.NMS_HTTP_PORT || 8000;

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'cambia-este-secreto',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 12 },
  })
);

// --- Auth ---
app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (!process.env.DASHBOARD_PASSWORD || password === process.env.DASHBOARD_PASSWORD) {
    req.session.authenticated = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: 'Contraseña incorrecta' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/session', (req, res) => {
  res.json({
    authenticated: !process.env.DASHBOARD_PASSWORD || !!(req.session && req.session.authenticated),
    passwordRequired: !!process.env.DASHBOARD_PASSWORD,
  });
});

// --- Info pública de conexión (no requiere auth para mostrar en login? mejor protegido) ---
app.get('/api/connection-info', requireAuth, (req, res) => {
  res.json({
    publicRtmpUrl: process.env.PUBLIC_RTMP_URL || null,
    streamKey: process.env.STREAM_KEY || null,
  });
});

// --- Destinos ---
app.get('/api/destinations', requireAuth, (req, res) => {
  const items = store.list().map((d) => ({
    ...d,
    streamKey: d.streamKey ? maskKey(d.streamKey) : '',
  }));
  res.json(items);
});

function maskKey(key) {
  if (key.length <= 4) return '••••';
  return `${key.slice(0, 2)}${'•'.repeat(Math.max(4, key.length - 4))}${key.slice(-2)}`;
}

app.post('/api/destinations', requireAuth, (req, res) => {
  const { platform, name, url, streamKey, enabled } = req.body || {};
  if (!url) return res.status(400).json({ error: 'La URL RTMP es obligatoria' });
  const item = store.add({ platform, name, url, streamKey, enabled });
  res.json(item);
});

app.put('/api/destinations/:id', requireAuth, (req, res) => {
  const patch = { ...req.body };
  delete patch.id;
  const updated = store.update(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'No encontrado' });
  res.json(updated);
});

app.delete('/api/destinations/:id', requireAuth, (req, res) => {
  const ok = store.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'No encontrado' });
  res.json({ ok: true });
});

// --- Estado / control del relay ---
app.get('/api/status', requireAuth, (req, res) => {
  res.json(relay.getStatus());
});

app.post('/api/relay/restart', requireAuth, (req, res) => {
  relay.restart();
  res.json(relay.getStatus());
});

app.post('/api/relay/stop', requireAuth, (req, res) => {
  relay.stop();
  res.json(relay.getStatus());
});

// --- Calidad de la señal entrante (resolución, fps, códec) ---
// Se lee de la API interna de Node Media Server, así que funciona
// aunque todavía no haya destinos habilitados.
app.get('/api/quality', requireAuth, async (req, res) => {
  const key = process.env.STREAM_KEY;
  try {
    const r = await fetch(`http://127.0.0.1:${NMS_HTTP_PORT}/api/streams`);
    const data = await r.json();
    const liveApp = (data && data.live) || {};
    const info = key ? liveApp[key] : Object.values(liveApp)[0];
    if (!info || !info.publisher) return res.json({ live: false });
    const v = info.publisher.video || {};
    const a = info.publisher.audio || {};
    res.json({
      live: true,
      video: { codec: v.codec, width: v.width, height: v.height, fps: v.fps, profile: v.profile },
      audio: { codec: a.codec, samplerate: a.samplerate, channels: a.channels },
    });
  } catch (e) {
    res.json({ live: false, error: e.message });
  }
});

// --- Vista previa en vivo (HTTP-FLV), reenviada desde Node Media Server ---
app.get('/live/:file', requireAuth, (req, res) => {
  const proxyReq = http.request(
    {
      host: '127.0.0.1',
      port: NMS_HTTP_PORT,
      path: `/live/${req.params.file}`,
      method: 'GET',
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );
  proxyReq.on('error', () => {
    if (!res.headersSent) res.status(502).end('No se pudo conectar con el servidor RTMP interno');
  });
  req.on('close', () => proxyReq.destroy());
  proxyReq.end();
});

app.get('/health', (req, res) => res.send('ok'));

app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`[web] Panel disponible en puerto ${PORT}`);
});

rtmpServer.start();
