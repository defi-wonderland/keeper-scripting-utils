import { TransactionResponse } from '@ethersproject/abstract-provider';
import { SendLegacyTransactionProps } from '@types';
import { providers } from 'ethers';

export async function sendLegacyTransaction(props: SendLegacyTransactionProps): Promise<providers.TransactionReceipt> {
	const { chainId, workFunction, explorerUrl } = props;
	const tx: TransactionResponse = await workFunction();

	tx.chainId = chainId;

	if (explorerUrl) {
		console.log(`Transaction submitted: ${explorerUrl}/tx/${tx.hash}`);
	} else {
		console.log(`Transaction submitted: ${tx.hash}`);
	}

	return await tx.wait();
}
