// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SageQuote} from "./SageQuote.sol";

/// @title AgentRegistry
/// @notice The list of StockSage agents. A creator deploys an agent by paying a fee in $SAGE, set in ETH and converted
///         at the oracle rate: `deploymentBurnBps` of it goes to the burn address and the rest to the treasury.
///         On-chain, an agent is its creator, its price per use in ETH and the hash of its configuration, so anyone
///         can check that the configuration the app serves is the one the creator deployed.
/// @dev Only an agent's creator can change it. Until $SAGE is set, only the owner can deploy agents, for free.
contract AgentRegistry is SageQuote {
    struct Agent {
        address creator;
        uint64 createdAt;
        uint32 version;
        bool active;
        uint256 pricePerUseWei;
        bytes32 configHash;
        string name;
        string metadataURI;
    }

    uint256 public agentCount;
    mapping(uint256 agentId => Agent) private _agents;
    mapping(address creator => uint256[]) private _agentsOf;
    uint256 public deploymentFeeWei = 0.005 ether;
    uint16 public deploymentBurnBps = 8_000;

    event AgentDeployed(
        uint256 indexed agentId,
        address indexed creator,
        string name,
        uint256 pricePerUseWei,
        bytes32 configHash,
        string metadataURI,
        uint256 sagePaid,
        uint256 sageBurned
    );
    event AgentUpdated(uint256 indexed agentId, uint32 version, bytes32 configHash, string metadataURI);
    event AgentPriceUpdated(uint256 indexed agentId, uint256 pricePerUseWei);
    event AgentActiveSet(uint256 indexed agentId, bool active);
    event DeploymentFeeUpdated(uint256 feeWei, uint16 burnBps);

    error UnknownAgent();
    error NotCreator();
    error EmptyName();

    constructor(address initialOwner, address oracle_, address treasury_) Ownable(initialOwner) {
        _setAddresses(oracle_, treasury_);
    }

    // ---------------------------------------------------------------- reads

    function getAgent(uint256 agentId) external view returns (Agent memory) {
        return _agents[agentId];
    }

    function agentsOf(address creator) external view returns (uint256[] memory) {
        return _agentsOf[creator];
    }

    // ---------------------------------------------------------------- creators

    /// @notice Deploys an agent. Approve this contract for up to `maxSageFee` $SAGE first.
    function deployAgent(
        string calldata name,
        string calldata metadataURI,
        bytes32 configHash,
        uint256 pricePerUseWei,
        uint256 maxSageFee
    ) external whenNotPaused returns (uint256 agentId) {
        if (bytes(name).length == 0) revert EmptyName();
        uint256 fee;
        uint256 burned;
        if (address(sage) == address(0)) {
            if (msg.sender != owner()) revert TokenNotSet();
        } else {
            fee = quoteSage(deploymentFeeWei);
            if (fee > maxSageFee) revert CostExceedsMax(fee, maxSageFee);
            burned = (fee * deploymentBurnBps) / 10_000;
        }

        agentId = ++agentCount;
        _agents[agentId] = Agent({
            creator: msg.sender,
            createdAt: uint64(block.timestamp),
            version: 1,
            active: true,
            pricePerUseWei: pricePerUseWei,
            configHash: configHash,
            name: name,
            metadataURI: metadataURI
        });
        _agentsOf[msg.sender].push(agentId);

        if (fee != 0) {
            _burnFrom(msg.sender, burned);
            _pay(msg.sender, treasury, fee - burned);
        }
        emit AgentDeployed(agentId, msg.sender, name, pricePerUseWei, configHash, metadataURI, fee, burned);
    }

    function updateAgent(uint256 agentId, bytes32 configHash, string calldata metadataURI) external {
        Agent storage a = _creatorOnly(agentId);
        a.version += 1;
        a.configHash = configHash;
        a.metadataURI = metadataURI;
        emit AgentUpdated(agentId, a.version, configHash, metadataURI);
    }

    function setPrice(uint256 agentId, uint256 pricePerUseWei) external {
        _creatorOnly(agentId).pricePerUseWei = pricePerUseWei;
        emit AgentPriceUpdated(agentId, pricePerUseWei);
    }

    function setActive(uint256 agentId, bool active) external {
        _creatorOnly(agentId).active = active;
        emit AgentActiveSet(agentId, active);
    }

    // ---------------------------------------------------------------- owner

    function setDeploymentFee(uint256 feeWei, uint16 burnBps) external onlyOwner {
        if (burnBps > 10_000) revert InvalidSplit();
        deploymentFeeWei = feeWei;
        deploymentBurnBps = burnBps;
        emit DeploymentFeeUpdated(feeWei, burnBps);
    }

    // ---------------------------------------------------------------- internal

    function _creatorOnly(uint256 agentId) private view returns (Agent storage a) {
        a = _agents[agentId];
        if (a.creator == address(0)) revert UnknownAgent();
        if (a.creator != msg.sender) revert NotCreator();
    }
}
