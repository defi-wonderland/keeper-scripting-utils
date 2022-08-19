import { getGasType2Parameters } from './';
import { TransactionRequest } from '@ethersproject/abstract-provider';
import { FormatTxsToType2NextBlockProps } from '@types';

export function formatTxsToType2NextBlock(props: FormatTxsToType2NextBlockProps): TransactionRequest[] {
	const { block, priorityFee, unsignedTxs } = props;
	const { priorityFee: priorityFeeToGwei, maxFeePerGas } = getGasType2Parameters(block, priorityFee);
	return unsignedTxs.map((tx) => ({
		...tx,
		type: 2,
		maxPriorityFeePerGas: priorityFeeToGwei,
		maxFeePerGas,
	}));
}
