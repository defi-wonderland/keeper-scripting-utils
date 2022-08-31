import { toGwei } from '../utils';
import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
import { GasType2Parameters, GetMainnetGasType2ParametersProps } from '@types';
import { BigNumber } from 'ethers';

export function getMainnetGasType2Parameters(props: GetMainnetGasType2ParametersProps): GasType2Parameters {
	let nextBlockBaseFee: BigNumber;

	const { block, blocksAhead, priorityFee } = props;

	if (!block.baseFeePerGas) {
		throw new Error('Missing property baseFeePerGas on block');
	}

	if (blocksAhead == 0 || blocksAhead == 1) {
		nextBlockBaseFee = FlashbotsBundleProvider.getBaseFeeInNextBlock(block.baseFeePerGas, block.gasUsed, block.gasLimit);
	} else {
		nextBlockBaseFee = FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock(block.baseFeePerGas, blocksAhead);
	}
	const priorityFeeToGwei = toGwei(priorityFee);
	const maxFeePerGas = priorityFeeToGwei.add(nextBlockBaseFee);
	return {
		priorityFee: priorityFeeToGwei,
		maxFeePerGas,
	};
}
