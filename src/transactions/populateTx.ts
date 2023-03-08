import type { TransactionRequest } from '@ethersproject/abstract-provider';
import type { PopulatedTransaction } from 'ethers';
import { PopulateTxProps } from 'types';

export async function populateTx(props: PopulateTxProps): Promise<TransactionRequest> {
	const { contract, functionName, functionArgs, options, chainId } = props;

	const populatedTx: PopulatedTransaction = await contract.populateTransaction[functionName](...functionArgs, {
		...options,
	});

	const formattedTx = {
		...populatedTx,
		chainId,
	};

	return formattedTx;
}
