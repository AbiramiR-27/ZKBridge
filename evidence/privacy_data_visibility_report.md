# Privacy and Data Visibility Analysis

**Date**: 2026-09-28  
**Protocol Version**: VeriSync Protocol v1.0  

---

## 1. Precise Data Visibility Matrix

A common misconception in cross-chain zero-knowledge systems is that zk-SNARKs render all transaction parameters private. In VeriSync Protocol v1.0, data visibility is strictly delineated between on-chain public parameters and hidden zero-knowledge witness values.

| Parameter | Location | Visibility Status | Rationale |
| :--- | :--- | :--- | :--- |
| **Sender Address** | Private Witness | **Hidden** on Destination Chain | The prover proves sender authorization inside the commitment without exposing sender address on the destination network. (Note: Sender is publicly visible on source chain deposit event). |
| **Deposit Salt** | Private Witness | **Hidden** | Random blinding value ensuring commitment hiding property. |
| **Deposit Nonce** | Private Witness | **Hidden** | Prevents rainbow table attacks against low-entropy deposits. |
| **Nullifier Secret** | Private Witness | **Hidden** | Prover secret used to derive the public nullifier. |
| **Merkle Path Siblings** | Private Witness | **Hidden** | Proves tree membership without revealing leaf position. |
| **Merkle Root** | Public Signal | **Publicly Visible** | Required by `DestinationBridge.sol` to verify source deposit anchoring. |
| **Nullifier** | Public Signal | **Publicly Visible** | Required by `DestinationBridge.sol` to prevent double-spending. |
| **Amount** | Public Signal | **Publicly Visible** | Destination contract must know exact amount of tokens to unlock/transfer. |
| **Token Address** | Public Signal | **Publicly Visible** | Destination contract must identify destination token mapping. |
| **Recipient Address** | Public Signal | **Publicly Visible** | Destination contract must transfer tokens to recipient. |
| **Source Chain ID** | Public Signal | **Publicly Visible** | Destination contract enforces domain separation against source network. |
| **Destination Chain ID** | Public Signal | **Publicly Visible** | Destination contract enforces domain separation against current network. |

---

## 2. Residual Privacy Risks & Limitations

1. **Source Chain Transparency**: On Ethereum Sepolia, the deposit transaction emits `BridgeDeposit`, which records the sender's source-chain address and amount on the source public ledger.
2. **Metadata Correlation**: If the transfer amount is unique (e.g. 13.48792 tokens), an observer can correlate the source chain deposit with the destination chain claim despite the zero-knowledge proof.
3. **Timing Correlation**: If the claim occurs shortly after the source deposit, temporal heuristics can link the source depositor to the destination recipient.
