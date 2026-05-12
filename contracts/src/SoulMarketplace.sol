// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./SoulNFT.sol";

/**
 * @title SoulMarketplace
 * @notice Handles buying, renting, and licensing Soul NFTs on MirrorMind.
 *         Sellers and lessors accumulate earnings in `pendingEarnings` and
 *         withdraw them explicitly. A 2.5% platform fee is deducted from
 *         every transaction.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.8,
 *               8.9, 14.2, 14.4
 */
contract SoulMarketplace is ReentrancyGuard, Ownable {
    // -------------------------------------------------------------------------
    // Structs
    // -------------------------------------------------------------------------

    /**
     * @notice Describes a Soul NFT listed for rental.
     * @param owner       The address that created the listing (must own the token).
     * @param pricePerDay Rental price in wei per day.
     * @param active      Whether the listing is currently active.
     */
    struct RentalListing {
        address owner;
        uint256 pricePerDay; // in wei
        bool active;
    }

    /**
     * @notice Describes a Soul NFT listed for sale.
     * @param seller The address that created the listing (must own the token).
     * @param price  Sale price in wei.
     * @param active Whether the listing is currently active.
     */
    struct SaleListing {
        address seller;
        uint256 price; // in wei
        bool active;
    }

    /**
     * @notice Represents an active rental lease held by a renter.
     * @param startTime  Unix timestamp when the lease began.
     * @param endTime    Unix timestamp when the lease expires.
     * @param dailyPrice The per-day price paid (in wei) at the time of rental.
     */
    struct RentalLease {
        uint256 startTime;
        uint256 endTime;
        uint256 dailyPrice;
    }

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Platform fee in basis points (250 bps = 2.5%).
    uint256 public constant PLATFORM_FEE_BPS = 250;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Maps token ID → active rental listing.
    mapping(uint256 => RentalListing) public rentalListings;

    /// @notice Maps token ID → active sale listing.
    mapping(uint256 => SaleListing) public saleListings;

    /// @notice Maps renter address → token ID → active lease.
    mapping(address => mapping(uint256 => RentalLease)) public activeLeases;

    /// @notice Accumulated earnings per seller / lessor, withdrawable at any time.
    mapping(address => uint256) public pendingEarnings;

    /// @notice Address that receives the platform fee on every transaction.
    address public feeRecipient;

    /// @notice The SoulNFT contract whose tokens are traded on this marketplace.
    SoulNFT public immutable soulNFT;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when a token is listed for rental.
    event RentalListed(uint256 indexed tokenId, address indexed owner, uint256 pricePerDay);

    /// @notice Emitted when a rental listing is cancelled.
    event RentalCancelled(uint256 indexed tokenId);

    /// @notice Emitted when a token is listed for sale.
    event SaleListed(uint256 indexed tokenId, address indexed seller, uint256 price);

    /// @notice Emitted when a sale listing is cancelled.
    event SaleCancelled(uint256 indexed tokenId);

    /// @notice Emitted when a token is successfully rented.
    event Rented(
        uint256 indexed tokenId,
        address indexed renter,
        uint256 durationDays,
        uint256 endTime
    );

    /// @notice Emitted when a token is successfully purchased.
    event Sold(uint256 indexed tokenId, address indexed buyer, uint256 price);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @param _soulNFT      Address of the deployed SoulNFT contract.
     * @param _feeRecipient Address that receives the 2.5% platform fee.
     * @param _owner        Initial owner of this contract (for Ownable).
     */
    constructor(address _soulNFT, address _feeRecipient, address _owner)
        Ownable(_owner)
    {
        soulNFT = SoulNFT(_soulNFT);
        feeRecipient = _feeRecipient;
    }

    // -------------------------------------------------------------------------
    // Listing — Rental
    // -------------------------------------------------------------------------

    /**
     * @notice List a Soul NFT for rental.
     * @dev    Caller must own the token. Overwrites any previous listing for
     *         the same token. Emits {RentalListed}.
     * @param tokenId     The token to list.
     * @param pricePerDay The rental price in wei per day.
     */
    function listForRent(uint256 tokenId, uint256 pricePerDay) external {
        require(
            soulNFT.ownerOf(tokenId) == msg.sender,
            "SoulMarketplace: not token owner"
        );

        rentalListings[tokenId] = RentalListing({
            owner: msg.sender,
            pricePerDay: pricePerDay,
            active: true
        });

        emit RentalListed(tokenId, msg.sender, pricePerDay);
    }

    /**
     * @notice Cancel an active rental listing.
     * @dev    Caller must be the listing owner. Emits {RentalCancelled}.
     * @param tokenId The token whose rental listing to cancel.
     */
    function cancelRentalListing(uint256 tokenId) external {
        require(
            rentalListings[tokenId].owner == msg.sender,
            "SoulMarketplace: not listing owner"
        );

        rentalListings[tokenId].active = false;

        emit RentalCancelled(tokenId);
    }

    // -------------------------------------------------------------------------
    // Listing — Sale
    // -------------------------------------------------------------------------

    /**
     * @notice List a Soul NFT for sale.
     * @dev    Caller must own the token. Overwrites any previous listing for
     *         the same token. Emits {SaleListed}.
     * @param tokenId The token to list.
     * @param price   The sale price in wei.
     */
    function listForSale(uint256 tokenId, uint256 price) external {
        require(
            soulNFT.ownerOf(tokenId) == msg.sender,
            "SoulMarketplace: not token owner"
        );

        saleListings[tokenId] = SaleListing({
            seller: msg.sender,
            price: price,
            active: true
        });

        emit SaleListed(tokenId, msg.sender, price);
    }

    /**
     * @notice Cancel an active sale listing.
     * @dev    Caller must be the listing seller. Emits {SaleCancelled}.
     * @param tokenId The token whose sale listing to cancel.
     */
    function cancelSaleListing(uint256 tokenId) external {
        require(
            saleListings[tokenId].seller == msg.sender,
            "SoulMarketplace: not listing seller"
        );

        saleListings[tokenId].active = false;

        emit SaleCancelled(tokenId);
    }

    // -------------------------------------------------------------------------
    // Transacting — Rent
    // -------------------------------------------------------------------------

    /**
     * @notice Rent a Soul NFT for a given number of days.
     * @dev    The listing must be active. `msg.value` must equal
     *         `pricePerDay * durationDays` exactly. A 2.5% platform fee is
     *         deducted; the remainder is added to the listing owner's
     *         `pendingEarnings`. Emits {Rented}.
     * @param tokenId      The token to rent.
     * @param durationDays The rental duration in days (must be > 0).
     */
    function rent(uint256 tokenId, uint256 durationDays)
        external
        payable
        nonReentrant
    {
        RentalListing storage listing = rentalListings[tokenId];
        require(listing.active, "SoulMarketplace: rental not active");

        uint256 totalCost = listing.pricePerDay * durationDays;
        require(msg.value == totalCost, "SoulMarketplace: incorrect payment");

        uint256 fee = (msg.value * PLATFORM_FEE_BPS) / 10_000;
        uint256 sellerAmount = msg.value - fee;

        // Accumulate earnings for the listing owner.
        pendingEarnings[listing.owner] += sellerAmount;

        // Transfer platform fee to fee recipient.
        (bool feeSuccess,) = feeRecipient.call{value: fee}("");
        require(feeSuccess, "SoulMarketplace: fee transfer failed");

        // Record the lease.
        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + durationDays * 86_400;

        activeLeases[msg.sender][tokenId] = RentalLease({
            startTime: startTime,
            endTime: endTime,
            dailyPrice: listing.pricePerDay
        });

        emit Rented(tokenId, msg.sender, durationDays, endTime);
    }

    // -------------------------------------------------------------------------
    // Transacting — Buy
    // -------------------------------------------------------------------------

    /**
     * @notice Purchase a Soul NFT listed for sale.
     * @dev    The listing must be active. `msg.value` must equal the listing
     *         price exactly. A 2.5% platform fee is deducted; the remainder
     *         is added to the seller's `pendingEarnings`. The NFT is
     *         transferred to the buyer and the listing is deactivated.
     *         Emits {Sold}.
     * @param tokenId The token to purchase.
     */
    function buy(uint256 tokenId) external payable nonReentrant {
        SaleListing storage listing = saleListings[tokenId];
        require(listing.active, "SoulMarketplace: sale not active");
        require(msg.value == listing.price, "SoulMarketplace: incorrect payment");

        uint256 fee = (msg.value * PLATFORM_FEE_BPS) / 10_000;
        uint256 sellerAmount = msg.value - fee;

        address seller = listing.seller;

        // Deactivate listing before external calls (checks-effects-interactions).
        listing.active = false;

        // Accumulate earnings for the seller.
        pendingEarnings[seller] += sellerAmount;

        // Transfer platform fee to fee recipient.
        (bool feeSuccess,) = feeRecipient.call{value: fee}("");
        require(feeSuccess, "SoulMarketplace: fee transfer failed");

        // Transfer the NFT to the buyer.
        soulNFT.transferFrom(seller, msg.sender, tokenId);

        emit Sold(tokenId, msg.sender, msg.value);
    }

    // -------------------------------------------------------------------------
    // Earnings withdrawal
    // -------------------------------------------------------------------------

    /**
     * @notice Withdraw all accumulated earnings for the caller.
     * @dev    Reverts if there are no earnings to withdraw. Uses the
     *         checks-effects-interactions pattern to prevent reentrancy.
     *         Protected by {ReentrancyGuard} as an additional safeguard.
     */
    function withdrawEarnings() external nonReentrant {
        uint256 amount = pendingEarnings[msg.sender];
        require(amount > 0, "SoulMarketplace: no earnings to withdraw");

        // Zero out before transfer (checks-effects-interactions).
        pendingEarnings[msg.sender] = 0;

        (bool success,) = msg.sender.call{value: amount}("");
        require(success, "SoulMarketplace: withdrawal failed");
    }

    // -------------------------------------------------------------------------
    // View helpers
    // -------------------------------------------------------------------------

    /**
     * @notice Returns whether a renter's lease for a given token is currently active.
     * @param renter  The address of the renter.
     * @param tokenId The token ID being queried.
     * @return        `true` if the current block timestamp is before the lease end time.
     */
    function isLeaseActive(address renter, uint256 tokenId)
        external
        view
        returns (bool)
    {
        return block.timestamp < activeLeases[renter][tokenId].endTime;
    }
}
