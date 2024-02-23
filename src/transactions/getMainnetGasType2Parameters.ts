import { GasType2Parameters, GetMainnetGasType2ParametersProps } from '../types';
import { getGasParametersNextBlock } from './getGasParametersNextBlock';
import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
import { BigNumber } from 'ethers';

/**
 * @notice Helper function to calculate the maxFeePerGas parameter required for a transaction of type 2.
 *
 * @param block            The current block. This is used to get the current baseFee, which is required for the calculation of the maxBaseFee
 * 					       which is then used to calculate maxFeePerGas.
 * @param priorityFeeInWei The desired priority fee in wei. This parameter will be added to maxBaseFee to get maxFeePerGas.
 * @param blocksAhead      The number blocks to send the transaction to. Can also be interpreted as the number of blocks into the future to use when calculating the maximum base fee.
 *
 * @return An object containing the provided priority fee in gwei and the calculated maxFeePerGas.
 */
export function getMainnetGasType2Parameters(props: GetMainnetGasType2ParametersProps): GasType2Parameters {
	const { block, priorityFeeInWei, blocksAhead } = props;

	if (!block.baseFeePerGas) {
		throw new Error('Missing property baseFeePerGas on block');
	}

	if (blocksAhead === 0 || blocksAhead === 1) {
		return getGasParametersNextBlock({ block, priorityFeeInWei });
	}

	const maxBaseFee = FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock(block.baseFeePerGas, blocksAhead);

	const priorityFee = BigNumber.from(priorityFeeInWei);
	const maxFeePerGas = maxBaseFee.add(priorityFee);
	return {
		priorityFee,
		maxFeePerGas,
	};
}
