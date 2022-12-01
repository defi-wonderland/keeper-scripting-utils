import { BigNumber } from 'ethers';

/**
 * @notice The required gas parameters to include in a transaction of type 2.
 *
 * @param priorityFeeInGwei The priority fee to send with the transaction expressed in Gwei.
 * @param maxFeePerGas      The max fee per gas to send with the transaction.
 */

export interface GasType2Parameters {
	priorityFeeInGwei: BigNumber;
	maxFeePerGas: BigNumber;
}
