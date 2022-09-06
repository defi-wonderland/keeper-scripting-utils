import { toGwei } from '../utils';
import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
import { GasType2Parameters, GetMainnetGasType2ParametersProps } from '@types';
import { BigNumber } from 'ethers';

/**
 * @notice Helper function to calculate the maxFeePerGas parameter required for a transaction of type 2.
 *
 * @param block       The current block. This is used to get the current baseFee, which is required for the calculation of the maxBaseFee
 * 					  which is then used to calculate maxFeePerGas.
 * @param priorityFee The desired priorityFee in wei. This parameter will be transformed into gwei and added to maxBaseFee to get maxFeePerGas.
 * @param blocksAhead How many blocks ahead to calculate the maxFeePerGas for. This parameter usually coincides with the burst size we use
 * 					  for our bundles, as we want to ensure our calculation of the maxBaseFee is correct.
 *
 * @return An object containing the provided priorityFee in gwei and the calculated maxFeePerGas.
 */
export function getMainnetGasType2Parameters(props: GetMainnetGasType2ParametersProps): GasType2Parameters {
	let maxBaseFee: BigNumber;

	const { block, blocksAhead, priorityFee } = props;

	if (!block.baseFeePerGas) {
		throw new Error('Missing property baseFeePerGas on block');
	}

	if (blocksAhead == 0 || blocksAhead == 1) {
		maxBaseFee = FlashbotsBundleProvider.getBaseFeeInNextBlock(block.baseFeePerGas, block.gasUsed, block.gasLimit);
	} else {
		maxBaseFee = FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock(block.baseFeePerGas, blocksAhead);
	}
	const priorityFeeToGwei = toGwei(priorityFee);
	const maxFeePerGas = priorityFeeToGwei.add(maxBaseFee);
	return {
		priorityFee: priorityFeeToGwei,
		maxFeePerGas,
	};
}
