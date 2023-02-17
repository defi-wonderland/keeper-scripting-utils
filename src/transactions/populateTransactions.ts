import { PopulateTransactionsProps } from '../types';
import { ContractTransaction } from 'ethers';

/**
 * @notice Helper function to populate transactions with their respective data and parameters.
 *
 * @param contract     An instance of the contract we wish to call.
 * @param functionName The name of the function we wish to call.
 * @param functionArgs The arguments for the different transactions we want to populate. The function arguments must be provided
 *                     as an array of arrays, each array containing the arguments for a different transaction in case transactions
 *                     with different data are needed. If this were the case, ensure functionArgs' length is the same as burstSize.
 * 					   For example: if we were to send [[arg1, arg2], [arg3, arg4]] as functionArgs, the resulting transactions would be:
 * 					                [tx1[arg1, arg2], tx2[arg3, arg4]]
 * @param chainId      The chainId of the network to which we will be sending our bundles.
 * @param options      Optional parameter. It includes all optional properties to add to a transaction. See ethers Overrides type.
 *
 * @return Array of populated transactions.
 */
export async function populateTransactions(props: PopulateTransactionsProps): Promise<ContractTransaction[]> {
	const { contract, functionName, functionArgs, chainId } = props;

	// Second map is due to flashbots having trouble inferring chainId from signer, so we add it explicitly
	const txs: ContractTransaction[] = (
		await Promise.all(
			functionArgs.map((args) => {
				return contract[functionName].populateTransaction(...args, {
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
