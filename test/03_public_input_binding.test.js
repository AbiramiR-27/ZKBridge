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

describe("Phase 4: Public Input Binding", function () {
    let env;
    let tree;
    let depositData;
    let formattedProof;

    before(async function () {
        env = await deployBridgeEnvironment();
        tree = new IncrementalMerkleTree(8);
        await tree.init();

        depositData = {
            sourceChainId: env.expectedSourceChainId,
            destinationChainId: env.expectedDestinationChainId,
            sender: env.user1.address,
            token: env.sourceTokenAddress,
            amount: ethers.parseEther("5").toString(),
            recipient: env.user2.address,
            salt: "555555",
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

    it("PUBLIC-INPUT-01: Correct recipient in claim parameters -> accepted", async function () {
        const isValid = await env.verifier.verifyProof(
            formattedProof._pA,
            formattedProof._pB,
            formattedProof._pC,
            formattedProof._pubSignals
        );
        expect(isValid).to.be.true;
    });

    it("PUBLIC-INPUT-02: Alter recipient in public signals -> rejected", async function () {
        const alteredSignals = [...formattedProof._pubSignals];
        alteredSignals[4] = BigInt(env.user1.address).toString();

        const isValid = await env.verifier.verifyProof(
            formattedProof._pA,
            formattedProof._pB,
            formattedProof._pC,
            alteredSignals
        );
        expect(isValid).to.be.false;
    });

    it("PUBLIC-INPUT-03: Alter amount in public signals -> rejected", async function () {
        const alteredSignals = [...formattedProof._pubSignals];
        alteredSignals[2] = ethers.parseEther("100").toString();

        const isValid = await env.verifier.verifyProof(
            formattedProof._pA,
            formattedProof._pB,
            formattedProof._pC,
            alteredSignals
        );
        expect(isValid).to.be.false;
    });

    it("PUBLIC-INPUT-04: Alter token in public signals -> rejected", async function () {
        const alteredSignals = [...formattedProof._pubSignals];
        alteredSignals[3] = BigInt(env.destTokenAddress).toString();

        const isValid = await env.verifier.verifyProof(
            formattedProof._pA,
            formattedProof._pB,
            formattedProof._pC,
            alteredSignals
        );
        expect(isValid).to.be.false;
    });

    it("PUBLIC-INPUT-05: Alter source chain ID in public signals -> rejected", async function () {
        const alteredSignals = [...formattedProof._pubSignals];
        alteredSignals[5] = "1"; // Mainnet Ethereum instead of testnet

        const isValid = await env.verifier.verifyProof(
            formattedProof._pA,
            formattedProof._pB,
            formattedProof._pC,
            alteredSignals
        );
        expect(isValid).to.be.false;
    });

    it("PUBLIC-INPUT-06: Alter destination chain ID in public signals -> rejected", async function () {
        const alteredSignals = [...formattedProof._pubSignals];
        alteredSignals[6] = "137"; // Polygon Mainnet instead of local chain

        const isValid = await env.verifier.verifyProof(
            formattedProof._pA,
            formattedProof._pB,
            formattedProof._pC,
            alteredSignals
        );
        expect(isValid).to.be.false;
    });

    it("PUBLIC-INPUT-07: Alter root in public signals -> rejected", async function () {
        const alteredSignals = [...formattedProof._pubSignals];
        alteredSignals[0] = "999999999999999999999999";

        const isValid = await env.verifier.verifyProof(
            formattedProof._pA,
            formattedProof._pB,
            formattedProof._pC,
            alteredSignals
        );
        expect(isValid).to.be.false;
    });

    it("PUBLIC-INPUT-08: Alter nullifier in public signals -> rejected", async function () {
        const alteredSignals = [...formattedProof._pubSignals];
        alteredSignals[1] = "111111111111111111111111";

        const isValid = await env.verifier.verifyProof(
            formattedProof._pA,
            formattedProof._pB,
            formattedProof._pC,
            alteredSignals
        );
        expect(isValid).to.be.false;
    });
});
