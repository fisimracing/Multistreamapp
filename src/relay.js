const { spawn } = require('child_process');
const store = require('./store');

const RTMP_PORT = process.env.RTMP_PORT || 1935;

const state = {
  proc: null,
  live: false,
  startedAt: null,
  streamPath: null,
  destinationsUsed: [],
  lastError: null,
  logTail: [],
};

function pushLog(line) {
  state.logTail.push(`[${new Date().toISOString()}] ${line}`);
  if (state.logTail.length > 200) state.logTail.shift();
}

function buildDestUrl(dest) {
  const base = dest.url.replace(/\/$/, '');
  if (!dest.streamKey) return base;
  return `${base}/${dest.streamKey}`;
}

function buildTeeOutputs(destinations) {
  return destinations
    .map((d) => `[f=flv:onfail=ignore]${buildDestUrl(d)}`)
    .join('|');
}

function stop() {
  if (state.proc) {
    try {
      state.proc.kill('SIGINT');
    } catch (e) {
      /* ignore */
    }
  }
  state.proc = null;
  state.live = false;
  state.startedAt = null;
  state.destinationsUsed = [];
}

function start(streamPath) {
  stop();

  const destinations = store.getEnabled();
  if (destinations.length === 0) {
    pushLog('No hay destinos habilitados, no se inicia la redistribución.');
    state.lastError = 'Sin destinos habilitados';
    return;
  }

  const input = `rtmp://127.0.0.1:${RTMP_PORT}${streamPath}`;
  const teeOutputs = buildTeeOutputs(destinations);

  const args = [
    '-i', input,
    '-c', 'copy',
    '-f', 'tee',
    '-map', '0:v?',
    '-map', '0:a?',
    teeOutputs,
  ];

  pushLog(`Iniciando ffmpeg -> ${destinations.map((d) => d.name).join(', ')}`);

  const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  state.proc = proc;
  state.live = true;
  state.startedAt = new Date().toISOString();
  state.streamPath = streamPath;
  state.destinationsUsed = destinations.map((d) => ({ id: d.id, name: d.name, platform: d.platform }));
  state.lastError = null;

  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    if (text.trim()) pushLog(text.trim().split('\n').slice(-1)[0]);
  });

  proc.on('close', (code) => {
    pushLog(`ffmpeg terminó con código ${code}`);
    if (state.proc === proc) {
      state.proc = null;
      state.live = false;
    }
  });

  proc.on('error', (err) => {
    state.lastError = err.message;
    pushLog(`Error al lanzar ffmpeg: ${err.message}`);
  });
}

function restart() {
  if (state.streamPath) {
    start(state.streamPath);
  }
}

function getStatus() {
  return {
    live: state.live,
    startedAt: state.startedAt,
    streamPath: state.streamPath,
    destinationsUsed: state.destinationsUsed,
    lastError: state.lastError,
    logTail: state.logTail.slice(-30),
  };
}

module.exports = { start, stop, restart, getStatus };
