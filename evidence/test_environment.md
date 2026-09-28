# Test Environment Specification

## System & Host Details
- **Operating System**: Microsoft Windows 11 (AMD64)
- **Node.js**: v24.18.0
- **npm**: 11.16.0
- **Circom Compiler**: 2.1.8 (`C:\Users\Lenovo\.cargo\bin\circom.exe`)
- **SnarkJS**: 0.7.6
- **Hardhat**: 2.28.0 (EVM Target: `paris`, Optimizer: `200` runs)
- **Solidity Version**: `pragma solidity ^0.8.20`
- **Curves & Field**: BN254 / alt_bn128 scalar field ($r = 21888242871839275222246405745257275088548364400416034343698204186575808495617$)

## Scope of Validation
- **Local EVM Validation**: 100% automated via Hardhat test suites.
- **ZK Circuit Validation**: 100% automated via Circom and SnarkJS Groth16 fullProve and verify.
- **Public Testnet Deployment**: **Out of scope** for this academic milestone (no live testnet transactions were submitted or fabricated).
