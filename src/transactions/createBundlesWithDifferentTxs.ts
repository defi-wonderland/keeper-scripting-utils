import { BundleBurstGroup, CreateBundlesProps } from '@types';

/**
 * @notice Creates amount of bundles equal to burstSize with consecutive target blocks. Each bundle will contain different transactions.
 * 		   An example of the bundle anatomy this function creates is the following: bundle1[tx1], bundle2[tx2], bundle3[tx3].
 *
 * @dev The length of the transaction array must coincide with the burstSize.
 *
 * @param unsignedTxs       An array of unsigned transactions.
 * @param burstSize			The amount of bundles to create and send to consecutive blocks.
 * @param firstBlockOfBatch The first block to target for the first bundle. For example, say we are in block 1000
 * 							and we want to send our bundles to block 1005. In that case, block 1005 will be the
 * 							firstBlockOfBatch.
 *
 * @return An array containing all created bundles.
 */
export function createBundlesWithDifferentTxs(props: CreateBundlesProps): BundleBurstGroup[] {
	const { firstBlockOfBatch, burstSize, unsignedTxs } = props;
	const amountOfTxs = unsignedTxs.length;

	if (amountOfTxs <= 1) {
		throw new Error(
			'Your transaction is a single one, make sure this is correct. If it is correct, please use createBundlesWithSameTxs'
		);
	}

	if (amountOfTxs != burstSize) {
		throw new Error('If the txs are different, they must have the same length as the burstSize');
	}

	return new Array(burstSize).fill(null).map((_, index) => ({
		targetBlock: firstBlockOfBatch + index,
		txs: [unsignedTxs[index]],
	}));
}
