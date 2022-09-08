import { TransactionRequest } from '@ethersproject/abstract-provider';

/**
 * @notice A BundleBurstGroup includes all properties of a valid Flashbot bundle.
 *
 * @param targetBlock The block to which the bundle will be sent to.
 * @param txs         The transactions to include in that bundle.
 */

export interface BundleBurstGroup {
	targetBlock: number;
	txs: TransactionRequest[];
	id?: string;
}
