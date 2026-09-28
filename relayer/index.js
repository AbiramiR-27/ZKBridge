/**
 * VeriSync Protocol v1.0 - ZK International Bridge Verifier System
 * Backend Relayer Service
 * 
 * PURPOSE:
 * Listens for BridgeDeposit events on the source chain, synchronizes the Merkle tree,
 * generates Groth16 proofs, and submits valid claims to the destination chain.
 */

require("dotenv").config();
const { ethers } = require("ethers");
const {
    generateProof,
    formatProofForSolidity,
    generateNullifierSecret,
    IncrementalMerkleTree,
    computeCanonicalCommitment
} = require("../circuits/generate_proof");
const fs = require("fs");
const path = require("path");

// ===========================================
// CONFIGURATION
// ===========================================

const CONFIG = {
    source: {
        rpcUrl: process.env.SEPOLIA_RPC_URL || "http://127.0.0.1:8545",
        chainId: 11155111,
        bridgeAddress: process.env.SOURCE_BRIDGE_ADDRESS,
    },
    destination: {
        rpcUrl: process.env.AMOY_RPC_URL || "http://127.0.0.1:8545",
        chainId: 80002,
        bridgeAddress: process.env.DESTINATION_BRIDGE_ADDRESS,
    },
    relayer: {
        privateKey: process.env.PRIVATE_KEY,
        pollInterval: parseInt(process.env.RELAYER_POLL_INTERVAL || "5000"),
        maxRetries: 3,
        retryDelay: 10000,
    },
};

const SOURCE_BRIDGE_ABI = [
    "event BridgeDeposit(uint256 indexed depositId, address indexed sender, address indexed token, uint256 amount, uint256 destinationChainId, address recipient, uint256 commitment, uint256 root, uint256 nonce, uint256 timestamp)",
    "function getDeposit(uint256 depositId) view returns (tuple(address sender, address token, uint256 amount, uint256 destinationChainId, address recipient, uint256 commitment, uint256 leafIndex, uint256 root, uint256 timestamp, uint256 nonce))",
    "function currentRoot() view returns (uint256)",
];

const DEST_BRIDGE_ABI = [
    "function claimWithProof(uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC, uint256[7] _pubSignals) returns (uint256)",
    "function isNullifierUsed(uint256 nullifier) view returns (bool)",
    "function isKnownSourceRoot(uint256 root) view returns (bool)",
    "function registerSourceRoot(uint256 root)",
];

// Local state
const processedDeposits = new Set();
const tree = new IncrementalMerkleTree(8);
let treeInitialized = false;

let sourceProvider, destProvider;
let sourceBridge, destBridge;
let relayerWallet;

async function setupProviders() {
    console.log("Setting up VeriSync Relayer...");
    sourceProvider = new ethers.JsonRpcProvider(CONFIG.source.rpcUrl);
    destProvider = new ethers.JsonRpcProvider(CONFIG.destination.rpcUrl);

    if (CONFIG.relayer.privateKey) {
        relayerWallet = new ethers.Wallet(CONFIG.relayer.privateKey, destProvider);
    }

    if (CONFIG.source.bridgeAddress) {
        sourceBridge = new ethers.Contract(CONFIG.source.bridgeAddress, SOURCE_BRIDGE_ABI, sourceProvider);
    }
    if (CONFIG.destination.bridgeAddress && relayerWallet) {
        destBridge = new ethers.Contract(CONFIG.destination.bridgeAddress, DEST_BRIDGE_ABI, relayerWallet);
    }

    await tree.init();
    treeInitialized = true;
    console.log("Relayer initialized with Merkle tree depth 8.");
}

async function processDeposit(depositData) {
    const { depositId, commitment, root } = depositData;

    if (processedDeposits.has(depositId)) {
        return;
    }

    try {
        console.log(`Processing deposit #${depositId} with commitment ${commitment}...`);

        // Insert into local tree mirror
        const leafIndex = await tree.insert(commitment);
        const merkleProof = await tree.generateProof(leafIndex);

        // Synchronize source root to destination chain if needed
        const isRootKnown = await destBridge.isKnownSourceRoot(merkleProof.root);
        if (!isRootKnown) {
            console.log(`Registering new source root ${merkleProof.root} on destination bridge...`);
            const regTx = await destBridge.registerSourceRoot(merkleProof.root);
            await regTx.wait();
        }

        // Generate ZK proof
        const nullifierSecret = generateNullifierSecret();
        const proofData = await generateProof({
            depositData: {
                sourceChainId: depositData.sourceChainId,
                destinationChainId: depositData.destinationChainId,
                sender: depositData.sender,
                token: depositData.token,
                amount: depositData.amount,
                recipient: depositData.recipient,
                salt: depositData.salt,
                nonce: depositData.nonce,
            },
            nullifierSecret,
            merkleProof
        });

        const formatted = formatProofForSolidity(proofData);

        console.log(`Submitting claimWithProof to DestinationBridge...`);
        const tx = await destBridge.claimWithProof(
            formatted._pA,
            formatted._pB,
            formatted._pC,
            formatted._pubSignals
        );
        const receipt = await tx.wait();

        console.log(`Claim succeeded in tx: ${receipt.hash}`);
        processedDeposits.add(depositId);
    } catch (err) {
        console.error(`Error processing deposit ${depositId}:`, err.message);
    }
}

async function start() {
    await setupProviders();
    if (!sourceBridge) {
        console.log("SOURCE_BRIDGE_ADDRESS not configured. Running in idle mode.");
        return;
    }

    sourceBridge.on("BridgeDeposit", (depositId, sender, token, amount, destinationChainId, recipient, commitment, root, nonce, timestamp) => {
        const depositData = {
            depositId: depositId.toString(),
            sender,
            token,
            amount: amount.toString(),
            destinationChainId: destinationChainId.toString(),
            recipient,
            commitment: commitment.toString(),
            root: root.toString(),
            nonce: nonce.toString(),
            salt: "0",
            timestamp: timestamp.toString()
        };
        processDeposit(depositData);
    });

    console.log("Listening for BridgeDeposit events...");
}

if (require.main === module) {
    start();
}

module.exports = {
    setupProviders,
    processDeposit,
    CONFIG
};
