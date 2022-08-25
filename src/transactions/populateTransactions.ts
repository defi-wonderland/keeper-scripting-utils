import { TransactionRequest } from '@ethersproject/abstract-provider';
import { PopulateTransactionsProps } from '@types';

//TODO: what happens if I don't pass options? handle options
export async function populateTransactions(props: PopulateTransactionsProps): Promise<TransactionRequest[]> {
	const { contract, functionName, functionArgs, burstSize } = props;
	const txsAmountToPopulate = functionArgs.length;

	if (txsAmountToPopulate == 1) {
		const tx: TransactionRequest = await contract.populateTransaction[functionName](...functionArgs[0], {
			...props.options,
		});
		return [tx];
	}

	if (txsAmountToPopulate != burstSize) {
		throw new Error('If the txs are different, they must have the same length as the burstSize');
	}

	const txs: TransactionRequest[] = functionArgs.map(async (args) => {
		return await contract.populateTransaction[functionName](...args, {
			...props.options,
		});
	}) as TransactionRequest[];

	return txs;
}
