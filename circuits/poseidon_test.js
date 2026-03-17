const { buildPoseidon } = require("circomlibjs");
(async () => {
  const poseidon = await buildPoseidon();
  const sender = 123n;
  const token = 456n;
  const amount = 1000n;
  const chain = 1n;
  const recipient = 789n;
  const salt = 111n;
  const nonce = 1n;
  const secret = 999n;

  const commitment = poseidon([sender, token, amount, chain, recipient, salt, nonce]);
  const nullifier = poseidon([commitment, secret]);

  console.log("commitment:", poseidon.F.toString(commitment));
  console.log("nullifier:", poseidon.F.toString(nullifier));
})();