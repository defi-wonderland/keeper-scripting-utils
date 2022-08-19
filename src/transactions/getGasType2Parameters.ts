import { toGwei } from '../utils';
import { Block } from '@ethersproject/abstract-provider';
import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
import { GasType2Parameters } from '@types';

export function getGasType2Parameters(block: Block, priorityFee: number): GasType2Parameters {
	const nextBlockBaseFee = FlashbotsBundleProvider.getBaseFeeInNextBlock(block.baseFeePerGas!, block.gasUsed, block.gasLimit);
	const priorityFeeToGwei = toGwei(priorityFee);
	const maxFeePerGas = priorityFeeToGwei.add(nextBlockBaseFee);
	return {
		priorityFee: priorityFeeToGwei,
		maxFeePerGas,
	};
}
