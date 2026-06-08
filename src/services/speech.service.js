// Enhanced polyfills for Azure Speech SDK in Node.js environment
if (typeof window === 'undefined') {
  global.window = {
    navigator: {
      userAgent: 'Node.js',
      platform: 'node',
      mediaDevices: {
        getUserMedia: () => Promise.resolve({
          getAudioTracks: () => [],
          getTracks: () => [],
          stop: () => {}
        }),
        getSupportedConstraints: () => ({
          audio: true,
          video: false,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: true,
          sampleSize: true,
          channelCount: true
        }),
        enumerateDevices: () => Promise.resolve([
          {
            deviceId: 'default',
            kind: 'audioinput',
            label: 'Default - Microphone',
            groupId: 'default'
          }
        ])
      }
    },
    document: {
      createElement: (tagName) => {
        const element = {
          addEventListener: () => {},
          removeEventListener: () => {},
          setAttribute: () => {},
          getAttribute: () => null,
          style: {},
          tagName: tagName.toUpperCase(),
          nodeType: 1,
          nodeName: tagName.toUpperCase(),
          appendChild: () => {},
          removeChild: () => {},
          insertBefore: () => {},
          cloneNode: () => element,
          hasAttribute: () => false,
          removeAttribute: () => {},
          click: () => {},
          focus: () => {},
          blur: () => {}
        };

        if (tagName.toLowerCase() === 'audio') {
          Object.assign(element, {
            play: () => Promise.resolve(),
            pause: () => {},
            load: () => {},
            canPlayType: () => 'probably',
            volume: 1,
            muted: false,
            paused: true,
            ended: false,
            currentTime: 0,
            duration: 0,
            playbackRate: 1,
            defaultPlaybackRate: 1,
            readyState: 4,
            networkState: 1,
            autoplay: false,
            loop: false,
            controls: false,
            crossOrigin: null,
            preload: 'metadata',
            src: '',
            currentSrc: ''
          });
        }

        return element;
      },
      getElementById: () => null,
      getElementsByTagName: () => [],
      getElementsByClassName: () => [],
      querySelector: () => null,
      querySelectorAll: () => [],
      body: {
        appendChild: () => {},
        removeChild: () => {},
        insertBefore: () => {},
        style: {}
      },
      head: {
        appendChild: () => {},
        removeChild: () => {},
        insertBefore: () => {},
        style: {}
      }
    },
    location: {
      href: 'file:///',
      protocol: 'file:',
      host: '',
      hostname: '',
      port: '',
      pathname: '/',
      search: '',
      hash: '',
      origin: 'file://'
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
    requestAnimationFrame: (callback) => global.setTimeout(callback, 16),
    cancelAnimationFrame: global.clearTimeout,
    console: global.console || {
      log: () => {},
      error: () => {},
      warn: () => {},
      info: () => {},
      debug: () => {}
    },
    AudioContext: class AudioContext {
      constructor() {
        this.state = 'running';
        this.sampleRate = 16000;
        this.currentTime = 0;
        this.listener = {
          setPosition: () => {},
          setOrientation: () => {}
        };
        this.destination = {
          connect: () => {},
          disconnect: () => {},
          channelCount: 2,
          channelCountMode: 'explicit',
          channelInterpretation: 'speakers'
        };
      }
      createMediaStreamSource(stream) {
        return {
          connect: () => {},
          disconnect: () => {},
          mediaStream: stream
        };
      }
      createGain() {
        return {
          connect: () => {},
          disconnect: () => {},
          gain: {
            value: 1,
            setValueAtTime: () => {},
            linearRampToValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {}
          }
        };
      }
      createScriptProcessor(bufferSize = 4096, inputChannels = 1, outputChannels = 1) {
        return {
          connect: () => {},
          disconnect: () => {},
          onaudioprocess: null,
          bufferSize,
          numberOfInputs: inputChannels,
          numberOfOutputs: outputChannels
        };
      }
      createAnalyser() {
        return {
          connect: () => {},
          disconnect: () => {},
          fftSize: 2048,
          frequencyBinCount: 1024,
          minDecibels: -100,
          maxDecibels: -30,
          smoothingTimeConstant: 0.8,
          getByteFrequencyData: () => {},
          getByteTimeDomainData: () => {},
          getFloatFrequencyData: () => {},
          getFloatTimeDomainData: () => {}
        };
      }
      decodeAudioData() {
        return Promise.resolve({
          length: 44100,
          sampleRate: 44100,
          numberOfChannels: 1,
          duration: 1,
          getChannelData: () => new Float32Array(44100)
        });
      }
      suspend() {
        this.state = 'suspended';
        return Promise.resolve();
      }
      resume() {
        this.state = 'running';
        return Promise.resolve();
      }
      close() {
        this.state = 'closed';
        return Promise.resolve();
      }
    },
    webkitAudioContext: class webkitAudioContext {
      constructor() {
        this.state = 'running';
        this.sampleRate = 16000;
        this.currentTime = 0;
        this.listener = {
          setPosition: () => {},
          setOrientation: () => {}
        };
        this.destination = {
          connect: () => {},
          disconnect: () => {},
          channelCount: 2,
          channelCountMode: 'explicit',
          channelInterpretation: 'speakers'
        };
      }
      createMediaStreamSource(stream) {
        return {
          connect: () => {},
          disconnect: () => {},
          mediaStream: stream
        };
      }
      createGain() {
        return {
          connect: () => {},
          disconnect: () => {},
          gain: {
            value: 1,
            setValueAtTime: () => {},
            linearRampToValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {}
          }
        };
      }
      createScriptProcessor(bufferSize = 4096, inputChannels = 1, outputChannels = 1) {
        return {
          connect: () => {},
          disconnect: () => {},
          onaudioprocess: null,
          bufferSize,
          numberOfInputs: inputChannels,
          numberOfOutputs: outputChannels
        };
      }
      createAnalyser() {
        return {
          connect: () => {},
          disconnect: () => {},
          fftSize: 2048,
          frequencyBinCount: 1024,
          minDecibels: -100,
          maxDecibels: -30,
          smoothingTimeConstant: 0.8,
          getByteFrequencyData: () => {},
          getByteTimeDomainData: () => {},
          getFloatFrequencyData: () => {},
          getFloatTimeDomainData: () => {}
        };
      }
      decodeAudioData() {
        return Promise.resolve({
          length: 44100,
          sampleRate: 44100,
          numberOfChannels: 1,
          duration: 1,
          getChannelData: () => new Float32Array(44100)
        });
      }
      suspend() {
        this.state = 'suspended';
        return Promise.resolve();
      }
      resume() {
        this.state = 'running';
        return Promise.resolve();
      }
      close() {
        this.state = 'closed';
        return Promise.resolve();
      }
    },
    URL: class URL {
      constructor(url) {
        this.href = url;
        this.protocol = 'https:';
        this.host = 'localhost';
        this.hostname = 'localhost';
        this.port = '';
        this.pathname = '/';
        this.search = '';
        this.hash = '';
        this.origin = 'https://localhost';
      }
      toString() {
        return this.href;
      }
    },
    Blob: class Blob {
      constructor(parts = [], options = {}) {
        this.size = 0;
        this.type = options.type || '';
        this.parts = parts;
      }
      slice() {
        return new Blob();
      }
      stream() {
        return new ReadableStream();
      }
      text() {
        return Promise.resolve('');
      }
      arrayBuffer() {
        return Promise.resolve(new ArrayBuffer(0));
      }
    },
    File: class File {
      constructor(parts, name, options = {}) {
        this.name = name;
        this.size = 0;
        this.type = options.type || '';
        this.lastModified = Date.now();
        this.parts = parts;
      }
      slice() {
        return new File([], this.name);
      }
      stream() {
        return new ReadableStream();
      }
      text() {
        return Promise.resolve('');
      }
      arrayBuffer() {
        return Promise.resolve(new ArrayBuffer(0));
      }
    }
  };
  global.document = global.window.document;
  global.navigator = global.window.navigator;
  global.AudioContext = global.window.AudioContext;
  global.webkitAudioContext = global.window.webkitAudioContext;
  global.URL = global.window.URL;
  global.Blob = global.window.Blob;
  global.File = global.window.File;

  if (!global.performance) {
    global.performance = {
      now: () => Date.now(),
      mark: () => {},
      measure: () => {},
      clearMarks: () => {},
      clearMeasures: () => {},
      getEntriesByName: () => [],
      getEntriesByType: () => []
    };
  }

  if (!global.crypto) {
    global.crypto = {
      getRandomValues: (arr) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
      }
    };
  }
}

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { EventEmitter } = require('events');
const logger = require('../core/logger').createServiceLogger('SPEECH');
const config = require('../core/config');

let sdk = null;
try {
  sdk = require('microsoft-cognitiveservices-speech-sdk');
} catch (error) {
  logger.warn('Azure Speech SDK unavailable', { error: error.message });
}

let recorder = null;
try {
  recorder = require('node-record-lpcm16');
} catch (error) {
  logger.warn('Local audio recorder dependency unavailable', { error: error.message });
}

// We talk to Deepgram's live streaming API over a raw WebSocket. The official
// SDK's URL builder throws in Electron's main process ("searchParams undefined"),
// so we use `ws` directly (it ships as a dependency of @deepgram/sdk anyway).
let DeepgramWS = null;
try {
  DeepgramWS = require('ws');
} catch (error) {
  logger.warn('Deepgram WebSocket dependency (ws) unavailable', { error: error.message });
}

class SpeechService extends EventEmitter {
  constructor() {
    super();
    this.recognizer = null;
    this.isRecording = false;
    this.audioConfig = null;
    this.speechConfig = null;
    this.sessionStartTime = null;
    this.retryCount = 0;
    this.maxRetries = 3;
    this.pushStream = null;
    this.recording = null;
    this.available = false;
    this.provider = 'disabled';
    this.runtimeSettings = {};
    this.segmentTimer = null;
    this.audioProgram = null;
    this.whisperCommand = null;
    this.captureChannels = 1;
    // Deepgram live streaming.
    this.dgClient = null;
    this.dgConnection = null;
    this.dgKeepAlive = null;
    this.dgReady = false;
    // Per-speaker rolling PCM buffers for channel-based diarization (whisper provider).
    this.speakerBuffers = {};         // { me: [Buffer, ...], them: [Buffer, ...] }
    this.speakerBytes = {};           // { me: Number, them: Number }
    this.transcriptionInFlight = {};  // { me: bool, them: bool }
    // Legacy single-stream fields kept for the Azure push-stream path.
    this.segmentBuffers = [];
    this.segmentBytes = 0;

    this.initializeClient();
  }

  initializeClient() {
    this._cleanup();
    this.provider = 'disabled';
    this.available = false;
    this.speechConfig = null;
    this.whisperCommand = null;

    const provider = this._getConfiguredProvider();
    this.provider = provider;

    if (provider === 'azure') {
      this._initializeAzureClient();
      return;
    }

    if (provider === 'whisper') {
      this._initializeWhisperClient();
      return;
    }

    if (provider === 'deepgram') {
      this._initializeDeepgramClient();
      return;
    }

    const reason = 'Speech recognition disabled. Configure Deepgram, Azure or local Whisper.';
    logger.warn(reason);
    this.emit('status', reason);
  }

  _initializeAzureClient() {
    try {
      if (!sdk) {
        throw new Error('Azure Speech SDK dependency is not installed');
      }

      if (!recorder || typeof recorder.record !== 'function') {
        throw new Error('Local microphone recorder dependency is not installed');
      }

      const subscriptionKey = this._getSetting('azureKey') || process.env.AZURE_SPEECH_KEY;
      const region = this._getSetting('azureRegion') || process.env.AZURE_SPEECH_REGION;

      if (!subscriptionKey || !region) {
        const reason = 'Azure Speech credentials not found. Speech recognition disabled.';
        logger.warn('Speech service disabled (missing Azure credentials)');
        this.emit('status', reason);
        return;
      }

      this.speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, region);

      const azureConfig = config.get('speech.azure') || {};
      this.speechConfig.speechRecognitionLanguage = azureConfig.language || 'en-US';
      this.speechConfig.outputFormat = sdk.OutputFormat.Detailed;
      this.speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, '5000');
      this.speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, '2000');
      this.speechConfig.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, '2000');

      if (azureConfig.enableDictation) {
        this.speechConfig.enableDictation();
      }

      if (azureConfig.enableAudioLogging) {
        this.speechConfig.enableAudioLogging();
      }

      this.available = true;
      logger.info('Azure Speech service initialized successfully', {
        region,
        language: azureConfig.language || 'en-US'
      });
      this.emit('status', 'Azure Speech Services ready');
    } catch (error) {
      logger.error('Failed to initialize Azure Speech client', {
        error: error.message,
        stack: error.stack
      });
      this.available = false;
      this.emit('status', 'Azure speech unavailable');
    }
  }

  _initializeWhisperClient() {
    try {
      if (!recorder || typeof recorder.record !== 'function') {
        throw new Error('Local microphone recorder dependency is not installed');
      }

      this.whisperCommand = this._resolveWhisperCommand();
      if (!this.whisperCommand) {
        const reason = 'Local Whisper unavailable. Install the Whisper CLI or set WHISPER_COMMAND.';
        logger.warn(reason);
        this.emit('status', reason);
        return;
      }

      this.available = true;
      logger.info('Local Whisper service initialized successfully', {
        command: [this.whisperCommand.command, ...this.whisperCommand.baseArgs].join(' '),
        model: this._getWhisperModel(),
        language: this._getWhisperLanguage()
      });
      this.emit('status', 'Local Whisper ready');
    } catch (error) {
      logger.error('Failed to initialize local Whisper client', {
        error: error.message,
        stack: error.stack
      });
      this.available = false;
      this.emit('status', 'Local Whisper unavailable');
    }
  }

  _initializeDeepgramClient() {
    try {
      if (!DeepgramWS) {
        throw new Error('WebSocket dependency (ws) is not installed');
      }
      const apiKey = this._getDeepgramApiKey();
      if (!apiKey) {
        const reason = 'Deepgram API key not found (DEEPGRAM_API_KEY). Speech recognition disabled.';
        logger.warn(reason);
        this.emit('status', reason);
        return;
      }
      this.available = true;
      logger.info('Deepgram speech service initialized successfully', {
        model: this._getDeepgramModel(),
        language: this._getTranscriptionLanguage()
      });
      this.emit('status', 'Deepgram ready');
    } catch (error) {
      logger.error('Failed to initialize Deepgram client', { error: error.message });
      this.available = false;
      this.emit('status', 'Deepgram unavailable');
    }
  }

  _getDeepgramModel() {
    return this._getSetting('deepgramModel') || process.env.DEEPGRAM_MODEL || config.get('speech.deepgram.model') || 'nova-2';
  }

  /** Language the user speaks (BCP-47-ish, e.g. 'es', 'en', 'multi'). */
  _getTranscriptionLanguage() {
    return this._getSetting('transcriptionLanguage') || process.env.TRANSCRIPTION_LANGUAGE || config.get('speech.deepgram.language') || 'es';
  }

  _startDeepgramRecording() {
    const apiKey = this._getDeepgramApiKey();
    if (!DeepgramWS || !apiKey) {
      throw new Error('Deepgram not configured');
    }
    this._cleanup();
    this.isRecording = true;
    this.dgReady = false;
    this._resetSpeakerBuffers();
    this.emit('recording-started');
    this.emit('status', 'Deepgram recording started');

    const sampleRate = config.get('audio.sampleRateHertz') || 16000;
    // Downmix the 3-channel aggregate to 2 channels (0 = me, 1 = them) and ask
    // Deepgram to transcribe each channel separately (multichannel diarization).
    const params = new URLSearchParams({
      model: this._getDeepgramModel(),
      language: this._getTranscriptionLanguage(),
      encoding: 'linear16',
      sample_rate: String(sampleRate),
      channels: '2',
      multichannel: 'true',
      interim_results: 'true',
      smart_format: 'true',
      punctuate: 'true'
    });
    const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
    const ws = new DeepgramWS(url, { headers: { Authorization: `Token ${apiKey}` } });
    this.dgConnection = ws;

    ws.on('open', () => {
      this.dgReady = true;
      logger.info('Deepgram live connection open');
      this.dgKeepAlive = setInterval(() => {
        try { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'KeepAlive' })); } catch (_) {}
      }, 8000);
      this._startMicrophoneCapture();
    });

    ws.on('message', (raw) => {
      let data;
      try { data = JSON.parse(raw.toString()); } catch (_) { return; }
      if (data.type && data.type !== 'Results') return;
      try {
        const alt = data.channel && data.channel.alternatives && data.channel.alternatives[0];
        const text = (alt && alt.transcript || '').trim();
        if (!text) return;
        const chIdx = Array.isArray(data.channel_index) ? data.channel_index[0] : 0;
        const speaker = chIdx === 0 ? 'me' : 'them';
        if (data.is_final) {
          logger.info('Deepgram transcript', { speaker, chars: text.length, preview: text.slice(0, 40) });
          this.emit('transcription', { text, speaker });
        } else {
          this.emit('interim-transcription', { text, speaker });
        }
      } catch (error) {
        logger.error('Error handling Deepgram transcript', { error: error.message });
      }
    });

    ws.on('error', (err) => {
      logger.error('Deepgram live error', { error: err && (err.message || String(err)) });
      this.emit('error', `Deepgram error: ${err && (err.message || err)}`);
    });

    ws.on('close', () => {
      this.dgReady = false;
      logger.info('Deepgram live connection closed');
    });

    if (global.windowManager) {
      global.windowManager.handleRecordingStarted();
    }
  }

  /** Pause/resume a single diarization channel ('me'=input/mic, 'them'=output/system). */
  setChannelPaused(channel, paused) {
    if (channel === 'me') this.pauseMe = !!paused;
    else if (channel === 'them') this.pauseThem = !!paused;

    // When BOTH channels are paused, fully release the microphone (kill the ffmpeg
    // capture) so macOS stops showing the "in use" indicator and nothing is recorded.
    // When at least one channel is active again, resume capture.
    const bothPaused = this.pauseMe && this.pauseThem;
    try {
      if (bothPaused) {
        if (this.recording && this.recording.stop) {
          this.recording.stop();
          this.recording = null;
          logger.info('Both channels paused → microphone released');
        }
      } else if (this.isRecording && !this.recording && this.provider === 'deepgram' && this.dgReady) {
        this._startMicrophoneCapture();
        logger.info('Channel resumed → microphone capture restarted');
      }
    } catch (e) { logger.warn('Error toggling mic capture on pause', { error: e.message }); }

    logger.info('Audio channel pause toggled', { channel, paused: !!paused, bothPaused });
    return { me: !!this.pauseMe, them: !!this.pauseThem };
  }

  startRecording() {
    try {
      if (!this.available) {
        const errorMsg = `Speech provider "${this.provider}" is not available`;
        logger.error(errorMsg);
        this.emit('error', errorMsg);
        return;
      }

      if (this.isRecording) {
        logger.warn('Recording already in progress');
        return;
      }

      this.sessionStartTime = Date.now();
      this.retryCount = 0;

      if (this.provider === 'azure') {
        this._startAzureRecording();
        return;
      }

      if (this.provider === 'whisper') {
        this._startWhisperRecording();
        return;
      }

      if (this.provider === 'deepgram') {
        this._startDeepgramRecording();
        return;
      }

      throw new Error(`Unsupported speech provider: ${this.provider}`);
    } catch (error) {
      logger.error('Critical error in startRecording', { error: error.message, stack: error.stack });
      this.emit('error', `Speech recognition failed to start: ${error.message}`);
      this.isRecording = false;
    }
  }

  _startAzureRecording() {
    if (!this.speechConfig) {
      throw new Error('Azure Speech client not initialized');
    }

    this.isRecording = true;
    this.emit('recording-started');
    this.emit('status', 'Azure recording started');
    this._cleanup();

    try {
      this.pushStream = sdk.AudioInputStream.createPushStream();
      this.audioConfig = sdk.AudioConfig.fromStreamInput(this.pushStream);
      this._startMicrophoneCapture();
      this.recognizer = new sdk.SpeechRecognizer(this.speechConfig, this.audioConfig);
    } catch (error) {
      logger.error('Failed to start Azure recording session', { error: error.message });
      this.emit('error', `Audio configuration failed: ${error.message}`);
      this.isRecording = false;
      return;
    }

    this.recognizer.recognizing = (s, e) => {
      try {
        if (e.result.reason === sdk.ResultReason.RecognizingSpeech) {
          this.emit('interim-transcription', e.result.text);
        }
      } catch (error) {
        logger.error('Error in recognizing handler', { error: error.message });
      }
    };

    this.recognizer.recognized = (s, e) => {
      try {
        if (e.result.reason === sdk.ResultReason.RecognizedSpeech && e.result.text && e.result.text.trim()) {
          // Azure path captures the mic only -> always "me".
          this.emit('transcription', { text: e.result.text, speaker: 'me' });
        }
      } catch (error) {
        logger.error('Error in recognized handler', { error: error.message });
      }
    };

    this.recognizer.canceled = (s, e) => {
      logger.warn('Recognition session canceled', {
        reason: e.reason,
        errorCode: e.errorCode,
        errorDetails: e.errorDetails
      });

      if (e.reason === sdk.CancellationReason.Error) {
        const details = e.errorDetails || '';
        if (details.includes('1006')) {
          this.emit('error', 'Network connection failed. Please check your internet connection.');
        } else if (details.includes('InvalidServiceCredentials')) {
          this.emit('error', 'Invalid Azure Speech credentials. Please check AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.');
        } else if (details.includes('Forbidden')) {
          this.emit('error', 'Access denied. Please check your Azure Speech service subscription and region.');
        } else if (details.includes('AudioInputMicrophone_InitializationFailure')) {
          this.emit('error', 'Microphone initialization failed. Please check microphone permissions and availability.');
        } else {
          this.emit('error', `Recognition error: ${details}`);
        }
      }

      this.stopRecording();
    };

    this.recognizer.sessionStarted = (s, e) => {
      logger.info('Recognition session started', { sessionId: e.sessionId });
    };

    this.recognizer.sessionStopped = () => {
      this.stopRecording();
    };

    const startTimeout = setTimeout(() => {
      logger.error('Recognition start timeout');
      this.emit('error', 'Speech recognition start timeout. Please try again.');
      this.stopRecording();
    }, 10000);

    this.recognizer.startContinuousRecognitionAsync(
      () => {
        clearTimeout(startTimeout);
        logger.info('Continuous Azure speech recognition started successfully');
        if (global.windowManager) {
          global.windowManager.handleRecordingStarted();
        }
      },
      (error) => {
        clearTimeout(startTimeout);
        logger.error('Failed to start continuous recognition', { error: error.toString() });
        this.emit('error', `Recognition startup failed: ${error}`);
        this.isRecording = false;
        this._cleanup();
      }
    );
  }

  _startWhisperRecording() {
    this._cleanup();
    this.isRecording = true;
    this._resetSpeakerBuffers();
    this.emit('recording-started');
    this.emit('status', 'Local Whisper recording started');
    this._startMicrophoneCapture();

    const segmentMs = this._getWhisperSegmentMs();
    this.segmentTimer = setInterval(() => {
      this._flushWhisperSegment({ final: false }).catch((error) => {
        logger.error('Whisper segment transcription failed', { error: error.message });
      });
    }, segmentMs);

    if (global.windowManager) {
      global.windowManager.handleRecordingStarted();
    }
  }

  stopRecording() {
    if (!this.isRecording) {
      return;
    }

    this.isRecording = false;
    const sessionDuration = this.sessionStartTime ? Date.now() - this.sessionStartTime : 0;
    logger.info('Stopping speech recognition session', {
      provider: this.provider,
      sessionDuration: `${sessionDuration}ms`
    });

    if (this.provider === 'azure' && this.recognizer) {
      try {
        this.recognizer.stopContinuousRecognitionAsync(
          () => {
            this._finalizeStop('Recording stopped');
          },
          (error) => {
            logger.error('Error during recognition stop', { error: error.toString() });
            this._finalizeStop('Recording stopped');
          }
        );
      } catch (error) {
        logger.error('Error stopping recognizer', { error: error.message });
        this._finalizeStop('Recording stopped');
      }
      return;
    }

    if (this.provider === 'whisper') {
      this._finalizeWhisperStop();
      return;
    }

    if (this.provider === 'deepgram') {
      try {
        if (this.dgConnection && this.dgConnection.readyState === 1) {
          this.dgConnection.send(JSON.stringify({ type: 'CloseStream' }));
        }
      } catch (_) {}
      this._finalizeStop('Recording stopped');
      return;
    }

    this._finalizeStop('Recording stopped');
  }

  async _finalizeWhisperStop() {
    if (this.segmentTimer) {
      clearInterval(this.segmentTimer);
      this.segmentTimer = null;
    }

    if (this.recording) {
      try {
        this.recording.stop();
      } catch (error) {
        logger.error('Error stopping audio recording', { error: error.message });
      }
      this.recording = null;
    }

    try {
      await this._flushWhisperSegment({ final: true });
    } catch (error) {
      logger.error('Final Whisper transcription failed', { error: error.message });
      this.emit('error', `Whisper transcription failed: ${error.message}`);
    } finally {
      this._finalizeStop('Recording stopped');
    }
  }

  _finalizeStop(statusMessage) {
    this._cleanup();
    this.emit('recording-stopped');
    this.emit('status', statusMessage);
    if (global.windowManager) {
      global.windowManager.handleRecordingStopped();
    }
  }

  _cleanup() {
    if (this.segmentTimer) {
      clearInterval(this.segmentTimer);
      this.segmentTimer = null;
    }

    if (this.dgKeepAlive) {
      clearInterval(this.dgKeepAlive);
      this.dgKeepAlive = null;
    }

    if (this.dgConnection) {
      try {
        if (typeof this.dgConnection.terminate === 'function') this.dgConnection.terminate();
        else if (typeof this.dgConnection.close === 'function') this.dgConnection.close();
      } catch (_) {}
      this.dgConnection = null;
      this.dgReady = false;
    }

    if (this.recognizer) {
      try {
        this.recognizer.close();
      } catch (error) {
        logger.error('Error closing recognizer', { error: error.message });
      }
      this.recognizer = null;
    }

    if (this.audioConfig) {
      try {
        if (typeof this.audioConfig.close === 'function') {
          this.audioConfig.close();
        }
      } catch (error) {
        logger.error('Error closing audio config', { error: error.message });
      }
      this.audioConfig = null;
    }

    if (this.recording) {
      try {
        this.recording.stop();
      } catch (error) {
        logger.error('Error stopping audio recording', { error: error.message });
      }
      this.recording = null;
    }

    if (this.pushStream) {
      try {
        if (typeof this.pushStream.close === 'function') {
          this.pushStream.close();
        }
      } catch (error) {
        logger.error('Error closing push stream', { error: error.message });
      }
      this.pushStream = null;
    }

    this.segmentBuffers = [];
    this.segmentBytes = 0;
    this._resetSpeakerBuffers();
    this._audioDataLogged = false;
  }

  _getSpeakerList() {
    const map = config.get('audio.channelMap') || { me: [0] };
    return Object.keys(map);
  }

  _resetSpeakerBuffers() {
    this.speakerBuffers = {};
    this.speakerBytes = {};
    this.transcriptionInFlight = {};
    for (const sp of this._getSpeakerList()) {
      this.speakerBuffers[sp] = [];
      this.speakerBytes[sp] = 0;
      this.transcriptionInFlight[sp] = false;
    }
  }

  async recognizeFromFile(audioFilePath) {
    if (this.provider === 'azure') {
      if (!this.speechConfig) {
        throw new Error('Speech service not initialized');
      }

      if (!fs.existsSync(audioFilePath)) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }

      const audioConfig = sdk.AudioConfig.fromWavFileInput(audioFilePath);
      const recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);

      return await new Promise((resolve, reject) => {
        recognizer.recognizeOnceAsync(
          (result) => {
            resolve(result.reason === sdk.ResultReason.RecognizedSpeech ? result.text : '');
            recognizer.close();
            audioConfig.close();
          },
          (error) => {
            reject(new Error(`File recognition error: ${error}`));
            recognizer.close();
            audioConfig.close();
          }
        );
      });
    }

    if (this.provider === 'whisper') {
      return this._transcribeWhisperFile(audioFilePath);
    }

    throw new Error('Speech service not initialized');
  }

  async testConnection() {
    if (this.provider === 'azure') {
      if (!this.speechConfig) {
        throw new Error('Speech service not initialized');
      }

      try {
        const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
        const recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);
        recognizer.close();
        audioConfig.close();
        return { success: true, message: 'Azure connection test successful' };
      } catch (error) {
        return { success: false, message: error.message };
      }
    }

    if (this.provider === 'whisper') {
      return {
        success: !!this.whisperCommand,
        message: this.whisperCommand ? 'Local Whisper CLI detected' : 'Local Whisper CLI not found'
      };
    }

    return { success: false, message: 'Speech service not initialized' };
  }

  getStatus() {
    return {
      provider: this.provider,
      isRecording: this.isRecording,
      isInitialized: this.provider === 'azure' ? !!this.speechConfig : !!this.whisperCommand,
      sessionDuration: this.sessionStartTime ? Date.now() - this.sessionStartTime : 0,
      retryCount: this.retryCount,
      effectiveSettings: {
        speechProvider: this.provider,
        azureKey: this._getSetting('azureKey') || '',
        azureRegion: this._getSetting('azureRegion') || process.env.AZURE_SPEECH_REGION || '',
        whisperCommand: this._getSetting('whisperCommand') || process.env.WHISPER_COMMAND || '',
        whisperModelDir: this._getWhisperModelDir(),
        whisperModel: this._getWhisperModel(),
        whisperLanguage: this._getWhisperLanguage(),
        whisperSegmentMs: String(this._getWhisperSegmentMs())
      },
      config: {
        azure: config.get('speech.azure') || {},
        whisper: config.get('speech.whisper') || {},
        selectedProvider: this.provider
      }
    };
  }

  isAvailable() {
    if (this.provider === 'azure') {
      return !!this.speechConfig && !!this.available;
    }

    if (this.provider === 'whisper') {
      return !!this.whisperCommand && !!this.available;
    }

    return false;
  }

  updateSettings(settings = {}) {
    const speechKeys = ['speechProvider', 'azureKey', 'azureRegion', 'whisperCommand', 'whisperModelDir', 'whisperModel', 'whisperLanguage', 'whisperSegmentMs'];
    let changed = false;

    for (const key of speechKeys) {
      if (Object.prototype.hasOwnProperty.call(settings, key)) {
        this.runtimeSettings[key] = settings[key];
        changed = true;
      }
    }

    if (changed) {
      this.initializeClient();
    }

    return this.getStatus();
  }

  _getConfiguredProvider() {
    const provider = String(this._getSetting('speechProvider') || process.env.SPEECH_PROVIDER || config.get('speech.provider') || '').trim().toLowerCase();

    if (provider === 'azure' || provider === 'whisper' || provider === 'deepgram') {
      return provider;
    }

    // Auto: prefer Deepgram (cloud STT) when a key is present.
    if (this._getDeepgramApiKey()) {
      return 'deepgram';
    }

    const hasAzure = !!((this._getSetting('azureKey') || process.env.AZURE_SPEECH_KEY) &&
      (this._getSetting('azureRegion') || process.env.AZURE_SPEECH_REGION));

    if (hasAzure) {
      return 'azure';
    }

    return 'whisper';
  }

  _getDeepgramApiKey() {
    return (this._getSetting('deepgramKey') || process.env.DEEPGRAM_API_KEY || '').trim();
  }

  _getWhisperModel() {
    return this._getSetting('whisperModel') || process.env.WHISPER_MODEL || config.get('speech.whisper.model') || 'base';
  }

  _getWhisperModelDir() {
    return this._getSetting('whisperModelDir') || process.env.WHISPER_MODEL_DIR || '';
  }

  _getWhisperLanguage() {
    return this._getSetting('whisperLanguage') || process.env.WHISPER_LANGUAGE || config.get('speech.whisper.language') || 'en';
  }

  _getWhisperSegmentMs() {
    const rawValue = this._getSetting('whisperSegmentMs') || process.env.WHISPER_SEGMENT_MS || config.get('speech.whisper.segmentMs') || 4000;
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? Math.max(2000, parsed) : 4000;
  }

  _getSetting(key) {
    const value = this.runtimeSettings[key];
    return value === '' ? null : value;
  }

  _resolveWhisperCommand() {
    const configured = this._getSetting('whisperCommand') || process.env.WHISPER_COMMAND;
    const candidates = [];

    if (configured) {
      candidates.push(...this._expandConfiguredWhisperCandidates(configured));
    }

    candidates.push({ command: 'whisper', baseArgs: [] });
    candidates.push({ command: 'whisper.exe', baseArgs: [] });
    candidates.push({ command: 'py', baseArgs: ['-3', '-m', 'whisper'] });
    candidates.push({ command: 'python3', baseArgs: ['-m', 'whisper'] });
    candidates.push({ command: 'python', baseArgs: ['-m', 'whisper'] });

    for (const candidate of candidates) {
      if (!candidate || !candidate.command) {
        continue;
      }

      const probe = spawnSync(candidate.command, [...candidate.baseArgs, '--help'], {
        encoding: 'utf8',
        timeout: 5000
      });

      const output = `${probe.stdout || ''}\n${probe.stderr || ''}`;
      if (!probe.error && probe.status === 0 && !output.includes('No module named whisper')) {
        return candidate;
      }
    }

    return null;
  }

  _expandConfiguredWhisperCandidates(rawCommand) {
    const parsed = this._parseCommand(rawCommand);
    if (!parsed) {
      return [];
    }

    const candidates = [parsed];
    const resolvedPath = path.resolve(parsed.command);

    if (resolvedPath !== parsed.command) {
      candidates.push({ command: resolvedPath, baseArgs: parsed.baseArgs });
    }

    if (process.platform === 'win32') {
      if (!/\.(exe|cmd|bat)$/i.test(parsed.command)) {
        candidates.push({ command: `${parsed.command}.exe`, baseArgs: parsed.baseArgs });
        candidates.push({ command: `${parsed.command}.cmd`, baseArgs: parsed.baseArgs });
        candidates.push({ command: `${resolvedPath}.exe`, baseArgs: parsed.baseArgs });
        candidates.push({ command: `${resolvedPath}.cmd`, baseArgs: parsed.baseArgs });
      }
    }

    return candidates;
  }

  _parseCommand(rawCommand) {
    const parts = String(rawCommand || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return null;
    }

    return {
      command: parts[0],
      baseArgs: parts.slice(1)
    };
  }

  /**
   * Resolve an absolute path to ffmpeg. A .app launched from Finder inherits a
   * minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin) without Homebrew, so `spawn('ffmpeg')`
   * fails with ENOENT → no audio → no transcription. If the configured value is a bare
   * name, probe the usual install locations and fall back to the bare name (dev shells
   * with a full PATH still work).
   */
  _resolveFfmpeg(cmd) {
    try {
      if (cmd && cmd.includes('/')) return cmd; // already an absolute/relative path
      const fs = require('fs');
      const candidates = [
        '/opt/homebrew/bin/ffmpeg',  // Apple Silicon Homebrew
        '/usr/local/bin/ffmpeg',     // Intel Homebrew
        '/opt/local/bin/ffmpeg',     // MacPorts
        '/usr/bin/ffmpeg'
      ];
      for (const p of candidates) {
        try { if (fs.existsSync(p)) { logger.info('Resolved ffmpeg path', { path: p }); return p; } } catch (_) {}
      }
    } catch (_) {}
    return cmd || 'ffmpeg';
  }

  _startMicrophoneCapture() {
    // macOS sox/coreaudio cannot capture multichannel (mono only), so we capture the
    // Aggregate Device via ffmpeg/avfoundation, which exposes all channels. Output is raw
    // interleaved s16le PCM piped to _handleAudioChunk (same format the deinterleaver expects).
    // NOTE: see _resolveFfmpeg — a Finder-launched .app has a minimal PATH without
    // /opt/homebrew/bin, so a bare 'ffmpeg' spawn fails with ENOENT (no audio, no
    // transcription). We resolve an absolute path.
    const sampleRate = config.get('audio.sampleRateHertz') || 16000;
    const multichannelProvider = this.provider === 'whisper' || this.provider === 'deepgram';
    const channels = multichannelProvider ? (config.get('audio.channels') || 1) : 1;
    const deviceName = config.get('audio.deviceName') || 'OpenCluely In';
    const ffmpegCmd = this._resolveFfmpeg(config.get('audio.captureCmd') || 'ffmpeg');
    this.captureChannels = channels;

    const args = [
      '-f', 'avfoundation',
      '-i', `:${deviceName}`,
      '-ac', String(channels),
      '-ar', String(sampleRate),
      '-f', 's16le',
      '-loglevel', 'error',
      'pipe:1'
    ];

    try {
      const proc = spawn(ffmpegCmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      this.audioProgram = ffmpegCmd;
      // Wrap the ffmpeg process to keep the .stream()/.stop() shape the rest of the code uses.
      this.recording = {
        proc,
        stream: () => proc.stdout,
        stop: () => { try { proc.kill('SIGKILL'); } catch (_) {} }
      };

      proc.stdout.on('data', (chunk) => this._handleAudioChunk(chunk));

      proc.stderr.on('data', (d) => {
        const line = d.toString().trim();
        if (line) logger.debug('ffmpeg capture stderr', { line });
      });

      proc.on('error', (error) => {
        logger.error('ffmpeg capture failed to start', { error: error.message, cmd: ffmpegCmd });
        this.emit('error', `Audio capture (ffmpeg) failed to start: ${error.message}. Is ffmpeg installed and is the "${deviceName}" device available?`);
        this.recording = null;
      });

      proc.on('exit', (code, signal) => {
        logger.info('ffmpeg capture exited', { code, signal });
        if (this.isRecording && code && code !== 0) {
          this.emit('error', `Audio capture stopped unexpectedly (ffmpeg exit ${code}).`);
        }
      });

      logger.info('Microphone capture started via ffmpeg', { deviceName, channels, sampleRate });
    } catch (error) {
      logger.error('Failed to spawn ffmpeg capture', { error: error.message });
      this.emit('error', `Could not start audio capture: ${error.message}`);
    }
  }

  _handleAudioChunk(chunk) {
    if (!chunk || !chunk.length || !this.isRecording) {
      return;
    }

    if (this.provider === 'azure' && this.pushStream) {
      try {
        this.pushStream.write(chunk);
      } catch (error) {
        logger.error('Error writing audio data to Azure push stream', { error: error.message });
      }
      return;
    }

    if (this.provider === 'deepgram') {
      if (!this.dgConnection || !this.dgReady) return;
      const channels = this.captureChannels || 1;
      let payload;
      if (channels <= 1) {
        // Single channel: send as-is (channel 0 = me, them silent).
        payload = chunk;
      } else {
        // Downmix to 2 interleaved channels: ch0 = me, ch1 = them.
        const perSpeaker = this._deinterleaveChunk(chunk, channels); // { me: monoBuf, them: monoBuf }
        const me = perSpeaker.me || Buffer.alloc(0);
        const them = perSpeaker.them || Buffer.alloc(me.length);
        const frames = Math.floor(me.length / 2);
        payload = Buffer.alloc(frames * 4); // 2 channels * 2 bytes
        // Per-channel pause: write silence for a paused channel but keep the
        // stream flowing so the Deepgram WS stays open and timing is intact.
        const muteMe = !!this.pauseMe;
        const muteThem = !!this.pauseThem;
        for (let f = 0; f < frames; f++) {
          payload.writeInt16LE(muteMe ? 0 : me.readInt16LE(f * 2), f * 4);
          payload.writeInt16LE((muteThem || f * 2 >= them.length) ? 0 : them.readInt16LE(f * 2), f * 4 + 2);
        }
      }
      try {
        this.dgConnection.send(payload);
      } catch (error) {
        logger.error('Error sending audio to Deepgram', { error: error.message });
      }
      return;
    }

    if (this.provider === 'whisper') {
      const channels = this.captureChannels || 1;

      if (channels <= 1) {
        // Single-channel fallback: everything is attributed to "me".
        const sp = 'me';
        if (!this.speakerBuffers[sp]) { this.speakerBuffers[sp] = []; this.speakerBytes[sp] = 0; }
        this.speakerBuffers[sp].push(Buffer.from(chunk));
        this.speakerBytes[sp] += chunk.length;
        return;
      }

      const perSpeaker = this._deinterleaveChunk(chunk, channels);
      for (const sp of Object.keys(perSpeaker)) {
        if (!this.speakerBuffers[sp]) { this.speakerBuffers[sp] = []; this.speakerBytes[sp] = 0; }
        this.speakerBuffers[sp].push(perSpeaker[sp]);
        this.speakerBytes[sp] += perSpeaker[sp].length;
      }
    }
  }

  /**
   * Split interleaved int16-LE PCM into one mono buffer per speaker, using
   * config.audio.channelMap (e.g. { me: [0], them: [1,2] }). Channels listed
   * for a speaker are averaged (downmixed) to mono.
   */
  _deinterleaveChunk(chunk, channels) {
    const map = config.get('audio.channelMap') || { me: [0] };
    const bytesPerSample = 2;
    const frameBytes = channels * bytesPerSample;
    const numFrames = Math.floor(chunk.length / frameBytes);

    const out = {};
    for (const sp of Object.keys(map)) {
      out[sp] = Buffer.alloc(numFrames * bytesPerSample);
    }

    for (let f = 0; f < numFrames; f++) {
      const base = f * frameBytes;
      for (const sp of Object.keys(map)) {
        const chans = map[sp].filter(c => c >= 0 && c < channels);
        let sum = 0;
        let n = 0;
        for (const c of chans) {
          sum += chunk.readInt16LE(base + c * bytesPerSample);
          n++;
        }
        let v = n > 0 ? Math.round(sum / n) : 0;
        if (v > 32767) v = 32767; else if (v < -32768) v = -32768;
        out[sp].writeInt16LE(v, f * bytesPerSample);
      }
    }

    return out;
  }

  /** Root-mean-square amplitude of an int16-LE PCM buffer (cheap VAD). */
  _rms(buffer) {
    const n = Math.floor(buffer.length / 2);
    if (n === 0) return 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const s = buffer.readInt16LE(i * 2);
      sumSq += s * s;
    }
    return Math.sqrt(sumSq / n);
  }

  async _flushWhisperSegment({ final }) {
    const vadThreshold = config.get('audio.vadThreshold') || 0;
    const speakers = Object.keys(this.speakerBuffers);
    // Each speaker stream is transcribed independently and in parallel.
    await Promise.all(
      speakers.map(sp => this._flushSpeakerSegment(sp, vadThreshold, final))
    );
  }

  async _flushSpeakerSegment(speaker, vadThreshold, final) {
    if (this.transcriptionInFlight[speaker]) {
      // A transcription for this speaker is still running; let audio keep
      // accumulating and pick it up on the next tick.
      return;
    }

    const bytes = this.speakerBytes[speaker] || 0;
    if (!bytes) {
      return;
    }

    const audioBuffer = Buffer.concat(this.speakerBuffers[speaker], bytes);
    this.speakerBuffers[speaker] = [];
    this.speakerBytes[speaker] = 0;

    // Cheap VAD: skip near-silent segments so we don't run whisper on silence.
    if (!final && vadThreshold > 0 && this._rms(audioBuffer) < vadThreshold) {
      return;
    }

    this.transcriptionInFlight[speaker] = true;
    try {
      const transcript = await this._transcribeWhisperBuffer(audioBuffer);
      if (transcript && transcript.trim()) {
        this.emit('transcription', { text: transcript.trim(), speaker });
      }
    } catch (error) {
      logger.error('Whisper segment transcription failed', { error: error.message, speaker });
    } finally {
      this.transcriptionInFlight[speaker] = false;
    }
  }

  async _transcribeWhisperBuffer(audioBuffer) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencluely-whisper-'));
    const audioFilePath = path.join(tempDir, 'segment.wav');

    try {
      fs.writeFileSync(audioFilePath, this._createWavBuffer(audioBuffer));
      return await this._transcribeWhisperFile(audioFilePath);
    } finally {
      this._removeTempDir(tempDir);
    }
  }

  async _transcribeWhisperFile(audioFilePath) {
    if (!this.whisperCommand) {
      throw new Error('Local Whisper CLI not configured');
    }

    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencluely-whisper-out-'));
    const args = [
      ...this.whisperCommand.baseArgs,
      audioFilePath,
      '--model', this._getWhisperModel(),
      '--language', this._getWhisperLanguage(),
      '--task', 'transcribe',
      '--output_format', 'txt',
      '--output_dir', outputDir,
      '--verbose', 'False',
      '--fp16', 'False'
    ];

    if (this._getWhisperModelDir()) {
      args.push('--model_dir', this._getWhisperModelDir());
    }

    try {
      await new Promise((resolve, reject) => {
        const child = spawn(this.whisperCommand.command, args, {
          stdio: ['ignore', 'pipe', 'pipe']
        });

        let stderr = '';
        child.stderr.on('data', (chunk) => {
          stderr += chunk.toString();
        });

        child.on('error', (error) => {
          reject(error);
        });

        child.on('close', (code) => {
          if (code === 0) {
            resolve();
            return;
          }

          reject(new Error(stderr.trim() || `Whisper exited with code ${code}`));
        });
      });

      const transcriptPath = path.join(outputDir, `${path.parse(audioFilePath).name}.txt`);
      if (!fs.existsSync(transcriptPath)) {
        return '';
      }

      return fs.readFileSync(transcriptPath, 'utf8').trim();
    } finally {
      this._removeTempDir(outputDir);
    }
  }

  _createWavBuffer(rawPcmBuffer) {
    const header = Buffer.alloc(44);
    const sampleRate = 16000;
    const channels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + rawPcmBuffer.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(rawPcmBuffer.length, 40);

    return Buffer.concat([header, rawPcmBuffer]);
  }

  _removeTempDir(tempDir) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      logger.error('Failed to remove Whisper temp directory', {
        tempDir,
        error: error.message
      });
    }
  }
}

module.exports = new SpeechService();
