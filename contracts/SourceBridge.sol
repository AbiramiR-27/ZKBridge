// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SourceBridge
 * @author VeriSync Team
 * @notice Source chain bridge contract for VeriSync Protocol v1.0
 * @dev Manages token locking, canonical Poseidon commitment generation, and incremental Merkle tree insertion.
 */

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./IncrementalMerkleTree.sol";
import "./IPoseidon.sol";

contract SourceBridge is IncrementalMerkleTree, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ===========================================
    // STATE VARIABLES
    // ===========================================

    IPoseidon4 public immutable poseidon4;

    /// @notice Counter for generating unique deposit nonces
    uint256 public depositNonce;

    /// @notice Mapping of deposit nonce to deposit details
    mapping(uint256 => Deposit) public deposits;

    /// @notice Mapping of commitment hashes to prevent replay
    mapping(uint256 => bool) public usedCommitments;

    /// @notice Supported tokens for bridging
    mapping(address => bool) public supportedTokens;

    /// @notice Minimum deposit amount per token
    mapping(address => uint256) public minDepositAmount;

    /// @notice Maximum deposit amount per token
    mapping(address => uint256) public maxDepositAmount;

    /// @notice Bridge fee in basis points (10 = 0.1%)
    uint256 public bridgeFeeBps = 10;

    /// @notice Accumulated fees per token
    mapping(address => uint256) public accumulatedFees;

    /// @notice Emergency pause state
    bool public paused;

    // ===========================================
    // STRUCTS
    // ===========================================

    struct Deposit {
        address sender;
        address token;
        uint256 amount;
        uint256 destinationChainId;
        address recipient;
        uint256 commitment;
        uint256 leafIndex;
        uint256 root;
        uint256 timestamp;
        uint256 nonce;
    }

    // ===========================================
    // EVENTS
    // ===========================================

    event BridgeDeposit(
        uint256 indexed depositId,
        address indexed sender,
        address indexed token,
        uint256 amount,
        uint256 destinationChainId,
        address recipient,
        uint256 commitment,
        uint256 root,
        uint256 nonce,
        uint256 timestamp
    );

    event TokenAdded(address indexed token, uint256 minAmount, uint256 maxAmount);
    event TokenRemoved(address indexed token);
    event FeesWithdrawn(address indexed token, uint256 amount, address indexed recipient);
    event BridgeFeeUpdated(uint256 oldFee, uint256 newFee);
    event PauseStateChanged(bool paused);

    // ===========================================
    // ERRORS
    // ===========================================

    error TokenNotSupported();
    error AmountBelowMinimum();
    error AmountAboveMaximum();
    error InvalidRecipient();
    error InvalidChainId();
    error BridgePaused();
    error CommitmentAlreadyUsed();
    error InvalidFee();
    error TransferFailed();

    // ===========================================
    // MODIFIERS
    // ===========================================

    modifier whenNotPaused() {
        if (paused) revert BridgePaused();
        _;
    }

    // ===========================================
    // CONSTRUCTOR
    // ===========================================

    constructor(
        address _poseidon2,
        address _poseidon4
    ) IncrementalMerkleTree(_poseidon2) Ownable(msg.sender) {
        if (_poseidon4 == address(0)) revert InvalidHasher();
        poseidon4 = IPoseidon4(_poseidon4);
        depositNonce = 0;
    }

    // ===========================================
    // PUBLIC / EXTERNAL FUNCTIONS
    // ===========================================

    /**
     * @notice Calculate canonical Poseidon commitment matching Circom circuit
     */
    function calculateCommitment(
        uint256 srcChainId,
        uint256 dstChainId,
        address sender,
        address token,
        uint256 amount,
        address recipient,
        uint256 salt,
        uint256 nonce
    ) public view returns (uint256) {
        uint256[4] memory h1Input = [
            srcChainId,
            dstChainId,
            uint256(uint160(sender)),
            uint256(uint160(token))
        ];
        uint256 h1 = poseidon4.poseidon(h1Input);

        uint256[4] memory h2Input = [
            amount,
            uint256(uint160(recipient)),
            salt,
            nonce
        ];
        uint256 h2 = poseidon4.poseidon(h2Input);

        uint256[2] memory cInput = [h1, h2];
        return poseidon2.poseidon(cInput);
    }

    /**
     * @notice Deposit ERC20 tokens to bridge to another chain
     */
    function deposit(
        address token,
        uint256 amount,
        uint256 destinationChainId,
        address recipient,
        uint256 salt
    ) external nonReentrant whenNotPaused returns (uint256 depositId, uint256 commitment, uint256 root) {
        if (!supportedTokens[token]) revert TokenNotSupported();
        if (amount < minDepositAmount[token]) revert AmountBelowMinimum();
        if (amount > maxDepositAmount[token]) revert AmountAboveMaximum();
        if (recipient == address(0)) revert InvalidRecipient();
        if (destinationChainId == block.chainid) revert InvalidChainId();

        uint256 fee = (amount * bridgeFeeBps) / 10000;
        uint256 netAmount = amount - fee;

        commitment = calculateCommitment(
            block.chainid,
            destinationChainId,
            msg.sender,
            token,
            netAmount,
            recipient,
            salt,
            depositNonce
        );

        if (usedCommitments[commitment]) revert CommitmentAlreadyUsed();
        usedCommitments[commitment] = true;

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        accumulatedFees[token] += fee;

        (uint256 leafIndex, uint256 newRoot) = insert(commitment);
        root = newRoot;
        depositId = depositNonce;

        deposits[depositId] = Deposit({
            sender: msg.sender,
            token: token,
            amount: netAmount,
            destinationChainId: destinationChainId,
            recipient: recipient,
            commitment: commitment,
            leafIndex: leafIndex,
            root: root,
            timestamp: block.timestamp,
            nonce: depositNonce
        });

        emit BridgeDeposit(
            depositId,
            msg.sender,
            token,
            netAmount,
            destinationChainId,
            recipient,
            commitment,
            root,
            depositNonce,
            block.timestamp
        );

        depositNonce++;
        return (depositId, commitment, root);
    }

    /**
     * @notice Deposit native ETH to bridge to another chain
     */
    function depositETH(
        uint256 destinationChainId,
        address recipient,
        uint256 salt
    ) external payable nonReentrant whenNotPaused returns (uint256 depositId, uint256 commitment, uint256 root) {
        if (recipient == address(0)) revert InvalidRecipient();
        if (destinationChainId == block.chainid) revert InvalidChainId();

        uint256 amount = msg.value;
        if (amount == 0) revert AmountBelowMinimum();

        uint256 fee = (amount * bridgeFeeBps) / 10000;
        uint256 netAmount = amount - fee;

        commitment = calculateCommitment(
            block.chainid,
            destinationChainId,
            msg.sender,
            address(0),
            netAmount,
            recipient,
            salt,
            depositNonce
        );

        if (usedCommitments[commitment]) revert CommitmentAlreadyUsed();
        usedCommitments[commitment] = true;

        accumulatedFees[address(0)] += fee;

        (uint256 leafIndex, uint256 newRoot) = insert(commitment);
        root = newRoot;
        depositId = depositNonce;

        deposits[depositId] = Deposit({
            sender: msg.sender,
            token: address(0),
            amount: netAmount,
            destinationChainId: destinationChainId,
            recipient: recipient,
            commitment: commitment,
            leafIndex: leafIndex,
            root: root,
            timestamp: block.timestamp,
            nonce: depositNonce
        });

        emit BridgeDeposit(
            depositId,
            msg.sender,
            address(0),
            netAmount,
            destinationChainId,
            recipient,
            commitment,
            root,
            depositNonce,
            block.timestamp
        );

        depositNonce++;
        return (depositId, commitment, root);
    }

    // ===========================================
    // ADMIN FUNCTIONS
    // ===========================================

    function addSupportedToken(
        address token,
        uint256 minAmount,
        uint256 maxAmount
    ) external onlyOwner {
        supportedTokens[token] = true;
        minDepositAmount[token] = minAmount;
        maxDepositAmount[token] = maxAmount;
        emit TokenAdded(token, minAmount, maxAmount);
    }

    function removeSupportedToken(address token) external onlyOwner {
        supportedTokens[token] = false;
        emit TokenRemoved(token);
    }

    function setBridgeFee(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > 500) revert InvalidFee(); // Max 5%
        uint256 oldFee = bridgeFeeBps;
        bridgeFeeBps = newFeeBps;
        emit BridgeFeeUpdated(oldFee, newFeeBps);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PauseStateChanged(_paused);
    }

    function withdrawFees(address token, address recipient) external onlyOwner nonReentrant {
        if (recipient == address(0)) revert InvalidRecipient();
        uint256 amount = accumulatedFees[token];
        if (amount == 0) revert AmountBelowMinimum();

        accumulatedFees[token] = 0;

        if (token == address(0)) {
            (bool success, ) = recipient.call{value: amount}("");
            if (!success) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(recipient, amount);
        }

        emit FeesWithdrawn(token, amount, recipient);
    }

    function getDeposit(uint256 id) external view returns (Deposit memory) {
        return deposits[id];
    }
}
