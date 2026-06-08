const path = require('path');
const os = require('os');
const fs = require('fs');
const readline = require('readline');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const logger = require('../core/logger').createServiceLogger('BRAIN');
const config = require('../core/config');
const contextService = require('./context.service');

/**
 * BrainService — OpenCluely's reasoning is delegated to Hermes (the brain).
 *
 * This service keeps the SAME public surface that main.js used on the old
 * Gemini-based llm.service (processTextWithSkill / processImageWithSkill /
 * processTranscriptionWithIntelligentResponse / generateIntelligentFallbackResponse
 * / testConnection / getStats / updateApiKey / checkNetworkConnectivity), so the
 * rest of the app barely changes.
 *
 * Under the hood it talks to a warm Python sidecar (sidecar/hermes_bridge.py) that
 * instantiates Hermes' AIAgent once and answers over a stdio JSON-lines protocol.
 * Every query is enriched with the live meeting context (diarized transcript +
 * latest screenshot) so Hermes is "always seeing and hearing" the call.
 */
class BrainService extends EventEmitter {
  constructor() {
    super();
    this.proc = null;
    this.rl = null;
    this.ready = false;
    this.starting = null;          // Promise while starting
    this.requestSeq = 0;
    this.pending = new Map();      // id -> { resolve, reject, tokens: [] }
    this.tokenSink = null;         // optional fn(id, text) for streaming UI
  }

  /** Optional: wire a streaming sink (e.g. to forward tokens to the response window). */
  setTokenSink(fn) {
    this.tokenSink = typeof fn === 'function' ? fn : null;
  }

  _sidecarScriptPath() {
    // When packaged, sidecar/ is shipped as an extraResource (a real file on
    // disk, outside app.asar) so the Python interpreter can read it. In dev it
    // lives at the project root (two levels up from src/services).
    try {
      const { app } = require('electron');
      if (app && app.isPackaged) {
        return path.join(process.resourcesPath, 'sidecar', 'hermes_bridge.py');
      }
    } catch (_) { /* not in an Electron context */ }
    return path.join(__dirname, '..', '..', 'sidecar', 'hermes_bridge.py');
  }

  async start() {
    if (this.ready) return true;
    if (this.starting) return this.starting;

    this.starting = new Promise((resolve) => {
      try {
        const cmd = config.get('brain.sidecarCmd') || 'python3';
        const scriptPath = this._sidecarScriptPath();
        const extraArgs = config.get('brain.sidecarArgs') || [];
        const args = [scriptPath, ...extraArgs];

        const env = { ...process.env };
        const repoPath = config.get('brain.hermesRepoPath');
        if (repoPath) {
          env.PYTHONPATH = repoPath + (env.PYTHONPATH ? `${path.delimiter}${env.PYTHONPATH}` : '');
        }
        const model = config.get('brain.model');
        const provider = config.get('brain.provider');
        const apiMode = config.get('brain.apiMode');
        if (model) env.HERMES_BRIDGE_MODEL = String(model);
        if (provider) env.HERMES_BRIDGE_PROVIDER = String(provider);
        if (apiMode) env.HERMES_BRIDGE_API_MODE = String(apiMode);

        logger.info('Starting Hermes brain sidecar', { cmd, scriptPath, hasRepoPath: !!repoPath });

        this.proc = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], env });

        this.proc.stderr.on('data', (d) => {
          logger.debug('sidecar stderr', { line: d.toString().trim() });
        });

        this.proc.on('error', (error) => {
          logger.error('Failed to spawn brain sidecar', { error: error.message });
          this._handleProcessGone();
          resolve(false);
        });

        this.proc.on('exit', (code, signal) => {
          logger.warn('Brain sidecar exited', { code, signal });
          this._handleProcessGone();
        });

        this.rl = readline.createInterface({ input: this.proc.stdout });
        const startupTimeout = setTimeout(() => {
          if (!this.ready) {
            logger.error('Brain sidecar startup timed out');
            resolve(false);
          }
        }, config.get('brain.startupTimeoutMs') || 60000);

        this.rl.on('line', (line) => {
          let msg;
          try { msg = JSON.parse(line); } catch (_) { return; }

          if (msg.type === 'ready') {
            this.ready = true;
            clearTimeout(startupTimeout);
            logger.info('Brain sidecar ready', { model: msg.model, provider: msg.provider });
            resolve(true);
            return;
          }
          if (msg.type === 'startup_error') {
            clearTimeout(startupTimeout);
            logger.error('Brain sidecar startup error', { error: msg.error });
            resolve(false);
            return;
          }
          this._handleMessage(msg);
        });
      } catch (error) {
        logger.error('Error starting brain sidecar', { error: error.message });
        resolve(false);
      }
    }).finally(() => { this.starting = null; });

    return this.starting;
  }

  _handleProcessGone() {
    this.ready = false;
    if (this.rl) { try { this.rl.close(); } catch (_) {} this.rl = null; }
    this.proc = null;
    // Reject any in-flight requests so callers degrade gracefully.
    for (const [, p] of this.pending) {
      p.reject(new Error('Brain sidecar is not available'));
    }
    this.pending.clear();
  }

  _handleMessage(msg) {
    const p = msg.id != null ? this.pending.get(msg.id) : null;
    if (!p) return;

    if (msg.type === 'token') {
      p.tokens.push(msg.data || '');
      if (this.tokenSink) {
        try { this.tokenSink(msg.id, msg.data || ''); } catch (_) {}
      }
      return;
    }
    if (msg.type === 'final') {
      this.pending.delete(msg.id);
      p.resolve({ response: msg.response || p.tokens.join(''), metadata: msg.metadata || {} });
      return;
    }
    if (msg.type === 'error') {
      this.pending.delete(msg.id);
      p.reject(new Error(msg.error || 'Brain error'));
      return;
    }
    if (msg.type === 'pong') {
      this.pending.delete(msg.id);
      p.resolve({ ok: true });
      return;
    }
    if (msg.type === 'meeting_saved') {
      this.pending.delete(msg.id);
      p.resolve({ ok: true, path: msg.path });
    }
  }

  _send(obj) {
    if (!this.proc || !this.proc.stdin.writable) {
      throw new Error('Brain sidecar is not running');
    }
    this.proc.stdin.write(JSON.stringify(obj) + '\n');
  }

  /**
   * Core ask: compose the prompt with live context, attach an image if relevant,
   * send to the sidecar and await the final response.
   */
  async _ask({ text, imageBuffer, mimeType, mode, activeSkill, programmingLanguage }) {
    const started = await this.start();
    if (!started || !this.ready) {
      throw new Error('Brain (Hermes sidecar) unavailable');
    }

    // Live context: diarized transcript text (screenshot handled separately below).
    const live = contextService.getLiveContext({ includeScreenshot: false });

    // Resolve the image: an explicit one (screenshot capture) or the latest screen frame.
    let imagePath = null;
    let tmpToCleanup = null;
    let buf = imageBuffer;
    let mt = mimeType || 'image/png';
    if (!buf) {
      const ctxShot = contextService.getLiveContext({ includeScreenshot: true }).screenshot;
      if (ctxShot && contextService.screenshot && contextService.screenshot.buffer) {
        buf = contextService.screenshot.buffer;
        mt = contextService.screenshot.mimeType || 'image/png';
      }
    }
    if (buf && Buffer.isBuffer(buf)) {
      try {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencluely-brain-'));
        const ext = mt.includes('jpeg') ? 'jpg' : 'png';
        imagePath = path.join(dir, `frame.${ext}`);
        fs.writeFileSync(imagePath, buf);
        tmpToCleanup = dir;
      } catch (e) {
        logger.warn('Failed to write screenshot for brain', { error: e.message });
        imagePath = null;
      }
    }

    const prompt = this._composePrompt({ text, mode, live, activeSkill, programmingLanguage, hasImage: !!imagePath });

    const id = ++this.requestSeq;
    const timeoutMs = config.get('brain.timeoutMs') || 120000;

    const result = await new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('Brain request timed out'));
        }
      }, timeoutMs);
      const wrapResolve = (v) => { clearTimeout(t); resolve(v); };
      const wrapReject = (e) => { clearTimeout(t); reject(e); };
      this.pending.set(id, { resolve: wrapResolve, reject: wrapReject, tokens: [] });

      try {
        this._send({
          type: 'ask',
          id,
          text: prompt,
          image_path: imagePath,
          mode: mode || 'chat'
        });
      } catch (e) {
        clearTimeout(t);
        this.pending.delete(id);
        reject(e);
      }
    }).finally(() => {
      if (tmpToCleanup) {
        try { fs.rmSync(tmpToCleanup, { recursive: true, force: true }); } catch (_) {}
      }
    });

    // Meeting continuity is owned by the warm sidecar; nothing to persist here.

    return {
      response: result.response,
      metadata: {
        skill: activeSkill,
        programmingLanguage,
        mode,
        brain: 'hermes',
        usedFallback: false,
        ...(result.metadata || {})
      }
    };
  }

  _composePrompt({ text, mode, live, activeSkill, programmingLanguage, hasImage }) {
    const parts = [];
    if (live.hasTranscript) {
      parts.push('=== Contexto de la reunión en vivo (transcripción diarizada) ===');
      parts.push(live.transcriptText);
      parts.push('');
    }
    if (hasImage) {
      parts.push('(Se adjunta una captura de la pantalla actual del usuario.)');
      parts.push('');
    }
    // General-purpose assistant: Hermes already owns its personality, memory
    // (vault/Obsidian) and tools. We just relay the user's intent and the
    // live context — no skill framing, no forced "solve a coding problem".
    if (mode === 'transcription') {
      parts.push(`Acabo de escuchar lo siguiente en la reunión (transcripción): "${text}".`);
      parts.push('Si amerita una respuesta útil, dámela de forma concisa y accionable; si es charla casual o irrelevante, responde brevemente que estás atento.');
    } else if (mode === 'image') {
      parts.push(text
        ? `Mira la pantalla actual y responde a esto de forma concisa: ${text}`
        : 'Mira la pantalla actual y dime, de forma concisa y útil, qué es lo más relevante o en qué me puedes ayudar con lo que se ve. Si hay una pregunta, error, código o tarea evidente, resuélvela o explícala; si no, descríbelo brevemente.');
    } else {
      parts.push(text);
    }
    return parts.join('\n');
  }

  // ----- Public API compatible with the previous llm.service -----

  async processTextWithSkill(text, activeSkill, sessionMemory = [], programmingLanguage = null) {
    return this._ask({ text, mode: 'chat', activeSkill, programmingLanguage });
  }

  async processImageWithSkill(imageBuffer, mimeType, activeSkill, sessionMemory = [], programmingLanguage = null) {
    return this._ask({ text: '', imageBuffer, mimeType, mode: 'image', activeSkill, programmingLanguage });
  }

  async processTranscriptionWithIntelligentResponse(text, activeSkill, sessionMemory = [], programmingLanguage = null) {
    return this._ask({ text, mode: 'transcription', activeSkill, programmingLanguage });
  }

  /** Local heuristic fallback when the brain is unavailable (mirrors old behavior). */
  generateIntelligentFallbackResponse(text, activeSkill) {
    const response = `No pude consultar al cerebro (Hermes) en este momento. Verifica que el sidecar esté corriendo. (modo ${activeSkill})`;
    return {
      response,
      metadata: { skill: activeSkill, usedFallback: true, isTranscriptionResponse: true, brain: 'hermes' }
    };
  }

  // ----- Diagnostics / config shims (so existing IPC handlers keep working) -----

  async testConnection() {
    try {
      const started = await this.start();
      if (!started || !this.ready) return { success: false, error: 'Sidecar not ready' };
      const id = ++this.requestSeq;
      await new Promise((resolve, reject) => {
        this.pending.set(id, { resolve, reject, tokens: [] });
        const t = setTimeout(() => { this.pending.delete(id); reject(new Error('ping timeout')); }, 5000);
        const wrap = (fn) => (v) => { clearTimeout(t); fn(v); };
        this.pending.set(id, { resolve: wrap(resolve), reject: wrap(reject), tokens: [] });
        this._send({ type: 'ping', id });
      });
      return { success: true, response: 'OK', brain: 'hermes' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async checkNetworkConnectivity() {
    return { timestamp: new Date().toISOString(), tests: [{ name: 'brain-sidecar', success: this.ready }] };
  }

  updateApiKey(/* newApiKey */) {
    // Hermes manages its own provider credentials (~/.hermes/.env, config.yaml).
    logger.info('updateApiKey is a no-op: Hermes manages model credentials');
  }

  getStats() {
    return {
      isInitialized: this.ready,
      brain: 'hermes',
      sidecarRunning: !!this.proc
    };
  }

  /**
   * Save the current meeting to Obsidian: ship the accumulated diarized transcript
   * to the sidecar, which asks Hermes for a summary and writes a .md to the vault.
   * @returns {Promise<{ok:boolean, path?:string, skipped?:boolean}>}
   */
  async saveMeeting({ title = null, startedAt = null } = {}) {
    const started = await this.start();
    if (!started || !this.ready) throw new Error('Brain (Hermes sidecar) unavailable');

    const transcript = (contextService.transcript || []).map(l => ({
      label: l.label, speaker: l.speaker, text: l.text, timestamp: l.timestamp
    }));
    if (!transcript.length) return { ok: false, skipped: true };

    const id = ++this.requestSeq;
    const timeoutMs = config.get('brain.timeoutMs') || 120000;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('save_meeting timed out')); }
      }, timeoutMs);
      const wrap = (fn) => (v) => { clearTimeout(t); fn(v); };
      this.pending.set(id, { resolve: wrap(resolve), reject: wrap(reject), tokens: [] });
      try {
        this._send({
          type: 'save_meeting',
          id,
          title,
          transcript,
          started_at: startedAt || (transcript[0] && transcript[0].timestamp) || null,
          ended_at: new Date().toISOString()
        });
      } catch (e) {
        clearTimeout(t); this.pending.delete(id); reject(e);
      }
    });
  }

  /** Clear meeting continuity (e.g. on session clear / meeting end). The warm sidecar owns history. */
  resetConversation() {
    try {
      if (this.ready) this._send({ type: 'reset' });
    } catch (_) {}
  }

  stop() {
    if (this.proc) {
      try { this.proc.stdin.end(); } catch (_) {}
      try { this.proc.kill(); } catch (_) {}
    }
    this._handleProcessGone();
  }
}

module.exports = new BrainService();
