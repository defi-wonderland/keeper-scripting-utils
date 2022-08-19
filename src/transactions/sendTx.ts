import { SendTxProps } from '../types';
import { toGwei } from '../utils';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { providers } from 'ethers';

export async function sendTx(props: SendTxProps): Promise<providers.TransactionReceipt> {
	const { chainId, contract, functionArgs, functionName, gasLimit, maxFeePerGas, maxPriorityFeePerGas, explorerUrl } = props;
	const maxFeePerGasGwei = toGwei(Math.ceil(maxFeePerGas) + 10); // TODO CHECK
	const maxPriorityFeePerGasGwei = toGwei(Math.ceil(maxPriorityFeePerGas) + 10); // TODO CHECK
	const tx: TransactionResponse = await contract.functions[functionName](...functionArgs, {
		maxFeePerGas: maxFeePerGasGwei,
		maxPriorityFeePerGas: maxPriorityFeePerGasGwei,
		gasLimit,
		type: 2,
	});

	tx.chainId = chainId;
	if (explorerUrl) {
		console.log(`Transaction submitted: ${explorerUrl}/tx/${tx.hash}`);
	} else {
		console.log(`Transaction submitted: ${tx.hash}`);
	}

	return await tx.wait();
}
