require("dotenv").config();
// Also load Echo's user env (~/.Echo/.env) for secrets like DEEPGRAM_API_KEY.
try {
  require("dotenv").config({ path: require("path").join(require("os").homedir(), ".Echo", ".env") });
} catch (_) {}

const { app, BrowserWindow, globalShortcut, session, ipcMain } = require("electron");
const logger = require("./src/core/logger").createServiceLogger("MAIN");
const config = require("./src/core/config");

// Keep Chromium network noise out of the terminal; app-level logs still go through Winston.
app.commandLine.appendSwitch("log-level", "3");
app.commandLine.appendSwitch("disable-background-networking");
app.commandLine.appendSwitch("disable-component-update");
app.commandLine.appendSwitch("disable-domain-reliability");
app.commandLine.appendSwitch("no-pings");

// Services
// Screen capture (image-based)
const captureService = require("./src/services/capture.service");
const speechService = require("./src/services/speech.service");
// Brain is Hermes (via the sidecar). brain.service keeps the same public surface
// the old Gemini llm.service had, so it drops in as `llmService` here.
const llmService = require("./src/services/brain.service");
const contextService = require("./src/services/context.service");

// Managers
const windowManager = require("./src/managers/window.manager");
const sessionManager = require("./src/managers/session.manager");

class ApplicationController {
  constructor() {
    this.isReady = false;
    this.activeSkill = "general";
  // Default to C++ so language is enforced from first run
  this.codingLanguage = "cpp";
    this.speechAvailable = false;

    // Load settings persisted on disk (~/.Echo/settings.json) so the user's
    // preferences (disguise, language, detectability, etc.) survive restarts.
    this.persistedSettings = this._loadPersistedSettings();
    if (this.persistedSettings.activeSkill) this.activeSkill = this.persistedSettings.activeSkill;
    if (this.persistedSettings.appIcon) this.appIcon = this.persistedSettings.appIcon;

    // Window configurations for reference
    this.windowConfigs = {
      main: { title: "Echo" },
      chat: { title: "Chat" },
      llmResponse: { title: "AI Response" },
      settings: { title: "Settings" },
    };

    this.setupStealth();
    this.setupEventHandlers();
  }

  setupStealth() {
    if (config.get("stealth.disguiseProcess")) {
      process.title = config.get("app.processTitle");
    }

    // Present as "Echo" by default; the user can pick a disguise (Terminal /
    // Activity / Settings) in Settings for screen-sharing stealth.
    if (app && typeof app.setName === 'function') {
      app.setName("Echo");
    }
    process.title = "Echo";

    if (
      process.platform === "darwin" &&
      config.get("stealth.noAttachConsole")
    ) {
      process.env.ELECTRON_NO_ATTACH_CONSOLE = "1";
      process.env.ELECTRON_NO_ASAR = "1";
    }
  }

  setupEventHandlers() {
    app.whenReady().then(() => this.onAppReady());
    app.on("window-all-closed", () => this.onWindowAllClosed());
    app.on("activate", () => this.onActivate());
    app.on("will-quit", () => this.onWillQuit());

    // Quit fully and reliably. The audio is always-on, so "stop recording" rarely
    // fires — quitting is the natural end of a session: save to Obsidian (bounded),
    // kill the child processes (ffmpeg + Hermes sidecar) and timers, then hard-exit.
    this._exiting = false;
    app.on("before-quit", (e) => {
      if (this._exiting) return;
      e.preventDefault();      // we drive the shutdown ourselves so nothing lingers
      this._shutdownAndExit();
    });

    this.setupIPCHandlers();
    this.setupServiceEventHandlers();
  }

  // Single, reliable shutdown path used by both ⌘Q and "Salir" in Settings.
  async _shutdownAndExit() {
    if (this._exiting) return;
    this._exiting = true;
    logger.info("Shutting down Echo…");
    try { globalShortcut.unregisterAll(); } catch (_) {}

    // Best-effort Obsidian save with a short cap so quitting never hangs.
    try {
      const s = this.getSettings();
      if (s.obsidianAutoSave !== false && contextService.transcript && contextService.transcript.length) {
        await Promise.race([
          this.maybeAutoSaveMeeting(),
          new Promise((r) => setTimeout(r, 4000)),
        ]);
      }
    } catch (_) {}

    // Kill child processes / timers so the process can actually terminate.
    try { speechService.stopRecording(); } catch (_) {}
    try { if (llmService.stop) llmService.stop(); } catch (_) {}
    try { windowManager.destroyAllWindows(); } catch (_) {}

    logger.info("Echo shutdown complete; exiting.");
    app.exit(0); // hard exit — does not re-enter before-quit/will-quit
  }

  handleSecondInstance() {
    logger.info("Second instance launch detected; focusing existing windows");

    const focusExistingWindows = () => {
      try {
        const mainWindow = windowManager.getWindow("main");
        if (mainWindow) {
          if (mainWindow.isMinimized && mainWindow.isMinimized()) {
            mainWindow.restore();
          }
          windowManager.showAllWindows();
          windowManager.showOnCurrentDesktop(mainWindow);
          mainWindow.focus();
          return;
        }

        if (this.isReady) {
          windowManager.showAllWindows();
        }
      } catch (error) {
        logger.error("Failed to focus existing instance", {
          error: error.message,
        });
      }
    };

    if (app.isReady()) {
      focusExistingWindows();
    } else {
      app.whenReady().then(focusExistingWindows);
    }
  }

  async onAppReady() {
    // Present as Echo by default (disguise is opt-in via Settings).
    const startupIcon = (this.persistedSettings && this.persistedSettings.appIcon) || "echo";
    if (startupIcon === "echo") { app.setName("Echo"); process.title = "Echo"; }

    logger.info("Application starting", {
      version: config.get("app.version"),
      environment: config.get("app.isDevelopment")
        ? "development"
        : "production",
      platform: process.platform,
    });

    try {
      this.setupPermissions();
      this.setupNetworkConfiguration();

      // Small delay to ensure desktop/space detection is accurate
      await new Promise((resolve) => setTimeout(resolve, 200));

      await windowManager.initializeWindows();
      this.setupGlobalShortcuts();

      // Apply the chosen identity/disguise (defaults to Echo).
      this.updateAppIcon(startupIcon);

      this.isReady = true;

      // Start the Hermes brain sidecar (non-blocking: the UI is usable while it warms up).
      llmService.start()
        .then((ok) => logger.info("Brain sidecar start result", { ready: ok }))
        .catch((err) => logger.error("Brain sidecar failed to start", { error: err.message }));

      // Echo keeps the audio session always-on: start live transcription
      // (mic + system via BlackHole) as soon as the app is ready, unless the
      // user explicitly disabled it in settings.
      const ps = this.persistedSettings || {};
      if (ps.audioSessionEnabled === false || ps.sttEnabled === false) {
        logger.info("Audio session disabled in settings; not auto-starting");
      } else {
        try {
          if (speechService.available) {
            speechService.startRecording();
          } else {
            logger.warn("Speech provider not available at startup; skipping auto-start", { provider: speechService.provider });
          }
        } catch (err) {
          logger.error("Failed to auto-start audio session", { error: err.message });
        }
      }

      logger.info("Application initialized successfully", {
        windowCount: Object.keys(windowManager.getWindowStats().windows).length,
        currentDesktop: "detected",
      });

      sessionManager.addEvent("Application started");
    } catch (error) {
      logger.error("Application initialization failed", {
        error: error.message,
      });
      app.quit();
    }
  }

  setupNetworkConfiguration() {
    // Configure session to handle network requests better
    const ses = session.defaultSession;
    
    // Allow HTTPS requests to Google APIs
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      if (details.url.includes('generativelanguage.googleapis.com')) {
        details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.156 Safari/537.36';
      }
      callback({ requestHeaders: details.requestHeaders });
    });
    
    // Handle certificate errors for Google APIs
    ses.setCertificateVerifyProc((request, callback) => {
      if (request.hostname === 'generativelanguage.googleapis.com') {
        callback(0); // Trust Google's certificates
      } else {
        callback(-2); // Use default verification
      }
    });
    
    logger.debug('Network configuration applied for Gemini API');
  }

  setupPermissions() {
    session.defaultSession.setPermissionRequestHandler(
      (webContents, permission, callback) => {
        const allowedPermissions = ["microphone", "camera", "display-capture"];
        const granted = allowedPermissions.includes(permission);

        logger.debug("Permission request", { permission, granted });
        callback(granted);
      }
    );
  }

  // Default accelerators per action id. The user can override any of these from
  // Settings → Atajos (persisted in settings.keybinds) and they re-register live.
  static get DEFAULT_KEYBINDS() {
    return {
      screenshot:        "CommandOrControl+Shift+S",
      toggleVisibility:  "CommandOrControl+Shift+V",
      toggleInteraction: "CommandOrControl+Shift+I",
      toggleSettings:    "CommandOrControl+,",
      clearSession:      "CommandOrControl+Shift+\\",
      toggleSpeech:      "Alt+R",
      moveUp:            "CommandOrControl+Up",
      moveDown:          "CommandOrControl+Down",
      moveLeft:          "CommandOrControl+Left",
      moveRight:         "CommandOrControl+Right",
    };
  }

  // Human-readable labels (Spanish) for the Settings UI.
  static get KEYBIND_LABELS() {
    return {
      screenshot:        "Preguntar sobre la pantalla (captura)",
      toggleVisibility:  "Mostrar / ocultar Echo",
      toggleInteraction: "Alternar interacción (click-through)",
      toggleSettings:    "Abrir / cerrar ajustes",
      clearSession:      "Limpiar sesión / chat",
      toggleSpeech:      "Activar / pausar transcripción",
      moveUp:            "Mover ventana arriba",
      moveDown:          "Mover ventana abajo",
      moveLeft:          "Mover ventana izquierda",
      moveRight:         "Mover ventana derecha",
    };
  }

  _handlerForKeybind(id) {
    const handlers = {
      screenshot:        () => this.triggerScreenshotOCR(),
      toggleVisibility:  () => windowManager.toggleVisibility(),
      toggleInteraction: () => windowManager.toggleInteraction(),
      toggleSettings:    () => windowManager.toggleSettings(),
      clearSession:      () => this.clearSessionMemory(),
      toggleSpeech:      () => this.toggleSpeechRecognition(),
      moveUp:            () => windowManager.moveBoundWindows(0, -40),
      moveDown:          () => windowManager.moveBoundWindows(0, 40),
      moveLeft:          () => windowManager.moveBoundWindows(-40, 0),
      moveRight:         () => windowManager.moveBoundWindows(40, 0),
    };
    return handlers[id];
  }

  getKeybinds() {
    const overrides = (this.persistedSettings && this.persistedSettings.keybinds) || {};
    return { ...ApplicationController.DEFAULT_KEYBINDS, ...overrides };
  }

  setupGlobalShortcuts() {
    globalShortcut.unregisterAll();
    const binds = this.getKeybinds();
    Object.entries(binds).forEach(([id, accelerator]) => {
      const handler = this._handlerForKeybind(id);
      if (!handler || !accelerator) return;
      try {
        const success = globalShortcut.register(accelerator, handler);
        logger.debug("Global shortcut registered", { id, accelerator, success });
      } catch (e) {
        logger.warn("Could not register shortcut", { id, accelerator, error: e.message });
      }
    });
    // Keep Alt+A as a fixed convenience alias for toggling interaction.
    try { globalShortcut.register("Alt+A", () => windowManager.toggleInteraction()); } catch (_) {}
  }

  setupServiceEventHandlers() {
    speechService.on("recording-started", () => {
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("recording-started");
      });
    });

    speechService.on("recording-stopped", () => {
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("recording-stopped");
      });
    });

    speechService.on("transcription", (payload) => {
      // payload is { text, speaker } (whisper diarized / azure mic). Tolerate legacy string.
      const text = typeof payload === "string" ? payload : (payload && payload.text) || "";
      const speaker = (payload && typeof payload === "object" && payload.speaker) || "me";
      if (!text.trim()) return;

      const label = speaker === "them" ? "Interlocutor" : "Yo";
      const labeled = `[${label}] ${text}`;

      // Feed the live meeting context so the brain (Hermes) is always "hearing" the call.
      contextService.addTranscriptLine(speaker, text);

      // Add to session memory (with speaker label)
      sessionManager.addUserInput(labeled, 'speech');

      // Send to the live-transcription window (and any listener). Transcription
      // is context for Hermes/Obsidian — it does NOT auto-post to the chat.
      const windows = BrowserWindow.getAllWindows();
      windows.forEach((window) => {
        window.webContents.send("transcription-received", { text: labeled, speaker });
      });
      // No auto-draft: the brain only answers when the user explicitly asks
      // (it still has the diarized call transcript as context via contextService).
    });

    speechService.on("interim-transcription", (text) => {
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("interim-transcription", { text });
      });
    });

    speechService.on("status", (status) => {
      this.speechAvailable = speechService.isAvailable ? speechService.isAvailable() : false;
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("speech-status", { status, available: this.speechAvailable });
      });
      // Also broadcast availability specifically
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("speech-availability", { available: this.speechAvailable });
      });
    });

    speechService.on("error", (error) => {
      // In error, still compute availability
      this.speechAvailable = speechService.isAvailable ? speechService.isAvailable() : false;
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("speech-error", { error, available: this.speechAvailable });
      });
    });
  }

  setupIPCHandlers() {
  ipcMain.handle("take-screenshot", () => this.triggerScreenshotOCR());
  ipcMain.handle("toggle-audio-channel", (event, channel) => {
    // channel: 'me' (input/mic) or 'them' (output/system). Toggles pause.
    const ch = channel === 'them' ? 'them' : 'me';
    const current = ch === 'them' ? !!speechService.pauseThem : !!speechService.pauseMe;
    const state = speechService.setChannelPaused(ch, !current);
    return state; // { me, them }
  });
  ipcMain.handle("toggle-undetectability", () => {
    const undetectable = windowManager.toggleContentProtection();
    this.persistSettings({ undetectable });
    return undetectable;
  });
  ipcMain.handle("set-launch-at-login", (event, enabled) => {
    try {
      app.setLoginItemSettings({ openAtLogin: !!enabled });
      this.persistSettings({ launchAtLogin: !!enabled });
      return { success: true, enabled: !!enabled };
    } catch (error) {
      logger.error("Failed to set launch at login", { error: error.message });
      return { success: false, error: error.message };
    }
  });
  ipcMain.handle("toggle-transcript", () => windowManager.toggleTranscriptWindow());
  ipcMain.handle("close-transcript", () => windowManager.closeTranscriptWindow());
  ipcMain.handle("show-history", () => {
    windowManager.switchToWindow("chat");
    windowManager.broadcastToAllWindows("show-history");
    return { success: true };
  });
    // ---- Google Calendar via Hermes' google-workspace skill (Phase 5) ----
    const path = require("path");
    const os = require("os");
    const fs = require("fs");
    const { spawn } = require("child_process");
    const gwsSetup = () => path.join(os.homedir(), ".hermes/skills/productivity/google-workspace/scripts/setup.py");
    const gwsPython = () => config.get("brain.sidecarCmd") || "python3";
    const clientSecretPath = () => path.join(os.homedir(), ".hermes/google_client_secret.json");
    const runGws = (args) => new Promise((resolve) => {
      try {
        const p = spawn(gwsPython(), [gwsSetup(), ...args], { stdio: ["ignore", "pipe", "pipe"] });
        let out = "", err = "";
        p.stdout.on("data", (d) => { out += d.toString(); });
        p.stderr.on("data", (d) => { err += d.toString(); });
        p.on("close", (code) => resolve({ code, out: out.trim(), err: err.trim() }));
        p.on("error", (e) => resolve({ code: -1, out: "", err: e.message }));
      } catch (e) { resolve({ code: -1, out: "", err: e.message }); }
    });

    ipcMain.handle("connect-google-calendar", async () => {
      try {
        const check = await runGws(["--check"]);
        if (/AUTHENTICATED(?!:)/.test(check.out) || check.out.startsWith("AUTHENTICATED")) {
          const msg = "Google Calendar conectado ✅";
          windowManager.broadcastToAllWindows("calendar-status", { message: msg, connected: true });
          return { success: true, connected: true, message: msg };
        }
        if (!fs.existsSync(clientSecretPath())) {
          const msg = "Para conectar Calendar: crea un OAuth Client (Desktop) en Google Cloud Console, descarga client_secret.json y guárdalo en ~/.hermes/google_client_secret.json. Luego vuelve a pulsar Conectar.";
          windowManager.broadcastToAllWindows("calendar-status", { message: msg, connected: false });
          return { success: false, needsSetup: true, message: msg };
        }
        // We have a client secret but no token: start the OAuth flow and open the URL.
        const authUrl = await runGws(["--auth-url"]);
        const url = (authUrl.out.match(/https?:\/\/\S+/) || [])[0];
        if (url) {
          const { shell } = require("electron");
          shell.openExternal(url);
          const msg = "Abrí el navegador para autorizar Google. Pega aquí el código que te dé Google.";
          windowManager.broadcastToAllWindows("calendar-status", { message: msg, needsCode: true });
          return { success: true, needsCode: true, url, message: msg };
        }
        return { success: false, message: authUrl.out || authUrl.err || "No se pudo iniciar el OAuth." };
      } catch (error) {
        logger.error("Calendar connect failed", { error: error.message });
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("submit-google-auth-code", async (event, code) => {
      try {
        const exch = await runGws(["--auth-code", String(code || "").trim()]);
        const check = await runGws(["--check"]);
        const connected = check.out.startsWith("AUTHENTICATED");
        const msg = connected ? "Google Calendar conectado ✅" : (exch.out || exch.err || "No se pudo completar la autenticación.");
        windowManager.broadcastToAllWindows("calendar-status", { message: msg, connected });
        return { success: connected, connected, message: msg };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // Upcoming meetings for the hub (via Hermes' google-workspace skill). Returns
    // [] if Google isn't connected yet. Reuses path/os/spawn from the block above.
    ipcMain.handle("get-meetings", async () => {
      try {
        const script = path.join(os.homedir(), ".hermes/skills/productivity/google-workspace/scripts/google_api.py");
        if (!fs.existsSync(script)) return [];
        return await new Promise((resolve) => {
          const p = spawn(gwsPython(), [script, "calendar", "list"], { stdio: ["ignore", "pipe", "pipe"] });
          let out = "";
          p.stdout.on("data", (d) => { out += d.toString(); });
          p.on("close", () => {
            try { const j = JSON.parse(out); resolve(Array.isArray(j) ? j : (j.events || j.items || [])); }
            catch { resolve([]); }
          });
          p.on("error", () => resolve([]));
          setTimeout(() => { try { p.kill(); } catch (_) {} resolve([]); }, 8000);
        });
      } catch (_) { return []; }
    });

  // Save the current meeting to Obsidian (diarized transcript + Hermes summary).
  ipcMain.handle("save-meeting", async (event, opts) => {
    try {
      const res = await llmService.saveMeeting({ title: (opts && opts.title) || null });
      if (res && res.skipped) {
        return { success: false, skipped: true, message: "No hay transcripción para guardar todavía." };
      }
      windowManager.broadcastToAllWindows("meeting-saved", { path: res && res.path });
      logger.info("Meeting saved to Obsidian", { path: res && res.path });
      return { success: true, path: res && res.path };
    } catch (error) {
      logger.error("Failed to save meeting to Obsidian", { error: error.message });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("list-displays", () => captureService.listDisplays());
  ipcMain.handle("capture-area", (event, options) => captureService.captureAndProcess(options));
    
    // Provide reliable clipboard write via main process
    ipcMain.handle("copy-to-clipboard", (event, text) => {
      try {
        const { clipboard } = require("electron");
        clipboard.writeText(String(text ?? ""));
        return true;
      } catch (e) {
        logger.error("Failed to write to clipboard", { error: e.message });
        return false;
      }
    });
    
    ipcMain.handle("get-speech-availability", () => {
      return speechService.isAvailable ? speechService.isAvailable() : false;
    });

    ipcMain.handle("start-speech-recognition", () => {
      speechService.startRecording();
      return speechService.getStatus();
    });

    ipcMain.handle("stop-speech-recognition", () => {
      speechService.stopRecording();
      return speechService.getStatus();
    });

    // Also handle direct send events for fallback
    ipcMain.on("start-speech-recognition", () => {
      speechService.startRecording();
    });

    ipcMain.on("stop-speech-recognition", () => {
      speechService.stopRecording();
    });

    ipcMain.on("chat-window-ready", () => {
      // Send a test message to confirm communication
      setTimeout(() => {
        windowManager.broadcastToAllWindows("transcription-received", {
          text: "Test message from main process - chat window communication is working!",
        });
      }, 1000);
    });

    ipcMain.on("test-chat-window", () => {
      windowManager.broadcastToAllWindows("transcription-received", {
        text: "🧪 IMMEDIATE TEST: Chat window IPC communication test successful!",
      });
    });

    ipcMain.handle("show-all-windows", () => {
      windowManager.showAllWindows();
      return windowManager.getWindowStats();
    });

    ipcMain.handle("hide-all-windows", () => {
      windowManager.hideAllWindows();
      return windowManager.getWindowStats();
    });

    ipcMain.handle("enable-window-interaction", () => {
      windowManager.setInteractive(true);
      return windowManager.getWindowStats();
    });

    ipcMain.handle("disable-window-interaction", () => {
      windowManager.setInteractive(false);
      return windowManager.getWindowStats();
    });

    ipcMain.handle("switch-to-chat", () => {
      windowManager.switchToWindow("chat");
      return windowManager.getWindowStats();
    });

    ipcMain.handle("switch-to-skills", () => {
      windowManager.switchToWindow("skills");
      return windowManager.getWindowStats();
    });

    ipcMain.handle("resize-window", (event, { width, height }) => {
      const mainWindow = windowManager.getWindow("main");
      if (mainWindow) {
        // Enforce horizontal constraints: min ~one icon, generous max so the user
        // can drag the chat hub wider than the compact bar.
        const minW = 60;
        const maxW = 1600;
        const clampedWidth = Math.max(minW, Math.min(maxW, Math.round(width || minW)));
        try {
          // Match content size to the DOM so no extra transparent area remains
          mainWindow.setContentSize(Math.max(1, clampedWidth), Math.max(1, Math.round(height)));
        } catch (e) {
          // Fallback in case setContentSize isn’t available on some platform
          mainWindow.setSize(Math.max(1, clampedWidth), Math.max(1, Math.round(height)));
        }
        logger.debug("Main window resized (content)", { width: clampedWidth, height });
      }
      return { success: true };
    });

    ipcMain.handle("move-window", (event, { deltaX, deltaY }) => {
      const mainWindow = windowManager.getWindow("main");
      if (mainWindow) {
        const [currentX, currentY] = mainWindow.getPosition();
        const newX = currentX + deltaX;
        const newY = currentY + deltaY;
        mainWindow.setPosition(newX, newY);
        logger.debug("Main window moved", {
          deltaX,
          deltaY,
          from: { x: currentX, y: currentY },
          to: { x: newX, y: newY },
        });
      }
      return { success: true };
    });

    ipcMain.handle("get-session-history", () => {
      return sessionManager.getOptimizedHistory();
    });

    ipcMain.handle("clear-session-memory", () => {
      sessionManager.clear();
      windowManager.broadcastToAllWindows("session-cleared");
      return { success: true };
    });

    ipcMain.handle("force-always-on-top", () => {
      windowManager.forceAlwaysOnTopForAllWindows();
      return { success: true };
    });

    ipcMain.handle("test-always-on-top", () => {
      const results = windowManager.testAlwaysOnTopForAllWindows();
      return { success: true, results };
    });

    ipcMain.handle("send-chat-message", async (event, text) => {
      // Add chat message to session memory
      sessionManager.addUserInput(text, 'chat');
      logger.debug('Chat message added to session memory', { textLength: text.length });

      // Echo the user's question into the chat as a user bubble + thinking state.
      // This makes questions asked from the main bar appear in the conversation
      // (the chat window renders this; it no longer adds the bubble locally).
      windowManager.broadcastToAllWindows('user-message', { text });

      // A typed chat message is a direct question — process it as a real chat
      // turn (mode 'chat'), NOT as a meeting transcription. The transcription
      // path replies "Atento" to casual lines, which is wrong for chat.
      setTimeout(async () => {
        try {
          const sessionHistory = sessionManager.getOptimizedHistory();
          await this.processWithLLM(text, sessionHistory);
        } catch (error) {
          logger.error("Failed to process chat message with LLM", {
            error: error.message,
            text: text.substring(0, 100)
          });
        }
      }, 0);

      return { success: true };
    });

    ipcMain.handle("get-skill-prompt", (event, skillName) => {
      try {
        const { promptLoader } = require('./prompt-loader');
        const skillPrompt = promptLoader.getSkillPrompt(skillName);
        return skillPrompt;
      } catch (error) {
        logger.error('Failed to get skill prompt', { skillName, error: error.message });
        return null;
      }
    });

    ipcMain.handle("set-gemini-api-key", (event, apiKey) => {
      llmService.updateApiKey(apiKey);
      return llmService.getStats();
    });

    ipcMain.handle("get-gemini-status", () => {
      return llmService.getStats();
    });

    // Window binding IPC handlers
    ipcMain.handle("set-window-binding", (event, enabled) => {
      return windowManager.setWindowBinding(enabled);
    });

    ipcMain.handle("toggle-window-binding", () => {
      return windowManager.toggleWindowBinding();
    });

    ipcMain.handle("get-window-binding-status", () => {
      return windowManager.getWindowBindingStatus();
    });

    ipcMain.handle("get-window-stats", () => {
      return windowManager.getWindowStats();
    });

    ipcMain.handle("set-window-gap", (event, gap) => {
      return windowManager.setWindowGap(gap);
    });

    ipcMain.handle("move-bound-windows", (event, { deltaX, deltaY }) => {
      windowManager.moveBoundWindows(deltaX, deltaY);
      return windowManager.getWindowBindingStatus();
    });

    ipcMain.handle("test-gemini-connection", async () => {
      return await llmService.testConnection();
    });

    ipcMain.handle("run-gemini-diagnostics", async () => {
      try {
        const connectivity = await llmService.checkNetworkConnectivity();
        const apiTest = await llmService.testConnection();
        
        return {
          success: true,
          connectivity,
          apiTest,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        };
      }
    });

    // Settings handlers
    ipcMain.handle("show-settings", () => {
      windowManager.showSettings();

      // Send current settings to the settings window
      const settingsWindow = windowManager.getWindow("settings");
      if (settingsWindow) {
        const currentSettings = this.getSettings();
        setTimeout(() => {
          settingsWindow.webContents.send("load-settings", currentSettings);
        }, 100);
      }

      return { success: true };
    });

    ipcMain.handle("get-settings", () => {
      return this.getSettings();
    });

    ipcMain.handle("save-settings", (event, settings) => {
      return this.saveSettings(settings);
    });

    ipcMain.handle("update-app-icon", (event, iconKey) => {
      return this.updateAppIcon(iconKey);
    });

    ipcMain.handle("update-active-skill", (event, skill) => {
      this.activeSkill = skill;
      windowManager.broadcastToAllWindows("skill-changed", { skill });
      return { success: true };
    });

    ipcMain.handle("restart-app-for-stealth", () => {
      // Force restart the app to ensure stealth name changes take effect
      const { app } = require("electron");
      app.relaunch();
      app.exit();
    });

    ipcMain.handle("close-window", (event) => {
      const webContents = event.sender;
      const window = windowManager.windows.forEach((win, type) => {
        if (win.webContents === webContents) {
          win.hide();
          return true;
        }
      });
      return { success: true };
    });

    // LLM window specific handlers
    ipcMain.handle("expand-llm-window", (event, contentMetrics) => {
      windowManager.expandLLMWindow(contentMetrics);
      return { success: true, contentMetrics };
    });

    ipcMain.handle("resize-llm-window-for-content", (event, contentMetrics) => {
      // Use the same expansion logic for now, can be enhanced later
      windowManager.expandLLMWindow(contentMetrics);
      return { success: true, contentMetrics };
    });

    ipcMain.handle("quit-app", () => {
      logger.info("Quit app requested via IPC (Settings → Salir)");
      this._shutdownAndExit();
    });

    // Handle close settings — restores the hub (handled in hideSettings).
    ipcMain.on("close-settings", () => {
      windowManager.hideSettings();
    });

    // ----- Customizable keyboard shortcuts -----
    ipcMain.handle("get-keybinds", () => {
      return {
        binds: this.getKeybinds(),
        defaults: ApplicationController.DEFAULT_KEYBINDS,
        labels: ApplicationController.KEYBIND_LABELS,
      };
    });

    // While the user is capturing a new shortcut in Settings, suspend the global
    // shortcuts so e.g. ⌘⇧S doesn't fire the screenshot instead of being captured.
    ipcMain.handle("suspend-shortcuts", (event, suspended) => {
      try {
        if (suspended) globalShortcut.unregisterAll();
        else this.setupGlobalShortcuts();
      } catch (_) {}
      return { success: true };
    });

    ipcMain.handle("set-keybind", (event, { id, accelerator }) => {
      try {
        if (!id || !(id in ApplicationController.DEFAULT_KEYBINDS)) {
          return { success: false, error: "Atajo desconocido" };
        }
        const keybinds = { ...((this.persistedSettings && this.persistedSettings.keybinds) || {}) };
        if (!accelerator) { delete keybinds[id]; } // reset to default
        else { keybinds[id] = accelerator; }
        this.persistSettings({ keybinds });
        this.setupGlobalShortcuts(); // re-register live
        return { success: true, binds: this.getKeybinds() };
      } catch (error) {
        logger.error("Failed to set keybind", { error: error.message });
        return { success: false, error: error.message };
      }
    });

    // ----- Deepgram API key (persisted to ~/.Echo/.env) -----
    ipcMain.handle("get-deepgram-status", () => {
      const key = this._readEnvKey("DEEPGRAM_API_KEY");
      return { hasKey: !!key, masked: key ? `••••••${key.slice(-4)}` : "" };
    });

    ipcMain.handle("set-deepgram-key", (event, key) => {
      try {
        const k = String(key || "").trim();
        if (!k) return { success: false, error: "Pega una API key válida." };
        this._writeEnvKey("DEEPGRAM_API_KEY", k);
        // Apply live: reconnect the speech session with the new key.
        try {
          process.env.DEEPGRAM_API_KEY = k;
          if (typeof speechService.updateSettings === "function") {
            speechService.updateSettings({ deepgramApiKey: k });
          }
          if (speechService.getStatus?.().isRecording) {
            speechService.stopRecording();
            setTimeout(() => { try { speechService.startRecording(); } catch (_) {} }, 600);
          } else {
            setTimeout(() => { try { speechService.startRecording(); } catch (_) {} }, 300);
          }
        } catch (e) { logger.warn("Could not apply Deepgram key live", { error: e.message }); }
        return { success: true, masked: `••••••${k.slice(-4)}` };
      } catch (error) {
        logger.error("Failed to set Deepgram key", { error: error.message });
        return { success: false, error: error.message };
      }
    });

    // Handle save settings (synchronous)
    ipcMain.on("save-settings", (event, settings) => {
      this.saveSettings(settings);
    });

    // Handle update skill
    ipcMain.on("update-skill", (event, skill) => {
      this.activeSkill = skill;
      windowManager.broadcastToAllWindows("skill-updated", { skill });
    });

    // Handle quit app (alternative method / window.api.send)
    ipcMain.on("quit-app", () => {
      logger.info("Quit app requested via IPC (on method)");
      this._shutdownAndExit();
    });
  }

  toggleSpeechRecognition() {
    const isAvailable = typeof speechService.isAvailable === 'function' ? speechService.isAvailable() : !!speechService.getStatus?.().isInitialized;
    if (!isAvailable) {
      logger.warn("Speech recognition unavailable; toggle ignored");
      try {
        windowManager.broadcastToAllWindows("speech-status", { status: 'Speech recognition unavailable', available: false });
        windowManager.broadcastToAllWindows("speech-availability", { available: false });
      } catch (e) {}
      return;
    }
    const currentStatus = speechService.getStatus();
    if (currentStatus.isRecording) {
      try {
        speechService.stopRecording();
        windowManager.hideChatWindow();
        this.maybeAutoSaveMeeting();
        logger.info("Speech recognition stopped via global shortcut");
      } catch (error) {
        logger.error("Error stopping speech recognition:", error);
      }
    } else {
      try {
        speechService.startRecording();
        windowManager.showChatWindow();
        logger.info("Speech recognition started via global shortcut");
      } catch (error) {
        logger.error("Error starting speech recognition:", error);
      }
    }
  }

  // When a meeting (live recording) ends, optionally persist it to Obsidian:
  // a diarized .md note + a Hermes summary. Gated by the obsidianAutoSave setting
  // (on by default); clears the live context afterwards so the next call is fresh.
  maybeAutoSaveMeeting() {
    try {
      const s = this.getSettings();
      if (s.obsidianAutoSave === false) return Promise.resolve();
      if (!contextService.transcript || !contextService.transcript.length) return Promise.resolve();
      return llmService.saveMeeting({}).then((res) => {
        if (res && res.path) {
          windowManager.broadcastToAllWindows("meeting-saved", { path: res.path, auto: true });
          logger.info("Meeting auto-saved to Obsidian", { path: res.path });
          contextService.clear();
        }
      }).catch((e) => logger.warn("Auto-save meeting failed", { error: e.message }));
    } catch (_) { return Promise.resolve(); }
  }

  clearSessionMemory() {
    try {
      sessionManager.clear();
      windowManager.broadcastToAllWindows("session-cleared");
      logger.info("Session memory cleared via global shortcut");
    } catch (error) {
      logger.error("Error clearing session memory:", error);
    }
  }

  handleUpArrow() {
    const isInteractive = windowManager.getWindowStats().isInteractive;

    if (isInteractive) {
      // Interactive mode: Navigate to previous skill
      this.navigateSkill(-1);
    } else {
      // Non-interactive mode: Move window up
      windowManager.moveBoundWindows(0, -20);
    }
  }

  handleDownArrow() {
    const isInteractive = windowManager.getWindowStats().isInteractive;

    if (isInteractive) {
      // Interactive mode: Navigate to next skill
      this.navigateSkill(1);
    } else {
      // Non-interactive mode: Move window down
      windowManager.moveBoundWindows(0, 20);
    }
  }

  handleLeftArrow() {
    const isInteractive = windowManager.getWindowStats().isInteractive;

    if (!isInteractive) {
      // Non-interactive mode: Move window left
      windowManager.moveBoundWindows(-20, 0);
    }
    // Interactive mode: Left arrow does nothing
  }

  handleRightArrow() {
    const isInteractive = windowManager.getWindowStats().isInteractive;

    if (!isInteractive) {
      // Non-interactive mode: Move window right
      windowManager.moveBoundWindows(20, 0);
    }
    // Interactive mode: Right arrow does nothing
  }

  navigateSkill(direction) {
    const availableSkills = [
      "general",
      "dsa",
    ];

    const currentIndex = availableSkills.indexOf(this.activeSkill);
    if (currentIndex === -1) {
      logger.warn("Current skill not found in available skills", {
        currentSkill: this.activeSkill,
        availableSkills,
      });
      return;
    }

    // Calculate new index with wrapping
    let newIndex = currentIndex + direction;
    if (newIndex >= availableSkills.length) {
      newIndex = 0; // Wrap to beginning
    } else if (newIndex < 0) {
      newIndex = availableSkills.length - 1; // Wrap to end
    }

    const newSkill = availableSkills[newIndex];
    this.activeSkill = newSkill;

    // Update session manager with the new skill
    sessionManager.setActiveSkill(newSkill);

    logger.info("Skill navigated via global shortcut", {
      from: availableSkills[currentIndex],
      to: newSkill,
      direction: direction > 0 ? "down" : "up",
    });

    // Broadcast the skill change to all windows
    windowManager.broadcastToAllWindows("skill-updated", { skill: newSkill });
  }

  async triggerScreenshotOCR() {
    if (!this.isReady) {
      logger.warn("Screenshot requested before application ready");
      return;
    }

    const startTime = Date.now();

    try {
      // Guard: on recent macOS, calling desktopCapturer without Screen Recording
      // permission can hard-crash the process. Check first and guide the user.
      if (process.platform === "darwin") {
        const { systemPreferences } = require("electron");
        const status = systemPreferences.getMediaAccessStatus
          ? systemPreferences.getMediaAccessStatus("screen")
          : "granted";
        // Only hard-block when explicitly denied. macOS can report 'not-determined'
        // or stale values for screen capture even when the toggle is ON; in those
        // cases let desktopCapturer proceed (it won't crash) so a granted-but-not-yet
        // -propagated permission still works.
        if (status === "denied") {
          logger.warn("Screen Recording permission not granted; skipping capture", { status });
          this.broadcastOCRError("Falta el permiso de Grabación de pantalla. Actívalo en Ajustes del Sistema → Privacidad y seguridad → Grabación de pantalla, y reinicia Echo.");
          try {
            const { shell } = require("electron");
            shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
          } catch (_) {}
          return;
        }
      }

      // Chat-centric flow: the screenshot is attached to the chat (like
      // ChatGPT/Claude), not shown in a separate floating window.
      windowManager.showChatWindow();

      const capture = await captureService.captureAndProcess();

      if (!capture.imageBuffer || !capture.imageBuffer.length) {
        this.broadcastOCRError("Failed to capture screenshot image");
        return;
      }

      const mimeType = capture.mimeType || 'image/png';

      // Keep the latest screen frame in live context so the brain is always "seeing".
      contextService.setScreenshot(capture.imageBuffer, mimeType);

      // Attach a preview thumbnail to the chat and show the thinking state.
      const dataUrl = `data:${mimeType};base64,${capture.imageBuffer.toString('base64')}`;
      windowManager.broadcastToAllWindows('screenshot-attached', { dataUrl });

      const sessionHistory = sessionManager.getOptimizedHistory();

      const llmResult = await llmService.processImageWithSkill(
        capture.imageBuffer,
        mimeType,
        this.activeSkill,
        sessionHistory.recent,
        null
      );

      // Record model response in session
      sessionManager.addModelResponse(llmResult.response, {
        skill: this.activeSkill,
        processingTime: llmResult.metadata.processingTime,
        usedFallback: llmResult.metadata.usedFallback,
        isImageAnalysis: true
      });

      // Answer lands in the chat (chat listens for 'llm-response').
      this.broadcastLLMSuccess(llmResult);
    } catch (error) {
      logger.error("Screenshot OCR process failed", {
        error: error.message,
        duration: Date.now() - startTime,
      });

      windowManager.hideLLMResponse();
      this.broadcastOCRError(error.message);
      
      sessionManager.addConversationEvent({
        role: 'system',
        content: `Screenshot OCR failed: ${error.message}`,
        action: 'ocr_error',
        metadata: {
          error: error.message
        }
      });
    }
  }

  async processWithLLM(text, sessionHistory) {
    try {
      // Add user input to session memory
      sessionManager.addUserInput(text, 'llm_input');

      // Check if current skill needs programming language context
      const skillsRequiringProgrammingLanguage = ['dsa'];
      const needsProgrammingLanguage = skillsRequiringProgrammingLanguage.includes(this.activeSkill);
      
      const llmResult = await llmService.processTextWithSkill(
        text,
        this.activeSkill,
        sessionHistory.recent,
        needsProgrammingLanguage ? this.codingLanguage : null
      );

      logger.info("LLM processing completed, showing response", {
        responseLength: llmResult.response.length,
        skill: this.activeSkill,
        programmingLanguage: needsProgrammingLanguage ? this.codingLanguage : 'not applicable',
        processingTime: llmResult.metadata.processingTime,
        responsePreview: llmResult.response.substring(0, 200) + "...",
      });

      // Add LLM response to session memory
      sessionManager.addModelResponse(llmResult.response, {
        skill: this.activeSkill,
        processingTime: llmResult.metadata.processingTime,
        usedFallback: llmResult.metadata.usedFallback,
      });

      // Echo is chat-centric: the answer is rendered in the chat window via
      // broadcastLLMSuccess (no separate floating response window).
      this.broadcastLLMSuccess(llmResult);
    } catch (error) {
      logger.error("LLM processing failed", {
        error: error.message,
        skill: this.activeSkill,
      });

      windowManager.hideLLMResponse();
      sessionManager.addConversationEvent({
        role: 'system',
        content: `LLM processing failed: ${error.message}`,
        action: 'llm_error',
        metadata: {
          error: error.message,
          skill: this.activeSkill
        }
      });

      this.broadcastLLMError(error.message);
    }
  }

  async processTranscriptionWithLLM(text, sessionHistory) {
    try {
      // Validate input text
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        logger.warn("Skipping LLM processing for empty or invalid transcription", {
          textType: typeof text,
          textLength: text ? text.length : 0
        });
        return;
      }

      const cleanText = text.trim();
      if (cleanText.length < 2) {
        logger.debug("Skipping LLM processing for very short transcription", {
          text: cleanText
        });
        return;
      }

      logger.info("Processing transcription with intelligent LLM response", {
        skill: this.activeSkill,
        textLength: cleanText.length,
        textPreview: cleanText.substring(0, 100) + "..."
      });

      // Check if current skill needs programming language context
      const skillsRequiringProgrammingLanguage = ['dsa'];
      const needsProgrammingLanguage = skillsRequiringProgrammingLanguage.includes(this.activeSkill);

      const llmResult = await llmService.processTranscriptionWithIntelligentResponse(
        cleanText,
        this.activeSkill,
        sessionHistory.recent,
        needsProgrammingLanguage ? this.codingLanguage : null
      );

      // Add LLM response to session memory
      sessionManager.addModelResponse(llmResult.response, {
        skill: this.activeSkill,
        processingTime: llmResult.metadata.processingTime,
        usedFallback: llmResult.metadata.usedFallback,
        isTranscriptionResponse: true
      });

      // Send response to chat windows
      this.broadcastTranscriptionLLMResponse(llmResult);

      logger.info("Transcription LLM response completed", {
        responseLength: llmResult.response.length,
        skill: this.activeSkill,
        programmingLanguage: needsProgrammingLanguage ? this.codingLanguage : 'not applicable',
        processingTime: llmResult.metadata.processingTime
      });

    } catch (error) {
      logger.error("Transcription LLM processing failed", {
        error: error.message,
        errorStack: error.stack,
        skill: this.activeSkill,
        text: text ? text.substring(0, 100) : 'undefined'
      });

      // Try to provide a fallback response
      try {
        const fallbackResult = llmService.generateIntelligentFallbackResponse(text, this.activeSkill);
        
        sessionManager.addModelResponse(fallbackResult.response, {
          skill: this.activeSkill,
          processingTime: fallbackResult.metadata.processingTime,
          usedFallback: true,
          isTranscriptionResponse: true,
          fallbackReason: error.message
        });

        this.broadcastTranscriptionLLMResponse(fallbackResult);
        
        logger.info("Used fallback response for transcription", {
          skill: this.activeSkill,
          fallbackResponse: fallbackResult.response
        });
        
      } catch (fallbackError) {
        logger.error("Fallback response also failed", {
          fallbackError: fallbackError.message
        });

        sessionManager.addConversationEvent({
          role: 'system',
          content: `Transcription LLM processing failed: ${error.message}`,
          action: 'transcription_llm_error',
          metadata: {
            error: error.message,
            skill: this.activeSkill
          }
        });
      }
    }
  }

  broadcastOCRSuccess(ocrResult) {
    windowManager.broadcastToAllWindows("ocr-completed", {
      text: ocrResult.text,
      metadata: ocrResult.metadata,
    });
  }

  broadcastOCRError(errorMessage) {
    windowManager.broadcastToAllWindows("ocr-error", {
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastLLMSuccess(llmResult) {
    const broadcastData = {
      response: llmResult.response,
      metadata: llmResult.metadata,
      skill: this.activeSkill, // Add the current active skill to the top level
    };

    logger.info("Broadcasting LLM success to all windows", {
      responseLength: llmResult.response.length,
      skill: this.activeSkill,
      dataKeys: Object.keys(broadcastData),
      responsePreview: llmResult.response.substring(0, 100) + "...",
    });

    windowManager.broadcastToAllWindows("llm-response", broadcastData);
  }

  broadcastLLMError(errorMessage) {
    windowManager.broadcastToAllWindows("llm-error", {
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastTranscriptionLLMResponse(llmResult) {
    const broadcastData = {
      response: llmResult.response,
      metadata: llmResult.metadata,
      skill: this.activeSkill,
      isTranscriptionResponse: true
    };

    logger.info("Broadcasting transcription LLM response to all windows", {
      responseLength: llmResult.response.length,
      skill: this.activeSkill,
      responsePreview: llmResult.response.substring(0, 100) + "..."
    });

    windowManager.broadcastToAllWindows("transcription-llm-response", broadcastData);
  }

  onWindowAllClosed() {
    if (process.platform !== "darwin") {
      app.quit();
    }
  }

  onActivate() {
    if (!this.isReady) {
      this.onAppReady();
    } else {
      // When app is activated, ensure windows appear on current desktop
      const mainWindow = windowManager.getWindow("main");
      if (mainWindow && mainWindow.isVisible()) {
        windowManager.showOnCurrentDesktop(mainWindow);
      }

      // Also handle other visible windows
      windowManager.windows.forEach((window, type) => {
        if (window.isVisible()) {
          windowManager.showOnCurrentDesktop(window);
        }
      });

      logger.debug("App activated - ensured windows appear on current desktop");
    }
  }

  onWillQuit() {
    globalShortcut.unregisterAll();
    windowManager.destroyAllWindows();
    try { if (llmService.stop) llmService.stop(); } catch (_) {}

    const sessionStats = sessionManager.getMemoryUsage();
    logger.info("Application shutting down", {
      sessionEvents: sessionStats.eventCount,
      sessionSize: sessionStats.approximateSize,
    });
  }

  getSettings() {
    let launchAtLogin = false;
    try { launchAtLogin = app.getLoginItemSettings().openAtLogin; } catch (_) {}
    return {
      // Persisted preferences first, then live/derived values.
      ...(this.persistedSettings || {}),
      codingLanguage: this.codingLanguage || "cpp",
      activeSkill: this.activeSkill || "general",
      appIcon: this.appIcon || "echo",
      selectedIcon: this.appIcon || "echo",
      speechAvailable: this.speechAvailable,
      launchAtLogin,
      version: (config.get("app.version") || app.getVersion()),
      undetectable: (this.persistedSettings && this.persistedSettings.undetectable !== undefined)
        ? this.persistedSettings.undetectable : true,
      transcriptionLanguage: (this.persistedSettings && this.persistedSettings.transcriptionLanguage) || "es",
      outputLanguage: (this.persistedSettings && this.persistedSettings.outputLanguage) || "es",
      // STT (Deepgram) is a simple on/off switch; on by default.
      sttEnabled: (this.persistedSettings && this.persistedSettings.sttEnabled !== undefined)
        ? this.persistedSettings.sttEnabled : true,
      // Auto-save meetings to Obsidian when a recording stops; on by default.
      obsidianAutoSave: (this.persistedSettings && this.persistedSettings.obsidianAutoSave !== undefined)
        ? this.persistedSettings.obsidianAutoSave : true
    };
  }
  
  saveSettings(settings) {
    try {
      // Update application settings
      if (settings.codingLanguage) {
        this.codingLanguage = settings.codingLanguage;
        // Broadcast language change to all windows for sync
        windowManager.broadcastToAllWindows("coding-language-changed", {
          language: settings.codingLanguage,
        });
      }
      if (settings.activeSkill) {
        this.activeSkill = settings.activeSkill;
        // Broadcast skill change to all windows
        windowManager.broadcastToAllWindows("skill-updated", {
          skill: settings.activeSkill,
        });
      }
      if (settings.appIcon) {
        this.appIcon = settings.appIcon;
      }

      // Handle icon change specifically
      if (settings.selectedIcon) {
        this.appIcon = settings.selectedIcon;
        // Immediately update the app icon
        this.updateAppIcon(settings.selectedIcon);
      }

      // Transcription language: push to the speech service and restart the live
      // audio session so Deepgram reconnects with the new language.
      if (settings.transcriptionLanguage) {
        try {
          if (typeof speechService.updateSettings === 'function') {
            speechService.updateSettings({ transcriptionLanguage: settings.transcriptionLanguage });
          }
          if (speechService.isRecording) {
            speechService.stopRecording();
            setTimeout(() => { try { speechService.startRecording(); } catch (_) {} }, 600);
          }
        } catch (e) {
          logger.warn('Could not apply transcription language live', { error: e.message });
        }
      }

      // Deepgram STT on/off switch: start or stop the live audio session.
      if (settings.sttEnabled !== undefined) {
        try {
          if (settings.sttEnabled) {
            if (!speechService.getStatus?.().isRecording) speechService.startRecording();
          } else if (speechService.getStatus?.().isRecording) {
            speechService.stopRecording();
          }
        } catch (e) {
          logger.warn("Could not apply STT toggle", { error: e.message });
        }
      }

      // Persist settings to file or config
      this.persistSettings(settings);

      logger.info("Settings saved successfully", settings);
      return { success: true };
    } catch (error) {
      logger.error("Failed to save settings", { error: error.message });
      return { success: false, error: error.message };
    }
  }

  _settingsFilePath() {
    const path = require("path");
    return path.join(config.appDataDir, "settings.json");
  }

  _envFilePath() {
    const path = require("path");
    return path.join(config.appDataDir, ".env");
  }

  _readEnvKey(name) {
    try {
      const fs = require("fs");
      const file = this._envFilePath();
      if (!fs.existsSync(file)) return "";
      for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
        const t = line.trim();
        if (t.startsWith(name + "=")) {
          return t.slice(name.length + 1).replace(/^["']|["']$/g, "").trim();
        }
      }
    } catch (e) { logger.warn("Could not read .env key", { name, error: e.message }); }
    return "";
  }

  _writeEnvKey(name, value) {
    const fs = require("fs");
    const file = this._envFilePath();
    fs.mkdirSync(config.appDataDir, { recursive: true });
    let lines = [];
    try { if (fs.existsSync(file)) lines = fs.readFileSync(file, "utf8").split(/\r?\n/); } catch (_) {}
    let found = false;
    lines = lines.map((l) => {
      if (l.trim().startsWith(name + "=")) { found = true; return `${name}=${value}`; }
      return l;
    });
    if (!found) lines.push(`${name}=${value}`);
    fs.writeFileSync(file, lines.filter((l, i) => !(l === "" && i === lines.length - 1)).join("\n") + "\n", { mode: 0o600 });
  }

  _loadPersistedSettings() {
    try {
      const fs = require("fs");
      const file = this._settingsFilePath();
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, "utf8")) || {};
      }
    } catch (error) {
      logger.warn("Could not load persisted settings", { error: error.message });
    }
    return {};
  }

  persistSettings(settings) {
    try {
      const fs = require("fs");
      // Merge onto whatever was previously persisted so partial saves don't wipe keys.
      this.persistedSettings = { ...(this.persistedSettings || {}), ...settings };
      fs.mkdirSync(config.appDataDir, { recursive: true });
      fs.writeFileSync(this._settingsFilePath(), JSON.stringify(this.persistedSettings, null, 2));
      logger.debug("Settings persisted to disk", { keys: Object.keys(settings) });
    } catch (error) {
      logger.error("Failed to persist settings", { error: error.message });
    }
  }

  updateAppIcon(iconKey) {
    try {
      const { app } = require("electron");
      const path = require("path");
      const fs = require("fs");

      // Icon mapping. Disguise icons use the monochrome (gray) variants so they
      // blend with a gray macOS dock theme; 'echo' is the real Echo logo.
      const iconPaths = {
        terminal: "assests/icons/terminal-mono.png",
        activity: "assests/icons/activity-mono.png",
        settings: "assests/icons/settings-mono.png",
        echo: "assests/icons/echo.png",
      };

      // App name mapping for stealth mode
      const appNames = {
        terminal: "Terminal ",
        activity: "Activity Monitor ",
        settings: "System Settings ",
        echo: "Echo",
      };

      const iconPath = iconPaths[iconKey];
      const appName = appNames[iconKey];

      if (!iconPath) {
        logger.error("Invalid icon key", { iconKey });
        return { success: false, error: "Invalid icon key" };
      }

      // Resolve relative to the app dir (main.js location) so it works both in
      // dev and inside the packaged app.asar — path.resolve() used cwd, which
      // is wrong when launched as a bundled .app ("Icon file not found").
      const fullIconPath = path.join(__dirname, iconPath);

      if (!fs.existsSync(fullIconPath)) {
        logger.error("Icon file not found", {
          iconKey,
          iconPath: fullIconPath,
        });
        return { success: false, error: "Icon file not found" };
      }

      // Set app icon for dock/taskbar.
      // IMPORTANT: inside a packaged .app the icons live in app.asar, and
      // app.dock.setIcon(path) cannot read from asar → the dock never changed.
      // Load the bytes via fs (which DOES read asar) into a NativeImage instead.
      if (process.platform === "darwin") {
        const { nativeImage } = require("electron");
        let img = null;
        try { img = nativeImage.createFromBuffer(fs.readFileSync(fullIconPath)); } catch (_) {}
        const setDock = () => { try { app.dock.setIcon(img || fullIconPath); } catch (_) {} };
        setDock();
        setTimeout(setDock, 100);
        setTimeout(setDock, 500);
      } else {
        // Windows/Linux - update window icons
        windowManager.windows.forEach((window, type) => {
          if (window && !window.isDestroyed()) {
            window.setIcon(fullIconPath);
          }
        });
      }

      // Update app name for stealth mode
      this.updateAppName(appName, iconKey);

      logger.info("App icon and name updated successfully", {
        iconKey,
        appName,
        iconPath: fullIconPath,
        platform: process.platform,
        fileExists: fs.existsSync(fullIconPath),
      });

      this.appIcon = iconKey;
      return { success: true };
    } catch (error) {
      logger.error("Failed to update app icon", {
        error: error.message,
        stack: error.stack,
      });
      return { success: false, error: error.message };
    }
  }

  updateAppName(appName, iconKey) {
    try {
      const { app } = require("electron");

      // Force update process title for Activity Monitor stealth - CRITICAL
      process.title = appName;

      // Set app name in dock (macOS) - this affects the dock and Activity Monitor
      if (process.platform === "darwin") {
        // Multiple attempts to ensure the name sticks
        app.setName(appName);

        // Force update the bundle name for macOS stealth
        const { execSync } = require("child_process");
        try {
          // Update the app's Info.plist CFBundleName in memory
          if (process.mainModule && process.mainModule.filename) {
            const appPath = process.mainModule.filename;
            // Force set the bundle name directly
            process.env.CFBundleName = appName.trim();
          }
        } catch (e) {
          // Silently fail if we can't modify bundle info
        }

        // Clear dock badge and reset. Resolve the icon relative to the app dir
        // (NOT cwd): path.resolve() used the working directory, which is "/" when
        // launched as a packaged .app → setIcon threw inside the timer and crashed
        // the whole app. updateAppIcon() already set the dock icon; this is a refresh.
        if (app.dock) {
          app.dock.setBadge("");
          const path = require("path");
          const fs = require("fs");
          const { nativeImage } = require("electron");
          const dockIcon = path.join(__dirname, "assests", "icons", `${iconKey}.png`);
          setTimeout(() => {
            try {
              if (fs.existsSync(dockIcon)) {
                let img = null;
                try { img = nativeImage.createFromBuffer(fs.readFileSync(dockIcon)); } catch (_) {}
                app.dock.setIcon(img || dockIcon);
              }
            } catch (_) { /* dock icon refresh is best-effort */ }
          }, 50);
        }
      }

      // Set app user model ID for Windows taskbar grouping
      app.setAppUserModelId(`${appName.trim()}-${iconKey}`);

      // Update all window titles to match the new app name
      const windows = windowManager.windows;
      windows.forEach((window, type) => {
        if (window && !window.isDestroyed()) {
          // Use stealth name for all windows
          const stealthTitle = appName.trim();
          window.setTitle(stealthTitle);
        }
      });

      // Multiple force refreshes with increasing delays
      const refreshTimes = [50, 100, 200, 500];
      refreshTimes.forEach((delay) => {
        setTimeout(() => {
          process.title = appName;
          if (process.platform === "darwin") {
            app.setName(appName);
            // Force update bundle display name
            if (app.getName() !== appName) {
              app.setName(appName);
            }
          }
        }, delay);
      });

      logger.info("App name updated for stealth mode", {
        appName,
        processTitle: process.title,
        appGetName: app.getName(),
        iconKey,
        platform: process.platform,
      });
    } catch (error) {
      logger.error("Failed to update app name", { error: error.message });
    }
  }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  const controller = new ApplicationController();
  app.on("second-instance", () => controller.handleSecondInstance());
}
