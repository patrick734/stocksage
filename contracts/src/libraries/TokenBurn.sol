// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IBurnable {
    function burn(uint256 amount) external;
}

/// @title TokenBurn
/// @notice Burns the token held by the calling contract: with the token's own burn() when it has one, otherwise by
///         sending it to the dead address, where nobody holds the key.
library TokenBurn {
    using SafeERC20 for IERC20;

    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;

    function burn(IERC20 token, uint256 amount) internal {
        if (amount == 0) return;
        uint256 before = token.balanceOf(address(this));
        try IBurnable(address(token)).burn(amount) {
            if (before - token.balanceOf(address(this)) == amount) return;
        } catch {}
        // No burn(), or a burn() that did not take exactly `amount`: the rest goes to the dead address.
        uint256 left = amount - (before - token.balanceOf(address(this)));
        if (left > 0) token.safeTransfer(DEAD, left);
    }
}
