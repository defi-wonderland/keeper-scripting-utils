import { Block } from '@ethersproject/abstract-provider';
import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
import { BigNumber, PopulatedTransaction, utils } from 'ethers';

export function formatTxsToType2NextBlock(
	unsignedTxs: PopulatedTransaction[],
	block: Block,
	priorityFee: number
): PopulatedTransaction[] {
	const nextBlockBaseFee = FlashbotsBundleProvider.getBaseFeeInNextBlock(block.baseFeePerGas!, block.gasUsed, block.gasLimit);
	const priorityFeeToGwei = toGwei(priorityFee);
	const maxFeePerGas = priorityFeeToGwei.add(nextBlockBaseFee);
	return unsignedTxs.map((tx) => ({
		...tx,
		type: 2,
		maxPriorityFeePerGas: priorityFeeToGwei,
		maxFeePerGas,
	}));
}

export function formatTxsToType2(
	unsignedTxs: PopulatedTransaction[],
	block: Block,
	priorityFee: number,
	blocksAhead: number
): PopulatedTransaction[] {
	const maxBlockBaseFee = FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock(block.baseFeePerGas!, blocksAhead);
	const priorityFeeToGwei = toGwei(priorityFee);
	const maxFeePerGas = priorityFeeToGwei.add(maxBlockBaseFee);
	return unsignedTxs.map((tx) => ({
		...tx,
		type: 2,
		maxPriorityFeePerGas: priorityFeeToGwei,
		maxFeePerGas,
	}));
}

export const toGwei = (value: number): BigNumber => {
	return utils.parseUnits(value.toString(), 'gwei');
};
