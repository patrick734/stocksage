// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/// @notice Test stand-in for the Pons-launched token: fixed supply, burnable. Never deployed on mainnet.
contract MockBurnableToken is ERC20, ERC20Burnable {
    constructor(address holder, uint256 supply) ERC20("Agent Token", "AGENT") {
        _mint(holder, supply);
    }
}

/// @notice A token with no burn(): the contracts fall back to the dead address.
contract MockPlainToken is ERC20 {
    constructor(address holder, uint256 supply) ERC20("Plain", "PLAIN") {
        _mint(holder, supply);
    }
}
