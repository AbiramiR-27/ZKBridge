# VeriSync: ZK International Bridge Verifier System

## Project Report

### 1. Abstract

VeriSync is a decentralized cross-chain bridge verification system that leverages Zero-Knowledge Succinct Non-Interactive Arguments of Knowledge (ZK-SNARKs) to enable trustless token transfers between blockchain networks. The system eliminates the need for centralized bridge operators by cryptographically proving the validity of cross-chain transactions without revealing sensitive information.

This project demonstrates the practical implementation of ZK-SNARKs in a real-world blockchain interoperability scenario, addressing critical security concerns in existing bridge architectures that have historically been vulnerable to exploits totaling billions of dollars in losses.

---

### 2. Introduction

#### 2.1 Background

Cross-chain bridges are essential infrastructure for blockchain interoperability, enabling users to transfer assets between different blockchain networks. However, traditional bridge designs suffer from significant security vulnerabilities:

- **Centralized Trust**: Most bridges rely on multisig wallets or centralized validators
- **Replay Attacks**: Transactions can potentially be replayed across chains
- **Front-running**: MEV bots can exploit pending bridge transactions
- **Oracle Manipulation**: Price oracle exploits can drain bridge liquidity

#### 2.2 Problem Statement

How can we create a trustless cross-chain bridge that:
1. Requires no trusted intermediaries
2. Provides cryptographic guarantees of transaction validity
3. Preserves user privacy while maintaining transparency
4. Prevents double-spending and replay attacks

#### 2.3 Proposed Solution

VeriSync addresses these challenges by implementing a ZK-SNARK-based verification system where:
- Deposits on the source chain generate cryptographic commitments
- Zero-knowledge proofs verify deposit validity without revealing private data
- On-chain verifiers validate proofs before releasing funds
- Nullifiers prevent double-claiming of deposits

---

### 3. System Architecture

#### 3.1 High-Level Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Source Chain   │     │  Relayer Service │     │ Destination Chain│
│   (Sepolia)     │────▶│  (ZK Prover)     │────▶│  (Polygon Amoy)  │
│                 │     │                  │     │                  │
│ SourceBridge.sol│     │ - Event Listener │     │DestBridge.sol    │
│ - deposit()     │     │ - Proof Generator│     │ - claimWithProof()
│ - commitment    │     │ - Transaction    │     │ - Verifier.sol   │
│   emission      │     │   Submitter      │     │ - nullifier check│
└─────────────────┘     └──────────────────┘     └──────────────────┘
```

#### 3.2 Component Details

**3.2.1 Source Bridge Contract (SourceBridge.sol)**
- Accepts token deposits from users
- Generates Pedersen commitment hashes
- Emits events containing deposit metadata
- Supports both ERC-20 tokens and native ETH

**3.2.2 ZK Circuit (bridge_verifier.circom)**
- Verifies commitment hash matches deposit data
- Computes nullifier to prevent double-spending
- Validates recipient and amount
- Generates SNARK proof for on-chain verification

**3.2.3 Destination Bridge Contract (DestinationBridge.sol)**
- Verifies ZK proofs on-chain using Groth16 verifier
- Checks nullifier hasn't been used
- Mints or releases equivalent tokens to recipient
- Maintains mapping of processed commitments

**3.2.4 Relayer Service**
- Monitors source chain for deposit events
- Generates ZK proofs using snarkjs
- Submits proofs to destination chain
- Handles retry logic and gas optimization

---

### 4. Technical Implementation

#### 4.1 Cryptographic Primitives

**Commitment Scheme:**
```
commitment = Poseidon(sender, token, amount, recipient, destChainId, salt, nonce)
```

The Poseidon hash function is used for its efficiency in ZK circuits, requiring significantly fewer constraints than Pedersen or SHA-256.

**Nullifier Computation:**
```
nullifier = Poseidon(commitment, nullifierSecret)
```

The nullifier serves as a unique identifier that can be publicly revealed without exposing the underlying deposit details.

#### 4.2 ZK Circuit Design

The circuit performs the following verifications:
1. Recomputes commitment from private inputs
2. Verifies commitment matches public input
3. Computes nullifier from commitment and secret
4. Validates recipient address format
5. Ensures amount is within valid range

**Circuit Statistics:**
- Constraints: ~15,000
- Public Inputs: 4 (commitment, nullifier, recipient, amount)
- Private Inputs: 8 (sender, token, destChainId, salt, nonce, nullifierSecret, timestamp)

#### 4.3 Smart Contract Security

**Access Control:**
- Owner-only administrative functions
- Role-based relayer authorization
- Pausable functionality for emergencies

**Reentrancy Protection:**
- ReentrancyGuard on all state-changing functions
- Checks-Effects-Interactions pattern

**Validation:**
- Input validation on all parameters
- Overflow protection using SafeMath
- Address validation for recipients

---

### 5. Security Analysis

#### 5.1 Threat Model

| Threat | Mitigation |
|--------|------------|
| Double-spending | Nullifier tracking prevents reuse |
| Replay attacks | Chain ID included in commitment |
| Front-running | Commitment scheme hides details |
| Proof forgery | ZK-SNARK soundness guarantees |
| Oracle manipulation | No external price oracles used |

#### 5.2 Attack Resistance

**Soundness**: The Groth16 proof system provides computational soundness - a malicious prover cannot generate a valid proof for false statements without breaking discrete logarithm assumptions.

**Zero-Knowledge**: Private inputs (salt, nullifier secret) remain hidden, protecting user privacy while enabling verification.

**Completeness**: Any valid deposit can always generate a valid proof, ensuring legitimate users are never locked out.

---

### 6. Performance Metrics

#### 6.1 Gas Costs (Estimated)

| Operation | Gas Cost | USD (at 20 gwei) |
|-----------|----------|------------------|
| Deposit | ~150,000 | ~$0.50 |
| Proof Verification | ~280,000 | ~$0.90 |
| Total Bridge Cost | ~430,000 | ~$1.40 |

#### 6.2 Proof Generation Time

- Circuit compilation: ~30 seconds (one-time)
- Witness generation: ~2 seconds
- Proof generation: ~15 seconds
- Total latency: ~17 seconds per bridge transaction

---

### 7. Testing Strategy

#### 7.1 Unit Tests
- Contract function tests using Hardhat
- Circuit constraint tests using circom_tester
- Edge case validation

#### 7.2 Integration Tests
- End-to-end bridge flow on testnets
- Multi-user concurrent bridging
- Error handling scenarios

#### 7.3 Security Auditing
- Static analysis with Slither
- Formal verification of critical paths
- Manual code review

---

### 8. Deployment Guide

#### 8.1 Prerequisites
- Node.js >= 18.0.0
- Circom 2.1.0+
- Hardhat
- MetaMask or compatible wallet

#### 8.2 Deployment Steps

1. **Compile Circuits:**
```bash
cd circuits
circom bridge_verifier.circom --r1cs --wasm --sym
```

2. **Generate Proving Keys:**
```bash
snarkjs groth16 setup bridge_verifier.r1cs pot12_final.ptau bridge_verifier_0000.zkey
snarkjs zkey contribute bridge_verifier_0000.zkey bridge_verifier_final.zkey
```

3. **Deploy Contracts:**
```bash
npx hardhat run scripts/deploy.js --network sepolia
npx hardhat run scripts/deploy.js --network amoy
```

4. **Configure Relayer:**
```bash
cp .env.example .env
# Edit .env with contract addresses and private keys
node relayer/index.js
```

---

### 9. Future Improvements

1. **Recursive Proofs**: Batch multiple proofs into single verification
2. **PLONK Migration**: Switch to universal trusted setup
3. **Multi-chain Support**: Extend to additional EVM chains
4. **NFT Bridging**: Support ERC-721 and ERC-1155 tokens
5. **Decentralized Relayers**: Implement relayer network with staking

---

### 10. Conclusion

VeriSync demonstrates that Zero-Knowledge proofs can effectively solve the trust problem in cross-chain bridges. By cryptographically proving deposit validity without relying on centralized validators, the system achieves:

- **Trustless Operation**: No single point of failure
- **Privacy Preservation**: Deposit details remain confidential
- **Security Guarantees**: Mathematically provable correctness
- **Efficient Verification**: On-chain proof validation in ~280k gas

This project serves as a foundation for building more secure blockchain infrastructure and advancing the adoption of ZK technology in real-world applications.

---

### 11. References

1. Groth, J. (2016). On the Size of Pairing-based Non-interactive Arguments
2. Ben-Sasson, E. et al. (2014). Succinct Non-Interactive Zero Knowledge for a von Neumann Architecture
3. Grassi, L. et al. (2021). Poseidon: A New Hash Function for Zero-Knowledge Proof Systems
4. Buterin, V. (2021). An Incomplete Guide to Rollups
5. Ethereum Foundation. (2023). EIP-4844: Shard Blob Transactions

---

### 12. Appendix

#### A. Contract Addresses (Testnet)

| Contract | Network | Address |
|----------|---------|---------|
| SourceBridge | Sepolia | TBD after deployment |
| DestinationBridge | Amoy | TBD after deployment |
| BridgeToken | Sepolia | TBD after deployment |
| Verifier | Amoy | TBD after deployment |

#### B. Circuit Hash
```
bridge_verifier.circom SHA-256: [Generated after compilation]
```

#### C. Trusted Setup Contribution
```
Powers of Tau: Hermez Phase 1 Ceremony
Contribution Hash: [Generated after contribution]
```
