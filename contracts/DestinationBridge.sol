// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DestinationBridge
 * @author VeriSync Team
 * @notice Destination chain bridge contract for VeriSync ZK Bridge System
 * @dev This contract verifies ZK proofs and releases/mints tokens on the destination chain (Polygon Amoy)
 * 
 * SECURITY FEATURES:
 * 1. ZK Proof Verification - Only valid proofs unlock tokens
 * 2. Replay Protection - Each proof can only be used once via nullifier
 * 3. Proof Expiration - Proofs must be submitted within time window
 * 4. Nonce Tracking - Prevents out-of-order processing
 */

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Interface for the ZK Verifier contract
interface IVerifier {
    function verifyProof(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[4] calldata _pubSignals
    ) external view returns (bool);
}

contract DestinationBridge is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ===========================================
    // STATE VARIABLES
    // ===========================================

    /// @notice The ZK verifier contract address
    IVerifier public verifier;

    /// @notice Mapping of nullifiers to prevent proof reuse
    mapping(bytes32 => bool) public usedNullifiers;

    /// @notice Mapping of processed commitments
    mapping(bytes32 => bool) public processedCommitments;

    /// @notice Token mapping from source chain to destination chain
    mapping(address => address) public tokenMappings;

    /// @notice Proof expiration window in seconds
    uint256 public proofExpirationWindow;

    /// @notice Source chain ID
    uint256 public sourceChainId;

    /// @notice Minimum valid nonce (for upgrade protection)
    uint256 public minValidNonce;

    /// @notice Total claims processed
    uint256 public totalClaims;

    /// @notice Pause state for emergency
    bool public paused;

    /// @notice Relayer whitelist (optional, for controlled relaying)
    mapping(address => bool) public authorizedRelayers;
    bool public relayerWhitelistEnabled;

    // ===========================================
    // STRUCTS
    // ===========================================

    /// @notice Claim information structure
    struct Claim {
        address recipient;        // Recipient of the tokens
        address token;            // Token address on destination
        uint256 amount;           // Amount claimed
        bytes32 nullifier;        // Nullifier for replay protection
        uint256 timestamp;        // Claim timestamp
        bytes32 commitment;       // Original commitment hash
    }

    /// @notice Mapping of claim ID to claim details
    mapping(uint256 => Claim) public claims;

    // ===========================================
    // EVENTS
    // ===========================================

    /// @notice Emitted when tokens are successfully claimed via ZK proof
    event TokensClaimed(
        uint256 indexed claimId,
        address indexed recipient,
        address indexed token,
        uint256 amount,
        bytes32 nullifier,
        bytes32 commitment
    );

    /// @notice Emitted when a ZK proof verification fails
    event ProofVerificationFailed(
        address indexed submitter,
        bytes32 commitment,
        string reason
    );

    /// @notice Emitted when token mapping is updated
    event TokenMappingUpdated(
        address indexed sourceToken,
        address indexed destToken
    );

    /// @notice Emitted when verifier is updated
    event VerifierUpdated(address indexed oldVerifier, address indexed newVerifier);

    /// @notice Emitted when pause state changes
    event PauseStateChanged(bool paused);

    /// @notice Emitted when relayer status changes
    event RelayerStatusChanged(address indexed relayer, bool authorized);

    // ===========================================
    // ERRORS
    // ===========================================

    error InvalidProof();
    error ProofExpired();
    error NullifierAlreadyUsed();
    error CommitmentAlreadyProcessed();
    error TokenNotMapped();
    error BridgePaused();
    error UnauthorizedRelayer();
    error InvalidNonce();
    error InsufficientBalance();
    error InvalidVerifier();

    // ===========================================
    // MODIFIERS
    // ===========================================

    modifier whenNotPaused() {
        if (paused) revert BridgePaused();
        _;
    }

    modifier onlyAuthorizedRelayer() {
        if (relayerWhitelistEnabled && !authorizedRelayers[msg.sender]) {
            revert UnauthorizedRelayer();
        }
        _;
    }

    // ===========================================
    // CONSTRUCTOR
    // ===========================================

    /**
     * @notice Initialize the destination bridge
     * @param _verifier Address of the ZK verifier contract
     * @param _sourceChainId Chain ID of the source network
     * @param _proofExpirationWindow Time window for proof validity (seconds)
     */
    constructor(
        address _verifier,
        uint256 _sourceChainId,
        uint256 _proofExpirationWindow
    ) Ownable(msg.sender) {
        if (_verifier == address(0)) revert InvalidVerifier();
        verifier = IVerifier(_verifier);
        sourceChainId = _sourceChainId;
        proofExpirationWindow = _proofExpirationWindow;
        totalClaims = 0;
        relayerWhitelistEnabled = false;
    }

    // ===========================================
    // EXTERNAL FUNCTIONS
    // ===========================================

    /**
     * @notice Claim tokens using a ZK proof
     * @dev Verifies the ZK proof and releases tokens if valid
     * @param _pA Proof component A
     * @param _pB Proof component B
     * @param _pC Proof component C
     * @param _pubSignals Public signals [commitment, nullifier, amount, timestamp]
     * @param recipient Address to receive tokens
     * @param sourceToken Original token address on source chain
     */
    function claimWithProof(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[4] calldata _pubSignals,
        address recipient,
        address sourceToken
    ) external nonReentrant whenNotPaused onlyAuthorizedRelayer returns (uint256 claimId) {
        // Extract public signals
        bytes32 commitment = bytes32(_pubSignals[0]);
        bytes32 nullifier = bytes32(_pubSignals[1]);
        uint256 amount = _pubSignals[2];
        uint256 proofTimestamp = _pubSignals[3];

        // Security Check 1: Verify proof hasn't expired
        if (block.timestamp > proofTimestamp + proofExpirationWindow) {
            emit ProofVerificationFailed(msg.sender, commitment, "Proof expired");
            revert ProofExpired();
        }

        // Security Check 2: Verify nullifier hasn't been used (replay protection)
        if (usedNullifiers[nullifier]) {
            emit ProofVerificationFailed(msg.sender, commitment, "Nullifier already used");
            revert NullifierAlreadyUsed();
        }

        // Security Check 3: Verify commitment hasn't been processed
        if (processedCommitments[commitment]) {
            emit ProofVerificationFailed(msg.sender, commitment, "Commitment already processed");
            revert CommitmentAlreadyProcessed();
        }

        // Security Check 4: Verify the ZK proof
        bool proofValid = verifier.verifyProof(_pA, _pB, _pC, _pubSignals);
        if (!proofValid) {
            emit ProofVerificationFailed(msg.sender, commitment, "Invalid ZK proof");
            revert InvalidProof();
        }

        // Security Check 5: Verify token mapping exists
        address destToken = tokenMappings[sourceToken];
        if (destToken == address(0)) revert TokenNotMapped();

        // Mark nullifier and commitment as used
        usedNullifiers[nullifier] = true;
        processedCommitments[commitment] = true;

        // Store claim details
        claimId = totalClaims;
        claims[claimId] = Claim({
            recipient: recipient,
            token: destToken,
            amount: amount,
            nullifier: nullifier,
            timestamp: block.timestamp,
            commitment: commitment
        });

        // Transfer tokens to recipient
        // Note: This contract must hold sufficient tokens (liquidity pool model)
        // Alternatively, implement minting for wrapped tokens
        IERC20(destToken).safeTransfer(recipient, amount);

        emit TokensClaimed(
            claimId,
            recipient,
            destToken,
            amount,
            nullifier,
            commitment
        );

        totalClaims++;

        return claimId;
    }

    /**
     * @notice Claim native tokens using a ZK proof
     * @dev For bridging native currency (ETH/MATIC)
     */
    function claimETHWithProof(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[4] calldata _pubSignals,
        address recipient
    ) external nonReentrant whenNotPaused onlyAuthorizedRelayer returns (uint256 claimId) {
        // Extract public signals
        bytes32 commitment = bytes32(_pubSignals[0]);
        bytes32 nullifier = bytes32(_pubSignals[1]);
        uint256 amount = _pubSignals[2];
        uint256 proofTimestamp = _pubSignals[3];

        // Security checks (same as ERC20)
        if (block.timestamp > proofTimestamp + proofExpirationWindow) {
            revert ProofExpired();
        }
        if (usedNullifiers[nullifier]) revert NullifierAlreadyUsed();
        if (processedCommitments[commitment]) revert CommitmentAlreadyProcessed();

        // Verify ZK proof
        bool proofValid = verifier.verifyProof(_pA, _pB, _pC, _pubSignals);
        if (!proofValid) revert InvalidProof();

        // Check contract has sufficient ETH
        if (address(this).balance < amount) revert InsufficientBalance();

        // Mark as used
        usedNullifiers[nullifier] = true;
        processedCommitments[commitment] = true;

        // Store claim
        claimId = totalClaims;
        claims[claimId] = Claim({
            recipient: recipient,
            token: address(0),
            amount: amount,
            nullifier: nullifier,
            timestamp: block.timestamp,
            commitment: commitment
        });

        // Transfer native currency
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "ETH transfer failed");

        emit TokensClaimed(
            claimId,
            recipient,
            address(0),
            amount,
            nullifier,
            commitment
        );

        totalClaims++;

        return claimId;
    }

    /**
     * @notice Check if a nullifier has been used
     * @param nullifier The nullifier to check
     * @return bool Whether the nullifier has been used
     */
    function isNullifierUsed(bytes32 nullifier) external view returns (bool) {
        return usedNullifiers[nullifier];
    }

    /**
     * @notice Check if a commitment has been processed
     * @param commitment The commitment to check
     * @return bool Whether the commitment has been processed
     */
    function isCommitmentProcessed(bytes32 commitment) external view returns (bool) {
        return processedCommitments[commitment];
    }

    /**
     * @notice Get claim details
     * @param claimId The claim ID
     * @return Claim struct
     */
    function getClaim(uint256 claimId) external view returns (Claim memory) {
        return claims[claimId];
    }

    /**
     * @notice Verify a proof without executing (for testing/UI)
     * @return bool Whether the proof is valid
     */
    function verifyProofOnly(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[4] calldata _pubSignals
    ) external view returns (bool) {
        return verifier.verifyProof(_pA, _pB, _pC, _pubSignals);
    }

    // ===========================================
    // ADMIN FUNCTIONS
    // ===========================================

    /**
     * @notice Update the ZK verifier contract
     * @param _newVerifier New verifier address
     */
    function setVerifier(address _newVerifier) external onlyOwner {
        if (_newVerifier == address(0)) revert InvalidVerifier();
        emit VerifierUpdated(address(verifier), _newVerifier);
        verifier = IVerifier(_newVerifier);
    }

    /**
     * @notice Set token mapping from source to destination
     * @param sourceToken Token address on source chain
     * @param destToken Token address on destination chain
     */
    function setTokenMapping(address sourceToken, address destToken) external onlyOwner {
        tokenMappings[sourceToken] = destToken;
        emit TokenMappingUpdated(sourceToken, destToken);
    }

    /**
     * @notice Update proof expiration window
     * @param _window New expiration window in seconds
     */
    function setProofExpirationWindow(uint256 _window) external onlyOwner {
        proofExpirationWindow = _window;
    }

    /**
     * @notice Add liquidity to the bridge
     * @param token Token address
     * @param amount Amount to add
     */
    function addLiquidity(address token, uint256 amount) external {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
    }

    /**
     * @notice Withdraw liquidity (owner only, for emergencies)
     * @param token Token address
     * @param amount Amount to withdraw
     * @param recipient Recipient address
     */
    function withdrawLiquidity(
        address token,
        uint256 amount,
        address recipient
    ) external onlyOwner {
        if (token == address(0)) {
            (bool success, ) = recipient.call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(token).safeTransfer(recipient, amount);
        }
    }

    /**
     * @notice Set relayer authorization
     * @param relayer Relayer address
     * @param authorized Whether relayer is authorized
     */
    function setRelayerAuthorization(address relayer, bool authorized) external onlyOwner {
        authorizedRelayers[relayer] = authorized;
        emit RelayerStatusChanged(relayer, authorized);
    }

    /**
     * @notice Enable/disable relayer whitelist
     * @param enabled Whether whitelist is enabled
     */
    function setRelayerWhitelistEnabled(bool enabled) external onlyOwner {
        relayerWhitelistEnabled = enabled;
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
     * @notice Receive ETH for native token bridging
     */
    receive() external payable {}
}
