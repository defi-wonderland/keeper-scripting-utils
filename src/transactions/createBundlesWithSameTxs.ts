import { BundleBurstGroup, CreateBundlesProps } from '@types';

// Multiple Txs: This would be more than one tx in a bundle: bundle1[tx1, tx2] bundle2[tx1, tx2]
export function createBundlesWithSameTxs(props: CreateBundlesProps): BundleBurstGroup[] {
	const { firstBlockOfBatch, burstSize, unsignedTxs, id } = props;

	return new Array(burstSize).fill(null).map((_, index) => ({
		targetBlock: firstBlockOfBatch + index,
		txs: unsignedTxs,
		id,
	}));
}
