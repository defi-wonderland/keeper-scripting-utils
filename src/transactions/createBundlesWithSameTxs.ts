import { BundleBurstGroup, CreateBundlesProps } from '../types';

/**
 * @notice Creates amount of bundles equal to burstSize with consecutive target blocks. Each bundle will contain the same transactions.
 * 		   Bear in mind, all transactions sent to this function will be included in every bundle.
 *
 * @dev An example of the bundle anatomy this function creates is the following:
 * 		If we send [tx1, tx], we would get: bundle1[tx1, tx2], bundle2[tx1, tx2], bundle3[tx1, tx2].
 * 		Note: A common use case is to populate the bundles with a single transaction. This can be used for that case
 * 	          as well by sending an array with a single tx. Like this: [tx1], which would result in bundle1[tx1],
 * 			  bundle2[tx2].
 *
 * @param unsignedTxs       An array of unsigned transactions.
 * @param burstSize			The amount of bundles to create and send to consecutive blocks.
 * @param firstBlockOfBatch The first block to target for the first bundle. For example, say we are in block 1000
 * 							and we want to send our bundles to block 1005. In that case, block 1005 will be the
 * 							firstBlockOfBatch.
 *
 * @return An array of unsigned transactions that will be on every bundle
 */
export function createBundlesWithSameTxs(props: CreateBundlesProps): BundleBurstGroup[] {
	const { firstBlockOfBatch, burstSize, unsignedTxs } = props;

	return new Array(burstSize).fill(null).map((_, index) => ({
		targetBlock: firstBlockOfBatch + index,
		txs: unsignedTxs,
	}));
}
