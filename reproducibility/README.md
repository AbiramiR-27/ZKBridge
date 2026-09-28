# VeriSync Protocol v1.0 — Reproducibility Guide

This directory provides complete instructions and automation scripts to reconstruct all circuit artifacts, proving keys, verification keys, Solidity verifiers, and contract builds from scratch.

## Prerequisites

- **Node.js**: `v24.x` or `v20.x` (LTS)
- **npm**: `v10.x` or `v11.x`
- **Circom**: `v2.1.8+`
- **snarkjs**: `v0.7.6+`
- **Hardhat**: `v2.28.0`

## Rebuild Steps

### Linux / macOS
```bash
chmod +x reproducibility/rebuild.sh
./reproducibility/rebuild.sh
```

### Windows (PowerShell)
```powershell
powershell -ExecutionPolicy Bypass -File reproducibility/rebuild.ps1
```

## Manual Step-by-Step Instructions

1. **Compile Circuit**:
   ```bash
   circom circuits/bridge_verifier.circom --r1cs --wasm --sym -o circuits/
   ```
2. **Groth16 Setup**:
   ```bash
   npx snarkjs groth16 setup circuits/bridge_verifier.r1cs pot12_final.ptau circuits/bridge_0000.zkey
   npx snarkjs zkey contribute circuits/bridge_0000.zkey circuits/bridge_final.zkey --name="Verisync" -v -e="verisync_entropy"
   ```
3. **Export Verification Key & Solidity Verifier**:
   ```bash
   npx snarkjs zkey export verificationkey circuits/bridge_final.zkey circuits/verification_key.json
   npx snarkjs zkey export solidityverifier circuits/bridge_final.zkey contracts/Verifier.sol
   ```
4. **Compile Smart Contracts**:
   ```bash
   npx hardhat compile
   ```
5. **Run Verification Test Suite**:
   ```bash
   npx hardhat test
   ```

## Trusted Setup Notice

The development Powers of Tau artifact `pot12_final.ptau` is provided for local testing and deterministic builds. For production deployment, a distributed multi-party trusted setup ceremony (e.g. Perpetual Powers of Tau Phase 1 + Phase 2 circuit-specific ceremony) is required.
