// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SourceBridge
 * @author VeriSync Team
 * @notice Source chain bridge contract for VeriSync ZK Bridge System
 * @dev This contract handles token locking and event emission on the source chain (Ethereum Sepolia)
 * 
 * ARCHITECTURE:
 * 1. User deposits/locks tokens on source chain
 * 2. Contract emits BridgeDeposit event with commitment hash
 * 3. Relayer listens for events and generates ZK proof
 * 4. ZK proof is submitted to destination chain for verification
 */

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SourceBridge is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ===========================================
    // STATE VARIABLES
    // ===========================================

    /// @notice Counter for generating unique deposit IDs
    uint256 public depositNonce;

    /// @notice Mapping of deposit ID to deposit details
    mapping(uint256 => Deposit) public deposits;

    /// @notice Mapping of commitment hashes to prevent replay
    mapping(bytes32 => bool) public usedCommitments;

    /// @notice Supported tokens for bridging
    mapping(address => bool) public supportedTokens;

    /// @notice Minimum deposit amount per token
    mapping(address => uint256) public minDepositAmount;

    /// @notice Maximum deposit amount per token
    mapping(address => uint256) public maxDepositAmount;

    /// @notice Bridge fee in basis points (1 = 0.01%)
    uint256 public bridgeFeeBps = 10; // 0.1% default fee

    /// @notice Accumulated fees per token
    mapping(address => uint256) public accumulatedFees;

    /// @notice Pause state for emergency
    bool public paused;

    // ===========================================
    // STRUCTS
    // ===========================================

    /// @notice Deposit information structure
    struct Deposit {
        address sender;           // Original depositor address
        address token;            // Token address being bridged
        uint256 amount;           // Amount being bridged (after fees)
        uint256 destinationChainId; // Target chain ID
        address recipient;        // Recipient on destination chain
        bytes32 commitment;       // Commitment hash for ZK proof
        uint256 timestamp;        // Block timestamp of deposit
        bool processed;           // Whether deposit has been processed
    }

    // ===========================================
    // EVENTS
    // ===========================================

    /// @notice Emitted when a deposit is made for bridging
    /// @dev Relayer listens for this event to generate ZK proofs
    event BridgeDeposit(
        uint256 indexed depositId,
        address indexed sender,
        address indexed token,
        uint256 amount,
        uint256 destinationChainId,
        address recipient,
        bytes32 commitment,
        uint256 timestamp,
        uint256 nonce
    );

    /// @notice Emitted when a token is added to supported list
    event TokenAdded(address indexed token, uint256 minAmount, uint256 maxAmount);

    /// @notice Emitted when a token is removed from supported list
    event TokenRemoved(address indexed token);

    /// @notice Emitted when fees are withdrawn
    event FeesWithdrawn(address indexed token, uint256 amount, address indexed recipient);

    /// @notice Emitted when bridge fee is updated
    event BridgeFeeUpdated(uint256 oldFee, uint256 newFee);

    /// @notice Emitted when pause state changes
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

    constructor() Ownable(msg.sender) {
        depositNonce = 0;
    }

    // ===========================================
    // EXTERNAL FUNCTIONS
    // ===========================================

    /**
     * @notice Deposit tokens to bridge to another chain
     * @dev Generates a commitment hash from private inputs for ZK proof generation
     * @param token Address of the ERC20 token to bridge
     * @param amount Amount of tokens to bridge
     * @param destinationChainId Chain ID of the destination network
     * @param recipient Address to receive tokens on destination chain
     * @param salt Random salt for commitment generation (should be kept private)
     * @return depositId Unique identifier for this deposit
     * @return commitment The commitment hash for ZK proof
     */
    function deposit(
        address token,
        uint256 amount,
        uint256 destinationChainId,
        address recipient,
        bytes32 salt
    ) external nonReentrant whenNotPaused returns (uint256 depositId, bytes32 commitment) {
        // Validations
        if (!supportedTokens[token]) revert TokenNotSupported();
        if (amount < minDepositAmount[token]) revert AmountBelowMinimum();
        if (amount > maxDepositAmount[token]) revert AmountAboveMaximum();
        if (recipient == address(0)) revert InvalidRecipient();
        if (destinationChainId == block.chainid) revert InvalidChainId();

        // Calculate fee and net amount
        uint256 fee = (amount * bridgeFeeBps) / 10000;
        uint256 netAmount = amount - fee;

        // Generate commitment hash
        // commitment = hash(sender, token, amount, destinationChainId, recipient, salt, nonce)
        commitment = keccak256(
            abi.encodePacked(
                msg.sender,
                token,
                netAmount,
                destinationChainId,
                recipient,
                salt,
                depositNonce
            )
        );

        // Check commitment hasn't been used (replay protection)
        if (usedCommitments[commitment]) revert CommitmentAlreadyUsed();
        usedCommitments[commitment] = true;

        // Transfer tokens from sender
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Update accumulated fees
        accumulatedFees[token] += fee;

        // Store deposit details
        depositId = depositNonce;
        deposits[depositId] = Deposit({
            sender: msg.sender,
            token: token,
            amount: netAmount,
            destinationChainId: destinationChainId,
            recipient: recipient,
            commitment: commitment,
            timestamp: block.timestamp,
            processed: false
        });

        // Emit event for relayer
        emit BridgeDeposit(
            depositId,
            msg.sender,
            token,
            netAmount,
            destinationChainId,
            recipient,
            commitment,
            block.timestamp,
            depositNonce
        );

        // Increment nonce for next deposit
        depositNonce++;

        return (depositId, commitment);
    }

    /**
     * @notice Deposit native ETH to bridge to another chain
     * @dev Wraps ETH handling with same commitment logic as ERC20
     * @param destinationChainId Chain ID of the destination network
     * @param recipient Address to receive tokens on destination chain
     * @param salt Random salt for commitment generation
     */
    function depositETH(
        uint256 destinationChainId,
        address recipient,
        bytes32 salt
    ) external payable nonReentrant whenNotPaused returns (uint256 depositId, bytes32 commitment) {
        if (recipient == address(0)) revert InvalidRecipient();
        if (destinationChainId == block.chainid) revert InvalidChainId();

        uint256 amount = msg.value;
        
        // Calculate fee and net amount
        uint256 fee = (amount * bridgeFeeBps) / 10000;
        uint256 netAmount = amount - fee;

        // Generate commitment hash for ETH (token = address(0))
        commitment = keccak256(
            abi.encodePacked(
                msg.sender,
                address(0), // Native ETH
                netAmount,
                destinationChainId,
                recipient,
                salt,
                depositNonce
            )
        );

        // Check commitment hasn't been used
        if (usedCommitments[commitment]) revert CommitmentAlreadyUsed();
        usedCommitments[commitment] = true;

        // Update accumulated fees for ETH
        accumulatedFees[address(0)] += fee;

        // Store deposit details
        depositId = depositNonce;
        deposits[depositId] = Deposit({
            sender: msg.sender,
            token: address(0),
            amount: netAmount,
            destinationChainId: destinationChainId,
            recipient: recipient,
            commitment: commitment,
            timestamp: block.timestamp,
            processed: false
        });

        // Emit event for relayer
        emit BridgeDeposit(
            depositId,
            msg.sender,
            address(0),
            netAmount,
            destinationChainId,
            recipient,
            commitment,
            block.timestamp,
            depositNonce
        );

        depositNonce++;

        return (depositId, commitment);
    }

    /**
     * @notice Get deposit details by ID
     * @param depositId The deposit identifier
     * @return Deposit struct with all details
     */
    function getDeposit(uint256 depositId) external view returns (Deposit memory) {
        return deposits[depositId];
    }

    /**
     * @notice Verify a commitment hash exists
     * @param commitment The commitment hash to verify
     * @return bool Whether the commitment exists
     */
    function verifyCommitment(bytes32 commitment) external view returns (bool) {
        return usedCommitments[commitment];
    }

    // ===========================================
    // ADMIN FUNCTIONS
    // ===========================================

    /**
     * @notice Add a supported token for bridging
     * @param token Token address
     * @param minAmount Minimum deposit amount
     * @param maxAmount Maximum deposit amount
     */
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

    /**
     * @notice Remove a supported token
     * @param token Token address to remove
     */
    function removeSupportedToken(address token) external onlyOwner {
        supportedTokens[token] = false;
        emit TokenRemoved(token);
    }

    /**
     * @notice Update bridge fee
     * @param newFeeBps New fee in basis points (max 100 = 1%)
     */
    function setBridgeFee(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > 100) revert InvalidFee(); // Max 1%
        emit BridgeFeeUpdated(bridgeFeeBps, newFeeBps);
        bridgeFeeBps = newFeeBps;
    }

    /**
     * @notice Withdraw accumulated fees
     * @param token Token address (address(0) for ETH)
     * @param recipient Address to receive fees
     */
    function withdrawFees(address token, address recipient) external onlyOwner {
        uint256 amount = accumulatedFees[token];
        accumulatedFees[token] = 0;

        if (token == address(0)) {
            (bool success, ) = recipient.call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(token).safeTransfer(recipient, amount);
        }

        emit FeesWithdrawn(token, amount, recipient);
    }

    /**
     * @notice Pause or unpause the bridge
     * @param _paused New pause state
     */
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PauseStateChanged(_paused);
    }

    /**
     * @notice Receive ETH
     */
    receive() external payable {}
}
