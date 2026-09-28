# Local End-to-End Integration Report

**Date**: 2026-09-28  
**Protocol Version**: VeriSync Protocol v1.0  
**Test Suite**: `test/09_e2e_integration.test.js`  
**Status**: PASS (8/8 Passed)

---

## 1. Local Flow Architecture
The local integration pipeline demonstrates the full VeriSync cross-chain lifecycle:

$$\begin{aligned}
\text{User Deposit on SourceBridge} &\longrightarrow \text{Poseidon Commitment Calculation} \\
&\longrightarrow \text{Incremental Merkle Tree Insertion (Depth 8)} \\
&\longrightarrow \text{Source Merkle Root Emission} \\
&\longrightarrow \text{Root Registration on DestinationBridge} \\
&\longrightarrow \text{SnarkJS Groth16 Witness \& Proof Generation} \\
&\longrightarrow \text{DestinationBridge Claim Execution} \\
&\longrightarrow \text{Nullifier Mark \& Token Release}
\end{aligned}$$

## 2. Test Evidence

| Test ID | Scenario | Expected Outcome | Actual Outcome | Result |
| :--- | :--- | :--- | :--- | :--- |
| **E2E-01** | Full Lifecycle: Deposit $\rightarrow$ Merkle insert $\rightarrow$ Proof $\rightarrow$ Claim | Tokens released to recipient | Tokens released, event emitted | **PASS** |
| **E2E-02** | Fabricated deposit (never inserted on source) | Rejected with `UnknownSourceRoot` | Rejected | **PASS** |
| **E2E-03** | Valid proof with altered recipient address | Rejected with `InvalidProof` | Rejected | **PASS** |
| **E2E-04** | Valid proof with altered amount | Rejected with `InvalidProof` | Rejected | **PASS** |
| **E2E-05** | Valid proof with altered token address | Rejected | Rejected | **PASS** |
| **E2E-06** | Valid proof with altered destination chain ID | Rejected with `InvalidDestinationChain` | Rejected | **PASS** |
| **E2E-07** | Valid claim replayed a second time | Rejected with `NullifierAlreadyUsed` | Rejected | **PASS** |
| **E2E-08** | Corrupted / malformed proof payload | Rejected | Rejected | **PASS** |

## 3. Scope Note
> **Explicit Scope Boundary**: All integration tests were executed in a deterministic local Hardhat EVM environment. Public testnet deployment is out of scope for this evaluation milestone and was not performed.
