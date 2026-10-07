// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Test stand-in for the Uniswap v4 PoolManager's extsload, placed at its address with hardhat_setCode.
contract MockExtsload {
    function extsload(bytes32 slot) external view returns (bytes32 value) {
        assembly {
            value := sload(slot)
        }
    }
}
