(() => {
  // ===== Year =====
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  // ===== Copy & watch asset =====
  const addr = '0xb5C84953983931dd2C10C9b04a4379eE52697193';
  const copyBtn = document.getElementById('copy');
  const watchBtn = document.getElementById('watch');

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(addr); alert('Contract copied to clipboard'); }
      catch (e) { alert('Copy failed'); }
    });
  }
  if (watchBtn) {
    watchBtn.addEventListener('click', async () => {
      if (!window.ethereum) { alert('Wallet not detected'); return; }
      try {
        await window.ethereum.request({
          method: 'wallet_watchAsset',
          params: {
            type: 'ERC20',
            options: { address: addr, symbol: 'ATN', decimals: 18, image: location.origin + '/favicon-32.png' }
          }
        });
      } catch (err) { console.log(err); }
    });
  }

  // ===== Tokenomics donut (Chart.js đã load trong <head>) =====
  (function initDonut(){
    const ctx = document.getElementById('pie');
    if (!ctx || !window.Chart) return;
    const data = {
      labels: [
        'Development (25%)',
        'Community & Airdrop (20%)',
        'Team – locked (20%)',
        'Marketing (15%)',
        'Partnerships & Listing (15%)',
        'Reserve (5%)'
      ],
      datasets: [{
        data: [25, 20, 20, 15, 15, 5],
        backgroundColor: ['#22c55e','#60a5fa','#f59e0b','#ef4444','#06b6d4','#a78bfa'],
        borderColor: 'rgba(15,23,42,.8)',
        borderWidth: 2,
        hoverOffset: 6
      }]
    };
    new Chart(ctx, {
      type: 'doughnut',
      data,
      options: { plugins: { legend: { position: 'bottom', labels: { color: '#cbd5e1' } } }, cutout: '55%' }
    });
  })();

  // ===== CUSTOM LIVE CHART + STATS (Dexscreener) =====
  (function initLiveChart(){
    const ctxLine = document.getElementById('priceLine')?.getContext('2d');
    if (!ctxLine || !window.Chart) return;

    const priceData = {
      labels: [],
      datasets: [{
        label: 'ATN/USD',
        data: [],
        borderColor: 'rgba(34,197,94,1)',
        borderWidth: 2,
        backgroundColor: 'rgba(34,197,94,.12)',
        tension: 0.25,
        fill: true
      }]
    };

    const priceChart = new Chart(ctxLine, {
      type: 'line',
      data: priceData,
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(148,163,184,.12)' } },
          y: { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(148,163,184,.12)' } }
        }
      }
    });

    const PAIR = "0x6a0ba3d48b25855bad2102796c837d9668ff8c18";
    const DS_URL = `https://api.dexscreener.com/latest/dex/pairs/bsc/${PAIR}`;

    const priceEl = document.getElementById('statPrice');
    const liqEl   = document.getElementById('statLiq');
    const fdvEl   = document.getElementById('statFdv');
    const volEl   = document.getElementById('statVol');

    function fmt(n){
      if(!n && n !== 0) return "—";
      const x = Number(n);
      if (x >= 1e9) return (x/1e9).toFixed(2) + "B";
      if (x >= 1e6) return (x/1e6).toFixed(2) + "M";
      if (x >= 1e3) return (x/1e3).toFixed(2) + "K";
      return x.toFixed(2);
    }

    async function refreshDex(){
      try{
        const r = await fetch(DS_URL, { cache: 'no-store' });
        const j = await r.json();
        const p = j?.pairs?.[0];
        if(!p) return;

        if (priceEl) priceEl.textContent = "$" + Number(p.priceUsd || 0).toFixed(6);
        if (liqEl)   liqEl.textContent   = "$" + fmt(p.liquidity?.usd);
        if (fdvEl)   fdvEl.textContent   = "$" + fmt(p.fdv);
        if (volEl)   volEl.textContent   = "$" + fmt(p.volume?.h24);

        const label = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        priceData.labels.push(label);
        priceData.datasets[0].data.push(Number(p.priceUsd || 0));

        if(priceData.labels.length > 50){
          priceData.labels.shift();
          priceData.datasets[0].data.shift();
        }
        priceChart.update();
      }catch(e){ console.log("Dex fetch error:", e); }
    }

    refreshDex();
    setInterval(refreshDex, 20000);
  })();
})();

