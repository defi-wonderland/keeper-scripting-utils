import { TransactionRequest } from '@ethersproject/abstract-provider';
import { PopulateTransactionsProps } from '@types';

export async function populateTransactions(props: PopulateTransactionsProps): Promise<TransactionRequest[]> {
	const { contract, functionName, functionArgs, chainId } = props;

	// Second map is due to flashbots having trouble inferring chainId from signer, so we add it explicitly
	const txs: TransactionRequest[] = (
		await Promise.all(
			functionArgs.map((args) => {
				return contract.populateTransaction[functionName](...args, {
					...props.options,
				});
			})
		)
	).map((tx) => ({
		...tx,
		chainId,
	}));

	return txs;
}
