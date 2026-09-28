const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployBridgeEnvironment } = require("./helpers");
const {
    computeCanonicalCommitment,
    IncrementalMerkleTree,
    generateProof,
    formatProofForSolidity,
    generateNullifierSecret
} = require("../circuits/generate_proof");

describe("Phase 7: Custody and Accounting Invariants", function () {
    let env;
    let tree;

    beforeEach(async function () {
        env = await deployBridgeEnvironment();
        tree = new IncrementalMerkleTree(8);
        await tree.init();
    });

    it("INVARIANT-01: Normal deposit and valid claim accurately update token balances and accounting state", async function () {
        const claimAmount = ethers.parseEther("100");
        const depositData = {
            sourceChainId: env.expectedSourceChainId,
            destinationChainId: env.expectedDestinationChainId,
            sender: env.user1.address,
            token: env.sourceTokenAddress,
            amount: claimAmount.toString(),
            recipient: env.user2.address,
            salt: "111",
            nonce: "0"
        };

        const commitment = await computeCanonicalCommitment(depositData);
        const leafIndex = await tree.insert(commitment);
        const merkleProof = await tree.generateProof(leafIndex);
        const nullifierSecret = generateNullifierSecret();

        const proofData = await generateProof({
            depositData,
            nullifierSecret,
            merkleProof
        });

        const formatted = formatProofForSolidity(proofData);
        await env.destBridge.registerSourceRoot(merkleProof.root);

        const initialUser2Balance = await env.destToken.balanceOf(env.user2.address);
        const initialBridgeBalance = await env.destToken.balanceOf(env.destBridgeAddress);

        await env.destBridge.claimWithProof(
            formatted._pA,
            formatted._pB,
            formatted._pC,
            formatted._pubSignals
        );

        const finalUser2Balance = await env.destToken.balanceOf(env.user2.address);
        const finalBridgeBalance = await env.destToken.balanceOf(env.destBridgeAddress);

        expect(finalUser2Balance - initialUser2Balance).to.equal(claimAmount);
        expect(initialBridgeBalance - finalBridgeBalance).to.equal(claimAmount);
        expect(await env.destBridge.totalAmountClaimed(env.destTokenAddress)).to.equal(claimAmount);
    });

    it("INVARIANT-02: Excessive claim exceeding contract liquidity is rejected without state alteration", async function () {
        const excessiveAmount = ethers.parseEther("100000"); // 100k tokens

        const depositData = {
            sourceChainId: env.expectedSourceChainId,
            destinationChainId: env.expectedDestinationChainId,
            sender: env.user1.address,
            token: env.sourceTokenAddress,
            amount: excessiveAmount.toString(),
            recipient: env.user2.address,
            salt: "222",
            nonce: "0"
        };

        const commitment = await computeCanonicalCommitment(depositData);
        const leafIndex = await tree.insert(commitment);
        const merkleProof = await tree.generateProof(leafIndex);
        const nullifierSecret = generateNullifierSecret();

        const proofData = await generateProof({
            depositData,
            nullifierSecret,
            merkleProof
        });

        const formatted = formatProofForSolidity(proofData);
        await env.destBridge.registerSourceRoot(merkleProof.root);

        const nullifier = formatted._pubSignals[1];

        await expect(
            env.destBridge.claimWithProof(
                formatted._pA,
                formatted._pB,
                formatted._pC,
                formatted._pubSignals
            )
        ).to.be.revertedWithCustomError(env.destBridge, "InsufficientLiquidity");

        expect(await env.destBridge.isNullifierUsed(nullifier)).to.be.false;
    });

    it("INVARIANT-03: Failed claim (e.g. invalid proof) leaves accounting state and nullifiers completely intact", async function () {
        const depositData = {
            sourceChainId: env.expectedSourceChainId,
            destinationChainId: env.expectedDestinationChainId,
            sender: env.user1.address,
            token: env.sourceTokenAddress,
            amount: ethers.parseEther("10").toString(),
            recipient: env.user2.address,
            salt: "333",
            nonce: "0"
        };

        const commitment = await computeCanonicalCommitment(depositData);
        const leafIndex = await tree.insert(commitment);
        const merkleProof = await tree.generateProof(leafIndex);
        const nullifierSecret = generateNullifierSecret();

        const proofData = await generateProof({
            depositData,
            nullifierSecret,
            merkleProof
        });

        const formatted = formatProofForSolidity(proofData);
        await env.destBridge.registerSourceRoot(merkleProof.root);

        const corruptedPA = ["0", "0"];

        await expect(
            env.destBridge.claimWithProof(
                corruptedPA,
                formatted._pB,
                formatted._pC,
                formatted._pubSignals
            )
        ).to.be.revertedWithCustomError(env.destBridge, "InvalidProof");

        expect(await env.destBridge.totalClaims()).to.equal(0);
        expect(await env.destBridge.isNullifierUsed(formatted._pubSignals[1])).to.be.false;
    });
});
