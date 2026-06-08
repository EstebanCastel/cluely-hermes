// Echo single-window hub: chat + history rendered INSIDE the main window
// (no separate windows). Listens to the same IPC the chat window used.
(function () {
  const api = window.electronAPI || {};
  const hubBody = document.getElementById('hubBody');
  const secChat = document.getElementById('hubChat');
  const secHistory = document.getElementById('hubHistorySec');
  const secTranscript = document.getElementById('hubTranscriptSec');
  const messagesEl = document.getElementById('hubMessages');
  const historyEl = document.getElementById('hubHistory');
  const transcriptEl = document.getElementById('hubTranscript');
  if (!hubBody) return;

  const CONV_KEY = 'echo_conversations_v1';
  let conversations = [];
  let current = null; // { id, title, updatedAt, items: [] }

  function load() { try { conversations = JSON.parse(localStorage.getItem(CONV_KEY) || '[]') || []; } catch { conversations = []; } }
  function persist() { try { localStorage.setItem(CONV_KEY, JSON.stringify(conversations.slice(-100))); } catch {} }
  function genId() { return 'c' + Date.now() + Math.floor(Math.random() * 1000); }
  function ensureCurrent() {
    if (!current) { current = { id: genId(), title: 'Chat nuevo', updatedAt: Date.now(), items: [] }; conversations.push(current); }
  }
  function saveItem(item) {
    ensureCurrent();
    current.items.push(item);
    if (item.kind === 'message' && item.type === 'user' && (current.title === 'Chat nuevo' || !current.title)) current.title = item.text.slice(0, 60);
    current.updatedAt = Date.now();
    persist();
  }

  function esc(s) { return (s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
  function fmt(text) {
    if (typeof markdown !== 'undefined' && markdown.toHTML) { try { return markdown.toHTML(text); } catch {} }
    return esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/`(.+?)`/g, '<code>$1</code>').replace(/\n/g, '<br>');
  }
  function scrollBottom() { messagesEl.scrollTop = messagesEl.scrollHeight; }

  function renderMessage(type, text, persistIt = true) {
    const div = document.createElement('div'); div.className = 'msg ' + type;
    const b = document.createElement('div'); b.className = 'bubble';
    if (type === 'assistant') {
      // split fenced code blocks
      const parts = String(text).split(/```/);
      b.innerHTML = '';
      parts.forEach((p, i) => {
        if (i % 2 === 1) {
          const lines = p.split('\n'); if (lines.length && /^[a-zA-Z0-9+#-]+$/.test(lines[0])) lines.shift();
          const pre = document.createElement('pre'); pre.className = 'code'; pre.textContent = lines.join('\n').replace(/^\n/, '');
          const cp = document.createElement('span'); cp.className = 'copy'; cp.textContent = 'Copiar';
          cp.onclick = () => { navigator.clipboard.writeText(pre.textContent).then(() => { cp.textContent = 'Copiado'; setTimeout(() => cp.textContent = 'Copiar', 1200); }); };
          pre.appendChild(cp); b.appendChild(pre);
        } else if (p.trim()) { const span = document.createElement('div'); span.innerHTML = fmt(p); b.appendChild(span); }
      });
    } else { b.textContent = text; }
    div.appendChild(b); messagesEl.appendChild(div); scrollBottom();
    if (persistIt) saveItem({ kind: 'message', type, text });
  }
  function renderImage(dataUrl, persistIt = true) {
    const div = document.createElement('div'); div.className = 'msg user';
    const w = document.createElement('div'); w.className = 'msg-img';
    const img = document.createElement('img'); img.src = dataUrl; img.onclick = () => img.classList.toggle('expanded');
    w.appendChild(img); div.appendChild(w); messagesEl.appendChild(div); scrollBottom();
    if (persistIt) saveItem({ kind: 'image', dataUrl });
  }
  let thinkingEl = null;
  function showThinking() { hideThinking(); const d = document.createElement('div'); d.className = 'msg assistant thinking'; const b = document.createElement('div'); b.className = 'bubble'; d.appendChild(b); messagesEl.appendChild(d); thinkingEl = d; scrollBottom(); }
  function hideThinking() { if (thinkingEl) { thinkingEl.remove(); thinkingEl = null; } }

  function setSection(name) {
    secChat.classList.toggle('active', name === 'chat');
    secHistory.classList.toggle('active', name === 'history');
    if (secTranscript) secTranscript.classList.toggle('active', name === 'transcript');
    hubBody.classList.add('open');
    autoResize();
  }
  function collapse() {
    hubBody.classList.remove('open');
    secChat.classList.remove('active');
    secHistory.classList.remove('active');
    if (secTranscript) secTranscript.classList.remove('active');
    // Drop any manual sizing so the bar returns to its compact width/height.
    manualSize = false;
    const hub = document.getElementById('echoHub');
    if (hub) hub.style.width = '';
    messagesEl.style.maxHeight = '';
    historyEl.style.maxHeight = '';
    autoResize();
  }

  // Auto-fit the window to the hub content. Uses rAF + dedupe so rapid renders
  // (streaming text, scroll) don't fire a storm of setContentSize calls (the flicker).
  // Disabled while the user is manually resizing via the grip.
  let manualSize = false;
  let lastW = 0, lastH = 0, rafPending = false;
  function autoResize() {
    if (manualSize || rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      const hub = document.getElementById('echoHub');
      if (!hub || !api.resizeWindow) return;
      const r = hub.getBoundingClientRect();
      const w = Math.ceil(r.width), h = Math.ceil(r.height) + 4;
      if (w === lastW && h === lastH) return;
      lastW = w; lastH = h;
      api.resizeWindow(w, h);
    });
  }

  // Toggle: clicking History (or ↓) again while it's showing collapses the hub.
  function toggleHistory() {
    if (hubBody.classList.contains('open') && secHistory.classList.contains('active')) { collapse(); }
    else { showHistory(); }
  }

  // ----- Live transcript (inline hub section, NOT a separate window) -----
  // Diarized lines accumulate here regardless of whether the section is visible,
  // so opening it shows the running conversation (Yo / Interlocutor).
  let transcriptInterim = null;
  function addTranscriptLine(speaker, text) {
    if (!transcriptEl) return;
    const empty = transcriptEl.querySelector('.t-empty'); if (empty) empty.remove();
    if (transcriptInterim) { transcriptInterim.remove(); transcriptInterim = null; }
    const div = document.createElement('div');
    div.className = 'tline ' + (speaker === 'them' ? 'them' : 'me');
    const who = speaker === 'them' ? 'Interlocutor' : 'Yo';
    div.innerHTML = '<span class="who"></span><span class="txt"></span>';
    div.querySelector('.who').textContent = who;
    div.querySelector('.txt').textContent = String(text).replace(/^\[(Yo|Interlocutor)\]\s*/, '');
    transcriptEl.appendChild(div);
    if (secTranscript && secTranscript.classList.contains('active')) transcriptEl.scrollTop = transcriptEl.scrollHeight;
  }
  function showTranscript() {
    if (transcriptEl && !transcriptEl.children.length) {
      transcriptEl.innerHTML = '<div class="t-empty">Escuchando… habla o reproduce la llamada.</div>';
    }
    setSection('transcript');
    if (transcriptEl) transcriptEl.scrollTop = transcriptEl.scrollHeight;
  }
  function toggleTranscript() {
    if (hubBody.classList.contains('open') && secTranscript && secTranscript.classList.contains('active')) { collapse(); }
    else { showTranscript(); }
  }

  function showChat() { renderCurrentIfEmpty(); setSection('chat'); }
  function renderCurrentIfEmpty() { if (!current && conversations.length) { /* keep collapsed list separate */ } }

  function newChat() { if (current && current.items.length) persist(); current = null; messagesEl.innerHTML = ''; }

  async function showHistory() {
    historyEl.innerHTML = '';
    // Upcoming meetings (via Hermes/Google).
    let meetings = [];
    try { if (api.getMeetings) meetings = await api.getMeetings(); } catch {}
    if (meetings && meetings.length) {
      historyEl.insertAdjacentHTML('beforeend', '<div class="hub-label">Próximas</div>');
      meetings.slice(0, 8).forEach(m => {
        const d = m.start ? new Date(m.start) : null;
        const mon = d ? d.toLocaleString('en', { month: 'short' }) : '';
        const day = d ? d.getDate() : '';
        const when = d ? d.toLocaleString('en', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
        const row = document.createElement('div'); row.className = 'hub-row';
        row.innerHTML = `<div style="display:flex;align-items:center;min-width:0;"><div class="hub-date"><div class="m">${mon}</div><div class="d">${day}</div></div><div class="t">${esc(m.summary || 'Reunión')}</div></div><div class="meta">${esc(when)}</div>`;
        historyEl.appendChild(row);
      });
    }
    // Past chats.
    load();
    historyEl.insertAdjacentHTML('beforeend', '<div class="hub-label">Conversaciones</div>');
    const sorted = conversations.slice().filter(c => c.items && c.items.length).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (!sorted.length && !(meetings && meetings.length)) { historyEl.innerHTML = '<div class="hub-empty">Nada todavía</div>'; }
    sorted.forEach(c => {
      const row = document.createElement('div'); row.className = 'hub-row';
      const when = c.updatedAt ? new Date(c.updatedAt).toLocaleDateString() : '';
      row.innerHTML = `<div class="t">${esc(c.title || 'Conversación')}</div><div class="meta">${when}</div>`;
      row.onclick = () => openConversation(c.id);
      historyEl.appendChild(row);
    });
    setSection('history');
  }

  function openConversation(id) {
    load(); const c = conversations.find(x => x.id === id); if (!c) return;
    current = c; messagesEl.innerHTML = '';
    (c.items || []).forEach(it => { if (it.kind === 'image') renderImage(it.dataUrl, false); else renderMessage(it.type, it.text, false); });
    setSection('chat');
  }

  // ----- IPC wiring (same events the chat window used) -----
  if (api.onUserMessage) api.onUserMessage((e, d) => { if (d && d.text) { showChat(); renderMessage('user', d.text); showThinking(); } });
  if (api.onScreenshotAttached) api.onScreenshotAttached((e, d) => { if (d && d.dataUrl) { showChat(); renderImage(d.dataUrl); showThinking(); } });
  const onResp = (e, d) => { if (d && d.response) { hideThinking(); showChat(); renderMessage('assistant', d.response); } };
  if (api.onLlmResponse) api.onLlmResponse(onResp);
  if (api.onTranscriptionLlmResponse) api.onTranscriptionLlmResponse(onResp);
  if (api.onShowHistory) api.onShowHistory(() => showHistory());
  // Live diarized transcript (accumulates even when its section is hidden).
  if (api.onTranscriptionReceived) api.onTranscriptionReceived((e, d) => { if (d && d.text) addTranscriptLine(d.speaker, d.text); });
  if (api.onInterimTranscription) api.onInterimTranscription((e, d) => {
    const t = (d && (d.text || d)) || ''; if (!t || !transcriptEl) return;
    const empty = transcriptEl.querySelector('.t-empty'); if (empty) empty.remove();
    if (!transcriptInterim) { transcriptInterim = document.createElement('div'); transcriptInterim.className = 'tline interim'; transcriptEl.appendChild(transcriptInterim); }
    transcriptInterim.textContent = typeof t === 'string' ? t : (t.text || '');
    if (secTranscript && secTranscript.classList.contains('active')) transcriptEl.scrollTop = transcriptEl.scrollHeight;
  });

  // ----- Manual resize grip (bottom-right of the hub body) -----
  // Lets the user drag the chat/history panel to a comfortable size; while dragging
  // we set manualSize so autoResize() stops fighting the user's chosen dimensions.
  const grip = document.getElementById('hubResize');
  if (grip) {
    grip.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      manualSize = true;
      const hub = document.getElementById('echoHub');
      const startRect = hub.getBoundingClientRect();
      const sx = e.screenX, sy = e.screenY;
      const sw = startRect.width, sh = startRect.height;
      const onMove = (ev) => {
        const w = Math.max(360, Math.min(1400, sw + (ev.screenX - sx)));
        const h = Math.max(220, sh + (ev.screenY - sy));
        hub.style.width = w + 'px';
        // The body chrome (bar + paddings) is ~60px; give the scroll areas the rest.
        const inner = Math.max(120, h - 64);
        messagesEl.style.maxHeight = inner + 'px';
        historyEl.style.maxHeight = inner + 'px';
        if (api.resizeWindow) api.resizeWindow(Math.ceil(w), Math.ceil(h) + 4);
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ----- Auto-save toast -----
  // Meetings save automatically when a recording stops (gated by the Obsidian
  // setting). No manual button — just a confirmation toast.
  function toast(text) {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);background:rgba(20,20,26,.95);color:#fff;border:1px solid rgba(255,255,255,.12);padding:8px 14px;border-radius:10px;font-size:12px;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,.5);';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }
  if (api.onMeetingSaved) api.onMeetingSaved(() => toast('Reunión guardada en Obsidian ✅'));

  load();
  // Expose for main-window.js
  window.Hub = { showChat, showHistory, toggleHistory, showTranscript, toggleTranscript, collapse, newChat };
})();
