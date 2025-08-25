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
onReady(function () {
  // Năm hiện tại
  var y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();

  // Copy & add asset vào ví
  var addr = "0xb5C84953983931dd2C10C9b04a4379eE52697193";
  var copyBtn  = document.getElementById("copy");
  var watchBtn = document.getElementById("watch");

  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      navigator.clipboard.writeText(addr)
        .then(function(){ alert("Contract copied to clipboard"); })
        .catch(function(){ alert("Copy failed"); });
    });
  }

  if (watchBtn) {
    watchBtn.addEventListener("click", function () {
      if (!window.ethereum) { alert("Wallet not detected"); return; }
      window.ethereum.request({
        method: "wallet_watchAsset",
        params: {
          type: "ERC20",
          options: { address: addr, symbol: "ATN", decimals: 18, image: location.origin + "/favicon-32.png" }
        }
      }).catch(function(e){ console.log(e); });
    });
  }
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
  var canvas = document.getElementById("priceLine");
  var ctxLine = canvas ? canvas.getContext("2d") : null;
  if (!ctxLine) return;

  var priceData = {
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

  var priceChart = new Chart(ctxLine, {
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

  var TOKEN = "0xb5C84953983931dd2C10C9b04a4379eE52697193";
  var PAIR  = "0x6a0ba3d48b25855bad2102796c837d9668ff8c18";

  var endpoints = [
    "https://api.dexscreener.com/latest/dex/pairs/bsc/"  + PAIR,
    "https://api.dexscreener.com/latest/dex/tokens/"     + TOKEN
  ];

  var priceEl = document.getElementById("statPrice");
  var liqEl   = document.getElementById("statLiq");
  var fdvEl   = document.getElementById("statFdv");
  var volEl   = document.getElementById("statVol");

  function fmtCompact(n) {
    if (n === undefined || n === null) return "—";
    var x = Number(n);
    if (!isFinite(x)) return "—";
    if (x >= 1e9) return (x/1e9).toFixed(2) + "B";
    if (x >= 1e6) return (x/1e6).toFixed(2) + "M";
    if (x >= 1e3) return (x/1e3).toFixed(2) + "K";
    return x.toFixed(2);
  }

  var timer = null;
  var abortCtrl = null;

  function firstPair(obj) {
    if (!obj || !obj.pairs || !obj.pairs.length) return null;
    // lấy cặp đầu có dữ liệu priceUsd
    for (var i = 0; i < obj.pairs.length; i++) {
      var p = obj.pairs[i];
      if (p && p.priceUsd) return p;
    }
    return null;
  }

  function fetchFirstOk(urls) {
    // trả về Promise pair đầu tiên có dữ liệu
    var idx = 0;
    return new Promise(function (resolve) {
      function next() {
        if (idx >= urls.length) { resolve(null); return; }
        var url = urls[idx++];
        var opts = { cache: "no-store" };
        if (abortCtrl && abortCtrl.signal) opts.signal = abortCtrl.signal;

        fetch(url, opts).then(function (r) {
          if (!r.ok) { next(); return; }
          r.json().then(function (j) {
            var p = firstPair(j);
            if (p) resolve(p); else next();
          }).catch(function(){ next(); });
        }).catch(function(){ next(); });
      }
      next();
    });
  }

  function refreshDex(){
    if (abortCtrl && abortCtrl.abort) abortCtrl.abort();
    abortCtrl = (typeof AbortController !== "undefined") ? new AbortController() : null;

    fetchFirstOk(endpoints).then(function (p) {
      if (!p) return;

      // cập nhật 4 chỉ số
      if (priceEl) priceEl.textContent = "$" + Number(p.priceUsd).toFixed(6);
      if (liqEl)   liqEl.textContent   = "$" + fmtCompact(p.liquidity && p.liquidity.usd);
      if (fdvEl)   fdvEl.textContent   = "$" + fmtCompact(p.fdv);
      if (volEl)   volEl.textContent   = "$" + fmtCompact(p.volume && p.volume.h24);

      // cập nhật chart
      var y = Number(p.priceUsd);
      if (isFinite(y) && y > 0) {
        var label = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        priceData.labels.push(label);
        priceData.datasets[0].data.push(y);

        var MAX_POINTS = 180; // ~15 phút nếu 5s/lần
        if (priceData.labels.length > MAX_POINTS) {
          priceData.labels.shift();
          priceData.datasets[0].data.shift();
        }
        priceChart.update("none");
      }
    });
  }

  function start() {
    if (timer) return;
    refreshDex();
    timer = setInterval(refreshDex, 5000);
  }
  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    if (abortCtrl && abortCtrl.abort) abortCtrl.abort();
  }

  start();
  document.addEventListener("visibilitychange", function(){ document.hidden ? stop() : start(); });
  window.addEventListener("pagehide", stop);
})();
