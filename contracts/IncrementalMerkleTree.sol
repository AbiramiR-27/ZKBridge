// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IPoseidon.sol";

/**
 * @title IncrementalMerkleTree
 * @notice Fixed-depth (8 levels) incremental Merkle tree using Poseidon hashing.
 */
contract IncrementalMerkleTree {
    uint8 public constant TREE_DEPTH = 8;
    uint256 public constant MAX_LEAVES = 256;

    IPoseidon2 public immutable poseidon2;

    uint256[TREE_DEPTH] public zeros;
    uint256[TREE_DEPTH] public filledSubtrees;
    uint256 public nextLeafIndex;
    uint256 public currentRoot;

    mapping(uint256 => bool) public isKnownRoot;

    event LeafInserted(uint256 indexed index, uint256 leaf, uint256 root);

    error TreeFull();
    error InvalidHasher();

    constructor(address _poseidon2) {
        if (_poseidon2 == address(0)) revert InvalidHasher();
        poseidon2 = IPoseidon2(_poseidon2);

        // Precompute empty zero subtrees
        uint256 currentZero = 0;
        zeros[0] = currentZero;
        for (uint8 i = 1; i < TREE_DEPTH; i++) {
            uint256[2] memory input = [currentZero, currentZero];
            currentZero = poseidon2.poseidon(input);
            zeros[i] = currentZero;
        }

        // Initialize root of empty tree
        uint256[2] memory topInput = [zeros[TREE_DEPTH - 1], zeros[TREE_DEPTH - 1]];
        currentRoot = poseidon2.poseidon(topInput);
        isKnownRoot[currentRoot] = true;
    }

    function insert(uint256 leaf) internal returns (uint256 index, uint256 newRoot) {
        if (nextLeafIndex >= MAX_LEAVES) revert TreeFull();

        index = nextLeafIndex;
        uint256 currentIndex = index;
        uint256 currentLevelHash = leaf;

        for (uint8 i = 0; i < TREE_DEPTH; i++) {
            if (currentIndex % 2 == 0) {
                filledSubtrees[i] = currentLevelHash;
                uint256[2] memory input = [currentLevelHash, zeros[i]];
                currentLevelHash = poseidon2.poseidon(input);
            } else {
                uint256[2] memory input = [filledSubtrees[i], currentLevelHash];
                currentLevelHash = poseidon2.poseidon(input);
            }
            currentIndex = currentIndex / 2;
        }

        newRoot = currentLevelHash;
        currentRoot = newRoot;
        isKnownRoot[newRoot] = true;
        nextLeafIndex++;

        emit LeafInserted(index, leaf, newRoot);
    }
}
