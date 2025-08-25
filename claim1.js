(() => {
/*** CONFIG (Airdrop #2) ***/
const X_HANDLE     = "Token_ATN";
const AIRDROP_ADDR = ethers.utils.getAddress("0xA395c7d4d4A864773D9141E3CDC61599DFea24c0");
const AIRDROP_ABI  = [
  {"inputs":[{"internalType":"address","name":"tokenAddress","type":"address"},{"internalType":"uint256","name":"_startTime","type":"uint256"},{"internalType":"uint256","name":"_amountPerWallet","type":"uint256"},{"internalType":"uint256","name":"_maxClaims","type":"uint256"}],"stateMutability":"nonpayable","type":"constructor"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"account","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"},{"indexed":true,"internalType":"uint256","name":"claimNo","type":"uint256"}],"name":"Claimed","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Deposited","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"oldOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Withdrawn","type":"event"},
  {"inputs":[],"name":"amountPerWallet","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"claim","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"claimed","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"claimsCount","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"user","type":"address"}],"name":"info","outputs":[
    {"internalType":"uint256","name":"_startTime","type":"uint256"},
    {"internalType":"uint256","name":"_amountPerWallet","type":"uint256"},
    {"internalType":"uint256","name":"_maxClaims","type":"uint256"},
    {"internalType":"uint256","name":"_claimsCount","type":"uint256"},
    {"internalType":"bool","name":"_claimed","type":"bool"},
    {"internalType":"uint256","name":"_contractBalance","type":"uint256"}
  ],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"maxClaims","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"startTime","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"token","outputs":[{"internalType":"contract IERC20","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"withdrawLeftover","outputs":[],"stateMutability":"nonpayable","type":"function"}
];

/*** RPCs (khỏe) ***/
const RPCS = [
  "https://bsc.publicnode.com",
  "https://rpc.ankr.com/bsc",
  "https://1rpc.io/bnb",
  "https://binance.llamarpc.com",
  "https://bsc-dataseed.binance.org"
];

/*** utils ***/
const $ = id => document.getElementById(id);
const short = a => a ? a.slice(0,6)+"…"+a.slice(-4) : "";
const ZERO  = "0x0000000000000000000000000000000000000000";
const fmt   = (bn,dec=18)=>ethers.utils.formatUnits(bn,dec);
function setMsg(t, kind="info"){
  const el=$("msg"); if(!el) return;
  el.textContent = t || "";
  el.style.color = kind==="error" ? "#ef4444" : kind==="warn" ? "#f59e0b" : "var(--muted)";
}

/*** state ***/
let provider, signer, airdrop, account=null, pollTimer=null, countdownTimer=null;
let START_TS=0, PER_WALLET="0", MAX=0, COUNT=0, CLAIMED=false, BALANCE="0";

/*** chain-time sync ***/
let CHAIN_NOW=0, SYNCED_AT_MS=0, chainSyncTimer=null;
async function syncChainTime(){
  const b = await provider.getBlock('latest');
  CHAIN_NOW = Number(b.timestamp);
  SYNCED_AT_MS = Date.now();
}
const nowSec = () => CHAIN_NOW ? Math.floor(CHAIN_NOW + (Date.now()-SYNCED_AT_MS)/1000) : Math.floor(Date.now()/1000);

/*** render ***/
function renderStats(){
  $("tokenSymbol") && ($("tokenSymbol").textContent = "ATN");
  $("perWallet")   && ($("perWallet").textContent   = `${fmt(PER_WALLET)} ATN`);
  $("maxClaims")   && ($("maxClaims").textContent   = String(MAX));
  $("claimedCount")&& ($("claimedCount").textContent= String(COUNT));
  $("contractBal") && ($("contractBal").textContent = `${fmt(BALANCE)} ATN`);
  $("remaining")   && ($("remaining").textContent   = `Remaining: ${Math.max(Number(MAX)-Number(COUNT),0)} slots`);
  const pb=$("claimProgress"), lbl=$("claimProgressLabel");
  if (pb && MAX>0){
    const pct=Math.min(100, Math.round((COUNT/MAX)*100));
    pb.style.setProperty("--pct", pct+"%");
    lbl && (lbl.textContent=`${COUNT}/${MAX} claimed (${pct}%)`);
  }
  const openVN=$("openAtVN");
  if (openVN && START_TS>0){
    openVN.textContent=new Date(START_TS*1000).toLocaleString(
      "vi-VN",{timeZone:"Asia/Ho_Chi_Minh",hour12:false,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"}
    )+" GMT+7";
  }
}

/*** enable/disable ***/
function updateClaimButton(){
  const nowOK=(START_TS>0)&&(nowSec()>=START_TS);
  const hasWallet=!!account;
  const hasFollow=$("followChk")?.checked ?? false;
  const left=MAX-COUNT;
  const enough=ethers.BigNumber.from(BALANCE).gte(ethers.BigNumber.from(PER_WALLET));
  const enable=nowOK&&hasWallet&&hasFollow&&left>0&&enough&&!CLAIMED;
  $("claimBtn").disabled=!enable;

  if (!nowOK) setMsg("Claiming has not started yet.", "warn");
  else if (!hasWallet) setMsg("Connect your wallet to claim.", "info");
  else if (!hasFollow) setMsg(`Please follow @${X_HANDLE} and tick the checkbox.`, "warn");
  else if (!enough) setMsg(left<=0 ? "All claim slots have been used." : "The contract has insufficient tokens for claiming.", "warn");
  else setMsg("");
}

/*** countdown ***/
function updateClaimButton(){
  const btn = $("claimBtn");
  if (!btn) return;

  const nowOK    = (START_TS > 0) && (nowSec() >= START_TS);
  const hasWallet= !!account;
  const hasFollow= $("followChk")?.checked ?? false;
  const left     = MAX - COUNT;
  const enough   = ethers.BigNumber.from(BALANCE).gte(ethers.BigNumber.from(PER_WALLET));
  const canClaim = nowOK && hasWallet && hasFollow && left > 0 && enough && !CLAIMED;

  // Ẩn khi CHƯA tới giờ; Hiện khi đã tới giờ
  btn.style.display = nowOK ? "inline-flex" : "none";
  // Khi đã tới giờ, vẫn có thể disabled nếu thiếu điều kiện
  btn.disabled = !canClaim;

  if (!nowOK) setMsg("Claiming has not started yet.", "warn");
  else if (!hasWallet) setMsg("Connect your wallet to claim.", "info");
  else if (!hasFollow) setMsg(`Please follow @${X_HANDLE} and tick the checkbox.`, "warn");
  else if (!enough) setMsg(left<=0 ? "All claim slots have been used." : "The contract has insufficient tokens for claiming.", "warn");
  else setMsg("");
}

// 2) Đếm ngược + ẩn chip “Opens (VN)” khi mở
function startCountdown(){
  if (countdownTimer) clearInterval(countdownTimer);
  const dEl=$("cd-days"), hEl=$("cd-hours"), mEl=$("cd-mins"), sEl=$("cd-secs");
  const badge=$("openBadge");
  const opensChip = $("openAtVN")?.closest(".chip");

  function setAll(a,b,c,d){ if(dEl)dEl.textContent=a; if(hEl)hEl.textContent=b; if(mEl)mEl.textContent=c; if(sEl)sEl.textContent=d; }

  function tick(){
    if(!START_TS){ setAll("--","--","--","--"); if(badge) badge.style.display="none"; return; }
    let diff = START_TS - nowSec();

    if (diff <= 0){
      setAll("00","00","00","00");
      if (badge)     badge.style.display = "inline-block";
      if (opensChip) opensChip.style.display = "none";  // ẩn “Opens (VN)”
      updateClaimButton();
      return;
    }
    const days=Math.floor(diff/86400); diff%=86400;
    const hrs =Math.floor(diff/3600);  diff%=3600;
    const mins=Math.floor(diff/60);    const secs=diff%60;
    setAll(String(days).padStart(2,"0"),String(hrs).padStart(2,"0"),String(mins).padStart(2,"0"),String(secs).padStart(2,"0"));
    if (badge)     badge.style.display = "none";
    if (opensChip) opensChip.style.display = "";        // hiện lại khi chưa mở
  }
  tick(); countdownTimer = setInterval(tick, 1000);
}


/*** read info ***/
async function fetchInfo(){
  const u=account||ZERO;
  const r=await airdrop.info(u);
  START_TS   = Number(r._startTime);
  PER_WALLET = r._amountPerWallet.toString();
  MAX        = Number(r._maxClaims);
  COUNT      = Number(r._claimsCount);
  CLAIMED    = Boolean(r._claimed);
  BALANCE    = r._contractBalance.toString();
  renderStats(); updateClaimButton();
}

/*** ensure BSC ***/
async function ensureBSC(){
  const net=await provider.getNetwork();
  if(net.chainId!==56){
    try{
      await window.ethereum.request({method:"wallet_switchEthereumChain",params:[{chainId:"0x38"}]});
    }catch{
      await window.ethereum.request({
        method:"wallet_addEthereumChain",
        params:[{chainId:"0x38",chainName:"BNB Smart Chain",nativeCurrency:{name:"BNB",symbol:"BNB",decimals:18},rpcUrls:["https://bsc-dataseed.binance.org/"],blockExplorerUrls:["https://bscscan.com/"]}]});
    }
  }
}

/*** connect ***/
async function connect(){
  try{
    if(!window.ethereum){ setMsg("Please install MetaMask.", "error"); return; }
    provider=new ethers.providers.Web3Provider(window.ethereum,"any");
    await provider.send("eth_requestAccounts",[]);
    await ensureBSC();
    signer = provider.getSigner();
    account= await signer.getAddress();
    $("accountLabel").textContent="Wallet: "+short(account);
    airdrop=new ethers.Contract(AIRDROP_ADDR,AIRDROP_ABI,provider);

    await syncChainTime(); if(chainSyncTimer) clearInterval(chainSyncTimer);
    chainSyncTimer=setInterval(syncChainTime,30000);

    await fetchInfo(); startCountdown(); updateClaimButton();
  }catch(e){ setMsg(e?.message||String(e),"error"); }
}

/*** claim ***/
async function doClaim(){
  try{
    if(!signer){ setMsg("Please connect your wallet first.", "error"); return; }
    if(!$("followChk").checked){ setMsg(`Please follow @${X_HANDLE} and tick the checkbox.`, "warn"); return; }
    if(nowSec()<START_TS){ setMsg("Claiming has not started yet.", "warn"); return; }
    setMsg("Submitting transaction...");
    const tx=await airdrop.connect(signer).claim();
    setMsg("Waiting for confirmation: "+tx.hash);
    await tx.wait();
    setMsg("Claim successful!","success");
    await fetchInfo();
  }catch(e){
    setMsg((e&&(e.error?.message||e.data?.message||e.message))||"Claim failed","error");
  }
}

/*** readonly init ***/
async function initReadonly(){
  let lastErr;
  for(const url of RPCS){
    try{
      provider=new ethers.providers.JsonRpcProvider(url, { name: "bnb", chainId: 56 });
      await provider.getBlockNumber();

      const code = await provider.getCode(AIRDROP_ADDR);
      if (code === "0x"){ setMsg("No contract code at " + AIRDROP_ADDR, "error"); return; }

      airdrop=new ethers.Contract(AIRDROP_ADDR,AIRDROP_ABI,provider);

      await syncChainTime(); if(chainSyncTimer) clearInterval(chainSyncTimer);
      chainSyncTimer=setInterval(syncChainTime,30000);

      await fetchInfo(); startCountdown();
      startPolling(); setMsg("Connect your wallet to claim.","info");
      return;
    }catch(e){ lastErr=e; }
  }

  if (window.ethereum) {
    try {
      provider = new ethers.providers.Web3Provider(window.ethereum, "any");
      await provider.getBlockNumber();
      const code = await provider.getCode(AIRDROP_ADDR);
      if (code === "0x"){ setMsg("No contract code at " + AIRDROP_ADDR, "error"); return; }

      airdrop  = new ethers.Contract(AIRDROP_ADDR, AIRDROP_ABI, provider);

      await syncChainTime(); if (chainSyncTimer) clearInterval(chainSyncTimer);
      chainSyncTimer = setInterval(syncChainTime, 30000);

      await fetchInfo(); startCountdown();
      startPolling(); setMsg("Connect your wallet to claim.", "info");
      return;
    } catch(e){ lastErr = e; }
  }

  setMsg("Unable to reach BSC RPC for Airdrop #2.", "error");
  console.error("RPC errors #2:", lastErr);
}
function startPolling(){ if(pollTimer) clearInterval(pollTimer); pollTimer=setInterval(async()=>{ try{ await fetchInfo(); }catch{} },15000); }

/*** events ***/
function runOnReady(fn){ document.readyState==="loading" ? document.addEventListener("DOMContentLoaded", fn, {once:true}) : fn(); }
runOnReady(initReadonly);

$("followChk") && $("followChk").addEventListener("change", updateClaimButton);
$("connectBtn") && $("connectBtn").addEventListener("click", connect);
$("claimBtn")   && $("claimBtn").addEventListener("click", doClaim);

if (window.ethereum){
  window.ethereum.on("accountsChanged", ()=>location.reload());
  window.ethereum.on("chainChanged",  ()=>location.reload());
}
})();
