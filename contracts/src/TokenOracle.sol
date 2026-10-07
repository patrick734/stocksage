// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {GovernanceChecks} from "./governance/GovernanceChecks.sol";

/// @title TokenOracle
/// @notice How many tokens (in wei) one ETH buys. The registry and the market use it to turn prices set in ETH into
///         token amounts.
/// @dev A spot price read from the Pons pool could be pushed around inside one transaction for free, so the price is
///      pushed by the keeper instead, and every push is bounded: at most `maxStepBps` away from the last price and no
///      sooner than `minInterval` after it. A price older than `maxAge` is refused, so a stopped keeper halts sales
///      instead of selling at a stale price. The admin (the 48h timelock) sets the first price and can reset it; the
///      guardian can freeze the price, and only the admin can unfreeze it.
contract TokenOracle is AccessControl {
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    /// @notice Hard limits on the bounds, so they can be tuned but never switched off.
    uint256 public constant MAX_PRICE = 1e36;
    uint16 public constant MIN_STEP_BPS = 100;
    uint16 public constant MAX_STEP_BPS = 5_000;
    uint32 public constant MIN_INTERVAL_FLOOR = 1 minutes;
    uint32 public constant MAX_AGE_CEILING = 7 days;

    uint256 public price;
    uint64 public updatedAt;
    uint32 public minInterval;
    uint32 public maxAge;
    uint16 public maxStepBps;
    bool public frozen;

    event PriceUpdated(uint256 price, address indexed by);
    event BoundsSet(uint32 minInterval, uint16 maxStepBps, uint32 maxAge);
    event FrozenSet(bool frozen);

    error InvalidConfig();
    error InvalidPrice();
    error TooSoon();
    error StepTooLarge(uint256 previous, uint256 next);
    error PriceUnavailable();

    constructor(address admin, address guardian, address keeper, uint32 minInterval_, uint16 maxStepBps_, uint32 maxAge_) {
        GovernanceChecks.requireRoles(admin, guardian, keeper, msg.sender);
        _setBounds(minInterval_, maxStepBps_, maxAge_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, guardian);
        _grantRole(KEEPER_ROLE, keeper);
    }

    /// @notice Token wei per 1 ETH. Reverts when no fresh price is available.
    function tokenPerEth() external view returns (uint256) {
        if (!isFresh()) revert PriceUnavailable();
        return price;
    }

    function isFresh() public view returns (bool) {
        return price != 0 && !frozen && block.timestamp <= uint256(updatedAt) + maxAge;
    }

    /// @notice Keeper push, bounded in size and frequency. The first price comes from the admin.
    function update(uint256 next) external onlyRole(KEEPER_ROLE) {
        uint256 prev = price;
        if (prev == 0) revert PriceUnavailable();
        if (next == 0 || next > MAX_PRICE) revert InvalidPrice();
        if (block.timestamp < uint256(updatedAt) + minInterval) revert TooSoon();
        uint256 diff = next > prev ? next - prev : prev - next;
        if (diff * 10_000 > prev * maxStepBps) revert StepTooLarge(prev, next);
        _set(next);
    }

    // ---------------------------------------------------------------- governance

    /// @notice Sets the price without the step bound: the first price, or a reset. Admin (timelock) only.
    function setPrice(uint256 next) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (next == 0 || next > MAX_PRICE) revert InvalidPrice();
        _set(next);
    }

    function setBounds(uint32 minInterval_, uint16 maxStepBps_, uint32 maxAge_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setBounds(minInterval_, maxStepBps_, maxAge_);
    }

    function freeze() external onlyRole(GUARDIAN_ROLE) {
        frozen = true;
        emit FrozenSet(true);
    }

    function unfreeze() external onlyRole(DEFAULT_ADMIN_ROLE) {
        frozen = false;
        emit FrozenSet(false);
    }

    function _set(uint256 next) private {
        price = next;
        updatedAt = uint64(block.timestamp);
        emit PriceUpdated(next, msg.sender);
    }

    function _setBounds(uint32 minInterval_, uint16 maxStepBps_, uint32 maxAge_) private {
        if (
            minInterval_ < MIN_INTERVAL_FLOOR || maxStepBps_ < MIN_STEP_BPS || maxStepBps_ > MAX_STEP_BPS
                || maxAge_ > MAX_AGE_CEILING || maxAge_ <= minInterval_
        ) revert InvalidConfig();
        minInterval = minInterval_;
        maxStepBps = maxStepBps_;
        maxAge = maxAge_;
        emit BoundsSet(minInterval_, maxStepBps_, maxAge_);
    }
}
