// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title BridgeToken
 * @author VeriSync Team
 * @notice Test ERC20 token for VeriSync bridge testing
 * @dev A simple ERC20 token for testing the bridge functionality
 */

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract BridgeToken is ERC20, ERC20Burnable, Ownable {
    uint8 private _decimals;

    /**
     * @notice Constructor for the bridge test token
     * @param name Token name
     * @param symbol Token symbol
     * @param decimals_ Number of decimals
     * @param initialSupply Initial supply to mint to deployer
     */
    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals_,
        uint256 initialSupply
    ) ERC20(name, symbol) Ownable(msg.sender) {
        _decimals = decimals_;
        _mint(msg.sender, initialSupply * 10 ** decimals_);
    }

    /**
     * @notice Override decimals
     */
    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    /**
     * @notice Mint new tokens (owner only)
     * @param to Address to mint to
     * @param amount Amount to mint
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /**
     * @notice Faucet function for testing - anyone can get tokens
     * @param amount Amount to receive (max 1000 tokens per call)
     */
    function faucet(uint256 amount) external {
        require(amount <= 1000 * 10 ** _decimals, "Max 1000 tokens per faucet call");
        _mint(msg.sender, amount);
    }
}
