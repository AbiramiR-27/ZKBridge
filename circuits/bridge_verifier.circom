/*
 * VeriSync Protocol v1.0 - ZK International Bridge Verifier System
 * Circom Circuit: Bridge Transaction Verifier with Merkle Deposit Anchoring
 * 
 * PUBLIC SIGNALS (Exposed to on-chain verifier):
 * 1. root: Merkle root of source deposits
 * 2. nullifier: Unique anti-replay nullifier
 * 3. amount: Bridged token amount
 * 4. token: Source token address / canonical token identifier
 * 5. recipient: Destination recipient address
 * 6. sourceChainId: Source network chain ID
 * 7. destinationChainId: Destination network chain ID
 * 
 * PRIVATE SIGNALS (Hidden inside zero-knowledge witness):
 * 1. sender: Original depositor address
 * 2. salt: Blinding salt for privacy
 * 3. nonce: Deposit nonce
 * 4. nullifierSecret: Secret used to derive the nullifier
 * 5. pathElements[8]: Merkle path sibling hashes
 * 6. pathIndices[8]: Merkle path direction bits (0 = left, 1 = right)
 */

pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

// DualMux helper to conditionally order Merkle pair based on direction selector
template DualMux() {
    signal input in[2];
    signal input s;
    signal output out[2];

    s * (1 - s) === 0;
    out[0] <== (in[1] - in[0]) * s + in[0];
    out[1] <== (in[0] - in[1]) * s + in[1];
}

/**
 * @title BridgeVerifier
 * @notice Verifies bridge deposit commitment, Merkle inclusion in source root, and nullifier derivation.
 */
template BridgeVerifier(levels) {
    // =========================================
    // PUBLIC INPUTS (Revealed to on-chain verifier)
    // =========================================
    signal input root;                 // Merkle root of source deposits
    signal input nullifier;            // Unique anti-replay nullifier
    signal input amount;               // Bridged amount
    signal input token;                // Bridged token address
    signal input recipient;            // Destination recipient address
    signal input sourceChainId;        // Source blockchain ID
    signal input destinationChainId;   // Destination blockchain ID

    // =========================================
    // PRIVATE INPUTS (Hidden in witness)
    // =========================================
    signal input sender;               // Original depositor address
    signal input salt;                 // Random blinding salt
    signal input nonce;                // Deposit nonce
    signal input nullifierSecret;      // Secret used to derive the nullifier
    signal input pathElements[levels]; // Merkle proof sibling hashes
    signal input pathIndices[levels];  // Merkle proof directions (0 = left, 1 = right)

    // =========================================
    // 1. COMMITMENT CALCULATION
    // =========================================
    // Canonical 2-step Poseidon hash binding all 8 parameters:
    // h1 = Poseidon(sourceChainId, destinationChainId, sender, token)
    // h2 = Poseidon(amount, recipient, salt, nonce)
    // commitment = Poseidon(h1, h2)
    component h1Hasher = Poseidon(4);
    h1Hasher.inputs[0] <== sourceChainId;
    h1Hasher.inputs[1] <== destinationChainId;
    h1Hasher.inputs[2] <== sender;
    h1Hasher.inputs[3] <== token;

    component h2Hasher = Poseidon(4);
    h2Hasher.inputs[0] <== amount;
    h2Hasher.inputs[1] <== recipient;
    h2Hasher.inputs[2] <== salt;
    h2Hasher.inputs[3] <== nonce;

    component commitmentHasher = Poseidon(2);
    commitmentHasher.inputs[0] <== h1Hasher.out;
    commitmentHasher.inputs[1] <== h2Hasher.out;

    signal commitment;
    commitment <== commitmentHasher.out;

    // =========================================
    // 2. NULLIFIER DERIVATION
    // =========================================
    // nullifier = Poseidon(commitment, nullifierSecret)
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== commitment;
    nullifierHasher.inputs[1] <== nullifierSecret;
    
    nullifier === nullifierHasher.out;

    // =========================================
    // 3. MERKLE INCLUSION PROOF
    // =========================================
    component mux[levels];
    component levelHashers[levels];

    for (var i = 0; i < levels; i++) {
        mux[i] = DualMux();
        mux[i].in[0] <== (i == 0) ? commitment : levelHashers[i - 1].out;
        mux[i].in[1] <== pathElements[i];
        mux[i].s <== pathIndices[i];

        levelHashers[i] = Poseidon(2);
        levelHashers[i].inputs[0] <== mux[i].out[0];
        levelHashers[i].inputs[1] <== mux[i].out[1];
    }

    // Constrain computed Merkle root to equal the public root
    root === levelHashers[levels - 1].out;

    // =========================================
    // 4. AMOUNT VALIDATION
    // =========================================
    component amountGtZero = GreaterThan(252);
    amountGtZero.in[0] <== amount;
    amountGtZero.in[1] <== 0;
    amountGtZero.out === 1;
}

// Instantiate with depth = 8
component main {public [root, nullifier, amount, token, recipient, sourceChainId, destinationChainId]} = BridgeVerifier(8);
