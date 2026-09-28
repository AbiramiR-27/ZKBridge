/**
 * VeriSync Protocol v1.0 - ZK International Bridge Verifier System
 * Relayer API Server
 * 
 * Provides REST endpoints for the frontend to query bridge state, Merkle roots,
 * and proof parameters.
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");
const {
    generateProof,
    formatProofForSolidity,
    generateNullifierSecret,
    generateRandomSalt,
    computeCanonicalCommitment,
    IncrementalMerkleTree
} = require("../circuits/generate_proof");

const app = express();
const PORT = process.env.API_PORT || 3001;

app.use(cors());
app.use(express.json());

const CONFIG = {
    source: {
        rpcUrl: process.env.SEPOLIA_RPC_URL || "http://127.0.0.1:8545",
        bridgeAddress: process.env.SOURCE_BRIDGE_ADDRESS,
    },
    destination: {
        rpcUrl: process.env.AMOY_RPC_URL || "http://127.0.0.1:8545",
        bridgeAddress: process.env.DESTINATION_BRIDGE_ADDRESS,
    },
};

const SOURCE_BRIDGE_ABI = [
    "function getDeposit(uint256 depositId) view returns (tuple(address sender, address token, uint256 amount, uint256 destinationChainId, address recipient, uint256 commitment, uint256 leafIndex, uint256 root, uint256 timestamp, uint256 nonce))",
    "function depositNonce() view returns (uint256)",
    "function currentRoot() view returns (uint256)",
    "function supportedTokens(address) view returns (bool)",
];

const DEST_BRIDGE_ABI = [
    "function isNullifierUsed(uint256 nullifier) view returns (bool)",
    "function isKnownSourceRoot(uint256 root) view returns (bool)",
    "function getClaim(uint256 claimId) view returns (tuple(address recipient, address token, uint256 amount, uint256 nullifier, uint256 root, uint256 timestamp))",
    "function totalClaims() view returns (uint256)",
];

const sourceProvider = new ethers.JsonRpcProvider(CONFIG.source.rpcUrl);
const destProvider = new ethers.JsonRpcProvider(CONFIG.destination.rpcUrl);

let sourceBridge, destBridge;

function initContracts() {
    if (CONFIG.source.bridgeAddress) {
        sourceBridge = new ethers.Contract(CONFIG.source.bridgeAddress, SOURCE_BRIDGE_ABI, sourceProvider);
    }
    if (CONFIG.destination.bridgeAddress) {
        destBridge = new ethers.Contract(CONFIG.destination.bridgeAddress, DEST_BRIDGE_ABI, destProvider);
    }
}

app.get("/api/health", async (req, res) => {
    try {
        const sourceBlock = await sourceProvider.getBlockNumber();
        const destBlock = await destProvider.getBlockNumber();
        
        res.json({
            status: "healthy",
            sourceChain: { block: sourceBlock, rpc: CONFIG.source.rpcUrl },
            destChain: { block: destBlock, rpc: CONFIG.destination.rpcUrl },
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/config", (req, res) => {
    res.json({
        sourceChain: {
            name: "Ethereum Sepolia",
            chainId: 11155111,
            bridgeAddress: CONFIG.source.bridgeAddress,
        },
        destChain: {
            name: "Polygon Amoy",
            chainId: 80002,
            bridgeAddress: CONFIG.destination.bridgeAddress,
        },
    });
});

app.post("/api/deposit/prepare", async (req, res) => {
    try {
        const { sender, token, amount, recipient, destinationChainId } = req.body;
        if (!sender || !token || !amount || !recipient) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const salt = generateRandomSalt();
        const nullifierSecret = generateNullifierSecret();
        let nonce = "0";
        if (sourceBridge) {
            nonce = (await sourceBridge.depositNonce()).toString();
        }

        res.json({
            salt,
            nullifierSecret,
            nonce,
            destinationChainId: destinationChainId || "80002",
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/nullifier/:nullifier/status", async (req, res) => {
    try {
        const { nullifier } = req.params;
        if (!destBridge) {
            return res.status(500).json({ error: "Destination bridge not configured" });
        }
        const isUsed = await destBridge.isNullifierUsed(nullifier);
        res.json({ nullifier, used: isUsed });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

if (require.main === module) {
    initContracts();
    app.listen(PORT, () => {
        console.log(`Relayer API listening on port ${PORT}`);
    });
}

module.exports = app;
