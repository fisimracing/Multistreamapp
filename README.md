# Multistream App

Recibe una señal RTMP (desde OBS) y la redistribuye en simultáneo, sin recodificar,
a YouTube, Twitch, Kick, TikTok, Facebook o cualquier destino RTMP custom.

## Cómo funciona

1. Corrés OBS y publicás por RTMP a este servidor.
2. Apenas detecta que empezaste a transmitir, se dispara `ffmpeg` con el muxer `tee`
   y copia (sin recodificar) la señal a todos los destinos que tengas habilitados.
3. Un panel web con login te deja agregar/editar/prender/apagar destinos y ver el estado.

## 1. Subir a GitHub

```bash
cd multistream-app
git init
git add .
git commit -m "Multistream app inicial"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

## 2. Deploy en Railway

1. En Railway: **New Project → Deploy from GitHub repo** y elegí este repo.
   Railway va a detectar el `Dockerfile` y `railway.toml` automáticamente.
2. En la pestaña **Variables** del servicio, cargá (mínimo):
   - `DASHBOARD_PASSWORD`
   - `SESSION_SECRET`
   - `STREAM_KEY`
   - `DATA_DIR=/data`
3. **Volumen persistente** (para que no se borren tus destinos en cada deploy):
   - Andá a **Settings → Volumes → New Volume**, montalo en `/data`.
4. **Dominio HTTP** (para el panel web):
   - **Settings → Networking → Generate Domain** sobre el puerto del panel (Railway usa `PORT` automáticamente, no hace falta tocarlo).
5. **TCP Proxy** (para que OBS pueda publicar RTMP):
   - **Settings → Networking → TCP Proxy → Add Proxy**, puerto de destino `1935`.
   - Railway te va a dar algo como `roundhouse.proxy.rlwy.net:29838`. Con eso armá:
     `rtmp://roundhouse.proxy.rlwy.net:29838/live`
   - Cargá esa URL completa en la variable `PUBLIC_RTMP_URL` (solo para que se muestre linda en el panel).
6. Redeploy. Entrá al dominio HTTP que generaste, poné tu `DASHBOARD_PASSWORD` y ya está.

## 3. Configurar OBS

En OBS → **Configuración → Emisión**:
- Servicio: **Personalizado**
- Servidor: el que armaste arriba, ej. `rtmp://roundhouse.proxy.rlwy.net:29838/live`
- Clave de emisión: el valor de `STREAM_KEY` que configuraste

El panel web te muestra estos dos datos en la sección "Datos para OBS".

## 4. Cargar destinos

Desde el panel, por cada plataforma agregás:

| Plataforma | URL base típica                          | Dónde conseguir la clave |
|---|---|---|
| YouTube | `rtmp://a.rtmp.youtube.com/live2` | YouTube Studio → Transmitir en vivo |
| Twitch | `rtmp://live.twitch.tv/app` | Twitch Dashboard → Configuración → Emisión |
| Kick | la URL es propia de tu cuenta (`rtmps://...global-contribute.live-video.net/app`) | kick.com/dashboard/stream |
| TikTok | depende de tu cuenta (requiere TikTok Live Studio o permiso de streaming por PC) | TikTok Live Center |
| Facebook | depende de la transmisión que crees | Facebook Live Producer |

La URL y la clave se guardan separadas y se concatenan al momento de transmitir, así que
podés pegar la URL "base" tal cual te la da cada plataforma y la clave aparte.

**Importante sobre Kick**: usa RTMPS (con TLS). El ffmpeg del Dockerfile lo soporta,
pero probalo antes de un evento importante — si tu build de ffmpeg no tiene TLS,
esa salida en particular fallará (el resto sigue funcionando gracias a `onfail=ignore`).

## 5. Cambiar destinos en vivo

Si agregás, apagás o prendés un destino mientras ya estás transmitiendo, tenés que
tocar **"Aplicar destinos / reiniciar envío"** en el panel para que ffmpeg se reinicie
con la nueva lista (hay un corte de 1-2 segundos en todas las salidas al reiniciar).

## Desarrollo local

```bash
npm install
cp .env.example .env   # completar valores
# necesitás ffmpeg instalado localmente (brew install ffmpeg / apt install ffmpeg)
npm start
```

El panel queda en `http://localhost:3000` y el ingreso RTMP en `rtmp://localhost:1935/live`.

## Estructura

```
src/
  server.js       -> Express: panel web + API REST
  rtmp-server.js  -> Node Media Server: recibe el RTMP de OBS
  relay.js        -> maneja el proceso ffmpeg que redistribuye
  store.js        -> persistencia de destinos en JSON
  auth.js         -> auth simple por sesión
public/           -> frontend del panel (HTML/CSS/JS sin frameworks)
```

## Roadmap sugerido (no incluido todavía)

- Autenticación multiusuario en vez de una sola contraseña compartida.
- Encriptar las stream keys guardadas en disco.
- Métricas de bitrate por destino (ffmpeg `-progress` a un socket).
- Notificación (webhook/Telegram) si un destino falla.
