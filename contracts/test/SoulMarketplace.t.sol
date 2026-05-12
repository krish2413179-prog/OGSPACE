// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/SoulNFT.sol";
import "../src/SoulMarketplace.sol";

/**
 * @title SoulMarketplaceTest
 * @notice Unit tests for SoulMarketplace.sol.
 *         Fuzz / property tests are in SoulMarketplaceFuzz.t.sol (Task 2.4).
 *
 * Tests:
 *   - test_listForRent_success
 *   - test_cancelRentalListing
 *   - test_listForSale_success
 *   - test_cancelSaleListing
 *   - test_rent_success
 *   - test_rent_reverts_wrong_payment
 *   - test_rent_reverts_not_active
 *   - test_buy_success
 *   - test_buy_reverts_wrong_payment
 *   - test_buy_reverts_not_active
 *   - test_withdrawEarnings_success
 *   - test_withdrawEarnings_reverts_no_earnings
 *   - test_isLeaseActive_true_and_false
 *   - test_platform_fee_calculation
 */
contract SoulMarketplaceTest is Test {
    SoulNFT internal nft;
    SoulMarketplace internal marketplace;

    address internal constant OWNER        = address(0xABCD);
    address internal constant FEE_RECIPIENT = address(0xFEE0);
    address internal constant ALICE        = address(0x1111); // NFT owner / seller
    address internal constant BOB          = address(0x2222); // buyer / renter

    string internal constant CID_A = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

    uint256 internal constant PRICE_PER_DAY = 1 ether;
    uint256 internal constant SALE_PRICE    = 10 ether;

    // -------------------------------------------------------------------------
    // Setup
    // -------------------------------------------------------------------------

    function setUp() public {
        // Deploy SoulNFT with OWNER as the Ownable owner.
        nft = new SoulNFT(OWNER);

        // Deploy SoulMarketplace.
        marketplace = new SoulMarketplace(address(nft), FEE_RECIPIENT, OWNER);

        // Give ALICE and BOB some ETH.
        vm.deal(ALICE, 100 ether);
        vm.deal(BOB,   100 ether);

        // Mint a Soul NFT for ALICE (tokenId = 1).
        vm.prank(ALICE);
        nft.mint(CID_A, _defaultMeta());

        // ALICE approves the marketplace to transfer her NFT (needed for buy).
        vm.prank(ALICE);
        nft.approve(address(marketplace), 1);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function _defaultMeta() internal pure returns (SoulNFT.ModelMetadata memory) {
        return SoulNFT.ModelMetadata({
            totalActions: 42,
            trainingTimestamp: 1_700_000_000,
            performanceScore: 7500,
            isRentable: false,
            rentalPricePerDay: 0,
            isForSale: false,
            salePrice: 0
        });
    }

    /// @dev Compute the expected platform fee for a given payment.
    function _fee(uint256 payment) internal pure returns (uint256) {
        return (payment * 250) / 10_000;
    }

    // -------------------------------------------------------------------------
    // test_listForRent_success
    // -------------------------------------------------------------------------

    /**
     * @notice Listing a token for rent should:
     *         - store the listing with active=true
     *         - emit RentalListed
     */
    function test_listForRent_success() public {
        vm.prank(ALICE);
        vm.expectEmit(true, true, false, true);
        emit SoulMarketplace.RentalListed(1, ALICE, PRICE_PER_DAY);

        marketplace.listForRent(1, PRICE_PER_DAY);

        (address owner, uint256 price, bool active) = marketplace.rentalListings(1);
        assertEq(owner, ALICE,          "listing owner should be ALICE");
        assertEq(price, PRICE_PER_DAY,  "pricePerDay should match");
        assertTrue(active,              "listing should be active");
    }

    /**
     * @notice listForRent by a non-owner must revert.
     */
    function test_listForRent_reverts_non_owner() public {
        vm.prank(BOB);
        vm.expectRevert("SoulMarketplace: not token owner");
        marketplace.listForRent(1, PRICE_PER_DAY);
    }

    // -------------------------------------------------------------------------
    // test_cancelRentalListing
    // -------------------------------------------------------------------------

    /**
     * @notice Cancelling a rental listing should set active=false and emit
     *         RentalCancelled.
     */
    function test_cancelRentalListing() public {
        vm.prank(ALICE);
        marketplace.listForRent(1, PRICE_PER_DAY);

        vm.prank(ALICE);
        vm.expectEmit(true, false, false, false);
        emit SoulMarketplace.RentalCancelled(1);

        marketplace.cancelRentalListing(1);

        (,, bool active) = marketplace.rentalListings(1);
        assertFalse(active, "listing should be inactive after cancel");
    }

    /**
     * @notice cancelRentalListing by a non-listing-owner must revert.
     */
    function test_cancelRentalListing_reverts_non_owner() public {
        vm.prank(ALICE);
        marketplace.listForRent(1, PRICE_PER_DAY);

        vm.prank(BOB);
        vm.expectRevert("SoulMarketplace: not listing owner");
        marketplace.cancelRentalListing(1);
    }

    // -------------------------------------------------------------------------
    // test_listForSale_success
    // -------------------------------------------------------------------------

    /**
     * @notice Listing a token for sale should:
     *         - store the listing with active=true
     *         - emit SaleListed
     */
    function test_listForSale_success() public {
        vm.prank(ALICE);
        vm.expectEmit(true, true, false, true);
        emit SoulMarketplace.SaleListed(1, ALICE, SALE_PRICE);

        marketplace.listForSale(1, SALE_PRICE);

        (address seller, uint256 price, bool active) = marketplace.saleListings(1);
        assertEq(seller, ALICE,      "listing seller should be ALICE");
        assertEq(price,  SALE_PRICE, "price should match");
        assertTrue(active,           "listing should be active");
    }

    /**
     * @notice listForSale by a non-owner must revert.
     */
    function test_listForSale_reverts_non_owner() public {
        vm.prank(BOB);
        vm.expectRevert("SoulMarketplace: not token owner");
        marketplace.listForSale(1, SALE_PRICE);
    }

    // -------------------------------------------------------------------------
    // test_cancelSaleListing
    // -------------------------------------------------------------------------

    /**
     * @notice Cancelling a sale listing should set active=false and emit
     *         SaleCancelled.
     */
    function test_cancelSaleListing() public {
        vm.prank(ALICE);
        marketplace.listForSale(1, SALE_PRICE);

        vm.prank(ALICE);
        vm.expectEmit(true, false, false, false);
        emit SoulMarketplace.SaleCancelled(1);

        marketplace.cancelSaleListing(1);

        (,, bool active) = marketplace.saleListings(1);
        assertFalse(active, "listing should be inactive after cancel");
    }

    /**
     * @notice cancelSaleListing by a non-listing-seller must revert.
     */
    function test_cancelSaleListing_reverts_non_seller() public {
        vm.prank(ALICE);
        marketplace.listForSale(1, SALE_PRICE);

        vm.prank(BOB);
        vm.expectRevert("SoulMarketplace: not listing seller");
        marketplace.cancelSaleListing(1);
    }

    // -------------------------------------------------------------------------
    // test_rent_success
    // -------------------------------------------------------------------------

    /**
     * @notice Renting a token should:
     *         - create a RentalLease with correct start/end times
     *         - accumulate seller earnings (payment minus fee)
     *         - emit Rented
     */
    function test_rent_success() public {
        // ALICE lists for rent.
        vm.prank(ALICE);
        marketplace.listForRent(1, PRICE_PER_DAY);

        uint256 durationDays = 7;
        uint256 totalCost    = PRICE_PER_DAY * durationDays;
        uint256 expectedFee  = _fee(totalCost);
        uint256 expectedEarnings = totalCost - expectedFee;

        uint256 startTime = block.timestamp;
        uint256 expectedEndTime = startTime + durationDays * 86_400;

        vm.prank(BOB);
        vm.expectEmit(true, true, false, true);
        emit SoulMarketplace.Rented(1, BOB, durationDays, expectedEndTime);

        marketplace.rent{value: totalCost}(1, durationDays);

        // Verify lease.
        (uint256 leaseStart, uint256 leaseEnd, uint256 dailyPrice) =
            marketplace.activeLeases(BOB, 1);
        assertEq(leaseStart,  startTime,        "lease startTime should equal block.timestamp");
        assertEq(leaseEnd,    expectedEndTime,   "lease endTime should be start + days * 86400");
        assertEq(dailyPrice,  PRICE_PER_DAY,     "dailyPrice should match listing price");

        // Verify earnings accumulated for ALICE.
        assertEq(
            marketplace.pendingEarnings(ALICE),
            expectedEarnings,
            "ALICE earnings should equal payment minus fee"
        );
    }

    // -------------------------------------------------------------------------
    // test_rent_reverts_wrong_payment
    // -------------------------------------------------------------------------

    /**
     * @notice Sending the wrong msg.value to rent() must revert.
     */
    function test_rent_reverts_wrong_payment() public {
        vm.prank(ALICE);
        marketplace.listForRent(1, PRICE_PER_DAY);

        uint256 wrongPayment = PRICE_PER_DAY * 7 - 1; // one wei short

        vm.prank(BOB);
        vm.expectRevert("SoulMarketplace: incorrect payment");
        marketplace.rent{value: wrongPayment}(1, 7);
    }

    // -------------------------------------------------------------------------
    // test_rent_reverts_not_active
    // -------------------------------------------------------------------------

    /**
     * @notice Renting a token with no active listing must revert.
     */
    function test_rent_reverts_not_active() public {
        // No listing created — active defaults to false.
        vm.prank(BOB);
        vm.expectRevert("SoulMarketplace: rental not active");
        marketplace.rent{value: PRICE_PER_DAY}(1, 1);
    }

    /**
     * @notice Renting a cancelled listing must also revert.
     */
    function test_rent_reverts_cancelled_listing() public {
        vm.prank(ALICE);
        marketplace.listForRent(1, PRICE_PER_DAY);

        vm.prank(ALICE);
        marketplace.cancelRentalListing(1);

        vm.prank(BOB);
        vm.expectRevert("SoulMarketplace: rental not active");
        marketplace.rent{value: PRICE_PER_DAY}(1, 1);
    }

    // -------------------------------------------------------------------------
    // test_buy_success
    // -------------------------------------------------------------------------

    /**
     * @notice Buying a listed token should:
     *         - transfer the NFT to the buyer
     *         - deactivate the sale listing
     *         - accumulate seller earnings (payment minus fee)
     *         - emit Sold
     */
    function test_buy_success() public {
        vm.prank(ALICE);
        marketplace.listForSale(1, SALE_PRICE);

        uint256 expectedFee      = _fee(SALE_PRICE);
        uint256 expectedEarnings = SALE_PRICE - expectedFee;

        vm.prank(BOB);
        vm.expectEmit(true, true, false, true);
        emit SoulMarketplace.Sold(1, BOB, SALE_PRICE);

        marketplace.buy{value: SALE_PRICE}(1);

        // NFT ownership transferred to BOB.
        assertEq(nft.ownerOf(1), BOB, "BOB should own the NFT after purchase");

        // Sale listing deactivated.
        (,, bool active) = marketplace.saleListings(1);
        assertFalse(active, "sale listing should be inactive after purchase");

        // Earnings accumulated for ALICE.
        assertEq(
            marketplace.pendingEarnings(ALICE),
            expectedEarnings,
            "ALICE earnings should equal payment minus fee"
        );
    }

    // -------------------------------------------------------------------------
    // test_buy_reverts_wrong_payment
    // -------------------------------------------------------------------------

    /**
     * @notice Sending the wrong msg.value to buy() must revert.
     */
    function test_buy_reverts_wrong_payment() public {
        vm.prank(ALICE);
        marketplace.listForSale(1, SALE_PRICE);

        vm.prank(BOB);
        vm.expectRevert("SoulMarketplace: incorrect payment");
        marketplace.buy{value: SALE_PRICE - 1}(1);
    }

    // -------------------------------------------------------------------------
    // test_buy_reverts_not_active
    // -------------------------------------------------------------------------

    /**
     * @notice Buying a token with no active sale listing must revert.
     */
    function test_buy_reverts_not_active() public {
        vm.prank(BOB);
        vm.expectRevert("SoulMarketplace: sale not active");
        marketplace.buy{value: SALE_PRICE}(1);
    }

    /**
     * @notice Buying a cancelled listing must also revert.
     */
    function test_buy_reverts_cancelled_listing() public {
        vm.prank(ALICE);
        marketplace.listForSale(1, SALE_PRICE);

        vm.prank(ALICE);
        marketplace.cancelSaleListing(1);

        vm.prank(BOB);
        vm.expectRevert("SoulMarketplace: sale not active");
        marketplace.buy{value: SALE_PRICE}(1);
    }

    // -------------------------------------------------------------------------
    // test_withdrawEarnings_success
    // -------------------------------------------------------------------------

    /**
     * @notice withdrawEarnings should transfer the full accumulated balance to
     *         the caller and zero out pendingEarnings.
     */
    function test_withdrawEarnings_success() public {
        // ALICE lists and BOB rents for 3 days.
        vm.prank(ALICE);
        marketplace.listForRent(1, PRICE_PER_DAY);

        uint256 durationDays = 3;
        uint256 totalCost    = PRICE_PER_DAY * durationDays;
        uint256 expectedFee  = _fee(totalCost);
        uint256 expectedEarnings = totalCost - expectedFee;

        vm.prank(BOB);
        marketplace.rent{value: totalCost}(1, durationDays);

        assertEq(marketplace.pendingEarnings(ALICE), expectedEarnings);

        uint256 aliceBalanceBefore = ALICE.balance;

        vm.prank(ALICE);
        marketplace.withdrawEarnings();

        assertEq(marketplace.pendingEarnings(ALICE), 0, "pendingEarnings should be 0 after withdrawal");
        assertEq(
            ALICE.balance,
            aliceBalanceBefore + expectedEarnings,
            "ALICE balance should increase by earnings"
        );
    }

    // -------------------------------------------------------------------------
    // test_withdrawEarnings_reverts_no_earnings
    // -------------------------------------------------------------------------

    /**
     * @notice withdrawEarnings with zero balance must revert with the exact
     *         message "SoulMarketplace: no earnings to withdraw".
     */
    function test_withdrawEarnings_reverts_no_earnings() public {
        vm.prank(ALICE);
        vm.expectRevert("SoulMarketplace: no earnings to withdraw");
        marketplace.withdrawEarnings();
    }

    // -------------------------------------------------------------------------
    // test_isLeaseActive_true_and_false
    // -------------------------------------------------------------------------

    /**
     * @notice isLeaseActive should return true during the lease period and
     *         false after expiry.
     */
    function test_isLeaseActive_true_and_false() public {
        vm.prank(ALICE);
        marketplace.listForRent(1, PRICE_PER_DAY);

        uint256 durationDays = 5;
        uint256 totalCost    = PRICE_PER_DAY * durationDays;

        vm.prank(BOB);
        marketplace.rent{value: totalCost}(1, durationDays);

        // Should be active immediately after renting.
        assertTrue(
            marketplace.isLeaseActive(BOB, 1),
            "lease should be active right after renting"
        );

        // Warp to just before expiry — still active.
        uint256 endTime = block.timestamp + durationDays * 86_400;
        vm.warp(endTime - 1);
        assertTrue(
            marketplace.isLeaseActive(BOB, 1),
            "lease should be active one second before expiry"
        );

        // Warp to exactly the expiry timestamp — no longer active.
        vm.warp(endTime);
        assertFalse(
            marketplace.isLeaseActive(BOB, 1),
            "lease should be inactive at expiry timestamp"
        );

        // Warp past expiry — still inactive.
        vm.warp(endTime + 1 days);
        assertFalse(
            marketplace.isLeaseActive(BOB, 1),
            "lease should be inactive after expiry"
        );
    }

    /**
     * @notice isLeaseActive returns false for an address that never rented.
     */
    function test_isLeaseActive_no_lease() public view {
        assertFalse(
            marketplace.isLeaseActive(BOB, 1),
            "should return false when no lease exists"
        );
    }

    // -------------------------------------------------------------------------
    // test_platform_fee_calculation
    // -------------------------------------------------------------------------

    /**
     * @notice Verify that the platform fee equals price * 250 / 10000 (2.5%)
     *         and that fee + seller earnings == total payment exactly.
     */
    function test_platform_fee_calculation() public {
        uint256 price = 4 ether; // chosen so fee is a round number

        vm.prank(ALICE);
        marketplace.listForSale(1, price);

        uint256 feeRecipientBefore = FEE_RECIPIENT.balance;

        vm.prank(BOB);
        marketplace.buy{value: price}(1);

        uint256 expectedFee      = (price * 250) / 10_000; // 0.1 ether
        uint256 expectedEarnings = price - expectedFee;     // 3.9 ether

        // Fee recipient received the platform fee.
        assertEq(
            FEE_RECIPIENT.balance - feeRecipientBefore,
            expectedFee,
            "fee recipient should receive exactly 2.5% of the payment"
        );

        // Seller accumulated the remainder.
        assertEq(
            marketplace.pendingEarnings(ALICE),
            expectedEarnings,
            "seller earnings should equal payment minus 2.5% fee"
        );

        // Fee + earnings == total payment (no wei lost or created).
        assertEq(
            expectedFee + expectedEarnings,
            price,
            "fee + earnings must equal total payment"
        );
    }

    // -------------------------------------------------------------------------
    // Additional edge-case tests
    // -------------------------------------------------------------------------

    /**
     * @notice A seller can withdraw earnings accumulated from multiple
     *         transactions (rental + sale).
     */
    function test_withdrawEarnings_multiple_transactions() public {
        // Rent for 2 days.
        vm.prank(ALICE);
        marketplace.listForRent(1, PRICE_PER_DAY);

        uint256 rentCost     = PRICE_PER_DAY * 2;
        uint256 rentEarnings = rentCost - _fee(rentCost);

        vm.prank(BOB);
        marketplace.rent{value: rentCost}(1, 2);

        // Warp past the lease so the NFT can be listed for sale (no contract
        // restriction, but realistic scenario).
        vm.warp(block.timestamp + 3 days);

        // ALICE lists for sale and BOB buys.
        vm.prank(ALICE);
        marketplace.listForSale(1, SALE_PRICE);

        uint256 saleEarnings = SALE_PRICE - _fee(SALE_PRICE);

        vm.prank(BOB);
        marketplace.buy{value: SALE_PRICE}(1);

        uint256 totalExpected = rentEarnings + saleEarnings;
        assertEq(
            marketplace.pendingEarnings(ALICE),
            totalExpected,
            "earnings should accumulate across multiple transactions"
        );

        uint256 aliceBalanceBefore = ALICE.balance;

        vm.prank(ALICE);
        marketplace.withdrawEarnings();

        assertEq(ALICE.balance, aliceBalanceBefore + totalExpected);
        assertEq(marketplace.pendingEarnings(ALICE), 0);
    }
}
