import { getMainnetGasType2Parameters } from './getMainnetGasType2Parameters';
import { BundleBurstGroup, FormatBundlesTxsToType2Props } from '@types';

export function formatBundlesTxsToType2(props: FormatBundlesTxsToType2Props): BundleBurstGroup[] {
	const { block, blocksAhead, bundlesTxs, priorityFee } = props;
	const { priorityFee: priorityFeeToGwei, maxFeePerGas } = getMainnetGasType2Parameters({ block, priorityFee, blocksAhead });
	return bundlesTxs.map((bundle) => ({
		...bundle,
		txs: bundle.txs.map((tx) => ({
			...tx,
			type: 2,
			maxPriorityFeePerGas: priorityFeeToGwei,
			maxFeePerGas,
		})),
	}));
}
