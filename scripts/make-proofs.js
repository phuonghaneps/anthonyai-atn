// scripts/make-proofs.js (ethers v6)
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { MerkleTree } = require('merkletreejs');
const keccak256buf = require('keccak256');

// lấy hàm v6 trực tiếp
const { getAddress, parseUnits, keccak256, solidityPacked } = require('ethers');

const CSV = process.env.CSV || 'lists/airdrop2.csv';
const TARGET_DIR = process.env.TARGET_DIR || '<repo>';   // thư mục đích của bạn
const OUT = `${TARGET_DIR}/proofs.json`;

// đọc CSV
const csv = fs.readFileSync(CSV, 'utf8');
const rows = parse(csv, { columns: true, skip_empty_lines: true });

// chuẩn hóa dữ liệu
const entries = rows.map(r => {
  // validate + chuẩn checksum rồi hạ lowercase để làm key
  const addr = getAddress(r.address).toLowerCase();

  // ưu tiên trường amountWei; nếu không có thì lấy amountATN/amount và parse 18 decimals
  const amountWei = r.amountWei
    ? BigInt(r.amountWei)
    : parseUnits(String(r.amountATN ?? r.amount ?? 100), 18);

  return { addr, amountWei };
});

// leaf = keccak256(abi.encodePacked(address, uint256))
const leaves = entries.map(e => {
  const leafHex = keccak256(
    solidityPacked(['address', 'uint256'], [e.addr, e.amountWei])
  ); // "0x..."
  return Buffer.from(leafHex.slice(2), 'hex');
});

// build tree, sortPairs để hash theo cặp đã sort
const tree = new MerkleTree(leaves, keccak256buf, { sortPairs: true });

// tạo object { address(lowercase): { amount, proof } }
const claims = {};
entries.forEach((e, i) => {
  claims[e.addr] = {
    amount: e.amountWei.toString(),
    proof: tree.getHexProof(leaves[i])
  };
});

// ghi file
fs.mkdirSync(TARGET_DIR, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(claims, null, 2));
console.log('Wrote', OUT, 'with', Object.keys(claims).length, 'entries');
