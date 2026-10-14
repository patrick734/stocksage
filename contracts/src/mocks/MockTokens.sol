// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test stand-in for $SAGE. Never deployed on mainnet.
contract MockSage is ERC20 {
    constructor(address holder, uint256 supply) ERC20("StockSage", "SAGE") {
        _mint(holder, supply);
    }
}

/// @notice A token with 6 decimals, which the registry and market refuse.
contract MockSixDecimals is ERC20 {
    constructor() ERC20("Six", "SIX") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
