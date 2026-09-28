# Security & Invariant Test Report

**Date**: 2026-09-28  
**Protocol Version**: VeriSync Protocol v1.0  
**Test Suites**: `test/05_freshness_and_time.test.js`, `test/06_custody_and_accounting.test.js`, `test/07_verifier_admin.test.js`, `test/08_malformed_inputs.test.js`  
**Status**: PASS (15/15 Passed)

---

## 1. Freshness & Expiration Model (Phase 6)
- **Authoritative Timestamp**: Recorded on-chain by `DestinationBridge.sol` during root registration (`rootRegistrationTime[root] = block.timestamp`).
- **Prover-Independence**: The prover cannot manipulate or submit arbitrary timestamps to bypass expiration.
- **Window**: Configurable `rootExpiryWindow` (default: 3600 seconds).

| Test ID | Description | Result |
| :--- | :--- | :--- |
| **TIME-01** | Valid claim within `rootExpiryWindow` accepted | **PASS** |
| **TIME-02** | Expired claim past `rootExpiryWindow` rejected with `ProofExpired()` | **PASS** |
| **TIME-03** | Prover manipulation of freshness rejected by on-chain state check | **PASS** |
| **TIME-04** | Boundary test near expiry boundary | **PASS** |

---

## 2. Custody & Accounting Invariants (Phase 7)
- **Invariant**: Total claimed assets must never exceed available liquidity deposited in `DestinationBridge.sol`.
- **Atomic Rollback**: Any failed claim (e.g. invalid proof, unmapped token) reverts without consuming the nullifier or altering token balances.

| Test ID | Description | Result |
| :--- | :--- | :--- |
| **INVARIANT-01** | Deposit & claim update balances accurately | **PASS** |
| **INVARIANT-02** | Excessive claim exceeding liquidity rejected with `InsufficientLiquidity()` without consuming nullifier | **PASS** |
| **INVARIANT-03** | Corrupted proof leaves pool balance and nullifier state untouched | **PASS** |

---

## 3. Administrative Security & Verifier Replacement (Phase 8)
- **Access Control**: Owner-only administrative functions protected with OpenZeppelin `Ownable`.
- **2-Step Timelock**: Verifier replacement requires `initiateVerifierUpdate` followed by a 24-hour timelock before `executeVerifierUpdate`.
- **Emergency Pause**: Halts both deposit operations on `SourceBridge.sol` and claims on `DestinationBridge.sol`.

| Test ID | Description | Result |
| :--- | :--- | :--- |
| **ADMIN-01** | Unauthorized accounts rejected with `OwnableUnauthorizedAccount()` | **PASS** |
| **ADMIN-02** | 2-step timelocked verifier update operates safely and respects 24h timelock | **PASS** |
| **ADMIN-03** | Emergency pause halts deposits and claims | **PASS** |
| **ADMIN-04** | Privileged liquidity withdrawal restricted to owner and enforces balance checks | **PASS** |

---

## 4. Negative & Malformed Input Testing (Phase 9)
| Test ID | Description | Result |
| :--- | :--- | :--- |
| **MALFORMED-01** | Corrupted proof components ($\pi_A, \pi_B, \pi_C$) rejected with `InvalidProof()` | **PASS** |
| **MALFORMED-02** | Scalar field overflow ($s \ge r$) rejected by `checkField` | **PASS** |
| **MALFORMED-03** | Unmapped token rejected with `TokenNotMapped()` | **PASS** |
| **MALFORMED-04** | Unregistered source Merkle root rejected with `UnknownSourceRoot()` | **PASS** |
