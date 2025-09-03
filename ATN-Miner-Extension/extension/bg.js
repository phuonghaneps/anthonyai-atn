// bg.js — Heartbeat + đào băng thông thật (server tự đếm byte)
const DEFAULT_BACKEND = 'https://api.atncrypto.com';
const FALLBACK_PATHS  = ['/device/heartbeat', '/device/ping', '/miner/heartbeat', '/miner/ping', '/heartbeat'];

const getState = (keys = ['backend','wallet','device_id','registered','hb_enabled','hb_endpoint']) =>
  new Promise(r => chrome.storage.local.get(keys, r));
const setState = (kv) => new Promise(r => chrome.storage.local.set(kv, r));

function joinUrl(base, path) {
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path;
  if (base.endsWith('/') && path.startsWith('/')) return base.slice(0,-1) + path;
  if (!base.endsWith('/') && !path.startsWith('/')) return base + '/' + path;
  return base + path;
}

// ====== HEARTBEAT ======
async function tryPOST(url, bodyObj) {
  const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(bodyObj) });
  return { ok: res.ok, status: res.status, method: 'POST' };
}
async function tryGET(url, q) {
  const u = new URL(url);
  Object.entries(q).forEach(([k,v]) => u.searchParams.set(k, v));
  const res = await fetch(u.toString(), { method:'GET', cache:'no-store' });
  return { ok: res.ok, status: res.status, method: 'GET' };
}

async function probeOnce(backend, path, payload) {
  try {
    const r1 = await tryPOST(joinUrl(backend, path), payload);
    if (r1.ok || r1.status !== 404) return { ...r1, path };
  } catch {}
  try {
    const r2 = await tryGET(joinUrl(backend, path), { wallet: payload.wallet, device_id: payload.device_id, os: payload.os, ts: String(payload.ts) });
    return { ...r2, path };
  } catch {
    return { ok:false, status:0, method:'GET', path };
  }
}

async function findEndpoint(backend, configuredPath, payload) {
  if (configuredPath) {
    const r = await probeOnce(backend, configuredPath, payload);
    await setState({
      last_hb_time: Date.now(),
      last_hb_ok: r.ok,
      last_hb_status: r.status,
      last_hb_err: r.ok ? '' : `HTTP ${r.status}`,
      last_hb_probe: configuredPath,
      last_hb_method: r.method
    });
    if (r.ok) return { path: configuredPath, method: r.method };
  }
  for (const p of FALLBACK_PATHS) {
    const r = await probeOnce(backend, p, payload);
    await setState({
      last_hb_time: Date.now(),
      last_hb_ok: r.ok,
      last_hb_status: r.status,
      last_hb_err: r.ok ? '' : `HTTP ${r.status}`,
      last_hb_probe: p,
      last_hb_method: r.method
    });
    if (r.ok) {
      await setState({ hb_endpoint: p });
      return { path: p, method: r.method };
    }
  }
  return null;
}

async function sendHeartbeatOnce() {
  const st = await getState();
  const backend = (st.backend || DEFAULT_BACKEND).trim();
  const wallet  = (st.wallet || '').trim().toLowerCase();
  const device  = (st.device_id || '').trim();
  const validWallet = /^0x[a-fA-F0-9]{40}$/.test(wallet);
  if (!st.hb_enabled || !st.registered || !validWallet || !device) return;

  const payload = { wallet, device_id: device, os: 'ext', rate_mbps: 0, ts: Math.floor(Date.now()/1000) };
  const picked  = await findEndpoint(backend, st.hb_endpoint, payload);
  if (!picked) return;

  let result;
  if (picked.method === 'GET') {
    result = await tryGET(joinUrl(backend, picked.path), { wallet, device_id: device, os:'ext', ts: String(payload.ts) });
  } else {
    result = await tryPOST(joinUrl(backend, picked.path), payload);
  }

  await setState({
    last_hb_time: Date.now(),
    last_hb_ok: result.ok,
    last_hb_status: result.status,
    last_hb_err: result.ok ? '' : `HTTP ${result.status}`,
    last_hb_probe: picked.path,
    last_hb_method: picked.method
  });
}

// ====== MINING (server tự đếm và ghi vào DB) ======
async function downloadChunk(backend, wallet, device, kb = 256) {
  try {
    const url = new URL(joinUrl(backend, '/mine/chunk'));
    url.searchParams.set('kb', String(kb));
    url.searchParams.set('wallet', wallet);
    url.searchParams.set('device', device);

    const res = await fetch(url.toString(), { method: 'GET', cache: 'no-store' });
    if (!res.ok || !res.body) return 0;

    // đọc hết stream để tiêu thụ băng thông phía client
    const reader = res.body.getReader();
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) total += value.byteLength;
    }
    return total; // chỉ để debug; server đã tự ghi bytes_down
  } catch (_) { return 0; }
}

async function mineOnce() {
  const st = await getState();
  const backend = (st.backend || DEFAULT_BACKEND).trim();
  const wallet  = (st.wallet || '').trim().toLowerCase();
  const device  = (st.device_id || '').trim();
  const validWallet = /^0x[a-fA-F0-9]{40}$/.test(wallet);
  if (!st.registered || !validWallet || !device) return;

  const stopAt = Date.now() + 15_000; // ~15s
  while (Date.now() < stopAt) {
    const kb = 128 + Math.floor(Math.random() * 384); // 128..512 KB
    await downloadChunk(backend, wallet, device, kb);
  }
}

// ====== LỊCH NỀN ======
function scheduleHeartbeat() {
  chrome.alarms.clear('atn_hb', () => {
    chrome.alarms.create('atn_hb', { periodInMinutes: 0.25 }); // 15s/lần
  });
}
function scheduleMining() {
  chrome.alarms.clear('atn_mine', () => {
    chrome.alarms.create('atn_mine', { periodInMinutes: 1 }); // mỗi phút đào 1 nhịp 15s
  });
}

chrome.runtime.onInstalled.addListener(() => { scheduleHeartbeat(); scheduleMining(); });
chrome.runtime.onStartup.addListener(async () => {
  scheduleHeartbeat();
  scheduleMining();
  await sendHeartbeatOnce();
  await mineOnce();
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'atn_hb') sendHeartbeatOnce();
  if (a.name === 'atn_mine') mineOnce();
});

// Bấm nút "Gửi heartbeat ngay" từ popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.cmd !== 'hb_now') return;

  (async () => {
    try {
      await sendHeartbeatOnce();
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, err: String(e?.message || e) });
    }
  })();

  return true; // keep message channel alive
});

// Khi đổi cấu hình → sắp lịch lại và chạy 1 nhịp
chrome.storage.onChanged.addListener((chg) => {
  if (chg.hb_enabled || chg.registered || chg.wallet || chg.device_id || chg.backend || chg.hb_endpoint) {
    scheduleHeartbeat();
    scheduleMining();
    sendHeartbeatOnce();
    mineOnce();
  }
});
