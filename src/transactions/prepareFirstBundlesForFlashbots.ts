import { PrepareFirstBundlesForFlashbotsProps, PrepareFirstBundlesForFlashbotsReturnValue } from '../types';
import { createBundles } from './';
import { populateTransactions } from './populateTransactions';
import { TransactionRequest } from '@ethersproject/abstract-provider';

/**
 * @notice Prepares the first set of flashbot bundles to be sent.
 *
 * @param job The instance of the job Contract to be worked
 * @param functionName The name of the function to be called in order to work the job
 * @param signer The signer of the transaction
 * @param block Current block
 * @param priorityFee The priority fee to be paid to the miner
 * @param gasLimit The desired gas limit to set for the transaction request
 * @param chainId The chainId of the chain where this job is located
 * @param nonce The nonce to use for the submission of the transaction
 * @param futureBlocks How many blocks in the future to send the bundle
 * @param burstSize How many consecutives blocks do we want to send the bundle to
 * @param functionArgs The arguments of the function to be called. This will be used to populate the transaction fields
 *
 * @returns An array of equal bundles with different target blocks
 */

export async function prepareFirstBundlesForFlashbots(
	props: PrepareFirstBundlesForFlashbotsProps
): Promise<PrepareFirstBundlesForFlashbotsReturnValue> {
	const { contract, functionName, block, futureBlocks, burstSize, functionArgs, options } = props;
	const txs: TransactionRequest[] = await populateTransactions({
		burstSize,
		contract,
		functionArgs,
		functionName,
		options,
	});

	const targetBlock = block.number + futureBlocks;
	const bundles = createBundles({ unsignedTxs: txs, burstSize: burstSize, targetBlock, id: functionArgs[0] }); // TODO remove 3er paramenter. Its for loggin on dev phase

	return {
		txs,
		bundles,
	};
}
