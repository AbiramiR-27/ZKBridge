# Commitment Consistency Report

**Date**: 2026-09-28  
**Protocol Version**: VeriSync Protocol v1.0  
**Test Suite**: `test/01_commitment_consistency.test.js`  
**Status**: PASS (8/8 Passed)

---

## 1. Problem Addressed
In the original prototype, `SourceBridge.sol` computed commitments using `keccak256`, whereas `circuits/bridge_verifier.circom` computed commitments using the `Poseidon` hash. This mismatch broke verification consistency between on-chain contract logic and off-chain zero-knowledge circuits.

## 2. Canonical Construction Implemented
We implemented a canonical 2-step Poseidon hash scheme across Solidity (`SourceBridge.sol`), Circom (`bridge_verifier.circom`), and JavaScript (`merkle.js`):

$$\begin{aligned}
h_1 &= \text{Poseidon}_4(\text{sourceChainId}, \text{destinationChainId}, \text{sender}, \text{token}) \\
h_2 &= \text{Poseidon}_4(\text{amount}, \text{recipient}, \text{salt}, \text{nonce}) \\
\text{commitment} &= \text{Poseidon}_2(h_1, h_2)
\end{aligned}$$

## 3. Test Evidence

| Test ID | Description | Expected | Actual | Result |
| :--- | :--- | :--- | :--- | :--- |
| **TEST-COMMITMENT-01** | Same inputs produce identical Solidity & Circom/JS commitment | Exact Match | Exact Match | **PASS** |
| **TEST-COMMITMENT-02** | Changing `sender` produces different commitment | $C_1 \neq C_2$ | $C_1 \neq C_2$ | **PASS** |
| **TEST-COMMITMENT-03** | Changing `token` produces different commitment | $C_1 \neq C_2$ | $C_1 \neq C_2$ | **PASS** |
| **TEST-COMMITMENT-04** | Changing `amount` produces different commitment | $C_1 \neq C_2$ | $C_1 \neq C_2$ | **PASS** |
| **TEST-COMMITMENT-05** | Changing `recipient` produces different commitment | $C_1 \neq C_2$ | $C_1 \neq C_2$ | **PASS** |
| **TEST-COMMITMENT-06** | Changing `sourceChainId` produces different commitment | $C_1 \neq C_2$ | $C_1 \neq C_2$ | **PASS** |
| **TEST-COMMITMENT-07** | Changing `destinationChainId` produces different commitment | $C_1 \neq C_2$ | $C_1 \neq C_2$ | **PASS** |
| **TEST-COMMITMENT-08** | Changing `salt` or `nonce` produces different commitment | $C_1 \neq C_2 \neq C_3$ | $C_1 \neq C_2 \neq C_3$ | **PASS** |
