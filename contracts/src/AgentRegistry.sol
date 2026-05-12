// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AgentRegistry
 * @notice Registers agents with 0G Agent IDs, links them to Soul NFTs, and
 *         tracks active deployments on MirrorMind.
 *
 *         Each wallet may register at most one active agent at a time.
 *         The `recordAction` function is restricted to the registered
 *         `agentAddress` for each agent owner, enforcing that only the
 *         authorized backend EOA/contract can increment the action counter.
 *
 * Requirements: 4.1, 4.3, 4.8, 14.3, 14.4
 */
contract AgentRegistry is Ownable {
    // -------------------------------------------------------------------------
    // Enums
    // -------------------------------------------------------------------------

    /// @notice The three operating modes an agent can be in.
    enum AgentMode { OBSERVE, SUGGEST, EXECUTE }

    /// @notice The lifecycle status of an agent registration.
    enum AgentStatus { INACTIVE, ACTIVE }

    // -------------------------------------------------------------------------
    // Structs
    // -------------------------------------------------------------------------

    /**
     * @notice On-chain record for a registered agent.
     * @param owner         The wallet address that owns this agent.
     * @param agentId       The 0G Agent ID (off-chain identifier).
     * @param soulTokenId   The linked Soul NFT token ID; 0 means the agent
     *                      uses its own model CID (no Soul NFT minted yet).
     * @param isActive      Whether the agent is currently active.
     * @param deployedAt    Unix timestamp when the agent was registered.
     * @param totalActions  Cumulative count of recorded actions.
     * @param mode          Current operating mode (OBSERVE / SUGGEST / EXECUTE).
     * @param agentAddress  The EOA or contract authorized to call `recordAction`.
     */
    struct AgentRecord {
        address owner;
        string agentId;
        uint256 soulTokenId;
        bool isActive;
        uint256 deployedAt;
        uint256 totalActions;
        AgentMode mode;
        address agentAddress;
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Maps owner address → agent record.
    mapping(address => AgentRecord) public agents;

    /// @notice Maps 0G Agent ID → owner address.
    mapping(string => address) public agentIdToOwner;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event AgentRegistered(
        address indexed owner,
        string agentId,
        uint256 soulTokenId,
        AgentMode mode
    );

    event ModeUpdated(address indexed owner, AgentMode newMode);

    event ActionRecorded(address indexed agentOwner, uint256 totalActions);

    event AgentDeactivated(address indexed owner);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address _owner) Ownable(_owner) {}

    // -------------------------------------------------------------------------
    // External functions
    // -------------------------------------------------------------------------

    /**
     * @notice Register a new agent for the calling wallet.
     */
    function registerAgent(
        string calldata agentId,
        uint256 soulTokenId,
        AgentMode mode,
        address agentAddress
    ) external {
        require(
            !agents[msg.sender].isActive,
            "AgentRegistry: agent already registered"
        );
        require(
            agentIdToOwner[agentId] == address(0),
            "AgentRegistry: agentId already registered"
        );

        agents[msg.sender] = AgentRecord({
            owner: msg.sender,
            agentId: agentId,
            soulTokenId: soulTokenId,
            isActive: true,
            deployedAt: block.timestamp,
            totalActions: 0,
            mode: mode,
            agentAddress: agentAddress
        });

        agentIdToOwner[agentId] = msg.sender;

        emit AgentRegistered(msg.sender, agentId, soulTokenId, mode);
    }

    /**
     * @notice Update the operating mode of the caller's active agent.
     */
    function updateMode(AgentMode newMode) external {
        require(
            agents[msg.sender].isActive,
            "AgentRegistry: no active agent"
        );

        agents[msg.sender].mode = newMode;

        emit ModeUpdated(msg.sender, newMode);
    }

    /**
     * @notice Record an action performed by the agent on behalf of `agentOwner`.
     * @dev    Only the registered `agentAddress` for `agentOwner` may call this.
     */
    function recordAction(address agentOwner) external {
        require(
            msg.sender == agents[agentOwner].agentAddress,
            "AgentRegistry: caller is not the agent address"
        );
        require(
            agents[agentOwner].isActive,
            "AgentRegistry: agent not active"
        );

        agents[agentOwner].totalActions += 1;

        emit ActionRecorded(agentOwner, agents[agentOwner].totalActions);
    }

    /**
     * @notice Deactivate the caller's active agent.
     */
    function deactivateAgent() external {
        require(
            agents[msg.sender].isActive,
            "AgentRegistry: no active agent"
        );

        agents[msg.sender].isActive = false;

        emit AgentDeactivated(msg.sender);
    }

    /**
     * @notice Return the full agent record for a given owner address.
     */
    function getAgent(address owner) external view returns (AgentRecord memory) {
        return agents[owner];
    }
}
