import { SendTxProps } from '../types';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { providers } from 'ethers';

/**
 * @notice Sends a transaction.
 *
 * @dev This method should be used on chains that don't support flashbots.
 *
 * @param contractCall A callback function of the function to call on-chain.
 * @param explorerUrl  The url of the explorer of the chain to which the transaction will be sent.
 *
 * @returns A promise of a transaction receipt.
 */
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
