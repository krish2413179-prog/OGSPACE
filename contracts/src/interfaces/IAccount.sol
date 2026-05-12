// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IAccount
 * @notice ERC-4337 Account Abstraction interface stub for agent wallet operations.
 *         See https://eips.ethereum.org/EIPS/eip-4337
 */
interface IAccount {
    /**
     * @notice Packed user operation struct as defined by ERC-4337.
     */
    struct UserOperation {
        address sender;
        uint256 nonce;
        bytes initCode;
        bytes callData;
        uint256 callGasLimit;
        uint256 verificationGasLimit;
        uint256 preVerificationGas;
        uint256 maxFeePerGas;
        uint256 maxPriorityFeePerGas;
        bytes paymasterAndData;
        bytes signature;
    }

    /**
     * @notice Validate user's signature and nonce.
     * @param userOp              The operation that is about to be executed.
     * @param userOpHash          Hash of the user's request data.
     * @param missingAccountFunds Missing funds on the account's deposit in the entrypoint.
     * @return validationData     Packaged ValidationData structure.
     *                            0 = success, 1 = failure.
     */
    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external returns (uint256 validationData);
}
