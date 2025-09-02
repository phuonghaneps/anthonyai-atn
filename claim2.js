(() => {
/*** CONFIG — Airdrop #2 (Merkle) ***/
const X_HANDLE2      = "Token_ATN";
const AIRDROP2_ADDR  = ethers.utils.getAddress("PASTE_AIRDROP2B_ADDRESS_HERE"); // <— ĐIỀN CONTRACT MỚI
const TOKEN_ADDR     = ethers.utils.getAddress("0xb5C84953983931dd2C10C9b04a379eE52697193"); // ATN
const PROOFS_URL     = "./claim/proofs.json"; // đường dẫn proofs.json bạn up lên GitHub Pages

// ABI tối giản cho MerkleAirdropV2 (claim(amount, proof))
const AIRDROP2_ABI   = [
  "function claim(uint256 amount, bytes32[] proof) external",
  "function claimed(address) view returns (bool)",
  "function startTime() view returns (uint256)",
  "function endTime() view returns (uint256)",
  "function totalDistributed() view returns (uint256)",
  "function maxDistributable() view returns (uint256)"
];
// ERC20 balanceOf để đọc số ATN còn trong contract
const ERC20_ABI      = [ "function balanceOf(address) view returns (uint256)" ];

// Nếu per-wallet cố định 100 ATN → để mặc định này (18 decimals).
const PER_WALLET2_DEFAULT = ethers.utils.parseUnits("100", 18).toString();

/*** RPCs (khỏe) ***/
const RPCS2 = [
  "https://bsc.publicnode.com",
  "https://rpc.ankr.com/bsc",
  "https://1rpc.io/bnb",
  "https://binance.llamarpc.com",
  "https://bsc-dataseed.binance.org"
];

/*** utils ***/
const $ = id => document.getElementById(id);
const short = a => a ? a.slice(0,6)+"…"+a.slice(-4) : "";
const fmt   = (bn, dec=18) => ethers.utils.formatUnits(bn, dec);
function setMsg2(t, kind="info"){
  const el = $("msg2"); if(!el) return;
  el.textContent = t || "";
  el.style.color = kind==="error" ? "#ef4444" : kind==="warn" ? "#f59e0b" : "var(--muted)";
}

/*** state ***/
let provider2, signer2, airdrop2, token2, account2=null, pollTimer2=null, countdownTimer2=null;
let START_TS2=0, END_TS2=0, MD2="0", TD2="0", CLAIMED2=false, BALANCE2="0";
let PER_WALLET2 = PER_WALLET2_DEFAULT; // sẽ cập nhật theo proofs nếu ví có trong whitelist
let PROOFS2=null;

/*** chain time sync ***/
let CHAIN_NOW2=0, SYNCED_AT_MS2=0, chainSyncTimer2=null;
async function syncChainTime2(){
  const b = await provider2.getBlock('latest');
  CHAIN_NOW2 = Number(b.timestamp);
  SYNCED_AT_MS2 = Date.now();
}
const nowSec2 = () => CHAIN_NOW2 ? Math.floor(CHAIN_NOW2 + (Date.now()-SYNCED_AT_MS2)/1000) : Math.floor(Date.now()/1000);

/*** fetch proofs.json ***/
async function loadProofs() {
  const candidates = [
    'proofs.json',
    '/proofs.json',
    './proofs.json',
    'assets/proofs.json',
    './assets/proofs.json'
  ];
  for (const p of candidates) {
    try {
      const r = await fetch(p, { cache: 'no-cache' });
      if (r.ok) return await r.json();
    } catch (_) {}
  }
  throw new Error('Không tìm thấy proofs.json ở các đường dẫn mặc định');
}


/*** render ***/
function renderStats2(){
  $("tokenSymbol2") && ($("tokenSymbol2").textContent = "ATN");
  $("perWallet2")   && ($("perWallet2").textContent   = `${fmt(PER_WALLET2)} ATN`);

  // Quy đổi slot theo per-wallet mặc định 100 ATN (nếu bạn thay đổi, sửa PER_WALLET2_DEFAULT)
  const per = ethers.BigNumber.from(PER_WALLET2_DEFAULT);
  const maxSlots = ethers.BigNumber.from(MD2).div(per).toNumber();
  const usedSlots= ethers.BigNumber.from(TD2).div(per).toNumber();

  $("maxClaims2")    && ($("maxClaims2").textContent   = String(maxSlots));
  $("claimedCount2") && ($("claimedCount2").textContent= String(usedSlots));
  $("contractBal2")  && ($("contractBal2").textContent = `${fmt(BALANCE2)} ATN`);
  $("remaining2")    && ($("remaining2").textContent   = `Remaining: ${Math.max(maxSlots - usedSlots,0)} slots`);

  const pb=$("claimProgress2"), lbl=$("claimProgressLabel2");
  if (pb && maxSlots>0){
    const pct=Math.min(100, Math.round((usedSlots/maxSlots)*100));
    pb.style.setProperty("--pct", pct+"%");
    lbl && (lbl.textContent=`${usedSlots}/${maxSlots} claimed (${pct}%)`);
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
  const btn = $("claimBtn2");
  if (!btn) return;

  const per = ethers.BigNumber.from(PER_WALLET2_DEFAULT);
  const maxSlots = ethers.BigNumber.from(MD2).div(per).toNumber();
  const usedSlots= ethers.BigNumber.from(TD2).div(per).toNumber();
  const leftSlots= Math.max(maxSlots - usedSlots, 0);

  const nowOK    = (START_TS2 > 0) && (nowSec2() >= START_TS2);
  const hasWallet= !!account2;
  const hasFollow= $("followChk2")?.checked ?? false;
  const enough   = ethers.BigNumber.from(BALANCE2).gte(ethers.BigNumber.from(PER_WALLET2));
  const canClaim = nowOK && hasWallet && hasFollow && leftSlots > 0 && enough && !CLAIMED2;

  btn.style.display = nowOK ? "inline-flex" : "none";
  btn.disabled = !canClaim;

  if (!nowOK) setMsg2("Claiming has not started yet.", "warn");
  else if (!hasWallet) setMsg2("Connect your wallet to claim.", "info");
  else if (!hasFollow) setMsg2(`Please follow @${X_HANDLE2} and tick the checkbox.`, "warn");
  else if (!enough) setMsg2(leftSlots<=0 ? "All claim slots have been used." : "The contract has insufficient tokens for claiming.", "warn");
  else setMsg2("");
}

function startCountdown2(){
  if (countdownTimer2) clearInterval(countdownTimer2);
  const dEl=$("cd-days2"), hEl=$("cd-hours2"), mEl=$("cd-mins2"), sEl=$("cd-secs2");
  const badge=$("openBadge2");
  const opensChip = $("openAtVN2")?.closest(".chip");

  const setAll=(a,b,c,d)=>{ if(dEl)dEl.textContent=a; if(hEl)hEl.textContent=b; if(mEl)mEl.textContent=c; if(sEl)sEl.textContent=d; };

  function tick(){
    if (!START_TS2){ setAll("--","--","--","--"); if(badge) badge.style.display="none"; return; }
    let diff = START_TS2 - nowSec2();

    if (diff <= 0){
      setAll("00","00","00","00");
      if (badge)     badge.style.display = "inline-block";
      if (opensChip) opensChip.style.display = "none";
      updateClaimButton2();
      return;
    }
    const days=Math.floor(diff/86400); diff%=86400;
    const hrs =Math.floor(diff/3600);  diff%=3600;
    const mins=Math.floor(diff/60);    const secs=diff%60;
    setAll(String(days).padStart(2,"0"),String(hrs).padStart(2,"0"),String(mins).padStart(2,"0"),String(secs).padStart(2,"0"));
    if (badge)     badge.style.display = "none";
    if (opensChip) opensChip.style.display = "";
  }
  tick(); countdownTimer2 = setInterval(tick, 1000);
}

/*** read info (Merkle) ***/
async function fetchInfo2(){
  // đọc thông tin tổng
  const [st, ed, md, td] = await Promise.all([
    airdrop2.startTime(),
    airdrop2.endTime(),
    airdrop2.maxDistributable(),
    airdrop2.totalDistributed()
  ]);
  START_TS2 = Number(st);
  END_TS2   = Number(ed);
  MD2       = md.toString();
  TD2       = td.toString();

  // số ATN đang nằm trong contract (để kiểm tra đủ token)
  BALANCE2  = (await token2.balanceOf(AIRDROP2_ADDR)).toString();

  // trạng thái ví hiện tại
  if (account2){
    CLAIMED2 = await airdrop2.claimed(account2);
    // nếu ví có trong whitelist → hiển thị đúng amount per-wallet của người đó
    try {
      const proofs = await loadProofs2();
      const row = proofs[account2.toLowerCase()];
      PER_WALLET2 = (row && row.amount) ? row.amount : PER_WALLET2_DEFAULT;
    } catch { PER_WALLET2 = PER_WALLET2_DEFAULT; }
  } else {
    PER_WALLET2 = PER_WALLET2_DEFAULT; // chưa connect: hiển thị mặc định 100 ATN
  }

  renderStats2(); updateClaimButton2();
}

/*** ensure BSC ***/
async function ensureBSC2(){
  const net = await provider2.getNetwork();
  if (net.chainId !== 56){
    try{
      await window.ethereum.request({method:"wallet_switchEthereumChain",params:[{chainId:"0x38"}]});
    }catch{
      await window.ethereum.request({
        method:"wallet_addEthereumChain",
        params:[{chainId:"0x38",chainName:"BNB Smart Chain",nativeCurrency:{name:"BNB",symbol:"BNB",decimals:18},rpcUrls:["https://bsc-dataseed.binance.org/"],blockExplorerUrls:["https://bscscan.com/"]}]} );
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
    signer2  = provider2.getSigner();
    account2 = await signer2.getAddress();
    $("accountLabel2") && ($("accountLabel2").textContent="Wallet: "+short(account2));

    airdrop2 = new ethers.Contract(AIRDROP2_ADDR, AIRDROP2_ABI, provider2);
    token2   = new ethers.Contract(TOKEN_ADDR,    ERC20_ABI,   provider2);

    await syncChainTime2(); if(chainSyncTimer2) clearInterval(chainSyncTimer2);
    chainSyncTimer2=setInterval(syncChainTime2,30000);

    await fetchInfo2(); startCountdown2(); updateClaimButton2();
  }catch(e){ setMsg2(e?.message||String(e),"error"); }
}

/*** claim (Merkle) ***/
async function doClaim2(){
  try{
    if(!signer2){ setMsg2("Please connect your wallet first.", "error"); return; }
    if(!$("followChk2")?.checked){ setMsg2(`Please follow @${X_HANDLE2} and tick the checkbox.`, "warn"); return; }
    if(nowSec2()<START_TS2){ setMsg2("Claiming has not started yet.", "warn"); return; }

    const proofs = await loadProofs2();
    const row = proofs[account2.toLowerCase()];
    if (!row){ setMsg2("Ví này không có trong whitelist.", "error"); return; }

    setMsg2("Submitting transaction...");
    const tx=await airdrop2.connect(signer2).claim(ethers.BigNumber.from(row.amount), row.proof);
    setMsg2("Waiting for confirmation: "+tx.hash);
    await tx.wait();
    setMsg2("Claim successful!","success");
    await fetchInfo2();
  }catch(e){
    setMsg2((e&&(e.error?.message||e.data?.message||e.message))||"Claim failed","error");
  }
}

/*** readonly init (không cần connect) ***/
async function initReadonly2(){
  let lastErr;
  for(const url of RPCS2){
    try{
      provider2=new ethers.providers.JsonRpcProvider(url, { name: "bnb", chainId: 56 });
      await provider2.getBlockNumber();
      const code = await provider2.getCode(AIRDROP2_ADDR);
      if (code === "0x"){ setMsg2("No contract code at " + AIRDROP2_ADDR, "error"); return; }

      airdrop2=new ethers.Contract(AIRDROP2_ADDR, AIRDROP2_ABI, provider2);
      token2  =new ethers.Contract(TOKEN_ADDR,    ERC20_ABI,   provider2);

      await syncChainTime2(); if(chainSyncTimer2) clearInterval(chainSyncTimer2);
      chainSyncTimer2=setInterval(syncChainTime2,30000);

      await fetchInfo2(); startCountdown2();
      startPolling2(); setMsg2("Connect your wallet to claim.","info");
      return;
    }catch(e){ lastErr=e; }
  }

  /* Fallback đọc chain qua MetaMask nếu RPC public đều fail */
  if (window.ethereum) {
    try {
      provider2 = new ethers.providers.Web3Provider(window.ethereum, "any");
      await provider2.getBlockNumber();
      const code = await provider2.getCode(AIRDROP2_ADDR);
      if (code === "0x"){ setMsg2("No contract code at " + AIRDROP2_ADDR, "error"); return; }

      airdrop2 = new ethers.Contract(AIRDROP2_ADDR, AIRDROP2_ABI, provider2);
      token2   = new ethers.Contract(TOKEN_ADDR,    ERC20_ABI,   provider2);

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
function runOnReady(fn){ document.readyState==="loading" ? document.addEventListener("DOMContentLoaded", fn, {once:true}) : fn(); }
runOnReady(initReadonly2);

$("followChk2") && $("followChk2").addEventListener("change", updateClaimButton2);
$("connectBtn2") && $("connectBtn2").addEventListener("click", connect2);
$("claimBtn2")   && $("claimBtn2").addEventListener("click", doClaim2);

if (window.ethereum){
  window.ethereum.on("accountsChanged", ()=>location.reload());
  window.ethereum.on("chainChanged",  ()=>location.reload());
}
})();
