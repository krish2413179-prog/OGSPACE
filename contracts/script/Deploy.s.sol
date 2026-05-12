// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/SoulNFT.sol";
import "../src/SoulMarketplace.sol";
import "../src/AgentRegistry.sol";

/**
 * @title DeployScript
 * @notice Deploys SoulNFT, SoulMarketplace, and AgentRegistry to 0G Chain.
 *
 * Usage:
 *   forge script script/Deploy.s.sol \
 *     --rpc-url $OG_RPC_URL \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast \
 *     --verify
 *
 * Requirements: 14.5
 */
contract DeployScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        // Fee recipient defaults to deployer; override via FEE_RECIPIENT env var.
        address feeRecipient = vm.envOr("FEE_RECIPIENT", deployer);

        console.log("Deployer:      ", deployer);
        console.log("Fee Recipient: ", feeRecipient);
        console.log("Chain ID:      ", block.chainid);

        vm.startBroadcast(deployerKey);

        // 1. Deploy SoulNFT
        SoulNFT nft = new SoulNFT(deployer);
        console.log("SoulNFT deployed at:       ", address(nft));

        // 2. Deploy SoulMarketplace (references SoulNFT)
        SoulMarketplace marketplace = new SoulMarketplace(
            address(nft),
            feeRecipient,
            deployer
        );
        console.log("SoulMarketplace deployed at:", address(marketplace));

        // 3. Deploy AgentRegistry
        AgentRegistry registry = new AgentRegistry(deployer);
        console.log("AgentRegistry deployed at: ", address(registry));

        vm.stopBroadcast();

        // Print env var block for easy copy-paste into .env
        console.log("\n--- Copy these into your .env ---");
        console.log("SOUL_NFT_ADDRESS=", address(nft));
        console.log("MARKETPLACE_ADDRESS=", address(marketplace));
        console.log("AGENT_REGISTRY_ADDRESS=", address(registry));
    }
}
