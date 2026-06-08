const path = require('path');
const os = require('os');

class ConfigManager {
  constructor() {
    this.env = process.env.NODE_ENV || 'development';
    this.appDataDir = path.join(os.homedir(), '.Echo');
    this.loadConfiguration();
  }

  loadConfiguration() {
    this.config = {
      app: {
        name: 'Echo',
        version: '1.0.0',
        processTitle: 'Echo',
        dataDir: this.appDataDir,
        isDevelopment: this.env === 'development',
        isProduction: this.env === 'production'
      },
      
      window: {
        defaultWidth: 400,
        defaultHeight: 600,
        minWidth: 300,
        minHeight: 400,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          enableRemoteModule: false,
          preload: path.join(__dirname, '../../preload.js')
        }
      },

      ocr: {
        language: 'eng',
        tempDir: os.tmpdir(),
        cleanupDelay: 5000
      },

      // Audio capture + per-channel speaker diarization (BlackHole + Aggregate Device).
      // The Aggregate Device exposes the mic and BlackHole as separate channels.
      // channelMap maps each speaker to the channel index/indices to mix down to mono.
      // Typical layout: mic = channel 0 ("me"), BlackHole stereo = channels 1-2 ("them").
      audio: {
        // Captured via ffmpeg/avfoundation (sox can't do multichannel on macOS).
        captureCmd: 'ffmpeg',
        deviceName: 'OpenCluely In',      // the macOS Aggregate Device (mic + BlackHole)
        channels: 3,                      // total channels to record from the Aggregate Device
        channelMap: {
          me: [0],                        // my microphone
          them: [1, 2]                    // remote call audio via BlackHole (downmixed to mono)
        },
        vadThreshold: 350,                // RMS (int16) below this => treat segment as silence, skip transcription
        sampleRateHertz: 16000
      },

      // Brain: OpenCluely no longer reasons by itself. It forwards queries to Hermes
      // (the brain) through a warm Python sidecar that drives Hermes' AIAgent SDK.
      // model/provider are optional overrides; when null, Hermes uses its own
      // ~/.hermes/config.yaml selection (keeps Hermes as the single source of truth).
      brain: {
        // Python from Hermes' own venv so `run_agent` and all of Hermes' deps are
        // importable. We use the SINGLE canonical Hermes install at ~/.hermes/hermes-agent
        // (the desktop-app install); the old ~/Desktop/Proyecto/hermes-agent copy is
        // retired. Override with env BRAIN_SIDECAR_CMD if needed.
        sidecarCmd: process.env.BRAIN_SIDECAR_CMD || require('path').join(require('os').homedir(), '.hermes/hermes-agent/venv/bin/python3'),
        sidecarArgs: [],
        hermesRepoPath: '',               // empty: the venv already has Hermes installed (editable)
        // Vision-capable, reliable brain for OpenCluely. The global Hermes default
        // (gemini-cli) DROPS images and its free quota throttles hard, so we pin
        // OpenCluely to OpenAI gpt-4o. apiMode MUST be chat_completions: gpt-4o
        // rejects the Responses API that direct OpenAI URLs default to.
        model: 'gpt-4o',
        provider: 'openai-api',
        apiMode: 'chat_completions',
        timeoutMs: 90000,
        startupTimeoutMs: 60000
      },

      llm: {
        gemini: {
          model: 'gemini-2.5-flash',
          maxRetries: 3,
          timeout: 60000,
          fallbackEnabled: true,
          enableFallbackMethod: true,
          generation: {
            temperature: 0.7,
            topK: 32,
            topP: 0.9,
            maxOutputTokens: 4096
          }
        }
      },

      speech: {
        // Echo uses Deepgram (cloud, streaming, multichannel) for live diarized
        // transcription. Key in ~/.Echo/.env (DEEPGRAM_API_KEY).
        provider: 'deepgram',
        deepgram: {
          model: 'nova-2',
          language: 'es'              // language the user speaks (transcription)
        },
        azure: {
          language: 'en-US',
          enableDictation: true,
          enableAudioLogging: false,
          outputFormat: 'detailed'
        },
        whisper: {
          model: 'base',
          language: 'en',
          segmentMs: 4000
        }
      },

      session: {
        maxMemorySize: 1000,
        compressionThreshold: 500,
        clearOnRestart: false
      },

      stealth: {
        hideFromDock: true,
        noAttachConsole: true,
        disguiseProcess: true
      }
    };
  }

  get(keyPath) {
    return keyPath.split('.').reduce((obj, key) => obj?.[key], this.config);
  }

  set(keyPath, value) {
    const keys = keyPath.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((obj, key) => obj[key] = obj[key] || {}, this.config);
    target[lastKey] = value;
  }

  getApiKey(service) {
    const envKey = `${service.toUpperCase()}_API_KEY`;
    return process.env[envKey];
  }

  isFeatureEnabled(feature) {
    return this.get(`features.${feature}`) !== false;
  }
}

module.exports = new ConfigManager();
