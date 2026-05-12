// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/SoulNFT.sol";

/**
 * @title SoulNFTTest
 * @notice Unit tests for SoulNFT.sol.
 *         Fuzz / property tests are in SoulNFTFuzz.t.sol (Task 2.2).
 *
 * Tests:
 *   - test_mint_success
 *   - test_mint_reverts_second_mint
 *   - test_tokenURI_format
 *   - test_updateModel_by_owner
 *   - test_updateModel_reverts_non_owner
 */
contract SoulNFTTest is Test {
    SoulNFT internal nft;

    address internal constant OWNER = address(0xABCD);
    address internal constant ALICE = address(0x1111);
    address internal constant BOB   = address(0x2222);

    string internal constant CID_A = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
    string internal constant CID_B = "bafybeiczsscdsbs7ffqz55asqdf3smv6klcw3gofszvwlyarci47bgf354";

    /// @dev Default metadata used across tests.
    function _defaultMeta() internal pure returns (SoulNFT.ModelMetadata memory) {
        return SoulNFT.ModelMetadata({
            totalActions: 42,
            trainingTimestamp: 1_700_000_000,
            performanceScore: 7500, // 75.00
            isRentable: false,
            rentalPricePerDay: 0,
            isForSale: false,
            salePrice: 0
        });
    }

    function setUp() public {
        nft = new SoulNFT(OWNER);
    }

    // -------------------------------------------------------------------------
    // test_mint_success
    // -------------------------------------------------------------------------

    /**
     * @notice Minting from a fresh wallet should:
     *         - return tokenId == 1 (first ever mint)
     *         - update walletToTokenId mapping
     *         - store the modelCID on-chain
     *         - emit SoulMinted event
     */
    function test_mint_success() public {
        vm.prank(ALICE);
        vm.expectEmit(true, false, false, true);
        emit SoulNFT.SoulMinted(ALICE, 1, CID_A);

        uint256 tokenId = nft.mint(CID_A, _defaultMeta());

        assertEq(tokenId, 1, "first tokenId should be 1");
        assertEq(nft.walletToTokenId(ALICE), 1, "walletToTokenId should map ALICE -> 1");
        assertEq(nft.modelCID(1), CID_A, "modelCID[1] should equal CID_A");
        assertEq(nft.ownerOf(1), ALICE, "ALICE should own token 1");
        assertEq(nft.originalWallet(1), ALICE, "originalWallet[1] should be ALICE");
    }

    // -------------------------------------------------------------------------
    // test_mint_reverts_second_mint
    // -------------------------------------------------------------------------

    /**
     * @notice A second mint from the same wallet must revert with the
     *         exact message "SoulNFT: wallet already has a Soul NFT".
     */
    function test_mint_reverts_second_mint() public {
        vm.startPrank(ALICE);
        nft.mint(CID_A, _defaultMeta());

        vm.expectRevert("SoulNFT: wallet already has a Soul NFT");
        nft.mint(CID_B, _defaultMeta());
        vm.stopPrank();
    }

    // -------------------------------------------------------------------------
    // test_tokenURI_format
    // -------------------------------------------------------------------------

    /**
     * @notice tokenURI must return a string that contains the stored CID.
     *         Expected format: "https://storage.0g.ai/{cid}/metadata.json"
     */
    function test_tokenURI_format() public {
        vm.prank(ALICE);
        uint256 tokenId = nft.mint(CID_A, _defaultMeta());

        string memory uri = nft.tokenURI(tokenId);
        string memory expected = string.concat(
            "https://storage.0g.ai/",
            CID_A,
            "/metadata.json"
        );

        assertEq(uri, expected, "tokenURI should match expected 0G Storage format");
        // Also verify the CID is present as a substring (belt-and-suspenders).
        assertTrue(
            _contains(uri, CID_A),
            "tokenURI must contain the stored CID"
        );
    }

    // -------------------------------------------------------------------------
    // test_updateModel_by_owner
    // -------------------------------------------------------------------------

    /**
     * @notice The token owner should be able to update the model CID and
     *         training timestamp. The ModelUpdated event must be emitted.
     */
    function test_updateModel_by_owner() public {
        vm.prank(ALICE);
        uint256 tokenId = nft.mint(CID_A, _defaultMeta());

        uint256 newTimestamp = 1_800_000_000;

        vm.prank(ALICE);
        vm.expectEmit(false, false, false, true);
        emit SoulNFT.ModelUpdated(tokenId, CID_B);

        nft.updateModel(tokenId, CID_B, newTimestamp);

        assertEq(nft.modelCID(tokenId), CID_B, "modelCID should be updated to CID_B");

        (, uint256 storedTimestamp,,,,,) = nft.metadata(tokenId);
        assertEq(storedTimestamp, newTimestamp, "trainingTimestamp should be updated");
    }

    // -------------------------------------------------------------------------
    // test_updateModel_reverts_non_owner
    // -------------------------------------------------------------------------

    /**
     * @notice A non-owner calling updateModel must revert with a descriptive
     *         error message.
     */
    function test_updateModel_reverts_non_owner() public {
        vm.prank(ALICE);
        uint256 tokenId = nft.mint(CID_A, _defaultMeta());

        vm.prank(BOB);
        vm.expectRevert("SoulNFT: caller is not the token owner");
        nft.updateModel(tokenId, CID_B, 1_800_000_000);
    }

    // -------------------------------------------------------------------------
    // Additional sanity: setRental and setSale
    // -------------------------------------------------------------------------

    /**
     * @notice setRental should update isRentable and rentalPricePerDay and emit RentalSet.
     */
    function test_setRental_by_owner() public {
        vm.prank(ALICE);
        uint256 tokenId = nft.mint(CID_A, _defaultMeta());

        uint256 pricePerDay = 1 ether;

        vm.prank(ALICE);
        vm.expectEmit(false, false, false, true);
        emit SoulNFT.RentalSet(tokenId, pricePerDay);

        nft.setRental(tokenId, pricePerDay);

        (,, , bool isRentable, uint256 storedPrice,,) = nft.metadata(tokenId);
        assertTrue(isRentable, "isRentable should be true after setRental");
        assertEq(storedPrice, pricePerDay, "rentalPricePerDay should match");
    }

    /**
     * @notice setSale should update isForSale and salePrice.
     */
    function test_setSale_by_owner() public {
        vm.prank(ALICE);
        uint256 tokenId = nft.mint(CID_A, _defaultMeta());

        uint256 price = 5 ether;

        vm.prank(ALICE);
        nft.setSale(tokenId, price);

        (,,,,, bool isForSale, uint256 storedPrice) = nft.metadata(tokenId);
        assertTrue(isForSale, "isForSale should be true after setSale");
        assertEq(storedPrice, price, "salePrice should match");
    }

    /**
     * @notice setRental by non-owner must revert.
     */
    function test_setRental_reverts_non_owner() public {
        vm.prank(ALICE);
        uint256 tokenId = nft.mint(CID_A, _defaultMeta());

        vm.prank(BOB);
        vm.expectRevert("SoulNFT: caller is not the token owner");
        nft.setRental(tokenId, 1 ether);
    }

    /**
     * @notice setSale by non-owner must revert.
     */
    function test_setSale_reverts_non_owner() public {
        vm.prank(ALICE);
        uint256 tokenId = nft.mint(CID_A, _defaultMeta());

        vm.prank(BOB);
        vm.expectRevert("SoulNFT: caller is not the token owner");
        nft.setSale(tokenId, 5 ether);
    }

    /**
     * @notice Different wallets can each mint one NFT; token IDs increment.
     */
    function test_two_wallets_can_each_mint_one() public {
        vm.prank(ALICE);
        uint256 tokenIdA = nft.mint(CID_A, _defaultMeta());

        vm.prank(BOB);
        uint256 tokenIdB = nft.mint(CID_B, _defaultMeta());

        assertEq(tokenIdA, 1, "ALICE should get tokenId 1");
        assertEq(tokenIdB, 2, "BOB should get tokenId 2");
        assertEq(nft.ownerOf(tokenIdA), ALICE);
        assertEq(nft.ownerOf(tokenIdB), BOB);
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /**
     * @dev Returns true if `haystack` contains `needle` as a substring.
     */
    function _contains(string memory haystack, string memory needle)
        internal
        pure
        returns (bool)
    {
        bytes memory h = bytes(haystack);
        bytes memory n = bytes(needle);
        if (n.length == 0) return true;
        if (n.length > h.length) return false;

        for (uint256 i = 0; i <= h.length - n.length; i++) {
            bool found = true;
            for (uint256 j = 0; j < n.length; j++) {
                if (h[i + j] != n[j]) {
                    found = false;
                    break;
                }
            }
            if (found) return true;
        }
        return false;
    }
}
