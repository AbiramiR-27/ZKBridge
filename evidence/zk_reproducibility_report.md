# Zero-Knowledge Circuit & Prover Reproducibility Report

**Date**: 2026-09-28  
**Protocol Version**: VeriSync Protocol v1.0  
**Circuit Source**: `circuits/bridge_verifier.circom`  
**Proving Scheme**: Groth16 over BN254 / alt_bn128

---

## 1. Circuit Statistics

- **Compiler**: Circom 2.1.8
- **Template Instances**: 149
- **Non-Linear Constraints**: 3,270
- **Linear Constraints**: 0
- **Public Inputs**: 7
  1. `root` (Signal 0)
  2. `nullifier` (Signal 1)
  3. `amount` (Signal 2)
  4. `token` (Signal 3)
  5. `recipient` (Signal 4)
  6. `sourceChainId` (Signal 5)
  7. `destinationChainId` (Signal 6)
- **Private Inputs**: 20
  1. `sender`
  2. `salt`
  3. `nonce`
  4. `nullifierSecret`
  5. `pathElements[8]` (8 sibling hashes)
  6. `pathIndices[8]` (8 direction bits)
- **Wires**: 3,287
- **Labels**: 10,333

---

## 2. Cryptographic Artifact Hashes

| Artifact | File Path | SHA-256 Checksum |
| :--- | :--- | :--- |
| Circom Source | `circuits/bridge_verifier.circom` | `fd103589bcf8bd593a4f0c6a120095a541a0ca0bb96a589e3634742872add014` |
| R1CS Constraint System | `circuits/bridge_verifier.r1cs` | `b2bb05ce55b3d02c373b78c96a93c6068cd3254cf8f02bf95969d1b63329257e` |
| Groth16 Proving Key | `circuits/bridge_final.zkey` | `a5b406e4f1e1b2006c26817324619ba9d457fbd48419408928efbce3bf2b35e2` |
| Verification Key | `circuits/verification_key.json` | `b57aaa698b8b8b26515692e4ea6833de867804fec4d4c88437022366df5b7ef5` |
| Exported Solidity Verifier | `contracts/Verifier.sol` | `b81c52b48d3f1d13c5d958dcfc864061accef362d245b15c77572392ba26e1b4` |

---

## 3. Trusted Setup Provenance & Limitations
- The setup utilizes the Powers of Tau file `pot12_final.ptau` for local testing and deterministic builds.
- **Academic Limitation Notice**: The Phase 2 ceremony contribution was conducted locally for reproducibility. For production deployments, a formal multi-party computation ceremony (MPC) with public verification must be conducted.
