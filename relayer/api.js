/**
 * VeriSync - ZK International Bridge Verifier System
 * Relayer API Server
 * 
 * This provides REST endpoints for the frontend to interact with the bridge.
 * Run alongside the main relayer service.
 * 
 * USAGE:
 * node relayer/api.js
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");
const { generateProof, formatProofForSolidity, generateNullifierSecret, generateRandomSalt } = require("../circuits/generate_proof");

const app = express();
const PORT = process.env.API_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// ===========================================
// CONFIGURATION
// ===========================================

const CONFIG = {
    source: {
        rpcUrl: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
        bridgeAddress: process.env.SOURCE_BRIDGE_ADDRESS,
    },
    destination: {
        rpcUrl: process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
        bridgeAddress: process.env.DESTINATION_BRIDGE_ADDRESS,
    },
};

// Contract ABIs
const SOURCE_BRIDGE_ABI = [
    "event BridgeDeposit(uint256 indexed depositId, address indexed sender, address indexed token, uint256 amount, uint256 destinationChainId, address recipient, bytes32 commitment, uint256 timestamp, uint256 nonce)",
    "function getDeposit(uint256 depositId) view returns (tuple(address sender, address token, uint256 amount, uint256 destinationChainId, address recipient, bytes32 commitment, uint256 timestamp, bool processed))",
    "function depositNonce() view returns (uint256)",
    "function supportedTokens(address) view returns (bool)",
];

const DEST_BRIDGE_ABI = [
    "function isCommitmentProcessed(bytes32 commitment) view returns (bool)",
    "function getClaim(uint256 claimId) view returns (tuple(address recipient, address token, uint256 amount, bytes32 nullifier, uint256 timestamp, bytes32 commitment))",
    "function totalClaims() view returns (uint256)",
];

// Providers
const sourceProvider = new ethers.JsonRpcProvider(CONFIG.source.rpcUrl);
const destProvider = new ethers.JsonRpcProvider(CONFIG.destination.rpcUrl);

// Contracts
let sourceBridge, destBridge;

function initContracts() {
    if (CONFIG.source.bridgeAddress) {
        sourceBridge = new ethers.Contract(CONFIG.source.bridgeAddress, SOURCE_BRIDGE_ABI, sourceProvider);
    }
    if (CONFIG.destination.bridgeAddress) {
        destBridge = new ethers.Contract(CONFIG.destination.bridgeAddress, DEST_BRIDGE_ABI, destProvider);
    }
}

// ===========================================
// API ENDPOINTS
// ===========================================

/**
 * Health check endpoint
 */
app.get("/api/health", async (req, res) => {
    try {
        const sourceBlock = await sourceProvider.getBlockNumber();
        const destBlock = await destProvider.getBlockNumber();
        
        res.json({
            status: "healthy",
            sourceChain: {
                block: sourceBlock,
                rpc: CONFIG.source.rpcUrl,
            },
            destChain: {
                block: destBlock,
                rpc: CONFIG.destination.rpcUrl,
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get bridge configuration
 */
app.get("/api/config", (req, res) => {
    res.json({
        sourceChain: {
            name: "Ethereum Sepolia",
            chainId: 11155111,
            bridgeAddress: CONFIG.source.bridgeAddress,
            rpcUrl: CONFIG.source.rpcUrl,
        },
        destChain: {
            name: "Polygon Amoy",
            chainId: 80002,
            bridgeAddress: CONFIG.destination.bridgeAddress,
            rpcUrl: CONFIG.destination.rpcUrl,
        },
    });
});

/**
 * Generate deposit parameters (salt, etc.)
 */
app.post("/api/deposit/prepare", async (req, res) => {
    try {
        const { sender, token, amount, recipient } = req.body;
        
        // Validate inputs
        if (!sender || !token || !amount || !recipient) {
            return res.status(400).json({ error: "Missing required fields" });
        }
        
        // Generate salt and nullifier secret
        const salt = generateRandomSalt();
        const nullifierSecret = generateNullifierSecret();
        
        // Get current nonce
        let nonce = "0";
        if (sourceBridge) {
            nonce = (await sourceBridge.depositNonce()).toString();
        }
        
        res.json({
            salt,
            nullifierSecret,
            nonce,
            message: "Store these values securely! You will need them to claim your tokens.",
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get deposit details
 */
app.get("/api/deposit/:depositId", async (req, res) => {
    try {
        const { depositId } = req.params;
        
        if (!sourceBridge) {
            return res.status(500).json({ error: "Source bridge not configured" });
        }
        
        const deposit = await sourceBridge.getDeposit(depositId);
        
        res.json({
            depositId,
            sender: deposit.sender,
            token: deposit.token,
            amount: deposit.amount.toString(),
            destinationChainId: deposit.destinationChainId.toString(),
            recipient: deposit.recipient,
            commitment: deposit.commitment,
            timestamp: deposit.timestamp.toString(),
            processed: deposit.processed,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Check if commitment is processed on destination
 */
app.get("/api/commitment/:commitment/status", async (req, res) => {
    try {
        const { commitment } = req.params;
        
        if (!destBridge) {
            return res.status(500).json({ error: "Destination bridge not configured" });
        }
        
        const isProcessed = await destBridge.isCommitmentProcessed(commitment);
        
        res.json({
            commitment,
            processed: isProcessed,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Generate ZK proof for a deposit
 */
app.post("/api/proof/generate", async (req, res) => {
    try {
        const {
            sender,
            token,
            amount,
            destinationChainId,
            recipient,
            salt,
            nonce,
            nullifierSecret,
        } = req.body;
        
        // Validate inputs
        if (!sender || !token || !amount || !destinationChainId || !recipient || !salt || !nonce || !nullifierSecret) {
            return res.status(400).json({ error: "Missing required fields" });
        }
        
        console.log("Generating proof for deposit...");
        console.log("  Sender:", sender);
        console.log("  Amount:", amount);
        
        // Convert addresses to field elements
        const proofInput = {
            sender: BigInt(sender).toString(),
            token: BigInt(token).toString(),
            amount: amount.toString(),
            destinationChainId: destinationChainId.toString(),
            recipient: BigInt(recipient).toString(),
            salt: salt.toString(),
            nonce: nonce.toString(),
        };
        
        // Generate proof
        const proofData = await generateProof(proofInput, nullifierSecret);
        const formattedProof = formatProofForSolidity(proofData);
        
        res.json({
            proof: formattedProof,
            commitment: proofData.commitment,
            nullifier: proofData.nullifier,
            timestamp: proofData.timestamp,
            publicSignals: proofData.publicSignals,
        });
    } catch (error) {
        console.error("Proof generation error:", error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get recent deposits for a user
 */
app.get("/api/deposits/user/:address", async (req, res) => {
    try {
        const { address } = req.params;
        
        if (!sourceBridge) {
            return res.status(500).json({ error: "Source bridge not configured" });
        }
        
        // Get deposit events for this user
        const filter = sourceBridge.filters.BridgeDeposit(null, address);
        const currentBlock = await sourceProvider.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - 10000);
        
        const events = await sourceBridge.queryFilter(filter, fromBlock, currentBlock);
        
        const deposits = events.map(event => ({
            depositId: event.args[0].toString(),
            sender: event.args[1],
            token: event.args[2],
            amount: event.args[3].toString(),
            destinationChainId: event.args[4].toString(),
            recipient: event.args[5],
            commitment: event.args[6],
            timestamp: event.args[7].toString(),
            nonce: event.args[8].toString(),
            txHash: event.transactionHash,
        }));
        
        res.json({ deposits });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get bridge statistics
 */
app.get("/api/stats", async (req, res) => {
    try {
        let sourceStats = { totalDeposits: 0 };
        let destStats = { totalClaims: 0 };
        
        if (sourceBridge) {
            const nonce = await sourceBridge.depositNonce();
            sourceStats.totalDeposits = nonce.toString();
        }
        
        if (destBridge) {
            const claims = await destBridge.totalClaims();
            destStats.totalClaims = claims.toString();
        }
        
        res.json({
            source: sourceStats,
            destination: destStats,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===========================================
// START SERVER
// ===========================================

initContracts();

app.listen(PORT, () => {
    console.log("===========================================");
    console.log("VeriSync - Relayer API Server");
    console.log("===========================================");
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
    console.log("===========================================\n");
});
