// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title SageOracle
/// @notice How many $SAGE (in wei) one ETH buys. Agent prices and the deployment fee are set in ETH; the registry and
///         the market turn them into $SAGE at this rate.
/// @dev The owner sets the rate by hand with `setRate`. Buyers and creators are protected from a rate change by the
///      maximum amount they pass to every purchase and deployment.
contract SageOracle is Ownable {
    uint256 private _rate;

    event RateUpdated(uint256 sagePerEth);

    error ZeroRate();

    constructor(address initialOwner, uint256 initialRate) Ownable(initialOwner) {
        _setRate(initialRate);
    }

    /// @notice $SAGE wei per 1 ETH.
    function sagePerEth() external view returns (uint256) {
        return _rate;
    }

    function setRate(uint256 sagePerEth_) external onlyOwner {
        _setRate(sagePerEth_);
    }

    function _setRate(uint256 sagePerEth_) private {
        if (sagePerEth_ == 0) revert ZeroRate();
        _rate = sagePerEth_;
        emit RateUpdated(sagePerEth_);
    }
}
