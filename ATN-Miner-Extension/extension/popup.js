(function () {
  'use strict';
  if (!document || !document.getElementById || !document.body) return;

  const DEFAULT_BACKEND = 'https://api.atncrypto.com';
  const DEFAULT_HB_PATH = '/device/heartbeat';

  const el = (id) => document.getElementById(id);
  const val = (id) => { const x = el(id); return x && typeof x.value === 'string' ? x.value : ''; };
  const setVal = (id, v) => { const x = el(id); if (x) x.value = v; };
  const setText = (id, t) => { const x = el(id); if (x) x.textContent = t; };

  const save = (kv) => chrome.storage.local.set(kv);
  const load = (keys) => new Promise(r => chrome.storage.local.get(keys, r));
  const isWallet = (w) => /^0x[a-fA-F0-9]{40}$/.test((w || '').trim());
  const normWallet = (w) => (w || '').trim().toLowerCase();

  function timeAgo(ts) {
    if (!ts) return '';
    const t = typeof ts === 'number' ? ts : Date.parse(ts);
    if (!t) return '';
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return `${Math.floor(s)}s ago`;
    const m = s / 60; if (m < 60) return `${Math.floor(m)}m ago`;
    const h = m / 60; if (h < 24) return `${Math.floor(h)}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  async function fetchJSON(url, opts) {
    const res = await fetch(url, opts);
    const ct = res.headers.get('content-type') || '';
    const text = await res.text();
    let data = null;
    if (ct.includes('application/json')) { try { data = JSON.parse(text); } catch {} }
    if (!res.ok) {
      const detail = (data && (data.detail || data.message)) || text.slice(0, 160);
      throw new Error(`HTTP ${res.status}: ${detail}`);
    }
    return data ?? JSON.parse(text);
  }

  function lockAll() {
    const w = el('wallet'), d = el('device');
    if (w) { w.readOnly = true; w.classList.add('readonly'); }
    if (d) { d.readOnly = true; d.classList.add('readonly'); }
    ['btnGen','btnSave','btnRegister'].forEach(id => { const b = el(id); if (b) b.disabled = true; });
  }

  // Show extra heartbeat debug from background
  function appendHbDebug(toText) {
    chrome.storage.local.get(
      ['last_hb_time','last_hb_ok','last_hb_status','last_hb_err','last_hb_probe','hb_endpoint','last_hb_method'],
      s => {
        const ep = s.hb_endpoint || s.last_hb_probe || '(probing)';
        const method = s.last_hb_method || '?';
        const t = s.last_hb_time
          ? ` • hb ${timeAgo(s.last_hb_time)} ${s.last_hb_ok ? 'ok' : ('fail ' + (s.last_hb_err || s.last_hb_status))} • ${method} ${ep}`
          : ` • hb: not sent yet`;
        setText('regStatus', toText + t);
      }
    );
  }

  async function checkOnline() {
    const backend = val('backend').trim() || DEFAULT_BACKEND;
    const w = normWallet(val('wallet'));
    const d = (val('device') || '').trim();
    if (!isWallet(w) || !d) return;

    try {
      const url = `${backend}/device/online?wallet=${encodeURIComponent(w)}&device=${encodeURIComponent(d)}`;
      const r = await fetchJSON(url);
      const ok = !!(r && (r.online===true || r.online===1 || r.online==='1' || r.online==='true'));
      appendHbDebug(ok ? 'ONLINE ●' : 'OFFLINE ○');
    } catch (e) {
      appendHbDebug(`NOT CONNECTED ○ • ${e.message || 'network error'}`);
    }
  }

  let statusTimer = null;
  function startStatusPoll() {
    if (!el('wallet') || !el('device')) return;
    if (statusTimer) clearInterval(statusTimer);
    statusTimer = setInterval(checkOnline, 5000);
    checkOnline();
  }

  async function trySyncDeviceFromServer() {
    const backend = val('backend').trim() || DEFAULT_BACKEND;
    const w = normWallet(val('wallet'));
    if (!isWallet(w)) return;
    try {
      const j = await fetchJSON(`${backend}/device/binding?wallet=${encodeURIComponent(w)}`);
      if (j && j.device_id) {
        setVal('device', j.device_id);
        await save({ wallet: w, device_id: j.device_id, registered: true, hb_enabled: true });
        lockAll();
        setText('regStatus', 'Synced device_id from server and locked.');
      }
    } catch {}
  }

  async function init() {
    const st = await load(['backend','wallet','device_id','registered','hb_enabled','hb_endpoint']) || {};
    setVal('backend', st.backend || DEFAULT_BACKEND);
    if (st.wallet)    setVal('wallet', st.wallet);
    if (st.device_id) setVal('device', st.device_id);
    setVal('hbEndpoint', st.hb_endpoint || DEFAULT_HB_PATH);

    // Close popup
    el('btnClose')?.addEventListener('click', () => { window.close(); });

    // Logout / Change wallet
    el('btnLogout')?.addEventListener('click', async () => {
      if (!confirm('Stop mining/heartbeat for the current wallet and switch to a new wallet?')) return;

      await save({ registered: false, hb_enabled: false, wallet: '', device_id: '' });

      if (statusTimer) { clearInterval(statusTimer); statusTimer = null; }

      const w = el('wallet'), d = el('device');
      if (w) { w.readOnly = false; w.classList.remove('readonly'); setVal('wallet', ''); }
      if (d) { d.readOnly = false; d.classList.remove('readonly'); setVal('device', ''); }
      ['btnGen','btnSave','btnRegister'].forEach(id => { const b = el(id); if (b) b.disabled = false; });

      setText('regStatus', 'Logged out. You can enter a new wallet and register again.');
    });

    if (st.registered) {
      lockAll();
      setText('regStatus', 'Registered – device & wallet are locked.');
      await save({ hb_enabled: true });
      startStatusPoll();
      chrome.runtime.sendMessage({ cmd: 'hb_now' }, () => {});
    }

    if (!st.device_id || !st.registered) {
      await trySyncDeviceFromServer();
      if ((val('device') || '').trim()) {
        await save({ hb_enabled: true });
        startStatusPoll();
        chrome.runtime.sendMessage({ cmd: 'hb_now' }, () => {});
      }
    }

    el('btnGen')?.addEventListener('click', () => {
      if (st.registered) return;
      const uuid = (crypto.randomUUID && crypto.randomUUID()) ||
        ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
          (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> (c / 4)).toString(16)
        );
      setVal('device', uuid);
    });

    el('btnSave')?.addEventListener('click', async () => {
      const backend = val('backend').trim() || DEFAULT_BACKEND;
      const w = normWallet(val('wallet'));
      const d = (val('device') || '').trim();
      if (!isWallet(w)) { setText('regStatus', 'Invalid wallet'); return; }
      if (!d) { setText('regStatus', 'Missing device_id'); return; }

      const prev = await load(['wallet','registered']);
      if (prev?.registered && prev?.wallet && prev.wallet.toLowerCase() !== w) {
        setText('regStatus', 'This device is already bound to another wallet. Cannot change.');
        return;
      }

      await save({ backend, wallet: w, device_id: d, hb_enabled: true });
      setText('regStatus', 'Saved.');
      el('wallet').readOnly = true; el('wallet').classList.add('readonly');
      await trySyncDeviceFromServer();
      startStatusPoll();
      chrome.runtime.sendMessage({ cmd: 'hb_now' }, () => {});
    });

    el('btnRegister')?.addEventListener('click', async () => {
      const backend = val('backend').trim() || DEFAULT_BACKEND;
      const w = normWallet(val('wallet'));
      const d = (val('device') || '').trim();
      if (!isWallet(w)) { setText('regStatus', 'Invalid wallet'); return; }
      if (!d) { setText('regStatus', 'Missing device_id'); return; }

      try {
        const data = await fetchJSON(`${backend}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: w, device_id: d, os: 'ext', fp: '' })
        });
        if (data && (data.ok === true || data.status === 'ok' || data.msg === 'Đã đăng ký trước đó' || data.msg === 'Already registered')) {
          await save({ registered: true, wallet: w, device_id: d, hb_enabled: true });
          lockAll();
          setText('regStatus', 'Registration successful ✅');
          startStatusPoll();
          chrome.runtime.sendMessage({ cmd: 'hb_now' }, () => {});
        } else {
          setText('regStatus', 'Registration failed: ' + JSON.stringify(data));
        }
      } catch (e) {
        setText('regStatus', 'Registration error: ' + String(e.message || e));
      }
    });

    el('btnStats')?.addEventListener('click', async () => {
      const backend = val('backend').trim() || DEFAULT_BACKEND;
      const w = normWallet(val('wallet'));
      const statsEl = el('stats'); if (!statsEl) return;
      if (!isWallet(w)) { statsEl.textContent = 'Invalid wallet'; return; }
      try {
        const data = await fetchJSON(`${backend}/stats/today?wallet=${encodeURIComponent(w)}`);
        const gb  = Number(data.gb || 0);
        const atn = Number(data.est_atn || 0);
        statsEl.textContent =
          `Wallet: ${data.wallet}\nToday’s data: ${gb.toFixed(3)} GB\nEstimated ATN: ${atn.toFixed(6)} ATN`;
      } catch (e) {
        statsEl.textContent = 'Stats error: ' + e.message;
      }
    });

    el('btnOpenClaim')?.addEventListener('click', () => {
      const w = normWallet(val('wallet'));
      const d = (val('device') || '').trim();
      if (!isWallet(w)) { alert('Enter a valid wallet before opening Claim'); return; }
      if (!d) { alert('No device_id yet. Click "Generate device_id" then "Save wallet".'); return; }
      const url = `https://atncrypto.com/claim?wallet=${encodeURIComponent(w)}&device=${encodeURIComponent(d)}&range=30`;
      chrome.tabs.create({ url });
    });

    // Save endpoint → send HB immediately and show result
    el('btnSaveHb')?.addEventListener('click', async () => {
      let ep = (val('hbEndpoint') || '').trim();
      if (!ep) ep = DEFAULT_HB_PATH;

      await save({ hb_endpoint: ep, hb_enabled: true });
      setText('regStatus', `Saved heartbeat endpoint: ${ep}`);

      chrome.runtime.sendMessage({ cmd: 'hb_now' }, (resp) => {
        if (chrome.runtime.lastError) {
          setText('regStatus', `HB error: ${chrome.runtime.lastError.message}`);
          return;
        }
        if (!resp) {
          setText('regStatus', 'HB: no response received');
          return;
        }
        setText('regStatus', resp.ok ? 'HB sent ✅' : ('HB error: ' + (resp.err || 'unknown')));
      });
    });

    // "Send heartbeat now"
    el('btnHbNow')?.addEventListener('click', () => {
      setText('regStatus', 'Sending heartbeat…');

      chrome.runtime.sendMessage({ cmd: 'hb_now' }, (resp) => {
        if (chrome.runtime.lastError) {
          setText('regStatus', `HB error: ${chrome.runtime.lastError.message}`);
          return;
        }
        if (!resp) {
          setText('regStatus', 'HB: no response received');
          return;
        }
        setText('regStatus', resp.ok ? 'HB sent ✅' : ('HB error: ' + (resp.err || 'unknown')));
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
