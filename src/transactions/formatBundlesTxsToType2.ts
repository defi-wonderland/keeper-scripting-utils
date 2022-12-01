import { BundleBurstGroup, FormatBundlesTxsToType2Props } from '../types';
import { getMainnetGasType2Parameters } from './getMainnetGasType2Parameters';

/**
 * @notice Helper function to format the transactions on every bundle to type 2.
 *
 * @dev This function will dynamically calculate the maximum possible baseFee in N blocks ahead determined with the blocksAhead property
 *      and then calculate the maxFeePerGas by adding the maxBaseFee to the provided priority fee.
 *
 * @param bundlesTxs       An array of bundles to format to type 2.
 * @param block            The current block. This is used to get the current baseFee, which is required for the calculation of the maxBaseFee.
 * @param priorityFeeInWei The desired priority fee in wei to use as maxPriorityFeePerGas.
 * @param blocksAhead      How many blocks ahead to calculate the maxFeePerGas for. This parameter usually coincides with the burst size we use
 * 					       for our bundles, as we want to ensure our calculation of the maxBaseFee is correct.
 *
 * @return An array containing all the formatted bundles.
 */
export function formatBundlesTxsToType2(props: FormatBundlesTxsToType2Props): BundleBurstGroup[] {
	const { block, blocksAhead, bundlesTxs, priorityFeeInWei } = props;
	const { priorityFeeInGwei, maxFeePerGas } = getMainnetGasType2Parameters({
		block,
		priorityFeeInWei,
		blocksAhead,
	});
	return bundlesTxs.map((bundle) => ({
		...bundle,
		txs: bundle.txs.map((tx) => ({
			...tx,
			type: 2,
			maxPriorityFeePerGas: priorityFeeInGwei,
			maxFeePerGas,
		})),
	}));
}
