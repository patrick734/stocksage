// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {GovernanceChecks} from "./governance/GovernanceChecks.sol";
import {TokenBurn} from "./libraries/TokenBurn.sol";
import {AgentRegistry} from "./AgentRegistry.sol";

/// @title AgentMarket
/// @notice Users buy uses of an agent in the token, at the creator's price in ETH converted at the oracle price. Every
///         payment is split in the same transaction: 60% to the agent's creator, 30% burned, 10% to the treasury.
/// @dev The split is fixed in code. The market never holds funds between transactions: the creator and treasury
///      shares are transferred straight from the buyer, and the burn share is burned at once. `usesPurchased` is the
///      on-chain record an app checks before it serves an agent.
contract AgentMarket is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    string public constant VERSION = "1.0.0";
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    uint16 public constant CREATOR_BPS = 6_000;
    uint16 public constant BURN_BPS = 3_000;
    uint16 public constant TREASURY_BPS = 1_000;
    uint256 public constant MAX_USES_PER_PURCHASE = 10_000;

    AgentRegistry public immutable registry;

    mapping(address user => mapping(uint256 agentId => uint256)) public usesPurchased;
    mapping(uint256 agentId => uint256) public agentUsesSold;
    mapping(uint256 agentId => uint256) public agentCreatorEarned;
    mapping(uint256 agentId => uint256) public agentBurned;
    uint256 public totalBurned;
    uint256 public totalToTreasury;

    event UsesPurchased(
        address indexed user, uint256 indexed agentId, uint256 uses, uint256 tokenPaid, uint256 toCreator, uint256 burned, uint256 toTreasury
    );

    error InvalidConfig();
    error NotForSale(uint256 agentId);
    error BadUses();
    error CostAboveMax(uint256 cost, uint256 maxCost);
    error TokenUnset();

    constructor(address admin, address guardian, AgentRegistry registry_) {
        GovernanceChecks.requireAdminAndGuardian(admin, guardian, msg.sender);
        if (address(registry_).code.length == 0) revert InvalidConfig();
        registry = registry_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, guardian);
    }

    /// @notice Token cost of `uses` uses at the current price. Reverts when there is no fresh oracle price.
    function quoteUses(uint256 agentId, uint256 uses) public view returns (uint256) {
        return registry.quoteToken(registry.getAgent(agentId).pricePerUseWei * uses);
    }

    /// @notice Buys `uses` uses of an agent. Approve this contract for up to `maxTokenCost` tokens first.
    function purchaseUses(uint256 agentId, uint256 uses, uint256 maxTokenCost) external nonReentrant whenNotPaused {
        if (!registry.isPurchasable(agentId)) revert NotForSale(agentId);
        if (uses == 0 || uses > MAX_USES_PER_PURCHASE) revert BadUses();
        AgentRegistry.Agent memory a = registry.getAgent(agentId);
        uint256 cost = registry.quoteToken(a.pricePerUseWei * uses);
        if (cost > maxTokenCost) revert CostAboveMax(cost, maxTokenCost);

        uint256 burned = cost * BURN_BPS / 10_000;
        uint256 toTreasury = cost * TREASURY_BPS / 10_000;
        uint256 toCreator = cost - burned - toTreasury;
        if (cost > 0) {
            IERC20 t = registry.token();
            if (address(t) == address(0)) revert TokenUnset();
            t.safeTransferFrom(msg.sender, a.creator, toCreator);
            t.safeTransferFrom(msg.sender, registry.treasury(), toTreasury);
            t.safeTransferFrom(msg.sender, address(this), burned);
            TokenBurn.burn(t, burned);
        }

        usesPurchased[msg.sender][agentId] += uses;
        agentUsesSold[agentId] += uses;
        agentCreatorEarned[agentId] += toCreator;
        agentBurned[agentId] += burned;
        totalBurned += burned;
        totalToTreasury += toTreasury;
        emit UsesPurchased(msg.sender, agentId, uses, cost, toCreator, burned, toTreasury);
    }

    function pause() external onlyRole(GUARDIAN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
