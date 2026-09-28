# 🌉 VeriSync Protocol v1.0 — ZK-Assisted Cross-Chain Bridge Prototype

> A proof-assisted cross-chain bridge prototype featuring Poseidon-based canonical commitments, incremental Merkle tree deposit anchoring, Groth16 zk-SNARK verification, and replay protection.

[![Solidity](https://img.shields.io/badge/Solidity-0.8.20-blue)](https://soliditylang.org/)
[![Circom](https://img.shields.io/badge/Circom-2.1.8-purple)](https://docs.circom.io/)
[![SnarkJS](https://img.shields.io/badge/SnarkJS-Groth16-orange)](https://github.com/iden3/snarkjs)
[![Hardhat](https://img.shields.io/badge/Hardhat-2.28.0-yellow)](https://hardhat.org/)
[![Status](https://img.shields.io/badge/Validation-Locally%20Validated%20(50%2F50%20Passing)-green)]()

---

## 📌 Project Overview

**VeriSync Protocol v1.0** is an academic prototype evaluating zero-knowledge cryptographic verification for cross-chain token transfers. Instead of relying on trusted multi-signature federations, VeriSync employs **Groth16 zk-SNARKs** over the BN254 curve to prove deposit inclusion on a destination blockchain without revealing the original sender address.

> ⚠️ **Academic Scope Notice**: Public testnet deployment is outside the scope of the current validation. The protocol is evaluated locally through a deterministic 50-test automated suite and end-to-end integration flows.

---

## 🏗️ System Architecture

```
 ┌───────────────────────────────────────┐
 │   Source Chain (SourceBridge.sol)    │
 ├───────────────────────────────────────┤
 │ • User deposits ERC20 / ETH           │
 │ • Canonical 2-step Poseidon Hash      │
 │ • Incremental Merkle Tree (Depth 8)   │
 │ • Emits BridgeDeposit + Merkle Root   │
 └──────────────────┬────────────────────┘
                    │ Event + Root
                    ▼
 ┌───────────────────────────────────────┐
 │      Off-Chain Relayer / Prover       │
 ├───────────────────────────────────────┤
 │ • Synchronizes local Merkle tree      │
 │ • Generates Merkle inclusion proof    │
 │ • Derives nullifier = Poseidon(c, sec)│
 │ • Synthesizes Groth16 witness & proof │
 └──────────────────┬────────────────────┘
                    │ Proof + 7 Public Signals
                    ▼
 ┌───────────────────────────────────────┐
 │ Destination Chain (DestBridge.sol)    │
 ├───────────────────────────────────────┤
 │ • Verifier.sol checks Groth16 proof   │
 │ • Verifies registered source root     │
 │ • Enforces root freshness window      │
 │ • Enforces nullifier replay protection│
 │ • Releases mapped assets to recipient │
 └───────────────────────────────────────┘
```

---

## 🔐 Canonical Cryptographic Design

### 1. Canonical Commitment
Solidity contracts and Circom circuits share an identical 2-step Poseidon construction:
$$\begin{aligned}
h_1 &= \text{Poseidon}_4(\text{sourceChainId}, \text{destinationChainId}, \text{sender}, \text{token}) \\
h_2 &= \text{Poseidon}_4(\text{amount}, \text{recipient}, \text{salt}, \text{nonce}) \\
\text{commitment} &= \text{Poseidon}_2(h_1, h_2)
\end{aligned}$$

### 2. Merkle Deposit Anchoring
- Tree depth: **8 levels** ($2^8 = 256$ deposits).
- Proof verifies that the commitment is a member of the published source Merkle root.
- Uninserted / fabricated deposits cannot produce valid proofs against genuine roots.

### 3. Public Signal Binding (7 Signals)
1. `root`: Merkle root of source deposits
2. `nullifier`: Unique anti-replay token derived via $\text{Poseidon}_2(\text{commitment}, \text{secret})$
3. `amount`: Bridged token amount
4. `sourceToken`: Source token address
5. `recipient`: Destination recipient address
6. `sourceChainId`: Source blockchain ID (domain separation)
7. `destinationChainId`: Destination blockchain ID (domain separation)

---

## ⚙️ Prerequisites

- **Node.js**: `v24.x` or `v20.x`
- **npm**: `v10.x` or `v11.x`
- **Circom**: `v2.1.8`
- **snarkjs**: `v0.7.6`

---

## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/AbiramiR-27/ZKBridge.git
cd ZKBridge

# Install npm dependencies
npm install
```

---

## 🧪 Exact Verification & Test Commands

### 1. Run Complete Automated Test Suite (50 Tests)
```bash
npx hardhat test
```

### 2. Run Targeted Test Suites by Phase
```bash
# Phase 2: Commitment Consistency (8 tests)
npx hardhat test test/01_commitment_consistency.test.js

# Phase 3: Merkle Deposit Anchoring (6 tests)
npx hardhat test test/02_merkle_anchoring.test.js

# Phase 4: Public Input Binding (8 tests)
npx hardhat test test/03_public_input_binding.test.js

# Phase 5: Nullifier & Replay Protection (5 tests)
npx hardhat test test/04_replay_and_nullifier.test.js

# Phase 6: Timestamp & Root Freshness (4 tests)
npx hardhat test test/05_freshness_and_time.test.js

# Phase 7: Custody & Accounting Invariants (3 tests)
npx hardhat test test/06_custody_and_accounting.test.js

# Phase 8: Verifier & Admin Controls (4 tests)
npx hardhat test test/07_verifier_admin.test.js

# Phase 9: Malformed Inputs & Security Testing (4 tests)
npx hardhat test test/08_malformed_inputs.test.js

# Phase 10: Local End-to-End Integration Flow (8 tests)
npx hardhat test test/09_e2e_integration.test.js
```

---

## 🔄 Clean Rebuild & Reproducibility

To compile circuits, re-generate proving artifacts, export the Solidity verifier, compile smart contracts, and run verification:

### Linux / macOS
```bash
chmod +x reproducibility/rebuild.sh
./reproducibility/rebuild.sh
```

### Windows (PowerShell)
```powershell
powershell -ExecutionPolicy Bypass -File reproducibility/rebuild.ps1
```

---

## 📊 Summary of Evidence Package

Detailed evidence reports are cataloged in [`evidence/`](./evidence/):
- [`artifact_hashes.txt`](./evidence/artifact_hashes.txt): SHA-256 checksums of all core artifacts
- [`commitment_consistency_report.md`](./evidence/commitment_consistency_report.md): Formal proof of Solidity/Circom hash equality
- [`protocol_validation_report.md`](./evidence/protocol_validation_report.md): Merkle anchoring & public signal validation
- [`security_test_report.md`](./evidence/security_test_report.md): Freshness, custody, admin, and negative security testing
- [`local_e2e_report.md`](./evidence/local_e2e_report.md): Full lifecycle execution results
- [`privacy_data_visibility_report.md`](./evidence/privacy_data_visibility_report.md): Honest data visibility analysis
- [`zk_reproducibility_report.md`](./evidence/zk_reproducibility_report.md): Constraint metrics and ceremony provenance

---

## ⚠️ Known Limitations & Residual Risks

1. **Testnet Status**: Public testnet deployment is outside the scope of the current validation. All evaluations reflect local EVM and cryptographic simulation.
2. **Trusted Setup Provenance**: Local Groth16 setup requires a production-grade multi-party ceremony prior to mainnet consideration.
3. **Relayer Decentralization**: The prototype relies on a single relayer to sync Merkle roots. Production systems require decentralized consensus or light-client header verification.
4. **Public Source Metadata**: Zero-knowledge proof on the destination chain does not obscure the deposit transaction recorded on the source chain ledger.

---

## 📄 License
MIT License.
