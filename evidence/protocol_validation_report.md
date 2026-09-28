# Protocol Validation Report: Merkle Anchoring & Public Input Binding

**Date**: 2026-09-28  
**Protocol Version**: VeriSync Protocol v1.0  
**Test Suites**: `test/02_merkle_anchoring.test.js`, `test/03_public_input_binding.test.js`, `test/04_replay_and_nullifier.test.js`  
**Status**: PASS (19/19 Passed)

---

## 1. Merkle Deposit Anchoring Design
To prevent provers from generating proofs for arbitrary, unmade deposits, `SourceBridge.sol` maintains an incremental Merkle tree of depth 8 ($2^8 = 256$ deposits).
- Every valid deposit appends its `commitment` into the tree and updates `currentRoot`.
- The circuit verifies that the prover's commitment is a valid leaf in the tree with Merkle root `root`.
- The `DestinationBridge.sol` verifies that `isKnownSourceRoot[root] == true`.

### Test Evidence (Phase 3)
| Test ID | Description | Result |
| :--- | :--- | :--- |
| **MERKLE-01** | Valid deposited leaf + correct Merkle path + correct root $\rightarrow$ verifies locally & on-chain | **PASS** |
| **MERKLE-02** | Leaf not present in tree $\rightarrow$ proof generation / verification fails | **PASS** |
| **MERKLE-03** | Correct leaf with altered root in public signals $\rightarrow$ rejected | **PASS** |
| **MERKLE-04** | Altered Merkle path sibling $\rightarrow$ constraint failure | **PASS** |
| **MERKLE-05** | Altered commitment parameter $\rightarrow$ root constraint failure | **PASS** |
| **MERKLE-06** | Fabricated deposit never inserted into tree cannot produce accepted proof against genuine root | **PASS** |

---

## 2. Public Input Binding Design
The circuit exposes and cryptographically binds all 7 public parameters required by `DestinationBridge.sol`:
1. `root` (Signal 0)
2. `nullifier` (Signal 1)
3. `amount` (Signal 2)
4. `sourceToken` (Signal 3)
5. `recipient` (Signal 4)
6. `sourceChainId` (Signal 5)
7. `destinationChainId` (Signal 6)

### Test Evidence (Phase 4)
| Test ID | Description | Result |
| :--- | :--- | :--- |
| **PUBLIC-INPUT-01** | Correct recipient in claim parameters $\rightarrow$ accepted | **PASS** |
| **PUBLIC-INPUT-02** | Alter recipient in public signals $\rightarrow$ rejected | **PASS** |
| **PUBLIC-INPUT-03** | Alter amount in public signals $\rightarrow$ rejected | **PASS** |
| **PUBLIC-INPUT-04** | Alter token address in public signals $\rightarrow$ rejected | **PASS** |
| **PUBLIC-INPUT-05** | Alter source chain ID in public signals $\rightarrow$ rejected | **PASS** |
| **PUBLIC-INPUT-06** | Alter destination chain ID in public signals $\rightarrow$ rejected | **PASS** |
| **PUBLIC-INPUT-07** | Alter Merkle root in public signals $\rightarrow$ rejected | **PASS** |
| **PUBLIC-INPUT-08** | Alter nullifier in public signals $\rightarrow$ rejected | **PASS** |

---

## 3. Replay Protection & Nullifier Tracking (Phase 5)
| Test ID | Description | Result |
| :--- | :--- | :--- |
| **REPLAY-01** | First claim accepted; identical second claim rejected with `NullifierAlreadyUsed()` | **PASS** |
| **REPLAY-02** | Nullifier submitted twice with different recipient or parameters rejected | **PASS** |
| **REPLAY-03** | Frontrunner replay attempt rejected | **PASS** |
| **REPLAY-04** | Cross-destination replay attempt with altered chain ID rejected | **PASS** |
| **REPLAY-05** | Cross-source replay attempt with altered chain ID rejected | **PASS** |
