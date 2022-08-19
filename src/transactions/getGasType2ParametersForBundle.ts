import { toGwei } from '../utils';
import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
import { GasType2Parameters, GetGasType2ParametersForBundleProps } from '@types';

export function getGasType2ParametersForBundle(props: GetGasType2ParametersForBundleProps): GasType2Parameters {
	const { block, blocksAhead, priorityFee } = props;
	const maxBlockBaseFee = FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock(block.baseFeePerGas!, blocksAhead);
	const priorityFeeToGwei = toGwei(priorityFee);
	const maxFeePerGas = priorityFeeToGwei.add(maxBlockBaseFee);
	return {
		priorityFee: priorityFeeToGwei,
		maxFeePerGas,
	};
}
