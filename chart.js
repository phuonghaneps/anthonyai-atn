// chart.js — ES5-safe for strict obfuscators (no arrow, no const/let, no ?.)
(function () {
  /* =================== Helpers =================== */
  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  function whenChartReady(fn) {
    if (window.Chart) { fn(); return; }
    var t = setInterval(function () {
      if (window.Chart) { clearInterval(t); fn(); }
    }, 50);
    setTimeout(function(){ clearInterval(t); }, 5000); // tối đa 5s
  }

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
  onReady(function () { whenChartReady(function () {

    // ----- Donut: Tokenomics -----
    (function initDonut(){
      var ctx = document.getElementById("pie");
      if (!ctx) return;

      var data = {
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
        data: data,
        options: {
          plugins: { legend: { position: "bottom", labels: { color: "#cbd5e1" } } },
          cutout: "55%"
        }
      });
    })();

    // ----- Line: Live price + stats (GeckoTerminal) -----
    (function initLiveChart(){
      var canvas = document.getElementById("priceLine");
      var ctxLine = canvas ? canvas.getContext("2d") : null;
      if (!ctxLine) return;

      // KHÓA kích thước để ngăn "bung"
      var w = (canvas.parentNode && canvas.parentNode.clientWidth) ? canvas.parentNode.clientWidth : 900;
      canvas.style.width  = "100%";
      canvas.style.height = "320px";
      canvas.width        = w;
      canvas.height       = 320;

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
          responsive: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: "#cbd5e1" }, grid: { color: "rgba(148,163,184,.12)" } },
            y: { ticks: { color: "#cbd5e1" }, grid: { color: "rgba(148,163,184,.12)" } }
          }
        }
      });

      // ==== DOM cho 4 chỉ số ====
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

      // ===== DỮ LIỆU TỪ GECKOTERMINAL =====
      var POOL = "0x6a0ba3d48b25855bad2102796c837d9668ff8c18";
      var GT_POOL_URL  = "https://api.geckoterminal.com/api/v2/networks/bsc/pools/" + POOL;
      var GT_OHLCV_URL = "https://api.geckoterminal.com/api/v2/networks/bsc/pools/" + POOL + "/ohlcv/minute?aggregate=5&limit=60";

      function gtAttr(obj, path) {
        try { for (var i=0;i<path.length;i++) obj = obj[path[i]]; return obj; }
        catch(e){ return null; }
      }

      var timer = null;
      var abortCtrl = null;

      // Seed dữ liệu lịch sử để có line ngay
      function seedChartFromGT(){
        return fetch(GT_OHLCV_URL, { cache: "no-store" })
          .then(function(r){ return r.json(); })
          .then(function(j){
            var arr = gtAttr(j, ["data","attributes","ohlcv_list"]) || []; // [[ts,o,h,l,c,vol],...]
            if (!arr.length) return;

            priceData.labels.length = 0;
            priceData.datasets[0].data.length = 0;

            for (var i=0;i<arr.length;i++){
              var row   = arr[i];
              var ts    = row[0];
              var close = Number(row[4] || 0);
              if (!isFinite(close) || close <= 0) continue;

              var label = new Date(ts*1000).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
              priceData.labels.push(label);
              priceData.datasets[0].data.push(close);
            }
            priceChart.update("none");
          })
          .catch(function(e){ console.log("GT seed error:", e); });
      }

      // Cập nhật số liệu + thêm 1 điểm mới
      function refreshFromGT(){
        if (abortCtrl && abortCtrl.abort) abortCtrl.abort();
        abortCtrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
        var sig = abortCtrl ? { signal: abortCtrl.signal } : {};

        fetch(GT_POOL_URL, sig)
          .then(function(r){ return r.json(); })
          .then(function(j){
            var a = gtAttr(j, ["data","attributes"]) || {};

            var priceUsd = Number(a.price_in_usd || a.base_token_price_usd || 0);
            var liqUsd   = Number(a.reserve_in_usd || 0);
            var fdvUsd   = Number(a.fdv_usd || 0);
            var vol24    = Number(a.volume_usd_24h || (a.volume_usd && a.volume_usd.h24) || 0);

            if (priceEl) priceEl.textContent = priceUsd ? ("$" + priceUsd.toFixed(6)) : "—";
            if (liqEl)   liqEl.textContent   = liqUsd   ? ("$" + fmtCompact(liqUsd)) : "—";
            if (fdvEl)   fdvEl.textContent   = fdvUsd   ? ("$" + fmtCompact(fdvUsd)) : "—";
            if (volEl)   volEl.textContent   = vol24    ? ("$" + fmtCompact(vol24)) : "—";

            if (isFinite(priceUsd) && priceUsd > 0){
              var label = new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
              priceData.labels.push(label);
              priceData.datasets[0].data.push(priceUsd);

              if (priceData.labels.length > 50){
                priceData.labels.shift();
                priceData.datasets[0].data.shift();
              }
              priceChart.update("none");
            }
          })
          .catch(function(e){ console.log("GT pool error:", e); });
      }

      // Khởi chạy: seed rồi update định kỳ
      seedChartFromGT().then(function(){ refreshFromGT(); });
      timer = setInterval(refreshFromGT, 20000);

      // Dọn dẹp khi ẩn tab
      function stop() {
        if (timer) { clearInterval(timer); timer = null; }
        if (abortCtrl && abortCtrl.abort) abortCtrl.abort();
      }
      document.addEventListener("visibilitychange", function(){
        if (document.hidden) { stop(); }
        else if (!timer) { timer = setInterval(refreshFromGT, 20000); }
      });
      window.addEventListener("pagehide", stop);
    })(); // end initLiveChart

  }); }); // <-- đóng whenChartReady và onReady

})(); // <-- đóng IIFE ngoài cùng
