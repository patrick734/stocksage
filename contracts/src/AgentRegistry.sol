// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {GovernanceChecks} from "./governance/GovernanceChecks.sol";
import {TokenBurn} from "./libraries/TokenBurn.sol";
import {TokenOracle} from "./TokenOracle.sol";

/// @title AgentRegistry
/// @notice The list of agents. A creator deploys an agent by paying a fee in the token, set in ETH and
///         converted at the oracle price: 80% of it is burned and 20% goes to the treasury. On-chain, an agent is
///         its creator, its price per use in ETH, and the hash of its configuration (purpose, personality, tools),
///         so anyone can check that the configuration an app serves is the one the creator deployed.
/// @dev Only an agent's creator can change it. The admin (the 48h timelock) sets the token once and can change the
///      deployment fee within a hard cap. The guardian can pause new deployments and block an agent from sale; only
///      the admin can undo either. Nobody can move a creator's earnings: they are paid out in the same transaction
///      as the purchase.
contract AgentRegistry is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    string public constant VERSION = "1.0.0";
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    uint16 public constant DEPLOY_BURN_BPS = 8_000;
    uint256 public constant MAX_DEPLOYMENT_FEE = 1 ether;
    uint256 public constant MAX_PRICE_PER_USE = 1 ether;
    uint256 public constant MAX_NAME_BYTES = 64;
    uint256 public constant MAX_URI_BYTES = 512;

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

    /// @notice An agent written in at deployment, owned by the treasury.
    struct Seed {
        string name;
        string metadataURI;
        bytes32 configHash;
        uint256 pricePerUseWei;
    }

    TokenOracle public immutable oracle;
    address public immutable treasury;

    IERC20 public token;
    uint256 public deploymentFeeWei;
    uint256 public totalBurned;

    Agent[] private _agents; // agent id = index + 1
    mapping(uint256 agentId => bool) public blocked;

    event AgentDeployed(
        uint256 indexed agentId,
        address indexed creator,
        string name,
        uint256 pricePerUseWei,
        bytes32 configHash,
        string metadataURI,
        uint256 tokenPaid,
        uint256 tokenBurned
    );
    event AgentUpdated(uint256 indexed agentId, uint32 version, bytes32 configHash, string metadataURI);
    event PriceSet(uint256 indexed agentId, uint256 pricePerUseWei);
    event ActiveSet(uint256 indexed agentId, bool active);
    event NameSet(uint256 indexed agentId, string name);
    event BlockedSet(uint256 indexed agentId, bool blocked);
    event TokenSet(address indexed token);
    event DeploymentFeeSet(uint256 feeWei);

    error InvalidConfig();
    error TokenAlreadySet();
    error TokenUnset();
    error UnknownAgent(uint256 agentId);
    error NotCreator();
    error BadName();
    error BadURI();
    error PriceTooHigh();
    error FeeAboveMax(uint256 fee, uint256 maxFee);

    constructor(address admin, address guardian, TokenOracle oracle_, address treasury_, uint256 deploymentFeeWei_, Seed[] memory seeds) {
        GovernanceChecks.requireAdminAndGuardian(admin, guardian, msg.sender);
        if (address(oracle_).code.length == 0 || treasury_ == address(0)) revert InvalidConfig();
        oracle = oracle_;
        treasury = treasury_;
        _setDeploymentFee(deploymentFeeWei_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, guardian);
        for (uint256 i; i < seeds.length; i++) {
            Seed memory s = seeds[i];
            uint256 id = _add(treasury_, s.name, s.metadataURI, s.configHash, s.pricePerUseWei);
            emit AgentDeployed(id, treasury_, s.name, s.pricePerUseWei, s.configHash, s.metadataURI, 0, 0);
        }
    }

    // ---------------------------------------------------------------- reads

    function agentCount() external view returns (uint256) {
        return _agents.length;
    }

    function getAgent(uint256 agentId) public view returns (Agent memory) {
        return _agents[_index(agentId)];
    }

    /// @notice True when the agent exists, its creator has it on, and the guardian has not blocked it.
    function isPurchasable(uint256 agentId) external view returns (bool) {
        return agentId != 0 && agentId <= _agents.length && _agents[agentId - 1].active && !blocked[agentId];
    }

    /// @notice Token amount for an ETH amount at the oracle price, rounded up. Reverts when there is no fresh price.
    function quoteToken(uint256 weiAmount) public view returns (uint256) {
        if (weiAmount == 0) return 0;
        return Math.mulDiv(weiAmount, oracle.tokenPerEth(), 1e18, Math.Rounding.Ceil);
    }

    function deploymentFeeToken() external view returns (uint256) {
        return quoteToken(deploymentFeeWei);
    }

    // ---------------------------------------------------------------- creators

    /// @notice Deploys an agent. Approve this contract for up to `maxTokenFee` tokens first.
    function deployAgent(string calldata name, string calldata metadataURI, bytes32 configHash, uint256 pricePerUseWei, uint256 maxTokenFee)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 agentId)
    {
        uint256 fee = quoteToken(deploymentFeeWei);
        if (fee > maxTokenFee) revert FeeAboveMax(fee, maxTokenFee);
        uint256 burned;
        if (fee > 0) {
            IERC20 t = token;
            if (address(t) == address(0)) revert TokenUnset();
            t.safeTransferFrom(msg.sender, address(this), fee);
            burned = fee * DEPLOY_BURN_BPS / 10_000;
            TokenBurn.burn(t, burned);
            t.safeTransfer(treasury, fee - burned);
            totalBurned += burned;
        }
        agentId = _add(msg.sender, name, metadataURI, configHash, pricePerUseWei);
        emit AgentDeployed(agentId, msg.sender, name, pricePerUseWei, configHash, metadataURI, fee, burned);
    }

    function updateAgent(uint256 agentId, bytes32 configHash, string calldata metadataURI) external {
        Agent storage a = _creatorOnly(agentId);
        if (bytes(metadataURI).length > MAX_URI_BYTES) revert BadURI();
        a.configHash = configHash;
        a.metadataURI = metadataURI;
        a.version += 1;
        emit AgentUpdated(agentId, a.version, configHash, metadataURI);
    }

    function setPrice(uint256 agentId, uint256 pricePerUseWei) external {
        Agent storage a = _creatorOnly(agentId);
        if (pricePerUseWei > MAX_PRICE_PER_USE) revert PriceTooHigh();
        a.pricePerUseWei = pricePerUseWei;
        emit PriceSet(agentId, pricePerUseWei);
    }

    function setActive(uint256 agentId, bool active) external {
        _creatorOnly(agentId).active = active;
        emit ActiveSet(agentId, active);
    }

    function setName(uint256 agentId, string calldata name) external {
        Agent storage a = _creatorOnly(agentId);
        uint256 n = bytes(name).length;
        if (n == 0 || n > MAX_NAME_BYTES) revert BadName();
        a.name = name;
        emit NameSet(agentId, name);
    }

    // ---------------------------------------------------------------- governance

    /// @notice Sets the token after its Pons launch. Admin (timelock) only, and only once.
    function setToken(IERC20 token_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(token) != address(0)) revert TokenAlreadySet();
        if (address(token_).code.length == 0) revert InvalidConfig();
        token = token_;
        emit TokenSet(address(token_));
    }

    function setDeploymentFee(uint256 feeWei) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setDeploymentFee(feeWei);
    }

    function pause() external onlyRole(GUARDIAN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Takes an agent off sale (for example one that impersonates someone). Its record stays.
    function blockAgent(uint256 agentId) external onlyRole(GUARDIAN_ROLE) {
        _index(agentId);
        blocked[agentId] = true;
        emit BlockedSet(agentId, true);
    }

    function unblockAgent(uint256 agentId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _index(agentId);
        blocked[agentId] = false;
        emit BlockedSet(agentId, false);
    }

    // ---------------------------------------------------------------- internal

    function _add(address creator, string memory name, string memory metadataURI, bytes32 configHash, uint256 pricePerUseWei)
        private
        returns (uint256)
    {
        uint256 n = bytes(name).length;
        if (n == 0 || n > MAX_NAME_BYTES) revert BadName();
        if (bytes(metadataURI).length > MAX_URI_BYTES) revert BadURI();
        if (pricePerUseWei > MAX_PRICE_PER_USE) revert PriceTooHigh();
        _agents.push(
            Agent({
                creator: creator,
                createdAt: uint64(block.timestamp),
                version: 1,
                active: true,
                pricePerUseWei: pricePerUseWei,
                configHash: configHash,
                name: name,
                metadataURI: metadataURI
            })
        );
        return _agents.length;
    }

    function _creatorOnly(uint256 agentId) private view returns (Agent storage a) {
        a = _agents[_index(agentId)];
        if (a.creator != msg.sender) revert NotCreator();
    }

    function _index(uint256 agentId) private view returns (uint256) {
        if (agentId == 0 || agentId > _agents.length) revert UnknownAgent(agentId);
        return agentId - 1;
    }

    function _setDeploymentFee(uint256 feeWei) private {
        if (feeWei > MAX_DEPLOYMENT_FEE) revert InvalidConfig();
        deploymentFeeWei = feeWei;
        emit DeploymentFeeSet(feeWei);
    }
}
