const { ethers } = require("hardhat");
const { poseidonContract } = require("circomlibjs");

async function deployPoseidonContracts(signer) {
    const abi2 = poseidonContract.generateABI(2);
    const code2 = poseidonContract.createCode(2);
    const factory2 = new ethers.ContractFactory(abi2, code2, signer);
    const poseidon2 = await factory2.deploy();
    await poseidon2.waitForDeployment();

    const abi4 = poseidonContract.generateABI(4);
    const code4 = poseidonContract.createCode(4);
    const factory4 = new ethers.ContractFactory(abi4, code4, signer);
    const poseidon4 = await factory4.deploy();
    await poseidon4.waitForDeployment();

    return {
        poseidon2Address: await poseidon2.getAddress(),
        poseidon4Address: await poseidon4.getAddress(),
        poseidon2,
        poseidon4
    };
}

async function deployBridgeEnvironment() {
    const [deployer, user1, user2, relayer] = await ethers.getSigners();

    const { poseidon2Address, poseidon4Address, poseidon2, poseidon4 } = await deployPoseidonContracts(deployer);

    // Deploy Verifier
    const VerifierFactory = await ethers.getContractFactory("Groth16Verifier");
    const verifier = await VerifierFactory.deploy();
    await verifier.waitForDeployment();
    const verifierAddress = await verifier.getAddress();

    // Deploy Tokens
    const TokenFactory = await ethers.getContractFactory("BridgeToken");
    const sourceToken = await TokenFactory.deploy("Source Token", "STK", 18, 1000000);
    await sourceToken.waitForDeployment();
    const sourceTokenAddress = await sourceToken.getAddress();

    const destToken = await TokenFactory.deploy("Destination Token", "DTK", 18, 1000000);
    await destToken.waitForDeployment();
    const destTokenAddress = await destToken.getAddress();

    // Deploy SourceBridge
    const SourceBridgeFactory = await ethers.getContractFactory("SourceBridge");
    const sourceBridge = await SourceBridgeFactory.deploy(poseidon2Address, poseidon4Address);
    await sourceBridge.waitForDeployment();
    const sourceBridgeAddress = await sourceBridge.getAddress();

    await sourceBridge.addSupportedToken(sourceTokenAddress, ethers.parseEther("0.01"), ethers.parseEther("10000"));

    // Deploy DestinationBridge
    const currentNetwork = await ethers.provider.getNetwork();
    const expectedSourceChainId = currentNetwork.chainId; // Local chain ID (31337)
    const expectedDestinationChainId = 80002n; // Polygon Amoy simulated destination
    const rootExpiryWindow = 3600; // 1 hour

    const DestBridgeFactory = await ethers.getContractFactory("DestinationBridge");
    const destBridge = await DestBridgeFactory.deploy(
        verifierAddress,
        expectedSourceChainId,
        expectedDestinationChainId,
        rootExpiryWindow
    );
    await destBridge.waitForDeployment();
    const destBridgeAddress = await destBridge.getAddress();

    // Setup Token Mapping & Liquidity
    await destBridge.setTokenMapping(sourceTokenAddress, destTokenAddress);
    const initialLiquidity = ethers.parseEther("50000");
    await destToken.approve(destBridgeAddress, initialLiquidity);
    await destBridge.addLiquidity(destTokenAddress, initialLiquidity);

    return {
        deployer,
        user1,
        user2,
        relayer,
        poseidon2,
        poseidon4,
        verifier,
        sourceToken,
        destToken,
        sourceBridge,
        destBridge,
        sourceBridgeAddress,
        destBridgeAddress,
        sourceTokenAddress,
        destTokenAddress,
        verifierAddress,
        expectedSourceChainId,
        expectedDestinationChainId,
        rootExpiryWindow
    };
}

module.exports = {
    deployPoseidonContracts,
    deployBridgeEnvironment
};
