/**
 * VeriSync - ZK International Bridge Verifier System
 * Deployment Script
 * 
 * This script deploys all contracts to the testnets:
 * 1. BridgeToken (for testing)
 * 2. SourceBridge on Sepolia
 * 3. Verifier on Polygon Amoy
 * 4. DestinationBridge on Polygon Amoy
 */

const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
    console.log("===========================================");
    console.log("VeriSync - ZK Bridge Deployment");
    console.log("===========================================\n");

    const [deployer] = await ethers.getSigners();
    console.log("Deployer address:", deployer.address);
    console.log("Network:", hre.network.name);
    console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

    // Get network configuration
    const networkName = hre.network.name;
    
    if (networkName === "sepolia") {
        await deploySourceChain(deployer);
    } else if (networkName === "amoy") {
        await deployDestinationChain(deployer);
    } else if (networkName === "hardhat" || networkName === "localhost") {
        await deployAll(deployer);
    } else {
        console.log("Unknown network. Please use sepolia, amoy, or hardhat.");
    }
}

/**
 * Deploy Source Chain contracts (Sepolia)
 */
async function deploySourceChain(deployer) {
    console.log("Deploying to SOURCE CHAIN (Sepolia)...\n");

    // 1. Deploy Test Token
    console.log("1. Deploying BridgeToken (VST)...");
    const BridgeToken = await ethers.getContractFactory("BridgeToken");
    const sourceToken = await BridgeToken.deploy(
        "VeriSync Test Token",
        "VST",
        18,
        1000000 // 1 million tokens
    );
    await sourceToken.waitForDeployment();
    const sourceTokenAddress = await sourceToken.getAddress();
    console.log("   BridgeToken deployed to:", sourceTokenAddress);

    // 2. Deploy Source Bridge
    console.log("2. Deploying SourceBridge...");
    const SourceBridge = await ethers.getContractFactory("SourceBridge");
    const sourceBridge = await SourceBridge.deploy();
    await sourceBridge.waitForDeployment();
    const sourceBridgeAddress = await sourceBridge.getAddress();
    console.log("   SourceBridge deployed to:", sourceBridgeAddress);

    // 3. Configure Source Bridge
    console.log("3. Configuring SourceBridge...");
    const minDeposit = ethers.parseEther("0.01"); // 0.01 tokens minimum
    const maxDeposit = ethers.parseEther("10000"); // 10000 tokens maximum
    
    const tx = await sourceBridge.addSupportedToken(sourceTokenAddress, minDeposit, maxDeposit);
    await tx.wait();
    console.log("   Token added to supported list");

    console.log("\n===========================================");
    console.log("SOURCE CHAIN DEPLOYMENT COMPLETE");
    console.log("===========================================");
    console.log("Network: Sepolia");
    console.log("BridgeToken (VST):", sourceTokenAddress);
    console.log("SourceBridge:", sourceBridgeAddress);
    console.log("\nSave these addresses for the destination chain deployment!");
    console.log("===========================================\n");

    return { sourceToken, sourceBridge };
}

/**
 * Deploy Destination Chain contracts (Polygon Amoy)
 */
async function deployDestinationChain(deployer) {
    console.log("Deploying to DESTINATION CHAIN (Polygon Amoy)...\n");

    // Get source chain addresses from environment or hardcode for testing
    const sourceChainId = 11155111; // Sepolia chain ID
    const proofExpirationWindow = 3600; // 1 hour

    // 1. Deploy Verifier
    console.log("1. Deploying Groth16Verifier...");
    const Verifier = await ethers.getContractFactory("Groth16Verifier");
    const verifier = await Verifier.deploy();
    await verifier.waitForDeployment();
    const verifierAddress = await verifier.getAddress();
    console.log("   Verifier deployed to:", verifierAddress);

    // 2. Deploy Test Token for destination
    console.log("2. Deploying BridgeToken (wVST) on destination...");
    const BridgeToken = await ethers.getContractFactory("BridgeToken");
    const destToken = await BridgeToken.deploy(
        "Wrapped VeriSync Token",
        "wVST",
        18,
        1000000 // 1 million tokens for liquidity
    );
    await destToken.waitForDeployment();
    const destTokenAddress = await destToken.getAddress();
    console.log("   BridgeToken (wVST) deployed to:", destTokenAddress);

    // 3. Deploy Destination Bridge
    console.log("3. Deploying DestinationBridge...");
    const DestinationBridge = await ethers.getContractFactory("DestinationBridge");
    const destBridge = await DestinationBridge.deploy(
        verifierAddress,
        sourceChainId,
        proofExpirationWindow
    );
    await destBridge.waitForDeployment();
    const destBridgeAddress = await destBridge.getAddress();
    console.log("   DestinationBridge deployed to:", destBridgeAddress);

    // 4. Configure Destination Bridge
    console.log("4. Configuring DestinationBridge...");
    
    // Set token mapping (source token => destination token)
    // Note: Replace SOURCE_TOKEN_ADDRESS with actual address from source deployment
    const sourceTokenAddress = process.env.SOURCE_TOKEN_ADDRESS || "0x0000000000000000000000000000000000000001";
    const mapTx = await destBridge.setTokenMapping(sourceTokenAddress, destTokenAddress);
    await mapTx.wait();
    console.log("   Token mapping configured");

    // 5. Add liquidity to bridge
    console.log("5. Adding liquidity to bridge...");
    const liquidityAmount = ethers.parseEther("100000"); // 100k tokens
    const approveTx = await destToken.approve(destBridgeAddress, liquidityAmount);
    await approveTx.wait();
    const addLiqTx = await destBridge.addLiquidity(destTokenAddress, liquidityAmount);
    await addLiqTx.wait();
    console.log("   Liquidity added:", ethers.formatEther(liquidityAmount), "wVST");

    console.log("\n===========================================");
    console.log("DESTINATION CHAIN DEPLOYMENT COMPLETE");
    console.log("===========================================");
    console.log("Network: Polygon Amoy");
    console.log("Verifier:", verifierAddress);
    console.log("BridgeToken (wVST):", destTokenAddress);
    console.log("DestinationBridge:", destBridgeAddress);
    console.log("===========================================\n");

    return { verifier, destToken, destBridge };
}

/**
 * Deploy all contracts locally for testing
 */
async function deployAll(deployer) {
    console.log("Deploying ALL contracts locally for testing...\n");

    // Source chain contracts
    console.log("--- SOURCE CHAIN CONTRACTS ---\n");
    
    const BridgeToken = await ethers.getContractFactory("BridgeToken");
    const sourceToken = await BridgeToken.deploy("VeriSync Test Token", "VST", 18, 1000000);
    await sourceToken.waitForDeployment();
    console.log("Source Token (VST):", await sourceToken.getAddress());

    const SourceBridge = await ethers.getContractFactory("SourceBridge");
    const sourceBridge = await SourceBridge.deploy();
    await sourceBridge.waitForDeployment();
    console.log("SourceBridge:", await sourceBridge.getAddress());

    // Configure source bridge
    await sourceBridge.addSupportedToken(
        await sourceToken.getAddress(),
        ethers.parseEther("0.01"),
        ethers.parseEther("10000")
    );

    // Destination chain contracts
    console.log("\n--- DESTINATION CHAIN CONTRACTS ---\n");
    
    const Verifier = await ethers.getContractFactory("Groth16Verifier");
    const verifier = await Verifier.deploy();
    await verifier.waitForDeployment();
    console.log("Verifier:", await verifier.getAddress());

    const destToken = await BridgeToken.deploy("Wrapped VeriSync Token", "wVST", 18, 1000000);
    await destToken.waitForDeployment();
    console.log("Dest Token (wVST):", await destToken.getAddress());

    const DestinationBridge = await ethers.getContractFactory("DestinationBridge");
    const destBridge = await DestinationBridge.deploy(
        await verifier.getAddress(),
        31337, // Local chain ID
        3600   // 1 hour expiration
    );
    await destBridge.waitForDeployment();
    console.log("DestinationBridge:", await destBridge.getAddress());

    // Configure destination bridge
    await destBridge.setTokenMapping(
        await sourceToken.getAddress(),
        await destToken.getAddress()
    );

    // Add liquidity
    const liqAmount = ethers.parseEther("100000");
    await destToken.approve(await destBridge.getAddress(), liqAmount);
    await destBridge.addLiquidity(await destToken.getAddress(), liqAmount);

    console.log("\n===========================================");
    console.log("LOCAL DEPLOYMENT COMPLETE");
    console.log("===========================================\n");

    return {
        sourceToken,
        sourceBridge,
        verifier,
        destToken,
        destBridge
    };
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
