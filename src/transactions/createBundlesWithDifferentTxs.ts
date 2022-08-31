import { BundleBurstGroup, CreateBundlesProps } from '@types';

// Different Txs: This would be for diff txs in diff bundles: bundle1[tx1] bundle2[tx2]
export function createBundlesWithDifferentTxs(props: CreateBundlesProps): BundleBurstGroup[] {
	const { firstBlockOfBatch, burstSize, unsignedTxs, id } = props;
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
		id,
	}));
}
