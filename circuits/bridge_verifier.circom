/*
 * VeriSync - ZK International Bridge Verifier System
 * Circom Circuit: Bridge Transaction Verifier
 * 
 * PURPOSE:
 * This circuit proves the validity of a bridge transaction without revealing:
 * - The sender's address
 * - The exact transaction details on the source chain
 * 
 * PUBLIC SIGNALS (Revealed on-chain):
 * - commitment: Hash of the transaction commitment
 * - nullifier: Unique identifier to prevent double-spending
 * - amount: Amount being bridged (publicly visible for token release)
 * - timestamp: Proof generation timestamp (for expiration checks)
 * 
 * PRIVATE SIGNALS (Hidden from on-chain):
 * - sender: Original sender address
 * - token: Token address
 * - destinationChainId: Target chain
 * - recipient: Recipient address on destination
 * - salt: Random salt for commitment
 * - nonce: Deposit nonce
 * - nullifierSecret: Secret for generating nullifier
 * 
 * CIRCUIT FLOW:
 * 1. Verify commitment = hash(sender, token, amount, destinationChainId, recipient, salt, nonce)
 * 2. Compute nullifier = hash(commitment, nullifierSecret)
 * 3. Output public signals for on-chain verification
 */

pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

/**
 * @title BridgeVerifier
 * @notice Main circuit for verifying bridge transactions
 */
template BridgeVerifier() {
    // =========================================
    // PUBLIC INPUTS (Visible on-chain)
    // =========================================
    
    signal input commitment;        // The commitment hash to verify
    signal input nullifier;         // Nullifier for replay protection
    signal input amount;            // Amount being bridged
    signal input timestamp;         // Timestamp for expiration check

    // =========================================
    // PRIVATE INPUTS (Hidden from on-chain)
    // =========================================
    
    signal input sender;            // Sender address (private)
    signal input token;             // Token address (private)
    signal input destinationChainId; // Destination chain ID (private)
    signal input recipient;         // Recipient address (private)
    signal input salt;              // Random salt (private)
    signal input nonce;             // Deposit nonce (private)
    signal input nullifierSecret;   // Secret for nullifier generation (private)

    // =========================================
    // COMMITMENT VERIFICATION
    // =========================================
    
    // Compute the commitment hash using Poseidon
    // commitment = Poseidon(sender, token, amount, destinationChainId, recipient, salt, nonce)
    component commitmentHasher = Poseidon(7);
    commitmentHasher.inputs[0] <== sender;
    commitmentHasher.inputs[1] <== token;
    commitmentHasher.inputs[2] <== amount;
    commitmentHasher.inputs[3] <== destinationChainId;
    commitmentHasher.inputs[4] <== recipient;
    commitmentHasher.inputs[5] <== salt;
    commitmentHasher.inputs[6] <== nonce;

    // Verify the computed commitment matches the public commitment
    signal computedCommitment;
    computedCommitment <== commitmentHasher.out;
    
    // Constraint: computed commitment must equal public commitment
    commitment === computedCommitment;

    // =========================================
    // NULLIFIER COMPUTATION & VERIFICATION
    // =========================================
    
    // Compute the nullifier = Poseidon(commitment, nullifierSecret)
    // This ensures each commitment can only be claimed once
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== commitment;
    nullifierHasher.inputs[1] <== nullifierSecret;

    // Verify the computed nullifier matches the public nullifier
    signal computedNullifier;
    computedNullifier <== nullifierHasher.out;
    
    // Constraint: computed nullifier must equal public nullifier
    nullifier === computedNullifier;

    // =========================================
    // AMOUNT VALIDATION
    // =========================================
    
    // Ensure amount is greater than 0
    component amountGtZero = GreaterThan(252);
    amountGtZero.in[0] <== amount;
    amountGtZero.in[1] <== 0;
    amountGtZero.out === 1;

    // =========================================
    // TIMESTAMP VALIDATION
    // =========================================
    
    // Ensure timestamp is valid (greater than 0)
    component timestampGtZero = GreaterThan(64);
    timestampGtZero.in[0] <== timestamp;
    timestampGtZero.in[1] <== 0;
    timestampGtZero.out === 1;
}

// Instantiate the main component
component main {public [commitment, nullifier, amount, timestamp]} = BridgeVerifier();
