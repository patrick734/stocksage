// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SageQuote} from "./SageQuote.sol";
import {AgentRegistry} from "./AgentRegistry.sol";

/// @title AgentMarket
/// @notice Users buy uses of a StockSage agent in $SAGE, at the creator's price in ETH converted at the oracle rate.
///         Every payment is split in the same transaction: `creatorBps` to the agent's creator, `burnBps` to the burn
///         address and the rest to the treasury. `usesPurchased` is the on-chain record the app checks before it
///         serves an agent.
contract AgentMarket is SageQuote {
    AgentRegistry public immutable registry;

    uint16 public creatorBps = 6_000;
    uint16 public burnBps = 3_000;

    mapping(address buyer => mapping(uint256 agentId => uint256)) public usesPurchased;
    mapping(uint256 agentId => uint256) public agentUsesSold;
    mapping(uint256 agentId => uint256) public agentCreatorEarned;
    mapping(uint256 agentId => uint256) public agentBurned;
    uint256 public totalBurned;

    event UsesPurchased(
        address indexed buyer,
        uint256 indexed agentId,
        uint256 uses,
        uint256 sageCost,
        uint256 toCreator,
        uint256 burned,
        uint256 toTreasury
    );
    event SplitUpdated(uint16 creatorBps, uint16 burnBps);

    error ZeroUses();
    error AgentInactive();
    error AgentIsFree();

    constructor(address initialOwner, address registry_, address oracle_, address treasury_) Ownable(initialOwner) {
        if (registry_ == address(0)) revert ZeroAddress();
        registry = AgentRegistry(registry_);
        _setAddresses(oracle_, treasury_);
    }

    /// @notice $SAGE cost of `uses` uses at the agent's current price.
    function quoteUses(uint256 agentId, uint256 uses) external view returns (uint256) {
        return quoteSage(registry.getAgent(agentId).pricePerUseWei * uses);
    }

    /// @notice Buys `uses` uses of an agent. Approve this contract for up to `maxSageCost` $SAGE first.
    function purchaseUses(uint256 agentId, uint256 uses, uint256 maxSageCost) external whenNotPaused {
        if (address(sage) == address(0)) revert TokenNotSet();
        if (uses == 0) revert ZeroUses();
        AgentRegistry.Agent memory a = registry.getAgent(agentId);
        if (!a.active) revert AgentInactive();
        if (a.pricePerUseWei == 0) revert AgentIsFree();

        uint256 cost = quoteSage(a.pricePerUseWei * uses);
        if (cost > maxSageCost) revert CostExceedsMax(cost, maxSageCost);
        uint256 toCreator = (cost * creatorBps) / 10_000;
        uint256 burned = (cost * burnBps) / 10_000;
        uint256 toTreasury = cost - toCreator - burned;

        usesPurchased[msg.sender][agentId] += uses;
        agentUsesSold[agentId] += uses;
        agentCreatorEarned[agentId] += toCreator;
        agentBurned[agentId] += burned;
        totalBurned += burned;

        _pay(msg.sender, a.creator, toCreator);
        _burnFrom(msg.sender, burned);
        _pay(msg.sender, treasury, toTreasury);
        emit UsesPurchased(msg.sender, agentId, uses, cost, toCreator, burned, toTreasury);
    }

    // ---------------------------------------------------------------- owner

    function setSplit(uint16 creatorBps_, uint16 burnBps_) external onlyOwner {
        if (uint256(creatorBps_) + burnBps_ > 10_000) revert InvalidSplit();
        creatorBps = creatorBps_;
        burnBps = burnBps_;
        emit SplitUpdated(creatorBps_, burnBps_);
    }
}
