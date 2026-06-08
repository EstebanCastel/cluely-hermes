const logger = require('../core/logger').createServiceLogger('CONTEXT');

/**
 * Live meeting context: a rolling, diarized transcript of the call plus the most
 * recent screenshot. The brain (Hermes) pulls this on every query so it is "always
 * seeing and hearing" what happens in the meeting.
 *
 * Speaker labels shown to the brain/UI:
 *   me   -> "Yo"
 *   them -> "Interlocutor"
 */
const SPEAKER_LABELS = {
  me: 'Yo',
  them: 'Interlocutor'
};

class ContextService {
  constructor() {
    this.transcript = [];          // [{ speaker, label, text, timestamp }]
    this.maxLines = 200;           // rolling cap; keep recent context bounded
    this.screenshot = null;        // { buffer, mimeType, timestamp }
  }

  /**
   * Append a diarized transcript line.
   * @param {string} speaker - 'me' | 'them'
   * @param {string} text
   */
  addTranscriptLine(speaker, text) {
    const clean = (text || '').trim();
    if (!clean) return;

    const label = SPEAKER_LABELS[speaker] || speaker || 'Desconocido';
    this.transcript.push({
      speaker,
      label,
      text: clean,
      timestamp: new Date().toISOString()
    });

    if (this.transcript.length > this.maxLines) {
      this.transcript = this.transcript.slice(-this.maxLines);
    }

    logger.debug('Transcript line added to live context', { speaker, length: clean.length });
  }

  /** Store the latest screenshot (PNG/JPEG buffer from capture.service). */
  setScreenshot(buffer, mimeType = 'image/png') {
    if (!buffer || !Buffer.isBuffer(buffer)) return;
    this.screenshot = { buffer, mimeType, timestamp: new Date().toISOString() };
    logger.debug('Live screenshot updated', { bytes: buffer.length, mimeType });
  }

  /** Human/brain-readable transcript, most recent `maxLines` lines. */
  getTranscriptText(maxLines = 60) {
    return this.transcript
      .slice(-maxLines)
      .map(line => `[${line.label}]: ${line.text}`)
      .join('\n');
  }

  /**
   * Build the live-context payload injected into every brain query.
   * @param {object} opts
   * @param {boolean} [opts.includeScreenshot=true]
   * @param {number} [opts.maxLines=60]
   * @returns {{ transcriptText: string, hasTranscript: boolean, screenshot: ({dataUrl:string, mimeType:string}|null) }}
   */
  getLiveContext({ includeScreenshot = true, maxLines = 60 } = {}) {
    const transcriptText = this.getTranscriptText(maxLines);

    let screenshot = null;
    if (includeScreenshot && this.screenshot && this.screenshot.buffer) {
      const base64 = this.screenshot.buffer.toString('base64');
      screenshot = {
        dataUrl: `data:${this.screenshot.mimeType};base64,${base64}`,
        mimeType: this.screenshot.mimeType
      };
    }

    return {
      transcriptText,
      hasTranscript: this.transcript.length > 0,
      screenshot
    };
  }

  /** Clear context (e.g. when a meeting/session ends). */
  clear() {
    const lines = this.transcript.length;
    this.transcript = [];
    this.screenshot = null;
    logger.info('Live context cleared', { clearedLines: lines });
  }
}

module.exports = new ContextService();
