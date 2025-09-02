(() => {
/*** CONFIG — Airdrop #2 (Merkle) ***/
const X_HANDLE      = "Token_ATN";
const AIRDROP_ADDR  = ethers.utils.getAddress("0x4B4e1138291255EC2e556BcE18a2929d7Bfa5959"); // địa chỉ MerkleAirdropV2
const PROOFS_URL    = "./airdrop2-proofs.json"; // ← ĐỔI thành file proofs thật của #2

// ABI đầy đủ của MerkleAirdropV2 (copy từ BscScan)
const AIRDROP_ABI = [
  {"inputs":[{"internalType":"contract IERC20","name":"_token","type":"address"},{"internalType":"bytes32","name":"_merkleRoot","type":"bytes32"},{"internalType":"uint256","name":"_startTime","type":"uint256"},{"internalType":"uint256","name":"_endTime","type":"uint256"},{"internalType":"uint256","name":"_maxDistributable","type":"uint256"},{"internalType":"address","name":"_owner","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"account","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Claimed","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Recovered","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":false,"internalType":"bytes32","name":"oldRoot","type":"bytes32"},{"indexed":false,"internalType":"bytes32","name":"newRoot","type":"bytes32"}],"name":"RootUpdated","type":"event"},
  {"inputs":[{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"bytes32[]","name":"proof","type":"bytes32[]"}],"name":"claim","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"claimed","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"endTime","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"maxDistributable","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"merkleRoot","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"to","type":"address"}],"name":"recoverLeftover","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"bytes32","name":"newRoot","type":"bytes32"}],"name":"setRoot","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"startTime","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"token","outputs":[{"internalType":"contract IERC20","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"totalDistributed","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"}
];

// ERC20 tối giản
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

// Mặc định nếu chưa load whitelist
const PER_WALLET_DEFAULT = ethers.utils.parseUnits("100", 18).toString();

/*** RPCs ***/
const RPCS = [
  "https://bsc.publicnode.com",
  "https://rpc.ankr.com/bsc",
  "https://1rpc.io/bnb",
  "https://binance.llamarpc.com",
  "https://bsc-dataseed.binance.org"
];

/*** helpers ***/
const $ = id => document.getElementById(id);
const short = a => a ? a.slice(0,6)+"…"+a.slice(-4) : "";
const fmt = (bn, dec=18) => ethers.utils.formatUnits(bn, dec);
function setMsg(t, kind="info"){
  const el = $("msg"); if (!el) return;
  el.textContent = t || "";
  el.style.color = kind==="error" ? "#ef4444" : kind==="warn" ? "#f59e0b" : "var(--muted)";
}

/*** state ***/
let provider, signer, airdrop, token, account=null, pollTimer=null, countdownTimer=null;
let START_TS=0, END_TS=0, MD="0", TD="0", CLAIMED=false, BALANCE="0";
let PER_WALLET = PER_WALLET_DEFAULT;

/*** chain time sync ***/
let CHAIN_NOW=0, SYNCED_AT_MS=0, chainSyncTimer=null;
async function syncChainTime(){
  const b = await provider.getBlock('latest');
  CHAIN_NOW = Number(b.timestamp);
  SYNCED_AT_MS = Date.now();
}
const nowSec = () => CHAIN_NOW ? Math.floor(CHAIN_NOW + (Date.now()-SYNCED_AT_MS)/1000) : Math.floor(Date.now()/1000);

/*** load proofs ***/
async function loadProofs() {
  const url = PROOFS_URL + (PROOFS_URL.includes("?") ? "" : `?v=${Date.now()}`);
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error("Không tải được proofs.json");
  const data = await r.json();
  return data.claims || data;
}

/*** render ***/
function renderStats(){
  $("tokenSymbol") && ($("tokenSymbol").textContent = "ATN");
  $("perWallet")   && ($("perWallet").textContent   = `${fmt(PER_WALLET)} ATN`);

  const per = ethers.BigNumber.from(PER_WALLET_DEFAULT);
  const maxSlots = ethers.BigNumber.from(MD).div(per).toNumber();
  const usedSlots= ethers.BigNumber.from(TD).div(per).toNumber();

  $("maxClaims")    && ($("maxClaims").textContent   = String(maxSlots));
  $("claimedCount") && ($("claimedCount").textContent= String(usedSlots));
  $("contractBal")  && ($("contractBal").textContent = `${fmt(BALANCE)} ATN`);
  $("remaining")    && ($("remaining").textContent   = `Remaining: ${Math.max(maxSlots - usedSlots,0)} slots`);

  const pb=$("claimProgress"), lbl=$("claimProgressLabel");
  if (pb && maxSlots>0){
    const pct=Math.min(100, Math.round((usedSlots/maxSlots)*100));
    pb.style.setProperty("--pct", pct+"%");
    lbl && (lbl.textContent=`${usedSlots}/${maxSlots} claimed (${pct}%)`);
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
  const btn = $("claimBtn");
  if (!btn) return;

  const per = ethers.BigNumber.from(PER_WALLET_DEFAULT);
  const maxSlots = ethers.BigNumber.from(MD).div(per).toNumber();
  const usedSlots= ethers.BigNumber.from(TD).div(per).toNumber();
  const leftSlots= Math.max(maxSlots - usedSlots, 0);

  const nowOK    = (START_TS > 0) && (nowSec() >= START_TS);
  const hasWallet= !!account;
  const hasFollow= $("followChk")?.checked ?? false;
  const enough   = ethers.BigNumber.from(BALANCE).gte(ethers.BigNumber.from(PER_WALLET));
  const canClaim = nowOK && hasWallet && hasFollow && leftSlots > 0 && enough && !CLAIMED;

  btn.style.display = nowOK ? "inline-flex" : "none";
  btn.disabled = !canClaim;

  if (!nowOK) setMsg("Claiming has not started yet.", "warn");
  else if (!hasWallet) setMsg("Connect your wallet to claim.", "info");
  else if (!hasFollow) setMsg(`Please follow @${X_HANDLE} and tick the checkbox.`, "warn");
  else if (!enough) setMsg(leftSlots<=0 ? "All claim slots have been used." : "The contract has insufficient tokens for claiming.", "warn");
  else setMsg("");
}

function startCountdown(){
  if (countdownTimer) clearInterval(countdownTimer);
  const dEl=$("cd-days"), hEl=$("cd-hours"), mEl=$("cd-mins"), sEl=$("cd-secs");
  const badge=$("openBadge");
  const opensChip = $("openAtVN")?.closest(".chip");

  const setAll=(a,b,c,d)=>{ if(dEl)dEl.textContent=a; if(hEl)hEl.textContent=b; if(mEl)mEl.textContent=c; if(sEl)sEl.textContent=d; };

  function tick(){
    if (!START_TS){ setAll("--","--","--","--"); if(badge) badge.style.display="none"; return; }
    let diff = START_TS - nowSec();

    if (diff <= 0){
      setAll("00","00","00","00");
      if (badge)     badge.style.display = "inline-block";
      if (opensChip) opensChip.style.display = "none";
      updateClaimButton();
      return;
    }
    const days=Math.floor(diff/86400); diff%=86400;
    const hrs =Math.floor(diff/3600);  diff%=3600;
    const mins=Math.floor(diff/60);    const secs=diff%60;
    setAll(String(days).padStart(2,"0"),String(hrs).padStart(2,"0"),String(mins).padStart(2,"0"),String(secs).padStart(2,"0"));
    if (badge)     badge.style.display = "none";
    if (opensChip) opensChip.style.display = "";
  }
  tick(); countdownTimer = setInterval(tick, 1000);
}

/*** read info (Merkle) ***/
async function fetchInfo(){
  const [st, ed, md, td] = await Promise.all([
    airdrop.startTime(),
    airdrop.endTime(),
    airdrop.maxDistributable(),
    airdrop.totalDistributed()
  ]);
  START_TS = Number(st);
  END_TS   = Number(ed);
  MD       = md.toString();
  TD       = td.toString();

  BALANCE  = (await token.balanceOf(AIRDROP_ADDR)).toString();

  if (account){
    CLAIMED = await airdrop.claimed(account);
    try {
      const proofs = await loadProofs();
      const row = proofs[account.toLowerCase()];
      PER_WALLET = (row && row.amount) ? row.amount : PER_WALLET_DEFAULT;
    } catch { PER_WALLET = PER_WALLET_DEFAULT; }
  } else {
    PER_WALLET = PER_WALLET_DEFAULT;
  }

  renderStats(); updateClaimButton();
}

/*** ensure BSC ***/
async function ensureBSC(){
  const net = await provider.getNetwork();
  if (net.chainId !== 56){
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
    signer  = provider.getSigner();
    account = await signer.getAddress();
    $("accountLabel") && ($("accountLabel").textContent="Wallet: "+short(account));

    airdrop = new ethers.Contract(AIRDROP_ADDR, AIRDROP_ABI, provider);
    const tokenAddr = await airdrop.token(); // lấy địa chỉ token từ on-chain
    token   = new ethers.Contract(tokenAddr, ERC20_ABI, provider);

    await syncChainTime(); if(chainSyncTimer) clearInterval(chainSyncTimer);
    chainSyncTimer=setInterval(syncChainTime,30000);

    await fetchInfo(); startCountdown(); updateClaimButton();
  }catch(e){ setMsg(e?.message||String(e),"error"); }
}

/*** claim (Merkle) ***/
async function doClaim(){
  try{
    if(!signer){ setMsg("Please connect your wallet first.", "error"); return; }
    if(!$("followChk")?.checked){ setMsg(`Please follow @${X_HANDLE} and tick the checkbox.`, "warn"); return; }
    if(nowSec()<START_TS){ setMsg("Claiming has not started yet.", "warn"); return; }

    const proofs = await loadProofs();
    const row = proofs[account.toLowerCase()];
    if (!row){ setMsg("Ví này không có trong whitelist.", "error"); return; }

    setMsg("Submitting transaction...");
    const tx=await airdrop.connect(signer).claim(ethers.BigNumber.from(row.amount), row.proof);
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

      airdrop=new ethers.Contract(AIRDROP_ADDR, AIRDROP_ABI, provider);
      const tokenAddr = await airdrop.token();
      token  =new ethers.Contract(tokenAddr, ERC20_ABI, provider);

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

      airdrop = new ethers.Contract(AIRDROP_ADDR, AIRDROP_ABI, provider);
      const tokenAddr = await airdrop.token();
      token   = new ethers.Contract(tokenAddr, ERC20_ABI, provider);

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
