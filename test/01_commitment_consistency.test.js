const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployBridgeEnvironment } = require("./helpers");
const { computeCanonicalCommitment } = require("../circuits/merkle");

describe("Phase 2: Canonical Commitment Consistency", function () {
    let env;

    before(async function () {
        env = await deployBridgeEnvironment();
    });

    const baseInput = {
        sourceChainId: 31337n,
        destinationChainId: 80002n,
        sender: "0x1111111111111111111111111111111111111111",
        token: "0x2222222222222222222222222222222222222222",
        amount: 1000000000000000000n,
        recipient: "0x3333333333333333333333333333333333333333",
        salt: 987654321n,
        nonce: 0n
    };

    it("TEST-COMMITMENT-01: Same inputs produce identical Solidity and Circom/JS Poseidon commitment", async function () {
        const jsCommitment = await computeCanonicalCommitment(baseInput);

        const solCommitment = await env.sourceBridge.calculateCommitment(
            baseInput.sourceChainId,
            baseInput.destinationChainId,
            baseInput.sender,
            baseInput.token,
            baseInput.amount,
            baseInput.recipient,
            baseInput.salt,
            baseInput.nonce
        );

        expect(solCommitment.toString()).to.equal(jsCommitment);
    });

    it("TEST-COMMITMENT-02: Changing sender changes commitment", async function () {
        const c1 = await computeCanonicalCommitment(baseInput);
        const c2 = await computeCanonicalCommitment({
            ...baseInput,
            sender: "0x4444444444444444444444444444444444444444"
        });
        expect(c1).to.not.equal(c2);
    });

    it("TEST-COMMITMENT-03: Changing token changes commitment", async function () {
        const c1 = await computeCanonicalCommitment(baseInput);
        const c2 = await computeCanonicalCommitment({
            ...baseInput,
            token: "0x5555555555555555555555555555555555555555"
        });
        expect(c1).to.not.equal(c2);
    });

    it("TEST-COMMITMENT-04: Changing amount changes commitment", async function () {
        const c1 = await computeCanonicalCommitment(baseInput);
        const c2 = await computeCanonicalCommitment({
            ...baseInput,
            amount: 2000000000000000000n
        });
        expect(c1).to.not.equal(c2);
    });

    it("TEST-COMMITMENT-05: Changing recipient changes commitment", async function () {
        const c1 = await computeCanonicalCommitment(baseInput);
        const c2 = await computeCanonicalCommitment({
            ...baseInput,
            recipient: "0x6666666666666666666666666666666666666666"
        });
        expect(c1).to.not.equal(c2);
    });

    it("TEST-COMMITMENT-06: Changing source chain ID changes commitment", async function () {
        const c1 = await computeCanonicalCommitment(baseInput);
        const c2 = await computeCanonicalCommitment({
            ...baseInput,
            sourceChainId: 11155111n
        });
        expect(c1).to.not.equal(c2);
    });

    it("TEST-COMMITMENT-07: Changing destination chain ID changes commitment", async function () {
        const c1 = await computeCanonicalCommitment(baseInput);
        const c2 = await computeCanonicalCommitment({
            ...baseInput,
            destinationChainId: 137n
        });
        expect(c1).to.not.equal(c2);
    });

    it("TEST-COMMITMENT-08: Changing salt/nonce changes commitment", async function () {
        const c1 = await computeCanonicalCommitment(baseInput);
        const c2 = await computeCanonicalCommitment({
            ...baseInput,
            salt: 999999999n
        });
        const c3 = await computeCanonicalCommitment({
            ...baseInput,
            nonce: 1n
        });
        expect(c1).to.not.equal(c2);
        expect(c1).to.not.equal(c3);
        expect(c2).to.not.equal(c3);
    });
});
