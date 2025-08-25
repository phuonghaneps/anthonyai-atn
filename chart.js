// chart.js
(() => {
  /* =================== Helpers =================== */
  const onReady = (fn) =>
    (document.readyState === "loading")
      ? document.addEventListener("DOMContentLoaded", fn, { once: true })
      : fn();

  const whenChartReady = (fn) => {
    if (window.Chart) return fn();
    const t = setInterval(() => {
      if (window.Chart) { clearInterval(t); fn(); }
    }, 50);
    setTimeout(() => clearInterval(t), 5000); // tối đa 5s
  };

  /* =================== Year / Copy / Watch =================== */
  onReady(() => {
    // Năm hiện tại
    const y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();

    // Copy & add asset vào ví
    const addr = "0xb5C84953983931dd2C10C9b04a4379eE52697193";
    const copyBtn  = document.getElementById("copy");
    const watchBtn = document.getElementById("watch");

    copyBtn?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(addr);
        alert("Contract copied to clipboard");
      } catch {
        alert("Copy failed");
      }
    });

    watchBtn?.addEventListener("click", async () => {
      if (!window.ethereum) { alert("Wallet not detected"); return; }
      try {
        await window.ethereum.request({
          method: "wallet_watchAsset",
          params: {
            type: "ERC20",
            options: { address: addr, symbol: "ATN", decimals: 18, image: location.origin + "/favicon-32.png" }
          }
        });
      } catch (err) {
        console.log(err);
      }
    });
  });

  /* =================== Charts =================== */
  onReady(() => whenChartReady(() => {
    // ----- Donut: Tokenomics -----
    (function initDonut(){
      const ctx = document.getElementById("pie");
      if (!ctx) return;

      const data = {
        labels: [
          "Development (25%)",
          "Community & Airdrop (20%)",
          "Team – locked (20%)",
          "Marketing (15%)",
          "Partnerships & Listing (15%)",
          "Reserve (5%)"
        ],
        datasets: [{
          data: [25, 20, 20, 15, 15, 5],
          backgroundColor: ["#22c55e","#60a5fa","#f59e0b","#ef4444","#06b6d4","#a78bfa"],
          borderColor: "rgba(15,23,42,.8)",
          borderWidth: 2,
          hoverOffset: 6
        }]
      };

      new Chart(ctx, {
        type: "doughnut",
        data,
        options: {
          plugins: { legend: { position: "bottom", labels: { color: "#cbd5e1" } } },
          cutout: "55%"
        }
      });
    })();

    // ----- Line: Live price + stats (Dexscreener) -----
(function initLiveChart(){
  const ctxLine = document.getElementById("priceLine")?.getContext("2d");
  if (!ctxLine) return;

  const priceData = {
    labels: [],
    datasets: [{
      label: "ATN/USD",
      data: [],
      borderColor: "rgba(34,197,94,1)",
      borderWidth: 2,
      backgroundColor: "rgba(34,197,94,.12)",
      tension: 0.25,
      fill: true,
      pointRadius: 0
    }]
  };

  const priceChart = new Chart(ctxLine, {
    type: "line",
    data: priceData,
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#cbd5e1" }, grid: { color: "rgba(148,163,184,.12)" } },
        y: { ticks: { color: "#cbd5e1" }, grid: { color: "rgba(148,163,184,.12)" } }
      }
    }
  });

  const TOKEN = "0xb5C84953983931dd2C10C9b04a4379eE52697193";
  const PAIR  = "0x6a0ba3d48b25855bad2102796c837d9668ff8c18";

  const endpoints = [
    `https://api.dexscreener.com/latest/dex/pairs/bsc/${PAIR}`,
    `https://api.dexscreener.com/latest/dex/tokens/${TOKEN}`
  ];

  const priceEl = document.getElementById("statPrice");
  const liqEl   = document.getElementById("statLiq");
  const fdvEl   = document.getElementById("statFdv");
  const volEl   = document.getElementById("statVol");

  const fmtCompact = (n) => {
    if (n == null) return "—";
    const x = Number(n);
    if (!isFinite(x)) return "—";
    if (x >= 1e9) return (x/1e9).toFixed(2) + "B";
    if (x >= 1e6) return (x/1e6).toFixed(2) + "M";
    if (x >= 1e3) return (x/1e3).toFixed(2) + "K";
    return x.toFixed(2);
  };

  let timer = null;
  let abortCtrl = null;

  async function fetchFirstOk(urls) {
    for (const url of urls) {
      try {
        const r = await fetch(url, { cache: "no-store", signal: abortCtrl?.signal });
        if (!r.ok) continue;
        const j = await r.json();
        const p = j?.pairs?.find(Boolean);
        if (p && p.priceUsd) return p;
      } catch (e) {
        if (e?.name !== "AbortError") console.debug("[Dex] fail:", e.message || e);
      }
    }
    return null;
  }

  async function refreshDex(){
    // tránh request chồng nhau
    if (abortCtrl) abortCtrl.abort();
    abortCtrl = new AbortController();

    const p = await fetchFirstOk(endpoints);
    if (!p) return; // không có dữ liệu → bỏ qua lần này

    // Cập nhật 4 chỉ số
    priceEl && (priceEl.textContent = "$" + Number(p.priceUsd).toFixed(6));
    liqEl   && (liqEl.textContent   = "$" + fmtCompact(p.liquidity?.usd));
    fdvEl   && (fdvEl.textContent   = "$" + fmtCompact(p.fdv));
    volEl   && (volEl.textContent   = "$" + fmtCompact(p.volume?.h24));

    // Cập nhật chart
    const y = Number(p.priceUsd);
    if (isFinite(y) && y > 0) {
      const label = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      priceData.labels.push(label);
      priceData.datasets[0].data.push(y);

      const MAX_POINTS = 180; // ~15 phút nếu 5s/lần
      if (priceData.labels.length > MAX_POINTS) {
        priceData.labels.shift();
        priceData.datasets[0].data.shift();
      }
      priceChart.update("none");
    }
  }

  const start = () => {
    if (timer) return;
    refreshDex();
    timer = setInterval(refreshDex, 5000); // 5s/lần
  };
  const stop = () => {
    if (timer) { clearInterval(timer); timer = null; }
    if (abortCtrl) abortCtrl.abort();
  };

  start();
  document.addEventListener("visibilitychange", () => document.hidden ? stop() : start());
  window.addEventListener("pagehide", stop);
})();
