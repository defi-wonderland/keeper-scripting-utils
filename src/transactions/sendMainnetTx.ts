import { getGasType2Parameters } from './';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { SendMainnetTxProps } from '@types';
import { providers } from 'ethers';

export async function sendMainnetTx(props: SendMainnetTxProps): Promise<providers.TransactionReceipt> {
	const { contract, block, chainId, gasLimit, priorityFee, functionName, functionArgs } = props;
	const { priorityFee: priorityFeeToGwei, maxFeePerGas } = getGasType2Parameters(block, priorityFee);
	const tx: TransactionResponse = await contract.functions[functionName](...functionArgs, {
		maxFeePerGas,
		maxPriorityFeePerGas: priorityFeeToGwei,
		gasLimit,
		type: 2,
	});

	tx.chainId = chainId;
	console.log(`Transaction submitted: https://etherscan.io/tx/${tx.hash}`);

	return await tx.wait();
}
