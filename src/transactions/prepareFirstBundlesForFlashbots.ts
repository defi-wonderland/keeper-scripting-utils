import { PrepareFirstBundlesForFlashbotsProps, PrepareFirstBundlesForFlashbotsReturnValue } from '../types';
import { createBundles, formatBundlesTxsToType2 } from './';
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
	const { block, burstSize, chainId, functionArgs, functionName, futureBlocks, gasLimit, job, nonce, priorityFee } = props;
	const tx: TransactionRequest = await job.populateTransaction[functionName](...functionArgs, {
		gasLimit,
	});
	tx.chainId = chainId;
	tx.nonce = nonce;

	const targetBlock = block.number + futureBlocks;
	const blocksAhead = futureBlocks + burstSize; // done
	const bundles = createBundles({ unsignedTx: tx, burstSize: burstSize, targetBlock, id: functionArgs[0] }); // TODO remove 3er paramenter. Its for loggin on dev phase
	const formattedBundles = formatBundlesTxsToType2({ bundlesTxs: bundles, block, priorityFee, blocksAhead });

	// This should probably return the transaction aswell
	return {
		tx,
		formattedBundles,
	};
}
