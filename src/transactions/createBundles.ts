import { BundleBurstGroup, CreateBundlesProps } from '@types';

export function createBundles(props: CreateBundlesProps): BundleBurstGroup[] {
	const { targetBlock, burstSize, unsignedTx, id } = props;
	return new Array(burstSize).fill(null).map((_, index) => ({
		targetBlock: targetBlock + index,
		txs: [unsignedTx],
		id,
	}));
}
