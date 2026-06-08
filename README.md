# Echo

**Asistente de reuniones para macOS.** Un overlay discreto que **escucha** la
conversación (transcripción en vivo diarizada por canal: *Yo* / *Interlocutor*),
**ve** tu pantalla y **razona** con [Hermes](https://hermes-agent.nousresearch.com)
como cerebro. Guarda notas de reunión automáticamente en Obsidian y puede volverse
indetectable al compartir pantalla.

> Repo: `EstebanCastel/cluely-hermes` · App: **Echo** · Plataforma: macOS (Apple Silicon)

---

## Qué hace

- 🎙️ **Transcripción en vivo diarizada** (Deepgram) separando tu micrófono del audio
  del sistema por canal, vía un *Aggregate Device* de macOS.
- 👁️ **Ve tu pantalla**: `⌘⇧S` adjunta una captura al chat para que el cerebro la analice.
- 🧠 **Cerebro = Hermes** (gpt‑4o con visión) a través de un *sidecar* de Python; Echo
  no razona por su cuenta, solo orquesta sensores + UI.
- 🪟 **Hub de una sola ventana**: barra estilo "pregunta lo que sea", chat, historial y
  transcripción en vivo, todo en la misma ventana.
- 📝 **Notas automáticas en Obsidian**: al cerrar la app guarda una nota `.md` por reunión
  con la transcripción diarizada + un resumen generado por Hermes.
- 🕵️ **Indetectable** al compartir pantalla (content protection) y modo *disfraz* (icono/nombre).
- ⌨️ **Atajos configurables** desde Ajustes.

## Requisitos

- macOS (Apple Silicon).
- [Hermes](https://hermes-agent.nousresearch.com) instalado en `~/.hermes/hermes-agent`
  (con su venv y su `config.yaml`/`.env`). Es el cerebro.
- `ffmpeg` (`brew install ffmpeg`) — captura de audio.
- [BlackHole](https://github.com/ExistentialAudio/BlackHole) + un *Aggregate Device*
  llamado `OpenCluely In` (mic en el canal 0, audio del sistema en 1‑2) para diarizar.
- Una API key de [Deepgram](https://console.deepgram.com).

## Configuración rápida

```bash
# 1. Dependencias de Node
npm install

# 2. API key de Deepgram (o ponla luego en Ajustes → General → Audio)
mkdir -p ~/.Echo && echo "DEEPGRAM_API_KEY=tu_key" >> ~/.Echo/.env
```

Hermes gestiona sus propias credenciales de LLM en `~/.hermes/`. Echo apunta al venv
`~/.hermes/hermes-agent/venv/bin/python3` para correr el *sidecar*.

## Desarrollo

```bash
npm start          # corre Echo con Electron
```

## Empaquetar la app (.app de doble clic)

La app se firma con un certificado local estable para que macOS recuerde los permisos.

```bash
npm run create-cert        # una sola vez: crea el certificado de firma local
npm run build-and-install  # build + firma + instala en ~/Applications + abre
```

Esto deja `Echo.app` en `~/Applications`. La primera vez, otorga **Micrófono** y
**Grabación de pantalla** a Echo en *Ajustes del Sistema → Privacidad y seguridad*
(la Grabación de pantalla solo surte efecto tras reiniciar la app).

## Atajos por defecto

| Acción | Atajo |
|---|---|
| Preguntar sobre la pantalla (captura) | `⌘⇧S` |
| Mostrar / ocultar Echo | `⌘⇧V` |
| Alternar interacción (click‑through) | `⌘⇧I` / `⌥A` |
| Abrir / cerrar ajustes | `⌘,` |
| Mover el hub | `⌘` + flechas |
| Historial | `↓` |

Todos editables en *Ajustes → Atajos*.

## Arquitectura (resumen)

- `main.js` — proceso principal de Electron (ventanas, atajos, ciclo de vida, IPC).
- `src/services/` — `speech.service` (audio + Deepgram), `brain.service` (puente al
  sidecar de Hermes), `context.service` (transcripción + captura como contexto vivo),
  `capture.service` (screenshots).
- `sidecar/hermes_bridge.py` — instancia el `AIAgent` de Hermes (sesión caliente) y
  responde por un protocolo JSON‑lines; también escribe las notas de reunión a Obsidian.
- `index.html` + `src/ui/hub.js` — el hub de una sola ventana.
- `settings.html` + `src/ui/settings-window.js` — ajustes.

## Licencia

MIT — ver [LICENSE](LICENSE).
