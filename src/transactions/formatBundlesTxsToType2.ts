import { getGasType2ParametersForBundle } from './';
import { BundleBurstGroup, FormatBundlesTxsToType2Props } from '@types';

export function formatBundlesTxsToType2(props: FormatBundlesTxsToType2Props): BundleBurstGroup[] {
	const { block, blocksAhead, bundlesTxs, priorityFee } = props;
	const { priorityFee: priorityFeeToGwei, maxFeePerGas } = getGasType2ParametersForBundle({ block, priorityFee, blocksAhead });
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
