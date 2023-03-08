import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
import { BigNumber } from 'ethers';
import { GasType2Parameters, GetGasParametersNextBlockProps } from 'types';

/**
 * @notice The required gas parameters to include in a transaction of type 2.
 *
 * @param block            The block to use to calculate the maxBaseFee
 * @param priorityFeeInWei The desired priority fee in wei. This parameter will be added to maxBaseFee to get maxFeePerGas.
 *
 * @return An object containing the provided priority fee in gwei and the calculated maxFeePerGas.
 */

export function getGasParametersNextBlock(props: GetGasParametersNextBlockProps): GasType2Parameters {
	const { block, priorityFeeInWei } = props;

	if (!block.baseFeePerGas) {
		throw new Error('Missing property baseFeePerGas on block');
	}

	const maxBaseFee = FlashbotsBundleProvider.getBaseFeeInNextBlock(block.baseFeePerGas, block.gasUsed, block.gasLimit);
	const priorityFee = BigNumber.from(priorityFeeInWei);
	const maxFeePerGas = maxBaseFee.add(priorityFee);
	return {
		priorityFee,
		maxFeePerGas,
	};
}
