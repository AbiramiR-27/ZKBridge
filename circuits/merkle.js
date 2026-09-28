const { buildPoseidon } = require("circomlibjs");

const TREE_DEPTH = 8;
const MAX_LEAVES = 2 ** TREE_DEPTH; // 256

let poseidonInstance = null;

async function getPoseidon() {
    if (!poseidonInstance) {
        poseidonInstance = await buildPoseidon();
    }
    return poseidonInstance;
}

async function poseidonHash2(a, b) {
    const poseidon = await getPoseidon();
    const hash = poseidon([BigInt(a), BigInt(b)]);
    return poseidon.F.toString(hash);
}

async function poseidonHash4(inputs) {
    const poseidon = await getPoseidon();
    const hash = poseidon(inputs.map(x => BigInt(x)));
    return poseidon.F.toString(hash);
}

async function computeZeroHashes(depth = TREE_DEPTH) {
    const zeros = ["0"];
    for (let i = 1; i <= depth; i++) {
        zeros[i] = await poseidonHash2(zeros[i - 1], zeros[i - 1]);
    }
    return zeros;
}

/**
 * Canonical 2-step Poseidon commitment calculation for VeriSync Protocol v1.0
 * h1 = Poseidon4(sourceChainId, destinationChainId, sender, token)
 * h2 = Poseidon4(amount, recipient, salt, nonce)
 * commitment = Poseidon2(h1, h2)
 */
async function computeCanonicalCommitment({
    sourceChainId,
    destinationChainId,
    sender,
    token,
    amount,
    recipient,
    salt,
    nonce
}) {
    const h1 = await poseidonHash4([sourceChainId, destinationChainId, sender, token]);
    const h2 = await poseidonHash4([amount, recipient, salt, nonce]);
    const commitment = await poseidonHash2(h1, h2);
    return commitment;
}

/**
 * Nullifier computation
 * nullifier = Poseidon2(commitment, nullifierSecret)
 */
async function computeNullifier(commitment, nullifierSecret) {
    return await poseidonHash2(commitment, nullifierSecret);
}

class IncrementalMerkleTree {
    constructor(depth = TREE_DEPTH) {
        this.depth = depth;
        this.leaves = [];
        this.zeros = [];
    }

    async init() {
        this.zeros = await computeZeroHashes(this.depth);
        return this;
    }

    async insert(leaf) {
        if (this.leaves.length >= 2 ** this.depth) {
            throw new Error("Tree is full");
        }
        const index = this.leaves.length;
        this.leaves.push(leaf.toString());
        return index;
    }

    async getRoot() {
        let currentLevel = [...this.leaves];
        const levelCount = 2 ** this.depth;
        
        // Pad with zeros at level 0
        while (currentLevel.length < levelCount) {
            currentLevel.push(this.zeros[0]);
        }

        for (let level = 0; level < this.depth; level++) {
            const nextLevel = [];
            for (let i = 0; i < currentLevel.length; i += 2) {
                const parent = await poseidonHash2(currentLevel[i], currentLevel[i + 1]);
                nextLevel.push(parent);
            }
            currentLevel = nextLevel;
        }

        return currentLevel[0];
    }

    async generateProof(leafIndex) {
        if (leafIndex < 0 || leafIndex >= this.leaves.length) {
            throw new Error(`Invalid leaf index: ${leafIndex}`);
        }

        const pathElements = [];
        const pathIndices = [];

        let currentLevel = [...this.leaves];
        const levelCount = 2 ** this.depth;
        while (currentLevel.length < levelCount) {
            currentLevel.push(this.zeros[0]);
        }

        let currentIndex = leafIndex;

        for (let level = 0; level < this.depth; level++) {
            const isRightChild = currentIndex % 2 === 1;
            const siblingIndex = isRightChild ? currentIndex - 1 : currentIndex + 1;

            pathElements.push(currentLevel[siblingIndex]);
            pathIndices.push(isRightChild ? 1 : 0);

            const nextLevel = [];
            for (let i = 0; i < currentLevel.length; i += 2) {
                const parent = await poseidonHash2(currentLevel[i], currentLevel[i + 1]);
                nextLevel.push(parent);
            }
            currentLevel = nextLevel;
            currentIndex = Math.floor(currentIndex / 2);
        }

        const root = currentLevel[0];
        return {
            root,
            pathElements,
            pathIndices
        };
    }
}

module.exports = {
    TREE_DEPTH,
    MAX_LEAVES,
    getPoseidon,
    poseidonHash2,
    poseidonHash4,
    computeZeroHashes,
    computeCanonicalCommitment,
    computeNullifier,
    IncrementalMerkleTree
};
