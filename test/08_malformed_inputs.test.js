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

describe("Phase 9: Malformed Inputs and Negative Security Testing", function () {
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
            salt: "777888",
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

    it("MALFORMED-01: Corrupted proof points (_pA, _pB, _pC) are rejected by on-chain verifier", async function () {
        const corruptedPA = [1n, 2n];
        await expect(
            env.destBridge.claimWithProof(
                corruptedPA,
                formattedProof._pB,
                formattedProof._pC,
                formattedProof._pubSignals
            )
        ).to.be.revertedWithCustomError(env.destBridge, "InvalidProof");

        const corruptedPC = [99999n, 88888n];
        await expect(
            env.destBridge.claimWithProof(
                formattedProof._pA,
                formattedProof._pB,
                corruptedPC,
                formattedProof._pubSignals
            )
        ).to.be.revertedWithCustomError(env.destBridge, "InvalidProof");
    });

    it("MALFORMED-02: Public signals exceeding the BN254 scalar field size (r) are rejected by checkField", async function () {
        const BN254_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
        const overflowSignals = [...formattedProof._pubSignals];
        overflowSignals[2] = (BN254_R + 100n).toString(); // amount >= r

        const isValid = await env.verifier.verifyProof(
            formattedProof._pA,
            formattedProof._pB,
            formattedProof._pC,
            overflowSignals
        );
        expect(isValid).to.be.false;
    });

    it("MALFORMED-03: Claim against an unmapped source token is rejected", async function () {
        const unmappedToken = "0x9999999999999999999999999999999999999999";
        const tree2 = new IncrementalMerkleTree(8);
        await tree2.init();
        const dep2 = { ...depositData, token: unmappedToken };
        const c2 = await computeCanonicalCommitment(dep2);
        const idx2 = await tree2.insert(c2);
        const mp2 = await tree2.generateProof(idx2);
        const ns2 = generateNullifierSecret();
        const p2 = await generateProof({ depositData: dep2, nullifierSecret: ns2, merkleProof: mp2 });
        const fp2 = formatProofForSolidity(p2);

        await env.destBridge.registerSourceRoot(mp2.root);

        await expect(
            env.destBridge.claimWithProof(
                fp2._pA,
                fp2._pB,
                fp2._pC,
                fp2._pubSignals
            )
        ).to.be.revertedWithCustomError(env.destBridge, "TokenNotMapped");
    });

    it("MALFORMED-04: Claim against an unregistered / unknown source root is rejected", async function () {
        const unregisteredRootTree = new IncrementalMerkleTree(8);
        await unregisteredRootTree.init();
        const dep = { ...depositData, nonce: "44" };
        const c = await computeCanonicalCommitment(dep);
        const idx = await unregisteredRootTree.insert(c);
        const mp = await unregisteredRootTree.generateProof(idx);
        const ns = generateNullifierSecret();
        const p = await generateProof({ depositData: dep, nullifierSecret: ns, merkleProof: mp });
        const fp = formatProofForSolidity(p);

        await expect(
            env.destBridge.claimWithProof(
                fp._pA,
                fp._pB,
                fp._pC,
                fp._pubSignals
            )
        ).to.be.revertedWithCustomError(env.destBridge, "UnknownSourceRoot");
    });
});
