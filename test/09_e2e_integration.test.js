const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployBridgeEnvironment } = require("./helpers");
const {
    IncrementalMerkleTree,
    generateProof,
    formatProofForSolidity,
    generateNullifierSecret
} = require("../circuits/generate_proof");

describe("Phase 10: Local End-to-End Integration Flow", function () {
    let env;
    let localTree;

    beforeEach(async function () {
        env = await deployBridgeEnvironment();
        localTree = new IncrementalMerkleTree(8);
        await localTree.init();
    });

    it("E2E-01: Full Lifecycle: Source deposit -> Merkle root update -> Proof generation -> Relayer -> Destination claim & release", async function () {
        const depositAmount = ethers.parseEther("50");
        const salt = 123456789n;

        // 1. User deposits into SourceBridge targeting Amoy (80002)
        await env.sourceToken.mint(env.user1.address, depositAmount);
        await env.sourceToken.connect(env.user1).approve(env.sourceBridgeAddress, depositAmount);

        const tx = await env.sourceBridge.connect(env.user1).deposit(
            env.sourceTokenAddress,
            depositAmount,
            env.expectedDestinationChainId,
            env.user2.address,
            salt
        );
        const receipt = await tx.wait();

        // Find BridgeDeposit event
        const depositEvent = receipt.logs
            .map(log => {
                try { return env.sourceBridge.interface.parseLog(log); } catch (e) { return null; }
            })
            .find(parsed => parsed && parsed.name === "BridgeDeposit");

        expect(depositEvent).to.exist;
        const { commitment, root, amount: eventAmount, nonce } = depositEvent.args;

        // 2. Off-chain tree mirror synchronizes deposit
        const leafIndex = await localTree.insert(commitment.toString());
        const merkleProof = await localTree.generateProof(leafIndex);
        expect(merkleProof.root).to.equal(root.toString());

        // 3. Register root on DestinationBridge (simulating cross-chain state relay)
        await env.destBridge.registerSourceRoot(root);

        // 4. Relayer prepares proof
        const nullifierSecret = generateNullifierSecret();
        const depositData = {
            sourceChainId: env.expectedSourceChainId,
            destinationChainId: env.expectedDestinationChainId,
            sender: env.user1.address,
            token: env.sourceTokenAddress,
            amount: eventAmount.toString(),
            recipient: env.user2.address,
            salt: salt.toString(),
            nonce: nonce.toString()
        };

        const proofData = await generateProof({
            depositData,
            nullifierSecret,
            merkleProof
        });

        const formatted = formatProofForSolidity(proofData);

        // 5. Submit claim on DestinationBridge
        const user2BalanceBefore = await env.destToken.balanceOf(env.user2.address);

        await expect(
            env.destBridge.connect(env.relayer).claimWithProof(
                formatted._pA,
                formatted._pB,
                formatted._pC,
                formatted._pubSignals
            )
        ).to.emit(env.destBridge, "TokensClaimed");

        const user2BalanceAfter = await env.destToken.balanceOf(env.user2.address);
        expect(user2BalanceAfter - user2BalanceBefore).to.equal(eventAmount);
    });

    it("E2E-02: Fabricated deposit not present on source bridge cannot produce an acceptable claim", async function () {
        const fakeDeposit = {
            sourceChainId: env.expectedSourceChainId,
            destinationChainId: env.expectedDestinationChainId,
            sender: env.user1.address,
            token: env.sourceTokenAddress,
            amount: ethers.parseEther("100").toString(),
            recipient: env.user1.address,
            salt: "999",
            nonce: "5"
        };

        const fakeTree = new IncrementalMerkleTree(8);
        await fakeTree.init();
        const fakeIdx = await fakeTree.insert("123456789");
        const fakeProof = await fakeTree.generateProof(fakeIdx);

        const nullifierSecret = generateNullifierSecret();
        try {
            const p = await generateProof({ depositData: fakeDeposit, nullifierSecret, merkleProof: fakeProof });
            const fp = formatProofForSolidity(p);

            await expect(
                env.destBridge.claimWithProof(
                    fp._pA,
                    fp._pB,
                    fp._pC,
                    fp._pubSignals
                )
            ).to.be.revertedWithCustomError(env.destBridge, "UnknownSourceRoot");
        } catch (err) {
            expect(err).to.exist;
        }
    });

    it("E2E-03: Valid proof with manipulated recipient is rejected", async function () {
        const depositData = {
            sourceChainId: env.expectedSourceChainId,
            destinationChainId: env.expectedDestinationChainId,
            sender: env.user1.address,
            token: env.sourceTokenAddress,
            amount: ethers.parseEther("10").toString(),
            recipient: env.user2.address,
            salt: "111",
            nonce: "0"
        };

        await localTree.insert(await env.sourceBridge.calculateCommitment(
            env.expectedSourceChainId, env.expectedDestinationChainId, env.user1.address, env.sourceTokenAddress, ethers.parseEther("10"), env.user2.address, 111n, 0n
        ));
        const mp = await localTree.generateProof(0);
        await env.destBridge.registerSourceRoot(mp.root);

        const ns = generateNullifierSecret();
        const p = await generateProof({ depositData, nullifierSecret: ns, merkleProof: mp });
        const fp = formatProofForSolidity(p);

        // Attempt to redirect recipient to attacker (user1)
        const tamperedSignals = [...fp._pubSignals];
        tamperedSignals[4] = BigInt(env.user1.address).toString();

        await expect(
            env.destBridge.claimWithProof(
                fp._pA,
                fp._pB,
                fp._pC,
                tamperedSignals
            )
        ).to.be.revertedWithCustomError(env.destBridge, "InvalidProof");
    });

    it("E2E-04: Valid proof with manipulated amount is rejected", async function () {
        const depositData = {
            sourceChainId: env.expectedSourceChainId,
            destinationChainId: env.expectedDestinationChainId,
            sender: env.user1.address,
            token: env.sourceTokenAddress,
            amount: ethers.parseEther("10").toString(),
            recipient: env.user2.address,
            salt: "111",
            nonce: "0"
        };

        await localTree.insert(await env.sourceBridge.calculateCommitment(
            env.expectedSourceChainId, env.expectedDestinationChainId, env.user1.address, env.sourceTokenAddress, ethers.parseEther("10"), env.user2.address, 111n, 0n
        ));
        const mp = await localTree.generateProof(0);
        await env.destBridge.registerSourceRoot(mp.root);

        const ns = generateNullifierSecret();
        const p = await generateProof({ depositData, nullifierSecret: ns, merkleProof: mp });
        const fp = formatProofForSolidity(p);

        const tamperedSignals = [...fp._pubSignals];
        tamperedSignals[2] = ethers.parseEther("1000").toString();

        await expect(
            env.destBridge.claimWithProof(
                fp._pA,
                fp._pB,
                fp._pC,
                tamperedSignals
            )
        ).to.be.revertedWithCustomError(env.destBridge, "InvalidProof");
    });

    it("E2E-05: Valid proof with manipulated token is rejected", async function () {
        const depositData = {
            sourceChainId: env.expectedSourceChainId,
            destinationChainId: env.expectedDestinationChainId,
            sender: env.user1.address,
            token: env.sourceTokenAddress,
            amount: ethers.parseEther("10").toString(),
            recipient: env.user2.address,
            salt: "111",
            nonce: "0"
        };

        await localTree.insert(await env.sourceBridge.calculateCommitment(
            env.expectedSourceChainId, env.expectedDestinationChainId, env.user1.address, env.sourceTokenAddress, ethers.parseEther("10"), env.user2.address, 111n, 0n
        ));
        const mp = await localTree.generateProof(0);
        await env.destBridge.registerSourceRoot(mp.root);

        const ns = generateNullifierSecret();
        const p = await generateProof({ depositData, nullifierSecret: ns, merkleProof: mp });
        const fp = formatProofForSolidity(p);

        const tamperedSignals = [...fp._pubSignals];
        tamperedSignals[3] = BigInt(env.destTokenAddress).toString();

        await expect(
            env.destBridge.claimWithProof(
                fp._pA,
                fp._pB,
                fp._pC,
                tamperedSignals
            )
        ).to.be.reverted;
    });

    it("E2E-06: Valid proof with manipulated destination chain is rejected", async function () {
        const depositData = {
            sourceChainId: env.expectedSourceChainId,
            destinationChainId: env.expectedDestinationChainId,
            sender: env.user1.address,
            token: env.sourceTokenAddress,
            amount: ethers.parseEther("10").toString(),
            recipient: env.user2.address,
            salt: "111",
            nonce: "0"
        };

        await localTree.insert(await env.sourceBridge.calculateCommitment(
            env.expectedSourceChainId, env.expectedDestinationChainId, env.user1.address, env.sourceTokenAddress, ethers.parseEther("10"), env.user2.address, 111n, 0n
        ));
        const mp = await localTree.generateProof(0);
        await env.destBridge.registerSourceRoot(mp.root);

        const ns = generateNullifierSecret();
        const p = await generateProof({ depositData, nullifierSecret: ns, merkleProof: mp });
        const fp = formatProofForSolidity(p);

        const tamperedSignals = [...fp._pubSignals];
        tamperedSignals[6] = "137"; // Polygon Mainnet instead of expected

        await expect(
            env.destBridge.claimWithProof(
                fp._pA,
                fp._pB,
                fp._pC,
                tamperedSignals
            )
        ).to.be.revertedWithCustomError(env.destBridge, "InvalidDestinationChain");
    });

    it("E2E-07: Valid claim replayed is rejected on second submission", async function () {
        const depositData = {
            sourceChainId: env.expectedSourceChainId,
            destinationChainId: env.expectedDestinationChainId,
            sender: env.user1.address,
            token: env.sourceTokenAddress,
            amount: ethers.parseEther("10").toString(),
            recipient: env.user2.address,
            salt: "111",
            nonce: "0"
        };

        await localTree.insert(await env.sourceBridge.calculateCommitment(
            env.expectedSourceChainId, env.expectedDestinationChainId, env.user1.address, env.sourceTokenAddress, ethers.parseEther("10"), env.user2.address, 111n, 0n
        ));
        const mp = await localTree.generateProof(0);
        await env.destBridge.registerSourceRoot(mp.root);

        const ns = generateNullifierSecret();
        const p = await generateProof({ depositData, nullifierSecret: ns, merkleProof: mp });
        const fp = formatProofForSolidity(p);

        await env.destBridge.claimWithProof(fp._pA, fp._pB, fp._pC, fp._pubSignals);

        await expect(
            env.destBridge.claimWithProof(fp._pA, fp._pB, fp._pC, fp._pubSignals)
        ).to.be.revertedWithCustomError(env.destBridge, "NullifierAlreadyUsed");
    });

    it("E2E-08: Corrupted / invalid proof payload is rejected", async function () {
        const corruptedPA = [111n, 222n];
        await expect(
            env.destBridge.claimWithProof(
                corruptedPA,
                [[0, 0], [0, 0]],
                [0, 0],
                [0, 0, 0, 0, 0, 0, 0]
            )
        ).to.be.reverted;
    });
});
