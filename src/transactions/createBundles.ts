import { BundleBurstGroup, CreateBundlesProps } from '@types';

export function createBundles(props: CreateBundlesProps): BundleBurstGroup[] {
	const { targetBlock, burstSize, unsignedTxs, id } = props;
	const amountOfTxs = unsignedTxs.length;
	const isSingleTransaction = amountOfTxs == 1;

	if (!isSingleTransaction && amountOfTxs != burstSize) {
		throw new Error('If the txs are different, they must have the same length as the burstSize');
	}
	return new Array(burstSize).fill(null).map((_, index) => ({
		targetBlock: targetBlock + index,
		txs: isSingleTransaction ? unsignedTxs : [unsignedTxs[index]], //does this work?
		id,
	}));
}
