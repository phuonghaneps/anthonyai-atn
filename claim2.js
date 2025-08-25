(() => {
/*** CONFIG #2 (EARLY) ***/
const X_HANDLE2      = "Token_ATN";
const AIRDROP2_ADDR  = "0x1f597227BA91E60548c1F6573cC86586EEC878f8";
const AIRDROP2_ABI   = [{"inputs":[{"internalType":"address","name":"tokenAddress","type":"address"},{"internalType":"uint256","name":"_startTime","type":"uint256"},{"internalType":"uint256","name":"_amountPerWallet","type":"uint256"},{"internalType":"uint256","name":"_maxClaims","type":"uint256"}],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"account","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"},{"indexed":true,"internalType":"uint256","name":"claimNo","type":"uint256"}],"name":"Claimed","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Deposited","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"oldOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Withdrawn","type":"event"},{"inputs":[],"name":"amountPerWallet","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"claim","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"claimed","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"claimsCount","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"user","type":"address"}],"name":"info","outputs":[{"internalType":"uint256","name":"_startTime","type":"uint256"},{"internalType":"uint256","name":"_amountPerWallet","type":"uint256"},{"internalType":"uint256","name":"_maxClaims","type":"uint256"},{"internalType":"uint256","name":"_claimsCount","type":"uint256"},{"internalType":"bool","name":"_claimed","type":"bool"},{"internalType":"uint256","name":"_contractBalance","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"maxClaims","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"startTime","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"token","outputs":[{"internalType":"contract IERC20","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"withdrawLeftover","outputs":[],"stateMutability":"nonpayable","type":"function"}];

/*** RPCs ***/
const RPCS2 = [
  "https://bsc-dataseed.binance.org/",
  "https://bsc-dataseed1.defibit.io/",
  "https://bsc-dataseed1.ninicoin.io/",
  "https://bsc-dataseed4.bnbchain.org/",
  "https://endpoints.omniatech.io/v1/bsc/mainnet/public",
  "https://bsc-pokt.nodies.app"
];

/*** utils ***/
const $ = id => document.getElementById(id);
const fmt = (bn, dec=18) => ethers.utils.formatUnits(bn, dec);
function setMsg2(t, kind="info"){
  const el = $("msg2"); if(!el) return;
  el.textContent = t || "";
  el.style.color = kind==="error" ? "#ef4444" : kind==="warn" ? "#f59e0b" : "var(--muted)";
}

/*** state ***/
let provider2, signer2, airdrop2, account2=null, pollTimer2=null, countdownTimer2=null;
let START_TS2=0, PER_WALLET2="0", MAX2=0, COUNT2=0, CLAIMED2=false, BALANCE2="0";

/*** chain time sync ***/
let CHAIN_NOW2=0, SYNCED_AT_MS2=0, chainSyncTimer2=null;
async function syncChainTime2(){
  const b = await provider2.getBlock('latest');
  CHAIN_NOW2 = Number(b.timestamp);
  SYNCED_AT_MS2 = Date.now();
}
const nowSec2 = () => CHAIN_NOW2 ? Math.floor(CHAIN_NOW2 + (Date.now()-SYNCED_AT_MS2)/1000) : Math.floor(Date.now()/1000);

/*** render ***/
function renderStats2(){
  $("tokenSymbol2") && ($("tokenSymbol2").textContent = "ATN");
  $("perWallet2")   && ($("perWallet2").textContent   = `${fmt(PER_WALLET2)} ATN`);
  $("maxClaims2")   && ($("maxClaims2").textContent   = String(MAX2));
  $("claimedCount2")&& ($("claimedCount2").textContent= String(COUNT2));
  $("contractBal2") && ($("contractBal2").textContent = `${fmt(BALANCE2)} ATN`);
  $("remaining2")   && ($("remaining2").textContent   = `Remaining: ${Math.max(Number(MAX2)-Number(COUNT2),0)} slots`);
  const pb=$("claimProgress2"), lbl=$("claimProgressLabel2");
  if (pb && MAX2>0){
    const pct=Math.min(100, Math.round((COUNT2/MAX2)*100));
    pb.style.setProperty("--pct", pct+"%");
    lbl && (lbl.textContent=`${COUNT2}/${MAX2} claimed (${pct}%)`);
  }
  const openVN=$("openAtVN2");
  if (openVN && START_TS2>0){
    openVN.textContent=new Date(START_TS2*1000).toLocaleString(
      "vi-VN",{timeZone:"Asia/Ho_Chi_Minh",hour12:false,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"}
    )+" GMT+7";
  }
}

/*** enable/disable ***/
function updateClaimButton2(){
  const nowOK=(START_TS2>0)&&(nowSec2()>=START_TS2);
  const hasWallet=!!account2;
  const hasFollow=$("followChk2")?.checked ?? false;
  const left=MAX2-COUNT2;
  const enough=ethers.BigNumber.from(BALANCE2).gte(ethers.BigNumber.from(PER_WALLET2));
  const enable=nowOK&&hasWallet&&hasFollow&&left>0&&enough&&!CLAIMED2;
  $("claimBtn2").disabled=!enable;

  if (!nowOK) setMsg2("Claiming has not started yet.", "warn");
  else if (!hasWallet) setMsg2("Connect your wallet to claim.", "info");
  else if (!hasFollow) setMsg2(`Please follow @${X_HANDLE2} and tick the checkbox.`, "warn");
  else if (!enough) setMsg2(left<=0 ? "All claim slots have been used." : "The contract has insufficient tokens for claiming.", "warn");
  else setMsg2("");
}

/*** countdown ***/
function startCountdown2(){
  if (countdownTimer2) clearInterval(countdownTimer2);
  const dEl=$("cd-days2"), hEl=$("cd-hours2"), mEl=$("cd-mins2"), sEl=$("cd-secs2");
  const badge=$("openBadge2");
  const setAll=(a,b,c,d)=>{ if(dEl) dEl.textContent=a; if(hEl) hEl.textContent=b; if(mEl) mEl.textContent=c; if(sEl) sEl.textContent=d; };

  function tick(){
    if (!START_TS2){ setAll("--","--","--","--"); if(badge) badge.style.display="none"; return; }
    let diff = START_TS2 - nowSec2();
    if (diff<=0){ setAll("00","00","00","00"); if(badge) badge.style.display="inline-block"; updateClaimButton2(); return; }
    const days=Math.floor(diff/86400); diff%=86400;
    const hrs=Math.floor(diff/3600);  diff%=3600;
    const mins=Math.floor(diff/60);   const secs=diff%60;
    setAll(String(days).padStart(2,"0"), String(hrs).padStart(2,"0"), String(mins).padStart(2,"0"), String(secs).padStart(2,"0"));
    if (badge) badge.style.display="none";
  }
  tick(); countdownTimer2=setInterval(tick,1000);
}

/*** read info ***/
async function fetchInfo2(){
  const u=account2||"0x0000000000000000000000000000000000000000";
  const r=await airdrop2.info(u);
  START_TS2   = Number(r._startTime);
  PER_WALLET2 = r._amountPerWallet.toString();
  MAX2        = Number(r._maxClaims);
  COUNT2      = Number(r._claimsCount);
  CLAIMED2    = Boolean(r._claimed);
  BALANCE2    = r._contractBalance.toString();
  renderStats2(); updateClaimButton2();
}

/*** ensure BSC ***/
async function ensureBSC2(){
  const net=await provider2.getNetwork();
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
async function connect2(){
  try{
    if(!window.ethereum){ setMsg2("Please install MetaMask.", "error"); return; }
    provider2=new ethers.providers.Web3Provider(window.ethereum,"any");
    await provider2.send("eth_requestAccounts",[]);
    await ensureBSC2();
    signer2 = provider2.getSigner();
    account2= await signer2.getAddress();
    $("accountLabel2").textContent="Wallet: "+(account2.slice(0,6)+"…"+account2.slice(-4));
    airdrop2=new ethers.Contract(AIRDROP2_ADDR,AIRDROP2_ABI,provider2);

    await syncChainTime2(); if(chainSyncTimer2) clearInterval(chainSyncTimer2);
    chainSyncTimer2=setInterval(syncChainTime2,30000);

    await fetchInfo2(); startCountdown2(); updateClaimButton2();
  }catch(e){ setMsg2(e?.message||String(e),"error"); }
}

/*** claim ***/
async function doClaim2(){
  try{
    if(!signer2){ setMsg2("Please connect your wallet first.", "error"); return; }
    if(!$("followChk2").checked){ setMsg2(`Please follow @${X_HANDLE2} and tick the checkbox.`, "warn"); return; }
    if(nowSec2()<START_TS2){ setMsg2("Claiming has not started yet.", "warn"); return; }
    setMsg2("Submitting transaction...");
    const tx=await airdrop2.connect(signer2).claim();
    setMsg2("Waiting for confirmation: "+tx.hash);
    await tx.wait();
    setMsg2("Claim successful!","success");
    await fetchInfo2();
  }catch(e){
    setMsg2((e&&(e.error?.message||e.data?.message||e.message))||"Claim failed","error");
  }
}

/*** readonly init ***/
async function initReadonly2(){
  let lastErr;
  for(const url of RPCS2){
    try{
      provider2=new ethers.providers.JsonRpcProvider(url);
      await provider2.getBlockNumber();
      airdrop2=new ethers.Contract(AIRDROP2_ADDR,AIRDROP2_ABI,provider2);

      await syncChainTime2(); if(chainSyncTimer2) clearInterval(chainSyncTimer2);
      chainSyncTimer2=setInterval(syncChainTime2,30000);

      await fetchInfo2(); startCountdown2();
      startPolling2(); setMsg2("Connect your wallet to claim.","info");
      return;
    }catch(e){ lastErr=e; }
  }

  /* Fallback đọc chain qua MetaMask nếu RPC public đều fail (không yêu cầu connect) */
  if (window.ethereum) {
    try {
      provider2 = new ethers.providers.Web3Provider(window.ethereum, "any");
      await provider2.getBlockNumber();
      airdrop2  = new ethers.Contract(AIRDROP2_ADDR, AIRDROP2_ABI, provider2);

      await syncChainTime2(); if (chainSyncTimer2) clearInterval(chainSyncTimer2);
      chainSyncTimer2 = setInterval(syncChainTime2, 30000);

      await fetchInfo2(); startCountdown2();
      startPolling2(); setMsg2("Connect your wallet to claim.", "info");
      return;
    } catch(e){ lastErr = e; }
  }

  setMsg2("Unable to reach BSC RPC for Airdrop #2.", "error");
  console.error("RPC errors #2:", lastErr);
}
function startPolling2(){ if(pollTimer2) clearInterval(pollTimer2); pollTimer2=setInterval(async()=>{ try{ await fetchInfo2(); }catch{} },15000); }

/*** events ***/
document.addEventListener("DOMContentLoaded", initReadonly2);
$("followChk2") && $("followChk2").addEventListener("change", updateClaimButton2);
$("connectBtn2") && $("connectBtn2").addEventListener("click", connect2);
$("claimBtn2")   && $("claimBtn2").addEventListener("click", doClaim2);

if (window.ethereum){
  window.ethereum.on("accountsChanged", ()=>location.reload());
  window.ethereum.on("chainChanged",  ()=>location.reload());
}
})();
