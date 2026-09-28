// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DestinationBridge
 * @author VeriSync Team
 * @notice Destination chain bridge contract for VeriSync Protocol v1.0
 * @dev Verifies Groth16 ZK proofs against registered source Merkle roots, enforces nullifier replay protection,
 *      and releases tokens safely to destination recipients.
 */

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IVerifier {
    function verifyProof(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[7] calldata _pubSignals
    ) external view returns (bool);
}

contract DestinationBridge is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ===========================================
    // STATE VARIABLES
    // ===========================================

    IVerifier public verifier;

    /// @notice Source chain ID this bridge accepts proofs from
    uint256 public immutable expectedSourceChainId;

    /// @notice Destination chain ID this bridge operates on
    uint256 public immutable expectedDestinationChainId;

    /// @notice Registered source Merkle roots
    mapping(uint256 => bool) public isKnownSourceRoot;

    /// @notice Timestamp when each source root was registered
    mapping(uint256 => uint256) public rootRegistrationTime;

    /// @notice Maximum allowed root age for claiming (freshness window)
    uint256 public rootExpiryWindow;

    /// @notice Nullifier replay protection mapping
    mapping(uint256 => bool) public usedNullifiers;

    /// @notice Token address mapping (sourceToken address -> destinationToken address)
    mapping(address => address) public tokenMappings;

    /// @notice Total claims processed
    uint256 public totalClaims;

    /// @notice Total amount claimed per destination token
    mapping(address => uint256) public totalAmountClaimed;

    /// @notice Total liquidity deposited per destination token
    mapping(address => uint256) public totalLiquidityProvided;

    /// @notice Emergency pause state
    bool public paused;

    /// @notice Timelock for verifier updates (2-step update)
    address public pendingVerifier;
    uint256 public verifierUpdateTimestamp;
    uint256 public constant VERIFIER_TIMELOCK = 1 days;

    // ===========================================
    // STRUCTS & EVENTS
    // ===========================================

    struct Claim {
        address recipient;
        address token;
        uint256 amount;
        uint256 nullifier;
        uint256 root;
        uint256 timestamp;
    }

    mapping(uint256 => Claim) public claims;

    event TokensClaimed(
        uint256 indexed claimId,
        address indexed recipient,
        address indexed token,
        uint256 amount,
        uint256 nullifier,
        uint256 root
    );

    event SourceRootRegistered(uint256 indexed root, uint256 timestamp);
    event SourceRootExpired(uint256 indexed root);
    event TokenMappingUpdated(address indexed sourceToken, address indexed destToken);
    event VerifierUpdateInitiated(address indexed oldVerifier, address indexed newVerifier, uint256 effectiveTime);
    event VerifierUpdated(address indexed oldVerifier, address indexed newVerifier);
    event LiquidityAdded(address indexed token, uint256 amount, address indexed provider);
    event LiquidityWithdrawn(address indexed token, uint256 amount, address indexed recipient);
    event PauseStateChanged(bool paused);
    event ProofVerificationFailed(uint256 indexed nullifier, uint256 indexed root, string reason);

    // ===========================================
    // ERRORS
    // ===========================================

    error InvalidProof();
    error ProofExpired();
    error NullifierAlreadyUsed();
    error UnknownSourceRoot();
    error InvalidSourceChain();
    error InvalidDestinationChain();
    error TokenNotMapped();
    error BridgePaused();
    error InsufficientLiquidity();
    error InvalidVerifier();
    error TimelockNotExpired();
    error NoPendingVerifier();
    error InvalidRecipient();
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
        address _verifier,
        uint256 _expectedSourceChainId,
        uint256 _expectedDestinationChainId,
        uint256 _rootExpiryWindow
    ) Ownable(msg.sender) {
        if (_verifier == address(0)) revert InvalidVerifier();
        verifier = IVerifier(_verifier);
        expectedSourceChainId = _expectedSourceChainId;
        expectedDestinationChainId = _expectedDestinationChainId;
        rootExpiryWindow = _rootExpiryWindow;
    }

    // ===========================================
    // CLAIM WITH PROOF
    // ===========================================

    /**
     * @notice Claim ERC20 tokens using a verified Groth16 proof
     * @param _pA Proof component A
     * @param _pB Proof component B
     * @param _pC Proof component C
     * @param _pubSignals Array of 7 public signals:
     *        [0] root
     *        [1] nullifier
     *        [2] amount
     *        [3] sourceToken
     *        [4] recipient
     *        [5] sourceChainId
     *        [6] destinationChainId
     */
    function claimWithProof(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[7] calldata _pubSignals
    ) external nonReentrant whenNotPaused returns (uint256 claimId) {
        uint256 root = _pubSignals[0];
        uint256 nullifier = _pubSignals[1];
        uint256 amount = _pubSignals[2];
        address sourceToken = address(uint160(_pubSignals[3]));
        address recipient = address(uint160(_pubSignals[4]));
        uint256 sourceChainId = _pubSignals[5];
        uint256 destinationChainId = _pubSignals[6];

        // 1. Destination chain ID verification
        if (destinationChainId != expectedDestinationChainId) revert InvalidDestinationChain();

        // 2. Source chain ID verification
        if (sourceChainId != expectedSourceChainId) revert InvalidSourceChain();

        // 3. Known source root verification
        if (!isKnownSourceRoot[root]) {
            emit ProofVerificationFailed(nullifier, root, "Unknown root");
            revert UnknownSourceRoot();
        }

        // 4. Root Freshness / Expiration check
        if (block.timestamp > rootRegistrationTime[root] + rootExpiryWindow) {
            emit ProofVerificationFailed(nullifier, root, "Proof expired");
            revert ProofExpired();
        }

        // 5. Nullifier Replay Protection
        if (usedNullifiers[nullifier]) {
            emit ProofVerificationFailed(nullifier, root, "Nullifier already used");
            revert NullifierAlreadyUsed();
        }

        // 6. Token Mapping check
        address destToken = tokenMappings[sourceToken];
        if (destToken == address(0)) revert TokenNotMapped();
        if (recipient == address(0)) revert InvalidRecipient();

        // 7. ZK Proof Verification on-chain
        bool isValid = verifier.verifyProof(_pA, _pB, _pC, _pubSignals);
        if (!isValid) {
            emit ProofVerificationFailed(nullifier, root, "Invalid ZK proof");
            revert InvalidProof();
        }

        // 8. Custody / Liquidity invariant check
        uint256 availableBalance = IERC20(destToken).balanceOf(address(this));
        if (availableBalance < amount) revert InsufficientLiquidity();

        // 9. State updates (Effects before Interactions)
        usedNullifiers[nullifier] = true;
        claimId = totalClaims;
        claims[claimId] = Claim({
            recipient: recipient,
            token: destToken,
            amount: amount,
            nullifier: nullifier,
            root: root,
            timestamp: block.timestamp
        });
        totalClaims++;
        totalAmountClaimed[destToken] += amount;

        // 10. Transfer funds to recipient
        IERC20(destToken).safeTransfer(recipient, amount);

        emit TokensClaimed(claimId, recipient, destToken, amount, nullifier, root);
        return claimId;
    }

    /**
     * @notice Claim native ETH / MATIC using a verified Groth16 proof
     */
    function claimETHWithProof(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[7] calldata _pubSignals
    ) external nonReentrant whenNotPaused returns (uint256 claimId) {
        uint256 root = _pubSignals[0];
        uint256 nullifier = _pubSignals[1];
        uint256 amount = _pubSignals[2];
        address sourceToken = address(uint160(_pubSignals[3]));
        address recipient = address(uint160(_pubSignals[4]));
        uint256 sourceChainId = _pubSignals[5];
        uint256 destinationChainId = _pubSignals[6];

        if (destinationChainId != expectedDestinationChainId) revert InvalidDestinationChain();
        if (sourceChainId != expectedSourceChainId) revert InvalidSourceChain();
        if (sourceToken != address(0)) revert TokenNotMapped();
        if (recipient == address(0)) revert InvalidRecipient();

        if (!isKnownSourceRoot[root]) revert UnknownSourceRoot();
        if (block.timestamp > rootRegistrationTime[root] + rootExpiryWindow) revert ProofExpired();
        if (usedNullifiers[nullifier]) revert NullifierAlreadyUsed();

        bool isValid = verifier.verifyProof(_pA, _pB, _pC, _pubSignals);
        if (!isValid) revert InvalidProof();

        if (address(this).balance < amount) revert InsufficientLiquidity();

        usedNullifiers[nullifier] = true;
        claimId = totalClaims;
        claims[claimId] = Claim({
            recipient: recipient,
            token: address(0),
            amount: amount,
            nullifier: nullifier,
            root: root,
            timestamp: block.timestamp
        });
        totalClaims++;
        totalAmountClaimed[address(0)] += amount;

        (bool success, ) = recipient.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit TokensClaimed(claimId, recipient, address(0), amount, nullifier, root);
        return claimId;
    }

    // ===========================================
    // ROOT & POOL MANAGEMENT
    // ===========================================

    function registerSourceRoot(uint256 root) external onlyOwner {
        isKnownSourceRoot[root] = true;
        rootRegistrationTime[root] = block.timestamp;
        emit SourceRootRegistered(root, block.timestamp);
    }

    function setTokenMapping(address sourceToken, address destToken) external onlyOwner {
        tokenMappings[sourceToken] = destToken;
        emit TokenMappingUpdated(sourceToken, destToken);
    }

    function addLiquidity(address token, uint256 amount) external nonReentrant {
        if (amount == 0) revert InsufficientLiquidity();
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        totalLiquidityProvided[token] += amount;
        emit LiquidityAdded(token, amount, msg.sender);
    }

    function addETHLiquidity() external payable nonReentrant {
        if (msg.value == 0) revert InsufficientLiquidity();
        totalLiquidityProvided[address(0)] += msg.value;
        emit LiquidityAdded(address(0), msg.value, msg.sender);
    }

    function withdrawLiquidity(address token, uint256 amount, address recipient) external onlyOwner nonReentrant {
        if (recipient == address(0)) revert InvalidRecipient();

        if (token == address(0)) {
            if (address(this).balance < amount) revert InsufficientLiquidity();
            (bool success, ) = recipient.call{value: amount}("");
            if (!success) revert TransferFailed();
        } else {
            if (IERC20(token).balanceOf(address(this)) < amount) revert InsufficientLiquidity();
            IERC20(token).safeTransfer(recipient, amount);
        }

        emit LiquidityWithdrawn(token, amount, recipient);
    }

    function setRootExpiryWindow(uint256 newWindow) external onlyOwner {
        rootExpiryWindow = newWindow;
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PauseStateChanged(_paused);
    }

    function initiateVerifierUpdate(address _newVerifier) external onlyOwner {
        if (_newVerifier == address(0)) revert InvalidVerifier();
        pendingVerifier = _newVerifier;
        verifierUpdateTimestamp = block.timestamp + VERIFIER_TIMELOCK;
        emit VerifierUpdateInitiated(address(verifier), _newVerifier, verifierUpdateTimestamp);
    }

    function executeVerifierUpdate() external onlyOwner {
        if (pendingVerifier == address(0)) revert NoPendingVerifier();
        if (block.timestamp < verifierUpdateTimestamp) revert TimelockNotExpired();

        address oldVerifier = address(verifier);
        verifier = IVerifier(pendingVerifier);
        pendingVerifier = address(0);
        verifierUpdateTimestamp = 0;

        emit VerifierUpdated(oldVerifier, address(verifier));
    }

    function isNullifierUsed(uint256 nullifier) external view returns (bool) {
        return usedNullifiers[nullifier];
    }

    function getClaim(uint256 claimId) external view returns (Claim memory) {
        return claims[claimId];
    }
}
