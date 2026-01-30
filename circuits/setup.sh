#!/bin/bash

# ===========================================
# VeriSync - ZK International Bridge Verifier System
# Zero-Knowledge Proof Setup Script
# ===========================================
# 
# This script performs the trusted setup ceremony and generates:
# 1. R1CS constraint system
# 2. WASM for proof generation
# 3. Proving and verification keys
# 4. Solidity verifier contract
#
# PREREQUISITES:
# - Node.js v18+
# - Circom 2.1.6+ installed
# - SnarkJS installed globally
#
# USAGE:
# chmod +x setup.sh
# ./setup.sh
# ===========================================

set -e

echo "==========================================="
echo "VeriSync - ZK Proof Setup"
echo "==========================================="
echo ""

# Create output directory
mkdir -p build

# Step 1: Compile the circuit
echo "[1/7] Compiling circuit..."
circom bridge_verifier.circom --r1cs --wasm --sym -o build

echo "   Circuit compiled successfully!"
echo "   - Constraints: $(cat build/bridge_verifier.r1cs | wc -c) bytes"

# Step 2: Download Powers of Tau (if not exists)
echo ""
echo "[2/7] Checking Powers of Tau..."
if [ ! -f "powersOfTau28_hez_final_12.ptau" ]; then
    echo "   Downloading Powers of Tau (this may take a while)..."
    wget https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_12.ptau
else
    echo "   Powers of Tau file already exists."
fi

# Step 3: Generate initial zkey
echo ""
echo "[3/7] Generating initial zkey (Phase 1)..."
snarkjs groth16 setup build/bridge_verifier.r1cs powersOfTau28_hez_final_12.ptau build/bridge_verifier_0000.zkey

# Step 4: Contribute to the ceremony (Phase 2)
echo ""
echo "[4/7] Contributing to ceremony (Phase 2)..."
# In production, multiple parties should contribute
# For development, we use a random entropy
snarkjs zkey contribute build/bridge_verifier_0000.zkey build/bridge_verifier_0001.zkey --name="First contribution" -v -e="$(head -c 32 /dev/urandom | xxd -p)"

# Step 5: Apply random beacon (Final Phase)
echo ""
echo "[5/7] Applying random beacon..."
snarkjs zkey beacon build/bridge_verifier_0001.zkey build/bridge_verifier_final.zkey 0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f 10 -n="Final Beacon phase2"

# Step 6: Export verification key
echo ""
echo "[6/7] Exporting verification key..."
snarkjs zkey export verificationkey build/bridge_verifier_final.zkey build/verification_key.json

# Step 7: Export Solidity verifier
echo ""
echo "[7/7] Exporting Solidity verifier..."
snarkjs zkey export solidityverifier build/bridge_verifier_final.zkey ../contracts/Verifier.sol

# Verify the setup
echo ""
echo "==========================================="
echo "Verifying setup..."
echo "==========================================="
snarkjs zkey verify build/bridge_verifier.r1cs powersOfTau28_hez_final_12.ptau build/bridge_verifier_final.zkey

echo ""
echo "==========================================="
echo "SETUP COMPLETE!"
echo "==========================================="
echo ""
echo "Generated files:"
echo "  - build/bridge_verifier.r1cs      (Constraint system)"
echo "  - build/bridge_verifier_js/       (WASM for proof generation)"
echo "  - build/bridge_verifier_final.zkey (Proving key)"
echo "  - build/verification_key.json     (Verification key)"
echo "  - ../contracts/Verifier.sol       (Solidity verifier)"
echo ""
echo "Next steps:"
echo "  1. Deploy the Verifier.sol contract"
echo "  2. Use the relayer to generate proofs"
echo "==========================================="
