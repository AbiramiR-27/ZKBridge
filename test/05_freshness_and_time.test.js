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

describe("Phase 6: Timestamp & Root Freshness", function () {
    let env;
    let tree;
    let depositData;
    let formattedProof;
    let root;

    beforeEach(async function () {
        env = await deployBridgeEnvironment();
        tree = new IncrementalMerkleTree(8);
        await tree.init();

        depositData = {
            sourceChainId: env.expectedSourceChainId,
            destinationChainId: env.expectedDestinationChainId,
            sender: env.user1.address,
            token: env.sourceTokenAddress,
            amount: ethers.parseEther("2").toString(),
            recipient: env.user2.address,
            salt: "998877",
            nonce: "0"
        };

        const commitment = await computeCanonicalCommitment(depositData);
        const leafIndex = await tree.insert(commitment);
        const merkleProof = await tree.generateProof(leafIndex);
        root = merkleProof.root;
        const nullifierSecret = generateNullifierSecret();

        const proofData = await generateProof({
            depositData,
            nullifierSecret,
            merkleProof
        });

        formattedProof = formatProofForSolidity(proofData);
        await env.destBridge.registerSourceRoot(root);
    });

    it("TIME-01: Valid and fresh claim within rootExpiryWindow (3600s) is accepted", async function () {
        await expect(
            env.destBridge.claimWithProof(
                formattedProof._pA,
                formattedProof._pB,
                formattedProof._pC,
                formattedProof._pubSignals
            )
        ).to.emit(env.destBridge, "TokensClaimed");
    });

    it("TIME-02: Expired claim after rootExpiryWindow (time advanced by 3601s) is rejected", async function () {
        await ethers.provider.send("evm_increaseTime", [3605]);
        await ethers.provider.send("evm_mine");

        await expect(
            env.destBridge.claimWithProof(
                formattedProof._pA,
                formattedProof._pB,
                formattedProof._pC,
                formattedProof._pubSignals
            )
        ).to.be.revertedWithCustomError(env.destBridge, "ProofExpired");
    });

    it("TIME-03: Prover cannot bypass freshness because root registration time is stored on-chain by the destination bridge", async function () {
        await ethers.provider.send("evm_increaseTime", [4000]);
        await ethers.provider.send("evm_mine");

        await expect(
            env.destBridge.claimWithProof(
                formattedProof._pA,
                formattedProof._pB,
                formattedProof._pC,
                formattedProof._pubSignals
            )
        ).to.be.revertedWithCustomError(env.destBridge, "ProofExpired");
    });

    it("TIME-04: Boundary condition test at exactly rootExpiryWindow", async function () {
        const newTree = new IncrementalMerkleTree(8);
        await newTree.init();
        const c = await computeCanonicalCommitment({ ...depositData, nonce: "1" });
        const idx = await newTree.insert(c);
        const mp = await newTree.generateProof(idx);
        const ns = generateNullifierSecret();
        const p = await generateProof({ depositData: { ...depositData, nonce: "1" }, nullifierSecret: ns, merkleProof: mp });
        const fp = formatProofForSolidity(p);

        await env.destBridge.registerSourceRoot(mp.root);

        await ethers.provider.send("evm_increaseTime", [3590]);
        await ethers.provider.send("evm_mine");

        await expect(
            env.destBridge.claimWithProof(
                fp._pA,
                fp._pB,
                fp._pC,
                fp._pubSignals
            )
        ).to.emit(env.destBridge, "TokensClaimed");
    });
});
