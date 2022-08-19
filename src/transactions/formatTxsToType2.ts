import { getGasType2ParametersForBundle } from './';
import { TransactionRequest } from '@ethersproject/abstract-provider';
import { FormatTxsToType2Props } from '@types';

export function formatTxsToType2(props: FormatTxsToType2Props): TransactionRequest[] {
	const { block, blocksAhead, priorityFee, unsignedTxs } = props;
	const { priorityFee: priorityFeeToGwei, maxFeePerGas } = getGasType2ParametersForBundle({ block, priorityFee, blocksAhead });
	return unsignedTxs.map((tx) => ({
		...tx,
		type: 2,
		maxPriorityFeePerGas: priorityFeeToGwei,
		maxFeePerGas,
	}));
}
