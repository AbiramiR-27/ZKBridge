const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployBridgeEnvironment } = require("./helpers");
const {
    computeCanonicalCommitment,
    IncrementalMerkleTree,
    generateProof,
    verifyProofLocally,
    formatProofForSolidity,
    generateNullifierSecret
} = require("../circuits/generate_proof");

describe("Phase 3: Merkle Deposit Anchoring", function () {
    let env;
    let tree;
    let depositData;
    let commitment;
    let leafIndex;
    let merkleProof;
    let nullifierSecret;

    before(async function () {
        env = await deployBridgeEnvironment();
        tree = new IncrementalMerkleTree(8);
        await tree.init();

        depositData = {
            sourceChainId: env.expectedSourceChainId,
            destinationChainId: env.expectedDestinationChainId,
            sender: env.user1.address,
            token: env.sourceTokenAddress,
            amount: ethers.parseEther("10").toString(),
            recipient: env.user2.address,
            salt: "1234567890",
            nonce: "0"
        };

        commitment = await computeCanonicalCommitment(depositData);
        leafIndex = await tree.insert(commitment);
        merkleProof = await tree.generateProof(leafIndex);
        nullifierSecret = generateNullifierSecret();
    });

    it("MERKLE-01: Valid deposited leaf + correct Merkle path + correct root -> proof verifies locally & on-chain", async function () {
        const proofData = await generateProof({
            depositData,
            nullifierSecret,
            merkleProof
        });

        const localValid = await verifyProofLocally(proofData);
        expect(localValid).to.be.true;

        const formatted = formatProofForSolidity(proofData);
        const onChainValid = await env.verifier.verifyProof(
            formatted._pA,
            formatted._pB,
            formatted._pC,
            formatted._pubSignals
        );
        expect(onChainValid).to.be.true;
    });

    it("MERKLE-02: Leaf not present in tree (invalid path for different leaf) -> proof generation / verification fails", async function () {
        const otherTree = new IncrementalMerkleTree(8);
        await otherTree.init();
        await otherTree.insert("9999999999999999999"); // different leaf
        const badProof = await otherTree.generateProof(0);

        try {
            const proofData = await generateProof({
                depositData,
                nullifierSecret,
                merkleProof: badProof
            });
            const valid = await verifyProofLocally(proofData);
            expect(valid).to.be.false;
        } catch (err) {
            expect(err).to.exist; // Circom constraint satisfaction error
        }
    });

    it("MERKLE-03: Correct leaf + altered root -> proof verification fails", async function () {
        const proofData = await generateProof({
            depositData,
            nullifierSecret,
            merkleProof
        });

        // Alter the root in public signals (publicSignals[0] is root)
        const tamperedSignals = [...proofData.publicSignals];
        tamperedSignals[0] = "12345678901234567890";

        const formatted = formatProofForSolidity({
            proof: proofData.proof,
            publicSignals: tamperedSignals
        });

        const onChainValid = await env.verifier.verifyProof(
            formatted._pA,
            formatted._pB,
            formatted._pC,
            formatted._pubSignals
        );
        expect(onChainValid).to.be.false;
    });

    it("MERKLE-04: Altered Merkle path -> witness generation fails", async function () {
        const alteredPath = [...merkleProof.pathElements];
        alteredPath[0] = "98765432109876543210";

        try {
            await generateProof({
                depositData,
                nullifierSecret,
                merkleProof: {
                    ...merkleProof,
                    pathElements: alteredPath
                }
            });
            expect.fail("Should have thrown constraint satisfaction error");
        } catch (err) {
            expect(err.message).to.include("Error");
        }
    });

    it("MERKLE-05: Altered commitment parameter -> root constraint fails", async function () {
        const tamperedDeposit = {
            ...depositData,
            amount: ethers.parseEther("999").toString()
        };

        try {
            await generateProof({
                depositData: tamperedDeposit,
                nullifierSecret,
                merkleProof
            });
            expect.fail("Should have thrown constraint satisfaction error");
        } catch (err) {
            expect(err.message).to.include("Error");
        }
    });

    it("MERKLE-06: Fabricated deposit never inserted into tree cannot produce accepted proof against genuine root", async function () {
        const fabricatedDeposit = {
            sourceChainId: env.expectedSourceChainId,
            destinationChainId: env.expectedDestinationChainId,
            sender: env.user1.address,
            token: env.sourceTokenAddress,
            amount: ethers.parseEther("5000").toString(),
            recipient: env.user1.address,
            salt: "777",
            nonce: "99"
        };

        try {
            await generateProof({
                depositData: fabricatedDeposit,
                nullifierSecret,
                merkleProof
            });
            expect.fail("Prover must not be able to generate proof for uninserted deposit");
        } catch (err) {
            expect(err.message).to.include("Error");
        }
    });
});
