
import { Indexer } from "@0gfoundation/0g-storage-ts-sdk";
import { ethers } from "ethers";

async function main() {
    // We don't need a real URL to just see the contract definition
    const indexer = new Indexer("http://localhost:5678");
    // The SDK likely has the Flow contract ABI embedded or accessible
    // Let's try to find it in the indexer object or prototype
    console.log("Indexer prototype keys:", Object.keys(Object.getPrototypeOf(indexer)));
}

main().catch(console.error);
