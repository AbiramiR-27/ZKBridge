/**
 * VeriSync - ZK International Bridge Verifier System
 * Backend Relayer Service
 * 
 * PURPOSE:
 * This service listens for deposit events on the source chain,
 * generates ZK proofs, and submits them to the destination chain.
 * 
 * ARCHITECTURE:
 * 1. Listen to BridgeDeposit events on Source Chain (Sepolia)
 * 2. Generate ZK proof for each deposit
 * 3. Submit proof to Destination Chain (Polygon Amoy)
 * 4. Track processed deposits to prevent duplicates
 * 
 * USAGE:
 * node relayer/index.js
 */

require("dotenv").config();
const { ethers } = require("ethers");
const { generateProof, formatProofForSolidity, generateNullifierSecret } = require("../circuits/generate_proof");
const fs = require("fs");
const path = require("path");

// ===========================================
// CONFIGURATION
// ===========================================

const CONFIG = {
    // Source Chain (Sepolia)
    source: {
        rpcUrl: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
        chainId: 11155111,
        bridgeAddress: process.env.SOURCE_BRIDGE_ADDRESS,
    },
    // Destination Chain (Polygon Amoy)
    destination: {
        rpcUrl: process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
        chainId: 80002,
        bridgeAddress: process.env.DESTINATION_BRIDGE_ADDRESS,
    },
    // Relayer settings
    relayer: {
        privateKey: process.env.PRIVATE_KEY,
        pollInterval: parseInt(process.env.RELAYER_POLL_INTERVAL || "5000"),
        maxRetries: 3,
        retryDelay: 10000,
    },
};

// Contract ABIs
const SOURCE_BRIDGE_ABI = [
    "event BridgeDeposit(uint256 indexed depositId, address indexed sender, address indexed token, uint256 amount, uint256 destinationChainId, address recipient, bytes32 commitment, uint256 timestamp, uint256 nonce)",
    "function getDeposit(uint256 depositId) view returns (tuple(address sender, address token, uint256 amount, uint256 destinationChainId, address recipient, bytes32 commitment, uint256 timestamp, bool processed))",
];

const DEST_BRIDGE_ABI = [
    "function claimWithProof(uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC, uint256[4] _pubSignals, address recipient, address sourceToken) returns (uint256)",
    "function isNullifierUsed(bytes32 nullifier) view returns (bool)",
    "function isCommitmentProcessed(bytes32 commitment) view returns (bool)",
    "function verifyProofOnly(uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC, uint256[4] _pubSignals) view returns (bool)",
];

// ===========================================
// STATE
// ===========================================

// Store processed deposits
const processedDeposits = new Set();
const pendingDeposits = new Map();

// Store nullifier secrets for each deposit
const nullifierSecrets = new Map();

// ===========================================
// PROVIDER & CONTRACT SETUP
// ===========================================

let sourceProvider, destProvider;
let sourceBridge, destBridge;
let relayerWallet;

function setupProviders() {
    console.log("Setting up providers...");
    
    // Source chain provider
    sourceProvider = new ethers.JsonRpcProvider(CONFIG.source.rpcUrl);
    
    // Destination chain provider
    destProvider = new ethers.JsonRpcProvider(CONFIG.destination.rpcUrl);
    
    // Relayer wallet (same key for both chains)
    const sourceWallet = new ethers.Wallet(CONFIG.relayer.privateKey, sourceProvider);
    relayerWallet = new ethers.Wallet(CONFIG.relayer.privateKey, destProvider);
    
    // Contract instances
    sourceBridge = new ethers.Contract(
        CONFIG.source.bridgeAddress,
        SOURCE_BRIDGE_ABI,
        sourceWallet
    );
    
    destBridge = new ethers.Contract(
        CONFIG.destination.bridgeAddress,
        DEST_BRIDGE_ABI,
        relayerWallet
    );
    
    console.log("Providers configured:");
    console.log("  Source Bridge:", CONFIG.source.bridgeAddress);
    console.log("  Dest Bridge:", CONFIG.destination.bridgeAddress);
    console.log("  Relayer Address:", relayerWallet.address);
}

// ===========================================
// EVENT LISTENER
// ===========================================

async function listenForDeposits() {
    console.log("\nListening for BridgeDeposit events on Source Chain...\n");
    
    // Listen for new deposits
    sourceBridge.on("BridgeDeposit", async (
        depositId,
        sender,
        token,
        amount,
        destinationChainId,
        recipient,
        commitment,
        timestamp,
        nonce,
        event
    ) => {
        console.log("===========================================");
        console.log("NEW DEPOSIT DETECTED!");
        console.log("===========================================");
        console.log("  Deposit ID:", depositId.toString());
        console.log("  Sender:", sender);
        console.log("  Token:", token);
        console.log("  Amount:", ethers.formatEther(amount), "tokens");
        console.log("  Destination Chain:", destinationChainId.toString());
        console.log("  Recipient:", recipient);
        console.log("  Commitment:", commitment);
        console.log("  Nonce:", nonce.toString());
        console.log("  Tx Hash:", event.transactionHash);
        console.log("");
        
        // Queue deposit for processing
        const depositData = {
            depositId: depositId.toString(),
            sender,
            token,
            amount: amount.toString(),
            destinationChainId: destinationChainId.toString(),
            recipient,
            commitment,
            timestamp: timestamp.toString(),
            nonce: nonce.toString(),
            txHash: event.transactionHash,
        };
        
        await processDeposit(depositData);
    });
}

// ===========================================
// DEPOSIT PROCESSING
// ===========================================

async function processDeposit(depositData) {
    const { depositId, commitment } = depositData;
    
    // Skip if already processed
    if (processedDeposits.has(depositId)) {
        console.log(`Deposit ${depositId} already processed, skipping.`);
        return;
    }
    
    // Check if commitment already processed on destination
    try {
        const isProcessed = await destBridge.isCommitmentProcessed(commitment);
        if (isProcessed) {
            console.log(`Commitment ${commitment} already processed on destination chain.`);
            processedDeposits.add(depositId);
            return;
        }
    } catch (error) {
        console.error("Error checking commitment status:", error.message);
    }
    
    // Add to pending
    pendingDeposits.set(depositId, depositData);
    
    // Generate and submit proof
    await generateAndSubmitProof(depositData);
}

async function generateAndSubmitProof(depositData, retryCount = 0) {
    const { depositId, sender, token, amount, destinationChainId, recipient, nonce } = depositData;
    
    console.log(`\nGenerating ZK proof for deposit ${depositId}...`);
    
    try {
        // Generate nullifier secret (or retrieve existing)
        let nullifierSecret = nullifierSecrets.get(depositId);
        if (!nullifierSecret) {
            nullifierSecret = generateNullifierSecret();
            nullifierSecrets.set(depositId, nullifierSecret);
        }
        
        // Prepare input for proof generation
        // Note: In production, you'd need to reconstruct the exact salt used
        // For this demo, we use a deterministic salt based on deposit data
        const salt = BigInt(ethers.keccak256(
            ethers.solidityPacked(
                ["address", "address", "uint256", "uint256"],
                [sender, token, amount, nonce]
            )
        )).toString();
        
        const proofInput = {
            sender: BigInt(sender).toString(),
            token: BigInt(token).toString(),
            amount: amount,
            destinationChainId: destinationChainId,
            recipient: BigInt(recipient).toString(),
            salt: salt,
            nonce: nonce,
        };
        
        // Generate proof
        const proofData = await generateProof(proofInput, nullifierSecret);
        
        console.log("Proof generated successfully!");
        console.log("  Commitment:", proofData.commitment);
        console.log("  Nullifier:", proofData.nullifier);
        
        // Format for Solidity
        const formattedProof = formatProofForSolidity(proofData);
        
        // Verify proof before submitting (optional but recommended)
        console.log("\nVerifying proof on-chain (dry run)...");
        const isValid = await destBridge.verifyProofOnly(
            formattedProof._pA,
            formattedProof._pB,
            formattedProof._pC,
            formattedProof._pubSignals
        );
        
        if (!isValid) {
            throw new Error("Proof verification failed on destination chain");
        }
        console.log("Proof verified successfully!");
        
        // Submit proof to destination chain
        console.log("\nSubmitting proof to destination chain...");
        const tx = await destBridge.claimWithProof(
            formattedProof._pA,
            formattedProof._pB,
            formattedProof._pC,
            formattedProof._pubSignals,
            recipient,
            token,
            { gasLimit: 500000 }
        );
        
        console.log("Transaction submitted:", tx.hash);
        console.log("Waiting for confirmation...");
        
        const receipt = await tx.wait();
        
        console.log("\n===========================================");
        console.log("CLAIM SUCCESSFUL!");
        console.log("===========================================");
        console.log("  Deposit ID:", depositId);
        console.log("  Tx Hash:", receipt.hash);
        console.log("  Block:", receipt.blockNumber);
        console.log("  Gas Used:", receipt.gasUsed.toString());
        console.log("===========================================\n");
        
        // Mark as processed
        processedDeposits.add(depositId);
        pendingDeposits.delete(depositId);
        
        // Save state
        saveState();
        
    } catch (error) {
        console.error(`\nError processing deposit ${depositId}:`, error.message);
        
        if (retryCount < CONFIG.relayer.maxRetries) {
            console.log(`Retrying in ${CONFIG.relayer.retryDelay / 1000} seconds... (attempt ${retryCount + 1}/${CONFIG.relayer.maxRetries})`);
            setTimeout(() => {
                generateAndSubmitProof(depositData, retryCount + 1);
            }, CONFIG.relayer.retryDelay);
        } else {
            console.error(`Max retries reached for deposit ${depositId}. Manual intervention required.`);
            // In production, alert the operator
        }
    }
}

// ===========================================
// STATE PERSISTENCE
// ===========================================

const STATE_FILE = path.join(__dirname, "relayer_state.json");

function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
            state.processedDeposits.forEach(id => processedDeposits.add(id));
            console.log(`Loaded ${processedDeposits.size} processed deposits from state file.`);
        }
    } catch (error) {
        console.error("Error loading state:", error.message);
    }
}

function saveState() {
    try {
        const state = {
            processedDeposits: Array.from(processedDeposits),
            lastUpdated: new Date().toISOString(),
        };
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (error) {
        console.error("Error saving state:", error.message);
    }
}

// ===========================================
// HISTORICAL DEPOSITS
// ===========================================

async function processHistoricalDeposits() {
    console.log("\nChecking for historical deposits...\n");
    
    try {
        // Get past events (last 1000 blocks)
        const currentBlock = await sourceProvider.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - 1000);
        
        const filter = sourceBridge.filters.BridgeDeposit();
        const events = await sourceBridge.queryFilter(filter, fromBlock, currentBlock);
        
        console.log(`Found ${events.length} historical deposits to process.`);
        
        for (const event of events) {
            const [depositId, sender, token, amount, destinationChainId, recipient, commitment, timestamp, nonce] = event.args;
            
            const depositData = {
                depositId: depositId.toString(),
                sender,
                token,
                amount: amount.toString(),
                destinationChainId: destinationChainId.toString(),
                recipient,
                commitment,
                timestamp: timestamp.toString(),
                nonce: nonce.toString(),
                txHash: event.transactionHash,
            };
            
            await processDeposit(depositData);
        }
    } catch (error) {
        console.error("Error processing historical deposits:", error.message);
    }
}

// ===========================================
// HEALTH CHECK
// ===========================================

async function healthCheck() {
    try {
        const sourceBlock = await sourceProvider.getBlockNumber();
        const destBlock = await destProvider.getBlockNumber();
        const balance = await destProvider.getBalance(relayerWallet.address);
        
        console.log("\n--- Health Check ---");
        console.log("  Source Chain Block:", sourceBlock);
        console.log("  Dest Chain Block:", destBlock);
        console.log("  Relayer Balance:", ethers.formatEther(balance), "MATIC");
        console.log("  Pending Deposits:", pendingDeposits.size);
        console.log("  Processed Total:", processedDeposits.size);
        console.log("--------------------\n");
        
        // Warn if balance is low
        if (balance < ethers.parseEther("0.1")) {
            console.warn("WARNING: Relayer balance is low! Please add funds.");
        }
    } catch (error) {
        console.error("Health check failed:", error.message);
    }
}

// ===========================================
// MAIN ENTRY POINT
// ===========================================

async function main() {
    console.log("===========================================");
    console.log("VeriSync - ZK Bridge Relayer");
    console.log("===========================================\n");
    
    // Validate configuration
    if (!CONFIG.source.bridgeAddress || !CONFIG.destination.bridgeAddress) {
        console.error("ERROR: Bridge addresses not configured.");
        console.error("Please set SOURCE_BRIDGE_ADDRESS and DESTINATION_BRIDGE_ADDRESS in .env");
        process.exit(1);
    }
    
    if (!CONFIG.relayer.privateKey) {
        console.error("ERROR: Relayer private key not configured.");
        console.error("Please set PRIVATE_KEY in .env");
        process.exit(1);
    }
    
    // Setup
    setupProviders();
    loadState();
    
    // Initial health check
    await healthCheck();
    
    // Process any historical deposits
    await processHistoricalDeposits();
    
    // Start listening for new deposits
    await listenForDeposits();
    
    // Periodic health check
    setInterval(healthCheck, 60000); // Every minute
    
    console.log("Relayer is running. Press Ctrl+C to stop.\n");
}

// Handle graceful shutdown
process.on("SIGINT", () => {
    console.log("\nShutting down relayer...");
    saveState();
    process.exit(0);
});

process.on("SIGTERM", () => {
    console.log("\nShutting down relayer...");
    saveState();
    process.exit(0);
});

// Run
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
