document.addEventListener('DOMContentLoaded', () => {
    const api = window.electronAPI || {};

    // ----- Tab switching -----
    const tabs = document.querySelectorAll('.tab');
    const panels = document.querySelectorAll('.panel');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const name = tab.dataset.tab;
            tabs.forEach(t => t.classList.toggle('active', t === tab));
            panels.forEach(p => p.classList.toggle('active', p.id === `panel-${name}`));
        });
    });

    // ----- Elements -----
    const closeButton = document.getElementById('closeButton');
    const quitButton = document.getElementById('quitButton');
    const undetectableToggle = document.getElementById('undetectableToggle');
    const launchAtLoginToggle = document.getElementById('launchAtLoginToggle');
    const iconGrid = document.getElementById('iconGrid');
    const transcriptionLanguage = document.getElementById('transcriptionLanguage');
    const outputLanguage = document.getElementById('outputLanguage');
    const windowGap = document.getElementById('windowGap');
    const sttToggle = document.getElementById('sttToggle');
    const obsidianAutoSaveToggle = document.getElementById('obsidianAutoSaveToggle');
    const calendarConnectBtn = document.getElementById('calendarConnectBtn');
    const calendarStatus = document.getElementById('calendarStatus');
    const appVersion = document.getElementById('appVersion');
    const profileEmail = document.getElementById('profileEmail');
    const profileGoogle = document.getElementById('profileGoogle');

    const save = (partial) => { if (api.saveSettings) api.saveSettings(partial); };

    // ----- Load current settings -----
    const load = (s) => {
        if (!s) return;
        if (undetectableToggle && s.undetectable !== undefined) undetectableToggle.checked = !!s.undetectable;
        if (launchAtLoginToggle && s.launchAtLogin !== undefined) launchAtLoginToggle.checked = !!s.launchAtLogin;
        if (transcriptionLanguage && s.transcriptionLanguage) transcriptionLanguage.value = s.transcriptionLanguage;
        if (outputLanguage && s.outputLanguage) outputLanguage.value = s.outputLanguage;
        if (windowGap && s.windowGap) windowGap.value = s.windowGap;
        if (sttToggle && s.sttEnabled !== undefined) sttToggle.checked = !!s.sttEnabled;
        if (obsidianAutoSaveToggle && s.obsidianAutoSave !== undefined) obsidianAutoSaveToggle.checked = !!s.obsidianAutoSave;
        if (appVersion && s.version) appVersion.textContent = 'v' + String(s.version).replace(/^v/, '');
        if (profileEmail && s.userEmail) profileEmail.textContent = s.userEmail;
        const selected = s.selectedIcon || s.appIcon;
        if (selected && iconGrid) {
            iconGrid.querySelectorAll('.icon-option').forEach(o =>
                o.classList.toggle('selected', o.dataset.icon === selected));
        }
        if (s.calendarConnected && calendarStatus) {
            calendarStatus.textContent = s.calendarAccount ? `Connected: ${s.calendarAccount}` : 'Connected';
        }
    };
    if (api.getSettings) api.getSettings().then(load).catch(() => {});
    if (window.api && window.api.receive) window.api.receive('load-settings', load);

    // ----- Wire controls -----
    if (undetectableToggle) undetectableToggle.addEventListener('change', () => {
        // toggleUndetectability flips and returns the new state; keep UI in sync.
        if (api.toggleUndetectability) api.toggleUndetectability().then((state) => {
            undetectableToggle.checked = !!state;
        }).catch(() => {});
    });
    if (launchAtLoginToggle) launchAtLoginToggle.addEventListener('change', () => {
        if (api.setLaunchAtLogin) api.setLaunchAtLogin(launchAtLoginToggle.checked).catch(() => {});
    });
    if (iconGrid) iconGrid.querySelectorAll('.icon-option').forEach(option => {
        option.addEventListener('click', () => {
            iconGrid.querySelectorAll('.icon-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            save({ selectedIcon: option.dataset.icon });
        });
    });
    if (transcriptionLanguage) transcriptionLanguage.addEventListener('change', () =>
        save({ transcriptionLanguage: transcriptionLanguage.value }));
    if (outputLanguage) outputLanguage.addEventListener('change', () =>
        save({ outputLanguage: outputLanguage.value }));
    if (windowGap) windowGap.addEventListener('change', () =>
        save({ windowGap: parseInt(windowGap.value, 10) || 20 }));
    if (sttToggle) sttToggle.addEventListener('change', () =>
        save({ sttEnabled: sttToggle.checked }));
    if (obsidianAutoSaveToggle) obsidianAutoSaveToggle.addEventListener('change', () =>
        save({ obsidianAutoSave: obsidianAutoSaveToggle.checked }));

    const calendarCodeRow = document.getElementById('calendarCodeRow');
    const calendarCode = document.getElementById('calendarCode');
    const calendarCodeSubmit = document.getElementById('calendarCodeSubmit');

    if (calendarConnectBtn) calendarConnectBtn.addEventListener('click', () => {
        if (!api.connectGoogleCalendar) return;
        calendarConnectBtn.textContent = 'Connecting…';
        calendarConnectBtn.disabled = true;
        api.connectGoogleCalendar().then((res) => {
            if (calendarStatus && res && res.message) calendarStatus.textContent = res.message.slice(0, 160);
            if (calendarCodeRow) calendarCodeRow.style.display = (res && res.needsCode) ? 'block' : 'none';
            if (res && res.connected && calendarStatus) calendarStatus.textContent = 'Connected ✅';
            calendarConnectBtn.textContent = 'Connect Google';
            calendarConnectBtn.disabled = false;
        }).catch(() => {
            calendarConnectBtn.textContent = 'Connect Google';
            calendarConnectBtn.disabled = false;
        });
    });
    if (calendarCodeSubmit) calendarCodeSubmit.addEventListener('click', () => {
        if (!api.submitGoogleAuthCode || !calendarCode) return;
        const code = calendarCode.value.trim();
        if (!code) return;
        calendarCodeSubmit.textContent = 'Submitting…';
        calendarCodeSubmit.disabled = true;
        api.submitGoogleAuthCode(code).then((res) => {
            if (calendarStatus && res && res.message) calendarStatus.textContent = res.message.slice(0, 160);
            if (res && res.connected && calendarCodeRow) calendarCodeRow.style.display = 'none';
            calendarCodeSubmit.textContent = 'Submit';
            calendarCodeSubmit.disabled = false;
        }).catch(() => { calendarCodeSubmit.textContent = 'Submit'; calendarCodeSubmit.disabled = false; });
    });
    if (window.api && window.api.receive) window.api.receive('calendar-status', (data) => {
        if (calendarStatus && data && data.message) calendarStatus.textContent = data.message.slice(0, 140);
    });

    // ----- Deepgram API key -----
    const deepgramKey = document.getElementById('deepgramKey');
    const deepgramSave = document.getElementById('deepgramSave');
    const deepgramState = document.getElementById('deepgramState');
    if (api.getDeepgramStatus) api.getDeepgramStatus().then((s) => {
        if (deepgramState) deepgramState.textContent = s && s.hasKey ? `Configurada (${s.masked})` : 'Sin configurar';
    }).catch(() => {});
    if (deepgramSave && deepgramKey) deepgramSave.addEventListener('click', () => {
        const k = deepgramKey.value.trim();
        if (!k || !api.setDeepgramKey) return;
        deepgramSave.textContent = 'Guardando…'; deepgramSave.disabled = true;
        api.setDeepgramKey(k).then((res) => {
            if (res && res.success) { if (deepgramState) deepgramState.textContent = `Configurada (${res.masked})`; deepgramKey.value = ''; }
            else if (deepgramState) deepgramState.textContent = (res && res.error) || 'Error';
        }).catch(() => {}).finally(() => { deepgramSave.textContent = 'Guardar'; deepgramSave.disabled = false; });
    });

    // ----- Customizable keyboard shortcuts -----
    const keybindList = document.getElementById('keybindList');
    function prettyAccel(a) {
        if (!a) return '—';
        return a.replace('CommandOrControl', '⌘').replace('Command', '⌘').replace('Control', '⌃')
                .replace('Shift', '⇧').replace('Alt', '⌥')
                .replace(/\bUp\b/, '↑').replace(/\bDown\b/, '↓').replace(/\bLeft\b/, '←').replace(/\bRight\b/, '→')
                .split('+').map(s => `<span class="kbd">${s}</span>`).join('');
    }
    function eventToAccelerator(e) {
        if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return null; // modifier alone
        const mods = [];
        if (e.metaKey) mods.push('CommandOrControl');
        if (e.ctrlKey && !e.metaKey) mods.push('Control');
        if (e.altKey) mods.push('Alt');
        if (e.shiftKey) mods.push('Shift');
        const map = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', ' ': 'Space' };
        let key = map[e.key] || (e.key.length === 1 ? e.key.toUpperCase() : e.key);
        const isArrow = ['Up', 'Down', 'Left', 'Right'].includes(key);
        if (!mods.length && !isArrow) return null; // require a modifier (except arrows)
        return [...mods, key].join('+');
    }
    function renderKeybinds(binds, labels) {
        if (!keybindList) return;
        keybindList.innerHTML = '';
        Object.keys(labels).forEach((id) => {
            const row = document.createElement('div');
            row.className = 'keybind';
            row.innerHTML = `<span>${labels[id]}</span><span class="kb-accel" data-id="${id}" style="cursor:pointer;">${prettyAccel(binds[id])}</span>`;
            keybindList.appendChild(row);
        });
        keybindList.querySelectorAll('.kb-accel').forEach((el) => {
            el.addEventListener('click', () => startCapture(el));
        });
    }
    let capturing = null;
    function startCapture(el) {
        if (capturing) return;
        capturing = el;
        if (api.suspendShortcuts) api.suspendShortcuts(true).catch(() => {});
        el.innerHTML = '<span class="kbd">Pulsa teclas…</span>';
        const onKey = (e) => {
            e.preventDefault(); e.stopPropagation();
            if (e.key === 'Escape') { cleanup(); if (api.getKeybinds) api.getKeybinds().then(d => renderKeybinds(d.binds, d.labels)); return; }
            const accel = eventToAccelerator(e);
            if (!accel) return; // wait for a non-modifier key
            const id = el.dataset.id;
            cleanup();
            if (api.setKeybind) api.setKeybind(id, accel).then((res) => {
                if (res && res.success) renderKeybinds(res.binds, lastLabels);
            }).catch(() => {});
        };
        const cleanup = () => {
            document.removeEventListener('keydown', onKey, true);
            capturing = null;
            if (api.suspendShortcuts) api.suspendShortcuts(false).catch(() => {});
        };
        document.addEventListener('keydown', onKey, true);
    }
    let lastLabels = {};
    if (api.getKeybinds) api.getKeybinds().then((d) => { lastLabels = d.labels; renderKeybinds(d.binds, d.labels); }).catch(() => {});

    // ----- Close / Quit -----
    if (closeButton) closeButton.addEventListener('click', () => {
        if (window.api && window.api.send) window.api.send('close-settings');
    });
    if (quitButton) quitButton.addEventListener('click', () => {
        try {
            if (window.api && window.api.send) window.api.send('quit-app');
            if (api.quit) api.quit();
            setTimeout(() => window.close(), 500);
        } catch (_) { window.close(); }
    });
});
