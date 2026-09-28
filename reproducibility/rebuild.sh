#!/usr/bin/env bash
# VeriSync Protocol v1.0 - Clean Rebuild Script
set -e

echo "=========================================="
echo "VeriSync Protocol v1.0 - Clean Rebuild"
echo "=========================================="

echo "[1/6] Compiling Circom circuit..."
circom circuits/bridge_verifier.circom --r1cs --wasm --sym -o circuits/

echo "[2/6] Setting up Groth16 proving keys..."
npx snarkjs groth16 setup circuits/bridge_verifier.r1cs pot12_final.ptau circuits/bridge_0000.zkey
npx snarkjs zkey contribute circuits/bridge_0000.zkey circuits/bridge_final.zkey --name="Verisync Contributor" -v -e="verisync_reproducible_phase_setup"

echo "[3/6] Exporting verification key..."
npx snarkjs zkey export verificationkey circuits/bridge_final.zkey circuits/verification_key.json

echo "[4/6] Exporting Solidity verifier..."
npx snarkjs zkey export solidityverifier circuits/bridge_final.zkey contracts/Verifier.sol

echo "[5/6] Compiling smart contracts..."
npx hardhat compile

echo "[6/6] Running automated test suite..."
npx hardhat test

echo "=========================================="
echo "Rebuild complete and all tests passed!"
echo "=========================================="
