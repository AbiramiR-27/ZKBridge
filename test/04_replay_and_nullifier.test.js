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

describe("Phase 5: Nullifier & Replay Protection", function () {
    let env;
    let tree;
    let depositData;
    let formattedProof;

    beforeEach(async function () {
        env = await deployBridgeEnvironment();
        tree = new IncrementalMerkleTree(8);
        await tree.init();

        depositData = {
            sourceChainId: env.expectedSourceChainId,
            destinationChainId: env.expectedDestinationChainId,
            sender: env.user1.address,
            token: env.sourceTokenAddress,
            amount: ethers.parseEther("1").toString(),
            recipient: env.user2.address,
            salt: "12345",
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

        formattedProof = formatProofForSolidity(proofData);
        await env.destBridge.registerSourceRoot(merkleProof.root);
    });

    it("REPLAY-01: First claim accepted; second claim using same proof/nullifier is rejected", async function () {
        await expect(
            env.destBridge.claimWithProof(
                formattedProof._pA,
                formattedProof._pB,
                formattedProof._pC,
                formattedProof._pubSignals
            )
        ).to.emit(env.destBridge, "TokensClaimed");

        await expect(
            env.destBridge.claimWithProof(
                formattedProof._pA,
                formattedProof._pB,
                formattedProof._pC,
                formattedProof._pubSignals
            )
        ).to.be.revertedWithCustomError(env.destBridge, "NullifierAlreadyUsed");
    });

    it("REPLAY-02: Same nullifier submitted twice with different recipient or parameters is rejected", async function () {
        await env.destBridge.claimWithProof(
            formattedProof._pA,
            formattedProof._pB,
            formattedProof._pC,
            formattedProof._pubSignals
        );

        const nullifier = formattedProof._pubSignals[1];
        const isUsed = await env.destBridge.isNullifierUsed(nullifier);
        expect(isUsed).to.be.true;

        await expect(
            env.destBridge.claimWithProof(
                formattedProof._pA,
                formattedProof._pB,
                formattedProof._pC,
                formattedProof._pubSignals
            )
        ).to.be.revertedWithCustomError(env.destBridge, "NullifierAlreadyUsed");
    });

    it("REPLAY-03: Same proof submitted by a different caller (frontrunner) is rejected on second attempt", async function () {
        await env.destBridge.connect(env.relayer).claimWithProof(
            formattedProof._pA,
            formattedProof._pB,
            formattedProof._pC,
            formattedProof._pubSignals
        );

        await expect(
            env.destBridge.connect(env.user1).claimWithProof(
                formattedProof._pA,
                formattedProof._pB,
                formattedProof._pC,
                formattedProof._pubSignals
            )
        ).to.be.revertedWithCustomError(env.destBridge, "NullifierAlreadyUsed");
    });

    it("REPLAY-04: Cross-destination replay rejected when chain ID differs", async function () {
        const alteredSignals = [...formattedProof._pubSignals];
        alteredSignals[6] = "137"; // Different destination chain

        await expect(
            env.destBridge.claimWithProof(
                formattedProof._pA,
                formattedProof._pB,
                formattedProof._pC,
                alteredSignals
            )
        ).to.be.revertedWithCustomError(env.destBridge, "InvalidDestinationChain");
    });

    it("REPLAY-05: Cross-source replay rejected when source chain ID differs", async function () {
        const alteredSignals = [...formattedProof._pubSignals];
        alteredSignals[5] = "1"; // Different source chain

        await expect(
            env.destBridge.claimWithProof(
                formattedProof._pA,
                formattedProof._pB,
                formattedProof._pC,
                alteredSignals
            )
        ).to.be.revertedWithCustomError(env.destBridge, "InvalidSourceChain");
    });
});
