// Contract addresses from environment variables
export const CONTRACT_ADDRESSES = {
  soulNft: (process.env.SOUL_NFT_ADDRESS ??
    "0x0000000000000000000000000000000000000000") as `0x${string}`,
  marketplace: (process.env.MARKETPLACE_ADDRESS ??
    "0x0000000000000000000000000000000000000000") as `0x${string}`,
  agentRegistry: (process.env.AGENT_REGISTRY_ADDRESS ??
    "0x0000000000000000000000000000000000000000") as `0x${string}`,
} as const;

// Minimal ABI for SoulNFT contract — only the functions the API needs
export const SOUL_NFT_ABI = [
  {
    name: "mint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "ogStorageCid", type: "string" },
      { name: "totalActions", type: "uint256" },
      { name: "performanceScore", type: "uint256" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    name: "updateModel",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "newCid", type: "string" },
      { name: "newTimestamp", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "tokenURI",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "walletToTokenId",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "Transfer",
    type: "event",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
    ],
  },
] as const;

// Minimal ABI for SoulMarketplace contract
export const SOUL_MARKETPLACE_ABI = [
  {
    name: "listForRent",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "pricePerDay", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "cancelRentalListing",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "listForSale",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "price", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "cancelSaleListing",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "rent",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "durationDays", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "buy",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "isLeaseActive",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "renter", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "RentalStarted",
    type: "event",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "renter", type: "address", indexed: true },
      { name: "durationDays", type: "uint256", indexed: false },
    ],
  },
  {
    name: "SaleCompleted",
    type: "event",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "price", type: "uint256", indexed: false },
    ],
  },
] as const;

// Minimal ABI for AgentRegistry contract
export const AGENT_REGISTRY_ABI = [
  {
    name: "registerAgent",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "ogAgentId", type: "string" },
      { name: "soulTokenId", type: "uint256" },
      { name: "modelCid", type: "string" },
      { name: "mode", type: "uint8" },
      { name: "agentAddress", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "updateMode",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "ogAgentId", type: "string" },
      { name: "mode", type: "uint8" },
    ],
    outputs: [],
  },
  {
    name: "deactivateAgent",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "ogAgentId", type: "string" }],
    outputs: [],
  },
  {
    name: "recordAction",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "ogAgentId", type: "string" },
      { name: "actionType", type: "string" },
      { name: "txHash", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "AgentRegistered",
    type: "event",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "ogAgentId", type: "string", indexed: false },
    ],
  },
] as const;
