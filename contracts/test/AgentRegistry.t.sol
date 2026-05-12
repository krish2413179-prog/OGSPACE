// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AgentRegistry.sol";

/**
 * @title AgentRegistryTest
 * @notice Unit tests for AgentRegistry.sol.
 *         Fuzz / property tests are in AgentRegistryFuzz.t.sol (Task 2.6).
 */
contract AgentRegistryTest is Test {
    AgentRegistry internal registry;

    address internal constant DEPLOYER      = address(0xDEAD);
    address internal constant ALICE         = address(0x1111);
    address internal constant BOB           = address(0x2222);
    address internal constant ALICE_AGENT   = address(0xAAAA);
    address internal constant BOB_AGENT     = address(0xBBBB);
    address internal constant RANDOM_CALLER = address(0x9999);

    string internal constant AGENT_ID_A = "0g-agent-alice-001";
    string internal constant AGENT_ID_B = "0g-agent-bob-001";

    function setUp() public {
        registry = new AgentRegistry(DEPLOYER);
    }

    function _registerAlice() internal {
        vm.prank(ALICE);
        registry.registerAgent(
            AGENT_ID_A,
            0,
            AgentRegistry.AgentMode.OBSERVE,
            ALICE_AGENT
        );
    }

    function test_registerAgent_success() public {
        uint256 soulTokenId = 7;
        AgentRegistry.AgentMode mode = AgentRegistry.AgentMode.SUGGEST;

        vm.prank(ALICE);
        vm.expectEmit(true, false, false, true);
        emit AgentRegistry.AgentRegistered(ALICE, AGENT_ID_A, soulTokenId, mode);

        registry.registerAgent(AGENT_ID_A, soulTokenId, mode, ALICE_AGENT);

        AgentRegistry.AgentRecord memory rec = registry.getAgent(ALICE);

        assertEq(rec.owner,        ALICE);
        assertEq(rec.agentId,      AGENT_ID_A);
        assertEq(rec.soulTokenId,  soulTokenId);
        assertTrue(rec.isActive);
        assertEq(rec.deployedAt,   block.timestamp);
        assertEq(rec.totalActions, 0);
        assertEq(uint256(rec.mode), uint256(mode));
        assertEq(rec.agentAddress, ALICE_AGENT);
        assertEq(registry.agentIdToOwner(AGENT_ID_A), ALICE);
    }

    function test_registerAgent_reverts_duplicate_owner() public {
        _registerAlice();

        vm.prank(ALICE);
        vm.expectRevert("AgentRegistry: agent already registered");
        registry.registerAgent("0g-agent-alice-002", 0, AgentRegistry.AgentMode.OBSERVE, ALICE_AGENT);
    }

    function test_registerAgent_reverts_duplicate_agentId() public {
        _registerAlice();

        vm.prank(BOB);
        vm.expectRevert("AgentRegistry: agentId already registered");
        registry.registerAgent(AGENT_ID_A, 0, AgentRegistry.AgentMode.OBSERVE, BOB_AGENT);
    }

    function test_updateMode_success() public {
        _registerAlice();

        AgentRegistry.AgentMode newMode = AgentRegistry.AgentMode.EXECUTE;

        vm.prank(ALICE);
        vm.expectEmit(true, false, false, true);
        emit AgentRegistry.ModeUpdated(ALICE, newMode);

        registry.updateMode(newMode);

        AgentRegistry.AgentRecord memory rec = registry.getAgent(ALICE);
        assertEq(uint256(rec.mode), uint256(newMode));
    }

    function test_updateMode_reverts_no_agent() public {
        vm.prank(BOB);
        vm.expectRevert("AgentRegistry: no active agent");
        registry.updateMode(AgentRegistry.AgentMode.EXECUTE);
    }

    function test_recordAction_success() public {
        _registerAlice();

        vm.prank(ALICE_AGENT);
        vm.expectEmit(true, false, false, true);
        emit AgentRegistry.ActionRecorded(ALICE, 1);
        registry.recordAction(ALICE);

        assertEq(registry.getAgent(ALICE).totalActions, 1);

        vm.prank(ALICE_AGENT);
        registry.recordAction(ALICE);
        assertEq(registry.getAgent(ALICE).totalActions, 2);
    }

    function test_recordAction_reverts_wrong_caller() public {
        _registerAlice();

        vm.prank(RANDOM_CALLER);
        vm.expectRevert("AgentRegistry: caller is not the agent address");
        registry.recordAction(ALICE);
    }

    function test_recordAction_reverts_inactive_agent() public {
        _registerAlice();

        vm.prank(ALICE);
        registry.deactivateAgent();

        vm.prank(ALICE_AGENT);
        vm.expectRevert("AgentRegistry: agent not active");
        registry.recordAction(ALICE);
    }

    function test_deactivateAgent_success() public {
        _registerAlice();

        vm.prank(ALICE);
        vm.expectEmit(true, false, false, true);
        emit AgentRegistry.AgentDeactivated(ALICE);

        registry.deactivateAgent();

        assertFalse(registry.getAgent(ALICE).isActive);
    }

    function test_deactivateAgent_reverts_no_agent() public {
        vm.prank(BOB);
        vm.expectRevert("AgentRegistry: no active agent");
        registry.deactivateAgent();
    }

    function test_two_wallets_can_each_register() public {
        vm.prank(ALICE);
        registry.registerAgent(AGENT_ID_A, 0, AgentRegistry.AgentMode.OBSERVE, ALICE_AGENT);

        vm.prank(BOB);
        registry.registerAgent(AGENT_ID_B, 0, AgentRegistry.AgentMode.SUGGEST, BOB_AGENT);

        assertTrue(registry.getAgent(ALICE).isActive);
        assertTrue(registry.getAgent(BOB).isActive);
    }

    function test_reregister_after_deactivation() public {
        _registerAlice();

        vm.prank(ALICE);
        registry.deactivateAgent();

        string memory newAgentId = "0g-agent-alice-v2";
        vm.prank(ALICE);
        registry.registerAgent(newAgentId, 0, AgentRegistry.AgentMode.EXECUTE, ALICE_AGENT);

        AgentRegistry.AgentRecord memory rec = registry.getAgent(ALICE);
        assertTrue(rec.isActive);
        assertEq(rec.agentId, newAgentId);
    }
}
