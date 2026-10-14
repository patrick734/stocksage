// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ISageOracle} from "./ISageOracle.sol";

/// @title SageQuote
/// @notice The parts the registry and the market share: two-step ownership, pausing, the $SAGE token, the oracle,
///         the treasury and the ETH to $SAGE conversion.
abstract contract SageQuote is Ownable2Step, Pausable {
    using SafeERC20 for IERC20;

    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    IERC20 public sage;
    ISageOracle public oracle;
    address public treasury;

    event SageSet(address indexed sage);
    event OracleUpdated(address indexed oracle);
    event TreasuryUpdated(address indexed treasury);

    error ZeroAddress();
    error TokenNotSet();
    error TokenAlreadySet();
    error NotAToken();
    error UnsupportedDecimals(uint8 decimals);
    error OracleReturnedZero();
    error InvalidSplit();
    error CostExceedsMax(uint256 cost, uint256 max);

    /// @notice Sets $SAGE after its launch. Owner only, and only once.
    function setSage(address sage_) external onlyOwner {
        if (address(sage) != address(0)) revert TokenAlreadySet();
        if (sage_ == address(0)) revert ZeroAddress();
        if (sage_.code.length == 0) revert NotAToken();
        uint8 d;
        try IERC20Metadata(sage_).decimals() returns (uint8 value) {
            d = value;
        } catch {
            revert NotAToken();
        }
        if (d != 18) revert UnsupportedDecimals(d);
        sage = IERC20(sage_);
        emit SageSet(sage_);
    }

    function setOracle(address oracle_) external onlyOwner {
        if (oracle_ == address(0)) revert ZeroAddress();
        oracle = ISageOracle(oracle_);
        emit OracleUpdated(oracle_);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice $SAGE amount for an ETH amount at the oracle rate.
    function quoteSage(uint256 weiAmount) public view returns (uint256) {
        if (weiAmount == 0) return 0;
        uint256 rate = oracle.sagePerEth();
        if (rate == 0) revert OracleReturnedZero();
        return (weiAmount * rate) / 1e18;
    }

    function _setAddresses(address oracle_, address treasury_) internal {
        if (oracle_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        oracle = ISageOracle(oracle_);
        treasury = treasury_;
    }

    /// @dev Moves `amount` $SAGE from `from` to `to`; nothing happens for zero.
    function _pay(address from, address to, uint256 amount) internal {
        if (amount != 0) sage.safeTransferFrom(from, to, amount);
    }

    function _burnFrom(address from, uint256 amount) internal {
        if (amount != 0) sage.safeTransferFrom(from, BURN_ADDRESS, amount);
    }
}
