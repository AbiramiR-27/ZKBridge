/**
 * VeriSync Protocol v1.0 - ZK International Bridge Verifier System
 * Proof Generation Library with Merkle Deposit Anchoring
 */

const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const {
    computeCanonicalCommitment,
    computeNullifier,
    IncrementalMerkleTree,
    getPoseidon
} = require("./merkle");

const WASM_PATH = path.join(__dirname, "bridge_verifier_js/bridge_verifier.wasm");
const ZKEY_PATH = path.join(__dirname, "bridge_final.zkey");
const VKEY_PATH = path.join(__dirname, "verification_key.json");

function generateNullifierSecret() {
    return (BigInt("0x" + require("crypto").randomBytes(31).toString("hex"))).toString();
}

function generateRandomSalt() {
    return (BigInt("0x" + require("crypto").randomBytes(31).toString("hex"))).toString();
}

/**
 * Generate full Groth16 proof with Merkle inclusion
 */
async function generateProof({
    depositData,
    nullifierSecret,
    merkleProof
}) {
    const {
        sourceChainId,
        destinationChainId,
        sender,
        token,
        amount,
        recipient,
        salt,
        nonce
    } = depositData;

    const commitment = await computeCanonicalCommitment(depositData);
    const nullifier = await computeNullifier(commitment, nullifierSecret);

    const circuitInput = {
        // Public signals
        root: merkleProof.root.toString(),
        nullifier: nullifier.toString(),
        amount: amount.toString(),
        token: BigInt(token).toString(),
        recipient: BigInt(recipient).toString(),
        sourceChainId: sourceChainId.toString(),
        destinationChainId: destinationChainId.toString(),

        // Private signals
        sender: BigInt(sender).toString(),
        salt: salt.toString(),
        nonce: nonce.toString(),
        nullifierSecret: nullifierSecret.toString(),
        pathElements: merkleProof.pathElements.map(x => x.toString()),
        pathIndices: merkleProof.pathIndices.map(x => x.toString())
    };

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInput,
        WASM_PATH,
        ZKEY_PATH
    );

    return {
        proof,
        publicSignals,
        commitment,
        nullifier,
        root: merkleProof.root.toString()
    };
}

/**
 * Format SnarkJS proof for Solidity Verifier contract
 */
function formatProofForSolidity(proofData) {
    const { proof, publicSignals } = proofData;

    const _pA = [proof.pi_a[0], proof.pi_a[1]];
    const _pB = [
        [proof.pi_b[0][1], proof.pi_b[0][0]],
        [proof.pi_b[1][1], proof.pi_b[1][0]]
    ];
    const _pC = [proof.pi_c[0], proof.pi_c[1]];

    return {
        _pA,
        _pB,
        _pC,
        _pubSignals: publicSignals
    };
}

/**
 * Verify proof locally using verification key
 */
async function verifyProofLocally(proofData) {
    const vKey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));
    return await snarkjs.groth16.verify(vKey, proofData.publicSignals, proofData.proof);
}

module.exports = {
    generateProof,
    formatProofForSolidity,
    verifyProofLocally,
    generateNullifierSecret,
    generateRandomSalt,
    computeCanonicalCommitment,
    computeNullifier,
    IncrementalMerkleTree
};
