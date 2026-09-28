# 🌉 VeriSync — ZK Cross-Chain Bridge

> A Zero-Knowledge proof-based cross-chain token bridge designed to enable
> verifiable and privacy-preserving transfers between blockchain networks.

[![Solidity](https://img.shields.io/badge/Solidity-0.8.20-blue)](https://soliditylang.org/)
[![Circom](https://img.shields.io/badge/Circom-2.1.6-purple)](https://docs.circom.io/)
[![SnarkJS](https://img.shields.io/badge/SnarkJS-Groth16-orange)](https://github.com/iden3/snarkjs)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![Ethereum](https://img.shields.io/badge/Source-Ethereum%20Sepolia-627eea)](https://ethereum.org/)
[![Polygon](https://img.shields.io/badge/Destination-Polygon%20Amoy-8247e5)](https://polygon.technology/)

---

## 📌 Overview

**VeriSync** is a Zero-Knowledge (ZK) proof-based cross-chain bridge
prototype that demonstrates how a transaction initiated on one blockchain
can be verified and claimed on another chain without exposing all of the
underlying transaction information.

The system combines:

- 🔐 Zero-Knowledge proofs
- ⛓️ Cross-chain communication
- 🧮 Circom circuits
- 🧾 Groth16 proofs through SnarkJS
- 📜 Solidity smart contracts
- 🔄 An automated relayer
- 🖥️ A Next.js web interface

The current implementation uses:

**Ethereum Sepolia → Polygon Amoy**

as the source-to-destination testnet flow.

---

## 🎯 Problem Statement

Traditional cross-chain bridges need a mechanism to establish that an event
or transaction on the source blockchain is valid before releasing assets on
the destination blockchain.

A bridge therefore needs to answer:

> "Can the destination chain verify that this transfer was legitimately
> initiated on the source chain?"

VeriSync explores a ZK-based approach where a prover generates a
cryptographic proof and the destination-chain verifier checks the proof
on-chain.

This reduces the amount of private transaction information that needs to be
revealed to the verifier.

---

## 💡 How VeriSync Works

The bridge follows this high-level flow:

```text
┌──────────────────────┐
│  Ethereum Sepolia    │
│    Source Chain      │
└──────────┬───────────┘
           │
           │ Deposit
           ▼
┌──────────────────────┐
│   Bridge Contract    │
│                      │
│ Creates commitment   │
│ Emits BridgeDeposit  │
└──────────┬───────────┘
           │
           │ Event
           ▼
┌──────────────────────┐
│      Relayer         │
│                      │
│ Detect deposit       │
│ Prepare proof input  │
└──────────┬───────────┘
           │
           │ Witness
           ▼
┌──────────────────────┐
│   Circom Circuit     │
│                      │
│ Verify commitment    │
│ Compute nullifier    │
│ Validate amount      │
│ Validate timestamp   │
└──────────┬───────────┘
           │
           │ Groth16 Proof
           ▼
┌──────────────────────┐
│ Destination Chain    │
│   Polygon Amoy       │
│                      │
│  ZK Verifier         │
│       ↓              │
│  Claim with Proof    │
└──────────────────────┘
```

---

## 🔐 Zero-Knowledge Proof Design

The core circuit is implemented in:

```text
circuits/bridge_verifier.circom
```

The circuit separates information into **public** and **private** signals.

### Public Signals

These values are exposed to the verifier:

| Signal | Purpose |
|---|---|
| `commitment` | Commitment representing the bridge transaction |
| `nullifier` | Prevents the same proof/commitment from being claimed twice |
| `amount` | Amount being bridged |
| `timestamp` | Used for timestamp validation |

### Private Signals

These values are used inside the proof:

| Signal | Purpose |
|---|---|
| `sender` | Original sender |
| `token` | Token address |
| `destinationChainId` | Destination blockchain |
| `recipient` | Destination recipient |
| `salt` | Randomization value |
| `nonce` | Deposit nonce |
| `nullifierSecret` | Secret used to derive the nullifier |

---

## 🧮 Commitment Generation

The circuit uses the Poseidon hash function to generate the transaction
commitment.

```text
commitment =
Poseidon(
    sender,
    token,
    amount,
    destinationChainId,
    recipient,
    salt,
    nonce
)
```

The circuit then constrains the computed commitment to equal the public
commitment.

```text
computedCommitment == commitment
```

This allows the verifier to check that the private transaction information
is consistent with the public commitment.

---

## 🛡️ Nullifier

To prevent a bridge transaction from being claimed multiple times, the
circuit derives a nullifier from the commitment and a secret:

```text
nullifier =
Poseidon(
    commitment,
    nullifierSecret
)
```

The resulting nullifier is exposed as a public signal and can be tracked by
the destination-chain bridge.

Conceptually:

```text
Private Secret
      │
      ▼
┌─────────────────────┐
│ Poseidon(commitment, │
│ nullifierSecret)     │
└──────────┬──────────┘
           │
           ▼
      Nullifier
           │
           ▼
   Replay Protection
```

---

## 🔄 Bridge Flow

### 1. User deposits tokens

The user initiates a bridge transaction on the source chain.

```text
User
 ↓
Source Bridge Contract
 ↓
Deposit
 ↓
Commitment
 ↓
BridgeDeposit Event
```

### 2. Relayer detects the deposit

The relayer listens for `BridgeDeposit` events on Ethereum Sepolia.

```text
BridgeDeposit
      ↓
   Relayer
      ↓
Deposit Information
```

### 3. ZK proof is generated

The relayer prepares the circuit inputs and generates a ZK proof.

```text
Deposit Data
     +
Private Inputs
     ↓
Circom Circuit
     ↓
Witness
     ↓
Groth16 Proof
```

### 4. Proof is verified

Before submitting the claim, the relayer can perform an on-chain
verification check.

```text
Proof
  +
Public Signals
      ↓
Verifier Contract
      ↓
Valid / Invalid
```

### 5. Destination claim

If the proof is valid, the relayer submits the proof to the destination
bridge.

```text
Valid Proof
     ↓
claimWithProof(...)
     ↓
Polygon Amoy
     ↓
Claim Completed
```

---

## 🏗️ Architecture

```text
                         VeriSync
                            │
       ┌────────────────────┼────────────────────┐
       │                    │                    │
       ▼                    ▼                    ▼
   Frontend             ZK Layer            Blockchain
       │                    │                    │
       │              ┌─────┴─────┐         ┌────┴─────┐
       │              │           │         │          │
       ▼              ▼           ▼         ▼          ▼
    Next.js         Circom     SnarkJS   Sepolia    Amoy
       │              │           │         │          │
       │              │         Groth16     │          │
       │              │           │         │          │
       └──────────────┴───────────┴─────────┴──────────┘
                            │
                            ▼
                         Relayer
```

---

## 📁 Project Structure

```text
ZKBridge/
│
├── app/                    # Next.js application pages
│
├── circuits/               # Circom circuits and ZK proof workflow
│
├── components/             # Reusable React / UI components
│
├── contracts/              # Solidity smart contracts and verifier
│
├── docs/                   # Project documentation
│
├── hooks/                  # React hooks
│
├── lib/                    # Shared frontend/helper logic
│
├── public/                 # Static frontend assets
│
├── relayer/                # Cross-chain event listener and proof submitter
│
├── scripts/                # Deployment / utility scripts
│
├── styles/                 # Application styling
│
├── hardhat.config.js       # Hardhat + network configuration
├── package.json            # Project dependencies and scripts
│
├── pot12_0000.ptau         # Powers of Tau setup artifact
├── pot12_0001.ptau         # Powers of Tau setup artifact
└── pot12_final.ptau        # Final Powers of Tau artifact
```

---

## 🛠️ Tech Stack

### Blockchain

- Ethereum Sepolia
- Polygon Amoy
- Solidity
- Hardhat
- Ethers.js

### Zero-Knowledge

- Circom 2.1.6
- SnarkJS
- Groth16
- Poseidon Hash

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- Radix UI

### Backend / Infrastructure

- Node.js
- Express
- Event-driven relayer
- Ethers.js

---

## ⚙️ Prerequisites

Make sure the following are installed:

- Node.js
- npm or pnpm
- Git
- Hardhat
- Circom
- SnarkJS

You will also need testnet RPC endpoints and a funded wallet for
testnet transactions.

---

## 📦 Installation

Clone the repository:

```bash
git clone https://github.com/AbiramiR-27/ZKBridge.git

cd ZKBridge
```

Install dependencies:

```bash
npm install
```

or:

```bash
pnpm install
```

---

## 🔑 Environment Variables

Create a `.env` file in the project root.

```env
SEPOLIA_RPC_URL=<YOUR_SEPOLIA_RPC_URL>
AMOY_RPC_URL=<YOUR_AMOY_RPC_URL>

PRIVATE_KEY=<YOUR_TESTNET_PRIVATE_KEY>

ETHERSCAN_API_KEY=<YOUR_ETHERSCAN_API_KEY>
POLYGONSCAN_API_KEY=<YOUR_POLYGONSCAN_API_KEY>

SOURCE_BRIDGE_ADDRESS=<DEPLOYED_SOURCE_BRIDGE>
DESTINATION_BRIDGE_ADDRESS=<DEPLOYED_DESTINATION_BRIDGE>
```

> ⚠️ Never commit your `.env` file or private key to GitHub.

---

## 🧮 Compile the ZK Circuit

The project provides an npm script for compiling the bridge circuit:

```bash
npm run compile:circuits
```

This compiles:

```text
circuits/bridge_verifier.circom
```

and generates the required R1CS, WASM and symbol artifacts.

---

## 🔐 Trusted Setup

The project uses a Groth16 proving system.

The trusted setup workflow uses the provided Powers of Tau artifacts.

Run:

```bash
npm run setup:trusted
```

The resulting proving artifacts can then be used for proof generation.

> ⚠️ For production systems, the trusted setup and proving-key lifecycle
> should follow a secure and independently verifiable ceremony.

---

## 📜 Export the Solidity Verifier

After generating the required proving key:

```bash
npm run export:verifier
```

This exports the Groth16 verifier contract into:

```text
contracts/Verifier.sol
```

---

## ⛓️ Hardhat Networks

The project is configured with:

### Local Hardhat Network

```text
Chain ID: 31337
```

### Ethereum Sepolia

```text
Chain ID: 11155111
Role: Source Chain
```

### Polygon Amoy

```text
Chain ID: 80002
Role: Destination Chain
```

---

## 🚀 Run the Frontend

Start the Next.js development server:

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

The frontend provides:

- Bridge interface
- Transaction history
- Bridge statistics
- Architecture / "How it Works" view

---

## 🔄 Run the Relayer

The relayer connects the source and destination chains.

Start it using:

```bash
npm run relayer:start
```

The relayer:

1. Connects to Ethereum Sepolia.
2. Listens for `BridgeDeposit` events.
3. Processes new deposits.
4. Generates the corresponding ZK proof.
5. Performs proof verification.
6. Submits the proof to Polygon Amoy.
7. Tracks processed deposits.
8. Performs periodic health checks.

---

## 🧪 Development Workflow

A typical development workflow is:

```text
1. Install dependencies
        ↓
2. Configure environment variables
        ↓
3. Compile Circom circuit
        ↓
4. Generate / configure proving artifacts
        ↓
5. Export Solidity verifier
        ↓
6. Deploy bridge contracts
        ↓
7. Configure contract addresses
        ↓
8. Start relayer
        ↓
9. Start Next.js frontend
        ↓
10. Perform testnet bridge transaction
```

---

## 🔍 Verification Model

The verifier accepts:

```text
Proof A
Proof B
Proof C
+
Public Signals
```

The four public signals are:

```text
[0] commitment
[1] nullifier
[2] amount
[3] timestamp
```

The Solidity verifier performs the Groth16 pairing-based verification on-chain.

---

## 🔒 Security Model

The prototype includes several mechanisms designed to strengthen bridge
verification:

### Commitment Integrity

The transaction commitment is recomputed inside the ZK circuit.

### Nullifier-Based Replay Protection

A nullifier is derived from the commitment and a secret to identify a
bridge claim.

### On-Chain Proof Verification

The destination chain verifies the ZK proof through the Solidity verifier.

### Duplicate Deposit Tracking

The relayer tracks processed deposits and checks whether commitments have
already been processed.

### Field Validation

The verifier checks that public signals are valid elements of the expected
SNARK scalar field.

---

## ⚠️ Current Limitations

This repository is currently a **prototype / testnet-oriented implementation**
and should not be treated as a production bridge.

Important areas for further development include:

- Production-grade trusted setup / ceremony
- Independent security audit
- More robust relayer key management
- Persistent database-backed relayer state
- Stronger source-chain transaction finality verification
- Production-grade token custody / accounting
- Better failure recovery
- Multi-relayer support
- Decentralized relayer architecture
- Comprehensive unit and integration tests
- Formal verification of critical bridge logic
- Production monitoring and alerting

---

## 🗺️ Future Roadmap

### Phase 1 — Core ZK Bridge

- [x] Circom bridge verification circuit
- [x] Poseidon commitment hashing
- [x] Nullifier generation
- [x] Groth16 verification
- [x] Solidity verifier
- [x] Relayer prototype
- [x] Next.js bridge interface

### Phase 2 — Reliability

- [ ] Persistent relayer database
- [ ] Improved retry and recovery system
- [ ] Transaction finality checks
- [ ] Comprehensive test suite
- [ ] Better error handling

### Phase 3 — Security

- [ ] Independent circuit audit
- [ ] Smart contract audit
- [ ] Secure trusted setup ceremony
- [ ] Relayer key management
- [ ] Multi-relayer architecture

### Phase 4 — Production Readiness

- [ ] Mainnet deployment
- [ ] Monitoring dashboard
- [ ] Multi-chain support
- [ ] Optimized proof generation
- [ ] Gas optimization
- [ ] Decentralized relayer network

---

## 📚 Key Concepts

This project demonstrates practical implementation of:

- Zero-Knowledge Proofs
- zk-SNARKs
- Groth16
- Circom
- Poseidon Hash
- Commitment Schemes
- Nullifiers
- Replay Protection
- Cross-Chain Messaging
- Smart Contract Verification
- Event-Driven Relayers
- Ethereum Testnets
- Polygon Testnets

---

## 🎓 Learning Outcomes

Through this project, the following concepts can be explored:

### Blockchain

Understanding how state and events can be used to coordinate cross-chain
operations.

### Zero-Knowledge Cryptography

Understanding how a prover can demonstrate that a statement is valid without
revealing all of the underlying private inputs.

### Smart Contracts

Implementing Solidity contracts capable of verifying cryptographic proofs.

### ZK Circuits

Designing constraints that connect private inputs to publicly verifiable
outputs.

### Cross-Chain Infrastructure

Building a relayer that observes one blockchain and submits verified
information to another.

---

## 🤝 Contributing

Contributions and suggestions are welcome.

```bash
# Fork the repository

# Create a feature branch
git checkout -b feature/your-feature

# Commit your changes
git commit -m "feat: add your feature"

# Push the branch
git push origin feature/your-feature
```

Then open a Pull Request.

---

## 👩‍💻 Author

**Abirami R**

Computer Science and Business Systems

GitHub:  
https://github.com/AbiramiR-27

---

## 📄 License

Add the appropriate project license here.

---

## ⭐ Acknowledgements

This project builds upon open-source tools and libraries from the
Zero-Knowledge and Ethereum ecosystems, including:

- Circom
- SnarkJS
- Circomlib
- Hardhat
- Ethers.js
- OpenZeppelin
- Next.js

---

<p align="center">
  Built using Zero-Knowledge Proofs and Blockchain Technology
</p>
