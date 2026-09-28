const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployBridgeEnvironment } = require("./helpers");

describe("Phase 8: Verifier & Admin Security Controls", function () {
    let env;

    beforeEach(async function () {
        env = await deployBridgeEnvironment();
    });

    it("ADMIN-01: Unauthorized account cannot initiate verifier update, change mappings, or pause", async function () {
        const dummyAddress = env.user2.address;

        // Unauthorized user attempts verifier update
        await expect(
            env.destBridge.connect(env.user1).initiateVerifierUpdate(dummyAddress)
        ).to.be.revertedWithCustomError(env.destBridge, "OwnableUnauthorizedAccount");

        // Unauthorized user attempts to pause bridge
        await expect(
            env.destBridge.connect(env.user1).setPaused(true)
        ).to.be.revertedWithCustomError(env.destBridge, "OwnableUnauthorizedAccount");

        // Unauthorized user attempts to change token mappings
        await expect(
            env.destBridge.connect(env.user1).setTokenMapping(env.sourceTokenAddress, dummyAddress)
        ).to.be.revertedWithCustomError(env.destBridge, "OwnableUnauthorizedAccount");
    });

    it("ADMIN-02: 2-step timelocked verifier update operates safely and respects timelock", async function () {
        const VerifierFactory = await ethers.getContractFactory("Groth16Verifier");
        const newVerifier = await VerifierFactory.deploy();
        await newVerifier.waitForDeployment();
        const newVerifierAddress = await newVerifier.getAddress();

        // 1. Owner initiates update
        await expect(env.destBridge.initiateVerifierUpdate(newVerifierAddress))
            .to.emit(env.destBridge, "VerifierUpdateInitiated");

        // 2. Immediate execution should revert due to timelock (1 day)
        await expect(
            env.destBridge.executeVerifierUpdate()
        ).to.be.revertedWithCustomError(env.destBridge, "TimelockNotExpired");

        // 3. Fast-forward time past 1 day (86400s)
        await ethers.provider.send("evm_increaseTime", [86405]);
        await ethers.provider.send("evm_mine");

        // 4. Execution succeeds after timelock
        await expect(env.destBridge.executeVerifierUpdate())
            .to.emit(env.destBridge, "VerifierUpdated");

        expect(await env.destBridge.verifier()).to.equal(newVerifierAddress);
    });

    it("ADMIN-03: Pause functionality temporarily halts deposits and claims", async function () {
        // Pause source and destination bridges
        await env.sourceBridge.setPaused(true);
        await env.destBridge.setPaused(true);

        // Deposit on SourceBridge should revert with BridgePaused
        await expect(
            env.sourceBridge.deposit(
                env.sourceTokenAddress,
                ethers.parseEther("1"),
                31337n,
                env.user2.address,
                12345n
            )
        ).to.be.revertedWithCustomError(env.sourceBridge, "BridgePaused");

        // Claim on DestinationBridge should revert with BridgePaused
        await expect(
            env.destBridge.claimWithProof(
                [0, 0],
                [[0, 0], [0, 0]],
                [0, 0],
                [0, 0, 0, 0, 0, 0, 0]
            )
        ).to.be.revertedWithCustomError(env.destBridge, "BridgePaused");

        // Unpause restores functionality
        await env.sourceBridge.setPaused(false);
        await env.destBridge.setPaused(false);
        expect(await env.sourceBridge.paused()).to.be.false;
        expect(await env.destBridge.paused()).to.be.false;
    });

    it("ADMIN-04: Privileged liquidity withdrawal is restricted to owner and enforces balance checks", async function () {
        // Unauthorized withdrawal
        await expect(
            env.destBridge.connect(env.user1).withdrawLiquidity(
                env.destTokenAddress,
                ethers.parseEther("100"),
                env.user1.address
            )
        ).to.be.revertedWithCustomError(env.destBridge, "OwnableUnauthorizedAccount");

        // Authorized withdrawal exceeding balance
        await expect(
            env.destBridge.withdrawLiquidity(
                env.destTokenAddress,
                ethers.parseEther("1000000"), // More than bridge has
                env.deployer.address
            )
        ).to.be.revertedWithCustomError(env.destBridge, "InsufficientLiquidity");
    });
});
