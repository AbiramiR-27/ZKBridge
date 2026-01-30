/**
 * VeriSync - ZK International Bridge Verifier System
 * Proof Testing Script
 * 
 * This script tests the ZK proof generation and verification
 * Run after completing the trusted setup
 */

const {
    generateProof,
    verifyProofLocal,
    generateRandomSalt,
    generateNullifierSecret,
    addressToField,
    ethToWei
} = require("./generate_proof");

async function testProofGeneration() {
    console.log("===========================================");
    console.log("VeriSync - ZK Proof Test");
    console.log("===========================================\n");

    // Test deposit data
    const depositData = {
        sender: addressToField("0x1234567890123456789012345678901234567890"),
        token: addressToField("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"),
        amount: ethToWei("100"),  // 100 tokens
        destinationChainId: "80002",  // Polygon Amoy
        recipient: addressToField("0x9876543210987654321098765432109876543210"),
        salt: generateRandomSalt(),
        nonce: "0"
    };

    const nullifierSecret = generateNullifierSecret();

    console.log("Test Deposit Data:");
    console.log("  Sender:", depositData.sender);
    console.log("  Token:", depositData.token);
    console.log("  Amount:", depositData.amount, "wei");
    console.log("  Destination Chain:", depositData.destinationChainId);
    console.log("  Recipient:", depositData.recipient);
    console.log("  Nonce:", depositData.nonce);
    console.log("");

    try {
        // Generate proof
        console.log("Generating ZK proof...\n");
        const startTime = Date.now();
        
        const proofData = await generateProof(depositData, nullifierSecret);
        
        const proofTime = Date.now() - startTime;
        console.log(`\nProof generated in ${proofTime}ms`);

        // Display proof components
        console.log("\nProof Components:");
        console.log("  pA:", proofData.solidityProof.pA);
        console.log("  pB:", proofData.solidityProof.pB);
        console.log("  pC:", proofData.solidityProof.pC);
        console.log("\nPublic Signals:");
        console.log("  [0] Commitment:", proofData.publicSignals[0]);
        console.log("  [1] Nullifier:", proofData.publicSignals[1]);
        console.log("  [2] Amount:", proofData.publicSignals[2]);
        console.log("  [3] Timestamp:", proofData.publicSignals[3]);

        // Verify proof locally
        console.log("\nVerifying proof locally...");
        const isValid = await verifyProofLocal(proofData.proof, proofData.publicSignals);
        
        console.log("\n===========================================");
        if (isValid) {
            console.log("PROOF VERIFICATION: SUCCESS");
            console.log("The proof is valid and ready for on-chain submission!");
        } else {
            console.log("PROOF VERIFICATION: FAILED");
            console.log("The proof is invalid. Check circuit constraints.");
        }
        console.log("===========================================");

        // Return proof data for further use
        return proofData;

    } catch (error) {
        console.error("\nError during proof generation:");
        console.error(error.message);
        
        if (error.message.includes("ENOENT")) {
            console.error("\nMissing circuit build files. Please run setup first:");
            console.error("  ./setup.sh  (Linux/Mac)");
            console.error("  setup.bat   (Windows)");
        }
        
        process.exit(1);
    }
}

// Test with invalid inputs
async function testInvalidProof() {
    console.log("\n===========================================");
    console.log("Testing Invalid Proof (should fail)");
    console.log("===========================================\n");

    const depositData = {
        sender: addressToField("0x1234567890123456789012345678901234567890"),
        token: addressToField("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"),
        amount: "0",  // Invalid: zero amount
        destinationChainId: "80002",
        recipient: addressToField("0x9876543210987654321098765432109876543210"),
        salt: generateRandomSalt(),
        nonce: "0"
    };

    const nullifierSecret = generateNullifierSecret();

    try {
        await generateProof(depositData, nullifierSecret);
        console.log("WARNING: Proof generated for invalid input!");
    } catch (error) {
        console.log("Expected behavior: Proof generation failed for zero amount");
        console.log("Error:", error.message);
    }
}

// Run tests
async function main() {
    await testProofGeneration();
    // Uncomment to test invalid inputs:
    // await testInvalidProof();
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
