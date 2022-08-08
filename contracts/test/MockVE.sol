// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

/// @dev Mocking contract of voting escrow.
contract MockVE {
    address[] public accounts;
    uint256 balance = 50 ether;
    uint256 supply = 100 ether;

    /// @dev Simulates a lock for the specified account.
    function createLock(address account) external {
        accounts.push(account);
    }

    /// @dev Gets the account balance at a specific block number.
    function balanceOfAt(address, uint256) external view returns (uint256){
        return balance;
    }

    /// @dev Sets the new balance.
    function setBalance(uint256 newBalance) external {
        balance = newBalance;
    }

    /// @dev Gets total token supply at a specific block number.
    function totalSupplyAt(uint256) external view returns (uint256) {
        return supply;
    }

    /// @dev Sets the new total supply.
    function setSupply(uint256 newSupply) external {
        supply = newSupply;
    }
}