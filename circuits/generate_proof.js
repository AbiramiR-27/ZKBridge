/**
 * VeriSync - ZK International Bridge Verifier System
 * Proof Generation Library
 * 
 * This module provides functions to generate ZK proofs for bridge transactions.
 * Used by the relayer to create proofs after detecting deposit events.
 */

const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
const fs = require("fs");
const path = require("path");

// Path to circuit build artifacts
const WASM_PATH = path.join(__dirname, "build/bridge_verifier_js/bridge_verifier.wasm");
const ZKEY_PATH = path.join(__dirname, "build/bridge_verifier_final.zkey");
const VKEY_PATH = path.join(__dirname, "build/verification_key.json");

/**
 * Initialize Poseidon hash function
 */
let poseidon;
async function initPoseidon() {
    if (!poseidon) {
        poseidon = await buildPoseidon();
    }
    return poseidon;
}

/**
 * Compute Poseidon hash
 * @param {Array} inputs - Array of inputs to hash
 * @returns {BigInt} - Hash result
 */
async function poseidonHash(inputs) {
    const poseidonInstance = await initPoseidon();
    const hash = poseidonInstance(inputs.map(x => BigInt(x)));
    return poseidonInstance.F.toString(hash);
}

/**
 * Generate commitment hash for a bridge deposit
 * @param {Object} depositData - Deposit data
 * @returns {string} - Commitment hash
 */
async function generateCommitment(depositData) {
    const { sender, token, amount, destinationChainId, recipient, salt, nonce } = depositData;
    
    const commitment = await poseidonHash([
        sender,
        token,
        amount,
        destinationChainId,
        recipient,
        salt,
        nonce
    ]);
    
    return commitment;
}

/**
 * Generate nullifier for a commitment
 * @param {string} commitment - The commitment hash
 * @param {string} nullifierSecret - Secret for nullifier generation
 * @returns {string} - Nullifier hash
 */
async function generateNullifier(commitment, nullifierSecret) {
    const nullifier = await poseidonHash([commitment, nullifierSecret]);
    return nullifier;
}

/**
 * Generate a ZK proof for a bridge transaction
 * @param {Object} depositData - The deposit data from source chain
 * @param {string} nullifierSecret - Secret for nullifier generation
 * @returns {Object} - Proof and public signals
 */
async function generateProof(depositData, nullifierSecret) {
    const {
        sender,
        token,
        amount,
        destinationChainId,
        recipient,
        salt,
        nonce
    } = depositData;

    // Generate commitment
    const commitment = await generateCommitment(depositData);
    
    // Generate nullifier
    const nullifier = await generateNullifier(commitment, nullifierSecret);
    
    // Current timestamp
    const timestamp = Math.floor(Date.now() / 1000);

    // Prepare circuit inputs
    const input = {
        // Public inputs
        commitment: commitment,
        nullifier: nullifier,
        amount: amount.toString(),
        timestamp: timestamp.toString(),
        
        // Private inputs
        sender: sender.toString(),
        token: token.toString(),
        destinationChainId: destinationChainId.toString(),
        recipient: recipient.toString(),
        salt: salt.toString(),
        nonce: nonce.toString(),
        nullifierSecret: nullifierSecret.toString()
    };

    console.log("Generating ZK proof with inputs:");
    console.log("  - Commitment:", commitment);
    console.log("  - Nullifier:", nullifier);
    console.log("  - Amount:", amount);
    console.log("  - Timestamp:", timestamp);

    // Generate the proof
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        input,
        WASM_PATH,
        ZKEY_PATH
    );

    console.log("Proof generated successfully!");

    // Format proof for Solidity
    const solidityProof = {
        pA: [proof.pi_a[0], proof.pi_a[1]],
        pB: [
            [proof.pi_b[0][1], proof.pi_b[0][0]],
            [proof.pi_b[1][1], proof.pi_b[1][0]]
        ],
        pC: [proof.pi_c[0], proof.pi_c[1]],
        pubSignals: publicSignals
    };

    return {
        proof,
        publicSignals,
        solidityProof,
        commitment,
        nullifier,
        timestamp
    };
}

/**
 * Verify a proof locally (for testing)
 * @param {Object} proof - The proof object
 * @param {Array} publicSignals - Public signals array
 * @returns {boolean} - Whether the proof is valid
 */
async function verifyProofLocal(proof, publicSignals) {
    const vKey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));
    const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);
    return isValid;
}

/**
 * Format proof for Solidity contract call
 * @param {Object} proofData - Proof data from generateProof
 * @returns {Object} - Formatted proof for Solidity
 */
function formatProofForSolidity(proofData) {
    const { solidityProof, publicSignals } = proofData;
    
    return {
        _pA: solidityProof.pA,
        _pB: solidityProof.pB,
        _pC: solidityProof.pC,
        _pubSignals: publicSignals.map(s => s.toString())
    };
}

/**
 * Generate a random salt for commitment
 * @returns {string} - Random salt as BigInt string
 */
function generateRandomSalt() {
    const randomBytes = require("crypto").randomBytes(31);
    return BigInt("0x" + randomBytes.toString("hex")).toString();
}

/**
 * Generate a random nullifier secret
 * @returns {string} - Random secret as BigInt string
 */
function generateNullifierSecret() {
    const randomBytes = require("crypto").randomBytes(31);
    return BigInt("0x" + randomBytes.toString("hex")).toString();
}

/**
 * Convert Ethereum address to field element
 * @param {string} address - Ethereum address
 * @returns {string} - BigInt string representation
 */
function addressToField(address) {
    return BigInt(address).toString();
}

/**
 * Convert ETH amount to field element (in wei)
 * @param {string} amountEth - Amount in ETH
 * @returns {string} - Amount in wei as BigInt string
 */
function ethToWei(amountEth) {
    return (BigInt(Math.floor(parseFloat(amountEth) * 1e18))).toString();
}

module.exports = {
    generateProof,
    verifyProofLocal,
    generateCommitment,
    generateNullifier,
    formatProofForSolidity,
    generateRandomSalt,
    generateNullifierSecret,
    addressToField,
    ethToWei,
    poseidonHash
};
