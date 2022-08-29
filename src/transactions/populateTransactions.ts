import { TransactionRequest } from '@ethersproject/abstract-provider';
import { PopulateTransactionsProps } from '@types';

export async function populateTransactions(props: PopulateTransactionsProps): Promise<TransactionRequest[]> {
	const { contract, functionName, functionArgs, burstSize, chainId } = props;
	const txsAmountToPopulate = functionArgs.length;

	if (txsAmountToPopulate == 1) {
		const tx: TransactionRequest = await contract.populateTransaction[functionName](...functionArgs[0], {
			...props.options,
		});

		tx.chainId = chainId;
		return [tx];
	}

	if (txsAmountToPopulate != burstSize) {
		throw new Error('If the txs are different, they must have the same length as the burstSize');
	}

	const txs: TransactionRequest[] = await Promise.all(
		functionArgs.map((args) => {
			return contract.populateTransaction[functionName](...args, {
				...props.options,
			});
		})
	);

	txs.forEach((tx) => {
		tx.chainId = chainId;
	});

	return txs;
}
