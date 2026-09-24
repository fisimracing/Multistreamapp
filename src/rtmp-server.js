const NodeMediaServer = require('node-media-server');
const relay = require('./relay');

const RTMP_PORT = Number(process.env.RTMP_PORT || 1935);
const NMS_HTTP_PORT = Number(process.env.NMS_HTTP_PORT || 8000);
const STREAM_KEY = process.env.STREAM_KEY || '';

const config = {
  rtmp: {
    port: RTMP_PORT,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60,
  },
  http: {
    port: NMS_HTTP_PORT,
    allow_origin: '*',
    mediaroot: './media',
  },
};

const nms = new NodeMediaServer(config);

nms.on('prePublish', (id, StreamPath, args) => {
  if (STREAM_KEY) {
    const key = StreamPath.split('/').pop();
    if (key !== STREAM_KEY) {
      console.log(`[rtmp] Publicación rechazada: stream key inválida (${key})`);
      const session = nms.getSession(id);
      if (session) session.reject();
    }
  }
});

nms.on('postPublish', (id, StreamPath) => {
  console.log(`[rtmp] Señal recibida en ${StreamPath}, iniciando redistribución`);
  relay.start(StreamPath);
});

nms.on('donePublish', (id, StreamPath) => {
  console.log(`[rtmp] Señal cortada en ${StreamPath}, deteniendo redistribución`);
  relay.stop();
});

function start() {
  nms.run();
  console.log(`[rtmp] Node Media Server escuchando RTMP en puerto ${RTMP_PORT}`);
}

module.exports = { start, nms };
