# VeriSync: Viva Voce Questions & Answers

## Comprehensive Q&A Preparation Guide

---

## Section 1: Zero-Knowledge Proofs Fundamentals

### Q1: What is a Zero-Knowledge Proof?
**Answer:** A Zero-Knowledge Proof (ZKP) is a cryptographic method that allows one party (the prover) to prove to another party (the verifier) that a statement is true without revealing any information beyond the validity of the statement itself.

**Example:** Imagine proving you know a secret password without actually telling the password. The verifier becomes convinced you know it, but learns nothing about what the password actually is.

### Q2: What does SNARK stand for and what does each letter mean?
**Answer:** SNARK stands for:
- **S**uccinct: Proofs are small (a few hundred bytes) regardless of computation size
- **N**on-interactive: Only one message from prover to verifier (no back-and-forth)
- **AR**gument: Security holds against computationally bounded adversaries
- **K**nowledge: Prover must "know" a valid witness, not just that one exists

### Q3: What is the difference between ZK-SNARK and ZK-STARK?
**Answer:**
| Feature | ZK-SNARK | ZK-STARK |
|---------|----------|----------|
| Trusted Setup | Required | Not required |
| Proof Size | ~200 bytes | ~50 KB |
| Verification Time | Fast | Slower |
| Quantum Resistance | No | Yes |
| Post-quantum Security | Vulnerable | Secure |

**In VeriSync:** We use ZK-SNARKs (Groth16) because proof size and verification gas costs are critical for on-chain verification.

### Q4: What is a "trusted setup" and why is it needed?
**Answer:** A trusted setup is a one-time ceremony that generates public parameters (proving and verification keys) for the ZK circuit.

**Why needed:** The Groth16 proof system requires "toxic waste" - random values that must be destroyed. If anyone retains these values, they could forge proofs.

**Mitigation:** Multi-party computation (MPC) ceremonies where many participants contribute randomness. As long as ONE participant is honest and destroys their randomness, the system is secure.

**VeriSync approach:** We use the Hermez Phase 1 ceremony (Powers of Tau) for initial setup, then conduct a circuit-specific Phase 2.

### Q5: Explain the three properties of a ZKP: Completeness, Soundness, and Zero-Knowledge.
**Answer:**
1. **Completeness:** If the statement is true and both parties follow the protocol, the verifier will always be convinced.
   - *VeriSync:* A valid deposit can always generate a valid proof

2. **Soundness:** A cheating prover cannot convince the verifier of a false statement (except with negligible probability).
   - *VeriSync:* Cannot claim tokens without a valid source chain deposit

3. **Zero-Knowledge:** The verifier learns nothing beyond the validity of the statement.
   - *VeriSync:* The proof reveals commitment validity without exposing salt or nullifier secret

---

## Section 2: Cryptographic Components

### Q6: Why did you choose Poseidon hash instead of SHA-256 or Keccak?
**Answer:** Poseidon is specifically designed for ZK circuits and operates natively over finite fields.

**Comparison:**
| Hash Function | Constraints in ZK Circuit |
|---------------|---------------------------|
| SHA-256 | ~25,000 |
| Keccak-256 | ~150,000 |
| Poseidon | ~300 |

**Result:** Using Poseidon reduced our circuit from ~100,000 constraints to ~15,000 constraints, significantly improving proof generation time and gas costs.

### Q7: What is a commitment scheme and how is it used in VeriSync?
**Answer:** A commitment scheme is a cryptographic primitive with two phases:
1. **Commit:** Lock in a value without revealing it
2. **Reveal:** Later prove what value was committed

**In VeriSync:**
```
commitment = Poseidon(sender, token, amount, recipient, destChainId, salt, nonce)
```

The commitment is stored on-chain during deposit. Later, the ZK proof demonstrates knowledge of the preimage without revealing the individual components.

### Q8: What is a nullifier and why is it important?
**Answer:** A nullifier is a unique identifier derived from the commitment that can be publicly revealed without compromising privacy.

```
nullifier = Poseidon(commitment, nullifierSecret)
```

**Importance:**
- Prevents double-spending (each deposit can only be claimed once)
- The nullifier doesn't reveal which deposit it corresponds to
- Once a nullifier is used, it's marked as spent in the destination contract

### Q9: What is the role of the "salt" in the commitment?
**Answer:** The salt is a random 256-bit value that:
1. **Ensures uniqueness:** Two identical deposits (same sender, amount, recipient) produce different commitments
2. **Prevents brute-force attacks:** Without knowing the salt, an attacker cannot guess the preimage
3. **Provides unlinkability:** Commitments cannot be linked to specific transactions without the salt

---

## Section 3: System Architecture

### Q10: Walk me through the complete flow of a bridge transaction.
**Answer:**
1. **User deposits on Source Chain (Sepolia):**
   - User approves token transfer
   - Calls `deposit()` with token, amount, recipient, salt
   - Contract computes commitment and emits `BridgeDeposit` event
   - Tokens are locked in the contract

2. **Relayer detects deposit:**
   - Listens for `BridgeDeposit` events
   - Extracts deposit data from event
   - Waits for sufficient block confirmations

3. **ZK Proof Generation:**
   - Relayer constructs witness with private inputs
   - Generates Groth16 proof using snarkjs
   - Proof attests to valid deposit without revealing private data

4. **Claim on Destination Chain (Amoy):**
   - Relayer calls `claimWithProof()` with proof and public signals
   - Verifier contract validates the SNARK proof
   - Contract checks nullifier hasn't been used
   - Tokens are minted/released to recipient
   - Nullifier is marked as spent

### Q11: Why do you need a relayer? Can't users submit their own proofs?
**Answer:** Users CAN submit their own proofs - the relayer is not a trusted entity.

**Reasons for relayer:**
1. **UX Convenience:** Users don't need to run proof generation software
2. **Gas Abstraction:** Relayer pays destination chain gas (can be reimbursed)
3. **Proof Efficiency:** Relayer can batch multiple proofs
4. **Reliability:** Automated monitoring ensures no deposits are missed

**Security note:** The relayer cannot steal funds or create invalid proofs - it only facilitates proof submission.

### Q12: How does the system prevent replay attacks?
**Answer:** Multiple layers of protection:

1. **Chain ID in Commitment:**
   ```
   commitment = Poseidon(..., destChainId, ...)
   ```
   Proofs are bound to a specific destination chain

2. **Nullifier Tracking:**
   Each commitment can only be claimed once per chain

3. **Nonce Inclusion:**
   Sequential nonces prevent transaction duplication

4. **Source Chain Verification:**
   Destination contract can optionally verify source chain state

---

## Section 4: Smart Contract Details

### Q13: Explain the key functions in SourceBridge.sol.
**Answer:**

```solidity
function deposit(
    address token,
    uint256 amount,
    uint256 destinationChainId,
    address recipient,
    bytes32 salt
) external returns (uint256 depositId, bytes32 commitment)
```

**Steps:**
1. Validate inputs (supported token, valid recipient, non-zero amount)
2. Transfer tokens from user to contract
3. Compute commitment hash
4. Store deposit record
5. Emit `BridgeDeposit` event
6. Return deposit ID and commitment

### Q14: Explain the key functions in DestinationBridge.sol.
**Answer:**

```solidity
function claimWithProof(
    uint256[2] memory _pA,
    uint256[2][2] memory _pB,
    uint256[2] memory _pC,
    uint256[4] memory _pubSignals
) external returns (bool)
```

**Steps:**
1. Extract public signals (commitment, nullifier, recipient, amount)
2. Check nullifier hasn't been used
3. Verify ZK proof using Verifier contract
4. Mark nullifier as spent
5. Mint/transfer tokens to recipient
6. Emit `BridgeClaim` event

### Q15: What security modifiers and patterns did you implement?
**Answer:**

1. **ReentrancyGuard:**
   ```solidity
   function deposit(...) external nonReentrant { ... }
   ```
   Prevents reentrancy attacks during token transfers

2. **Pausable:**
   ```solidity
   function pause() external onlyOwner { _pause(); }
   ```
   Emergency circuit breaker for discovered vulnerabilities

3. **Access Control:**
   ```solidity
   modifier onlyRelayer() {
       require(authorizedRelayers[msg.sender], "Not authorized");
       _;
   }
   ```

4. **Input Validation:**
   - Non-zero addresses
   - Positive amounts
   - Supported tokens only

---

## Section 5: Circom Circuit

### Q16: Explain the structure of your Circom circuit.
**Answer:**

```circom
template BridgeVerifier() {
    // Private inputs
    signal input sender;
    signal input token;
    signal input amount;
    signal input destChainId;
    signal input recipient;
    signal input salt;
    signal input nonce;
    signal input nullifierSecret;
    signal input timestamp;
    
    // Public inputs
    signal input commitment;
    signal input nullifier;
    signal input publicRecipient;
    signal input publicAmount;
    
    // Verification logic
    component commitmentHasher = Poseidon(9);
    // ... connect inputs
    commitment === commitmentHasher.out;
    
    component nullifierHasher = Poseidon(2);
    // ... connect inputs
    nullifier === nullifierHasher.out;
    
    // Additional constraints
    recipient === publicRecipient;
    amount === publicAmount;
}
```

### Q17: What are "constraints" in a ZK circuit?
**Answer:** Constraints are mathematical equations (specifically, R1CS - Rank-1 Constraint System) that the prover must satisfy.

**Form:** `A * B = C` where A, B, C are linear combinations of signals

**Example:**
```circom
signal a;
signal b;
signal c;
c <== a * b;  // This creates one constraint
```

**VeriSync stats:**
- Total constraints: ~15,000
- Each Poseidon hash: ~300 constraints
- Comparison operations: 1 constraint each

### Q18: How do you ensure the circuit is correctly implemented?
**Answer:**

1. **Unit Testing:**
   ```javascript
   const circuit = await wasm_tester(path.join(__dirname, "bridge_verifier.circom"));
   const witness = await circuit.calculateWitness(input);
   await circuit.checkConstraints(witness);
   ```

2. **Edge Case Testing:**
   - Zero amounts (should fail)
   - Invalid commitments (should fail)
   - Mismatched public inputs (should fail)

3. **Formal Verification:**
   - Audit constraint equations manually
   - Verify no under-constrained signals

---

## Section 6: Performance & Optimization

### Q19: What is the gas cost breakdown for proof verification?
**Answer:**

| Operation | Gas Cost |
|-----------|----------|
| ECPAIRING (2 pairs) | ~180,000 |
| Storage writes | ~40,000 |
| Event emission | ~2,000 |
| Other computation | ~58,000 |
| **Total** | **~280,000** |

**Optimization strategies:**
- Minimize storage writes
- Use events instead of storage where possible
- Batch multiple claims (future improvement)

### Q20: How long does proof generation take?
**Answer:**

| Phase | Time |
|-------|------|
| Witness calculation | ~2 seconds |
| Proof generation | ~15 seconds |
| **Total** | **~17 seconds** |

**Factors affecting performance:**
- Circuit size (number of constraints)
- CPU speed (proof generation is CPU-intensive)
- Memory availability (large circuits need >4GB RAM)

### Q21: How could you improve proof generation time?
**Answer:**

1. **GPU Acceleration:** Use CUDA/OpenCL for elliptic curve operations
2. **Circuit Optimization:** Reduce constraint count
3. **Proof Aggregation:** Combine multiple proofs into one
4. **Alternative Proof Systems:** PLONK has faster proving time
5. **Distributed Proving:** Split witness computation across machines

---

## Section 7: Security Analysis

### Q22: What are the main security assumptions of your system?
**Answer:**

1. **Discrete Logarithm Problem (DLP):** Hard to compute private key from public key
2. **Bilinear Diffie-Hellman:** Pairing-based assumptions for Groth16
3. **Collision Resistance:** Poseidon hash is collision-resistant
4. **Trusted Setup Integrity:** At least one ceremony participant was honest
5. **Smart Contract Correctness:** No bugs in Solidity implementation

### Q23: How does your system compare to existing bridges in terms of security?
**Answer:**

| Bridge | Trust Model | Historical Exploits | VeriSync Advantage |
|--------|-------------|---------------------|-------------------|
| Ronin | 5/9 Multisig | $625M (validator keys) | No trusted validators |
| Wormhole | Guardian consensus | $320M (signature bypass) | Cryptographic verification |
| Nomad | Optimistic | $190M (improper validation) | On-chain ZK verification |

**Key difference:** VeriSync replaces human trust with mathematical proofs.

### Q24: What happens if the relayer goes offline?
**Answer:**

1. **No fund loss:** Tokens remain locked in source contract
2. **User can run own relayer:** System is permissionless
3. **Time limits optional:** Contracts can implement deposit expiration
4. **Decentralized relayer network:** Future improvement with incentives

### Q25: Can the relayer steal funds or censor transactions?
**Answer:**

**Steal funds:** NO
- Relayer cannot generate proofs for deposits that don't exist
- Proofs bind recipient address - cannot redirect funds

**Censor transactions:** PARTIALLY
- A single relayer could refuse to relay specific deposits
- **Mitigation:** Multiple competing relayers, user can self-relay

---

## Section 8: Project-Specific Questions

### Q26: Why did you choose Ethereum Sepolia and Polygon Amoy?
**Answer:**

1. **Test networks:** Free to use, no real money at risk
2. **EVM compatibility:** Same smart contract code works on both
3. **Different finality:** Tests cross-chain with different confirmation times
4. **Good infrastructure:** Reliable faucets and block explorers
5. **Representative of mainnet:** Similar enough to production chains

### Q27: What were the biggest challenges you faced?
**Answer:**

1. **Circuit Optimization:**
   - Initial circuit was too large (100k+ constraints)
   - Switched from Pedersen to Poseidon hash
   - Result: 85% reduction in constraints

2. **Trusted Setup:**
   - Understanding MPC ceremony process
   - Implementing proper key generation workflow

3. **Cross-chain Coordination:**
   - Handling block reorganizations
   - Ensuring finality before proof generation

4. **Gas Optimization:**
   - Reducing storage operations
   - Optimizing Verifier contract

### Q28: If you had more time, what would you add?
**Answer:**

1. **Recursive Proofs:** Batch verify multiple bridges in one proof
2. **Decentralized Relayers:** Staking-based relayer network
3. **Multi-token Support:** Bridge any ERC-20 automatically
4. **Cross-L2:** Extend to Arbitrum, Optimism, zkSync
5. **Mobile App:** React Native interface with WalletConnect

---

## Section 9: General Blockchain Questions

### Q29: What is the difference between optimistic and ZK rollups?
**Answer:**

| Feature | Optimistic Rollups | ZK Rollups |
|---------|-------------------|------------|
| Proof Type | Fraud proofs | Validity proofs |
| Finality | 7 days (challenge period) | Minutes |
| Cost | Lower | Higher (proof generation) |
| EVM Compatibility | Full | Partial (improving) |
| Examples | Arbitrum, Optimism | zkSync, StarkNet |

**VeriSync connection:** Uses ZK validity proofs like ZK rollups for instant finality.

### Q30: What is ERC-20 and how did you handle token transfers?
**Answer:**

ERC-20 is the standard interface for fungible tokens:
```solidity
function transfer(address to, uint256 amount) external returns (bool);
function approve(address spender, uint256 amount) external returns (bool);
function transferFrom(address from, address to, uint256 amount) external returns (bool);
```

**In VeriSync:**
1. User calls `approve(bridgeAddress, amount)` on token contract
2. Bridge calls `transferFrom(user, bridge, amount)` to lock tokens
3. On destination, bridge calls `transfer(recipient, amount)` or mints new tokens

---

## Section 10: Advanced Topics

### Q31: Explain Groth16 at a high level.
**Answer:**

Groth16 is a pairing-based SNARK with the smallest proof size:

1. **Prover computes:**
   - Polynomial commitments to witness values
   - Quotient polynomial proving constraint satisfaction

2. **Proof consists of:**
   - Three group elements (A, B, C) on elliptic curves
   - Total size: ~192 bytes

3. **Verifier checks:**
   - Pairing equation: e(A, B) = e(α, β) · e(C, δ) · e(public_input_commitment, γ)
   - Single pairing check (~280k gas on Ethereum)

### Q32: What is the BN254 curve and why is it used?
**Answer:**

BN254 (also called alt_bn128) is a pairing-friendly elliptic curve:

- **Equation:** y² = x³ + 3 over a 254-bit prime field
- **Pairing:** Optimal Ate pairing with embedding degree 12
- **Security:** ~100 bits (sufficient for most applications)

**Why used:**
1. Native support in Ethereum precompiles (EIP-196, EIP-197)
2. Gas-efficient pairing operations
3. Widely audited and tested

### Q33: How would you implement this on a non-EVM chain?
**Answer:**

1. **If chain has pairing precompiles:** Direct port of Verifier contract
2. **If no precompiles:**
   - Implement pairing in native code (expensive)
   - Use alternative proof system (PLONK, FRI-based)
3. **Cosmos/IBC:** Use light client verification + ZK proofs
4. **Solana:** Implement verifier in Rust, use compute units

---

## Final Tips for Viva

1. **Know your code:** Be able to explain any line of code you wrote
2. **Understand trade-offs:** Why you chose specific technologies
3. **Acknowledge limitations:** Shows mature understanding
4. **Have future plans:** Shows depth of thinking
5. **Practice explanations:** Use analogies for complex concepts
6. **Stay calm:** If you don't know something, say "I would need to research that further"
