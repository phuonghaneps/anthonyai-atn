// scripts/make-proofs.js
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');
const { ethers } = require('ethers');

const CSV = process.env.CSV || 'lists/airdrop2.csv';
const TARGET_DIR = process.env.TARGET_DIR || '<repo>'; // <— ĐÚNG tên thư mục của bạn
const OUT = `${TARGET_DIR}/proofs.json`;

const csv = fs.readFileSync(CSV, 'utf8');
const rows = parse(csv, { columns: true, skip_empty_lines: true });

const entries = rows.map(r => {
  const addr = ethers.utils.getAddress(r.address).toLowerCase();
  const amountWei = r.amountWei
    ? ethers.BigNumber.from(r.amountWei)
    : ethers.utils.parseUnits(String(r.amountATN ?? r.amount ?? '100'), 18);
  return { addr, amountWei };
});

// leaf = keccak256(abi.encodePacked(address, uint256))
const leaves = entries.map(e =>
  Buffer.from(
    ethers.utils.solidityKeccak256(['address','uint256'], [e.addr, e.amountWei]).slice(2),
    'hex'
  )
);

const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });

const out = {};
entries.forEach((e, i) => {
  const proof = tree.getHexProof(leaves[i]);
  out[e.addr] = { amount: e.amountWei.toString(), proof };
});

fs.mkdirSync(TARGET_DIR, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log('merkleRoot =', '0x' + tree.getRoot().toString('hex'));

