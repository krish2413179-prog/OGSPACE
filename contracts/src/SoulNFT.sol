// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IAccount.sol";

/**
 * @title SoulNFT
 * @notice ERC-721 contract for minting behavioral models as Soul NFTs on MirrorMind.
 *         Each wallet may own at most one Soul NFT. The token URI points to the
 *         model metadata stored on 0G Storage.
 *
 *         Also implements the ERC-4337 IAccount interface as a stub to support
 *         agent wallet operations.
 *
 * Requirements: 6.2, 6.3, 6.4, 6.6, 6.7, 14.1, 14.6
 */
contract SoulNFT is ERC721, ERC721URIStorage, Ownable, IAccount {
    // -------------------------------------------------------------------------
    // Structs
    // -------------------------------------------------------------------------

    /**
     * @notice On-chain metadata stored for every minted Soul NFT.
     * @param totalActions        Number of on-chain actions used to train the model.
     * @param trainingTimestamp   Unix timestamp when the model was last trained.
     * @param performanceScore    Backtested quality score, scaled 0–10000 (i.e. 0.00–100.00).
     * @param isRentable          Whether the NFT is listed for rental.
     * @param rentalPricePerDay   Rental price in wei per day (0 when not rentable).
     * @param isForSale           Whether the NFT is listed for sale.
     * @param salePrice           Sale price in wei (0 when not for sale).
     */
    struct ModelMetadata {
        uint256 totalActions;
        uint256 trainingTimestamp;
        uint256 performanceScore; // 0–10000 (basis points of 100.00)
        bool isRentable;
        uint256 rentalPricePerDay; // in wei
        bool isForSale;
        uint256 salePrice; // in wei
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Maps token ID → 0G Storage CID for the model weights.
    mapping(uint256 => string) public modelCID;

    /// @notice Maps token ID → the wallet address that originally minted the NFT.
    mapping(uint256 => address) public originalWallet;

    /// @notice Maps token ID → on-chain ModelMetadata.
    mapping(uint256 => ModelMetadata) public metadata;

    /// @notice Maps wallet address → token ID (0 means no NFT minted yet).
    mapping(address => uint256) public walletToTokenId;

    /// @dev Auto-incrementing token ID counter; starts at 0, first token is 1.
    uint256 private _tokenIdCounter;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /**
     * @notice Emitted when a new Soul NFT is minted.
     * @param wallet   The wallet address that minted the NFT.
     * @param tokenId  The newly minted token ID.
     * @param modelCID The 0G Storage CID of the behavioral model.
     */
    event SoulMinted(address indexed wallet, uint256 tokenId, string modelCID);

    /**
     * @notice Emitted when a Soul NFT's model CID is updated.
     * @param tokenId  The token whose model was updated.
     * @param newCID   The new 0G Storage CID.
     */
    event ModelUpdated(uint256 tokenId, string newCID);

    /**
     * @notice Emitted when a Soul NFT's rental configuration is set.
     * @param tokenId     The token being listed for rental.
     * @param pricePerDay The rental price in wei per day.
     */
    event RentalSet(uint256 tokenId, uint256 pricePerDay);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address initialOwner)
        ERC721("SoulNFT", "SOUL")
        Ownable(initialOwner)
    {}

    // -------------------------------------------------------------------------
    // Minting
    // -------------------------------------------------------------------------

    /**
     * @notice Mint a Soul NFT for the calling wallet.
     * @dev    Enforces one NFT per wallet. Stores the CID and metadata on-chain.
     *         Emits {SoulMinted}.
     * @param _modelCID  The 0G Storage CID of the behavioral model weights.
     * @param _meta      The ModelMetadata to store on-chain.
     * @return tokenId   The newly minted token ID (starts at 1).
     */
    function mint(string calldata _modelCID, ModelMetadata calldata _meta)
        external
        returns (uint256)
    {
        require(
            walletToTokenId[msg.sender] == 0,
            "SoulNFT: wallet already has a Soul NFT"
        );

        _tokenIdCounter += 1;
        uint256 tokenId = _tokenIdCounter;

        _safeMint(msg.sender, tokenId);

        modelCID[tokenId] = _modelCID;
        originalWallet[tokenId] = msg.sender;
        metadata[tokenId] = _meta;
        walletToTokenId[msg.sender] = tokenId;

        emit SoulMinted(msg.sender, tokenId, _modelCID);

        return tokenId;
    }

    // -------------------------------------------------------------------------
    // Model updates
    // -------------------------------------------------------------------------

    /**
     * @notice Update the model CID and training timestamp for an existing Soul NFT.
     * @dev    Only callable by the current token owner.
     *         Emits {ModelUpdated}.
     * @param tokenId       The token to update.
     * @param newCID        The new 0G Storage CID.
     * @param newTimestamp  The new training timestamp (Unix seconds).
     */
    function updateModel(
        uint256 tokenId,
        string calldata newCID,
        uint256 newTimestamp
    ) external {
        require(
            ownerOf(tokenId) == msg.sender,
            "SoulNFT: caller is not the token owner"
        );

        modelCID[tokenId] = newCID;
        metadata[tokenId].trainingTimestamp = newTimestamp;

        emit ModelUpdated(tokenId, newCID);
    }

    // -------------------------------------------------------------------------
    // Rental and sale configuration
    // -------------------------------------------------------------------------

    /**
     * @notice Enable rental for a Soul NFT and set the daily price.
     * @dev    Only callable by the current token owner.
     *         Emits {RentalSet}.
     * @param tokenId     The token to list for rental.
     * @param pricePerDay The rental price in wei per day.
     */
    function setRental(uint256 tokenId, uint256 pricePerDay) external {
        require(
            ownerOf(tokenId) == msg.sender,
            "SoulNFT: caller is not the token owner"
        );

        metadata[tokenId].isRentable = true;
        metadata[tokenId].rentalPricePerDay = pricePerDay;

        emit RentalSet(tokenId, pricePerDay);
    }

    /**
     * @notice Enable sale for a Soul NFT and set the sale price.
     * @dev    Only callable by the current token owner.
     * @param tokenId The token to list for sale.
     * @param price   The sale price in wei.
     */
    function setSale(uint256 tokenId, uint256 price) external {
        require(
            ownerOf(tokenId) == msg.sender,
            "SoulNFT: caller is not the token owner"
        );

        metadata[tokenId].isForSale = true;
        metadata[tokenId].salePrice = price;
    }

    // -------------------------------------------------------------------------
    // Token URI
    // -------------------------------------------------------------------------

    /**
     * @notice Returns the metadata URI for a given token.
     * @dev    Constructs the URI from the 0G Storage CID stored on-chain.
     *         Format: "https://storage.0g.ai/{cid}/metadata.json"
     * @param tokenId The token to query.
     * @return        The full metadata URI string.
     */
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        _requireOwned(tokenId);
        return string.concat(
            "https://storage.0g.ai/",
            modelCID[tokenId],
            "/metadata.json"
        );
    }

    // -------------------------------------------------------------------------
    // ERC-4337 IAccount stub
    // -------------------------------------------------------------------------

    /**
     * @notice ERC-4337 account validation stub for agent wallet operations.
     * @dev    Returns 0 (success) unconditionally. This is a stub implementation
     *         that satisfies the IAccount interface; a production deployment would
     *         validate the user operation signature against the token owner.
     *         All parameters are intentionally unnamed — this is a no-op stub.
     * @return validationData Always 0 (success) in this stub.
     */
    function validateUserOp(
        UserOperation calldata, /* userOp */
        bytes32, /* userOpHash */
        uint256 /* missingAccountFunds */
    ) external pure override returns (uint256 validationData) {
        return 0;
    }

    // -------------------------------------------------------------------------
    // ERC-165 supportsInterface override
    // -------------------------------------------------------------------------

    /**
     * @inheritdoc ERC721
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
