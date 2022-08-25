import { SendTxProps } from '../types';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { providers } from 'ethers';

export async function sendTx(props: SendTxProps): Promise<providers.TransactionReceipt> {
	const { contractCall, explorerUrl } = props;
	const tx: TransactionResponse = await contractCall();

	if (explorerUrl) {
		console.log(`Transaction submitted: ${explorerUrl}/tx/${tx.hash}`);
	} else {
		console.log(`Transaction submitted: ${tx.hash}`);
	}

	return await tx.wait();
}
