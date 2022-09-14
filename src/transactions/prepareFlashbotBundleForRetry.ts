import { formatBundlesTxsToType2, createBundlesWithSameTxs, createBundlesWithDifferentTxs } from './';
import { TransactionRequest } from '@ethersproject/abstract-provider';
import { BundleBurstGroup, PrepareFlashbotBundleForRetryProps } from '@types';

/**
 * @notice Helper function to prepare new batch of bundles after previous batch failed.
 *
 * @dev The first time we send a bundle, that bundle contains one or multiple populated transactions as well as a target block.
 *      If that bundle is not included, and the jobs are still workable, we want to keep trying to work it.
 *      However, our first bundle wouldn't work anymore as its target block would be outdated and potentially its txs would be
 *      aswell if they have dynamic parameters depending on something like the block number.
 * 		For this reason, we have to create new bundles to try working that job again. This function is in charge of that behavior.
 *
 * @param txs                      	  An array of our previously sent transactions.
 * @param provider                 	  A provider. It will be used to fetch specific blocks and get the latest nonce.
 * @param signer                   	  A signer. It will be used to sign the new transactions.
 * @param priorityFeeInWei         	  The priority fee in wei we would like to use in our next batch of bundles.
 * @param notIncludedBlock         	  The target block of our first non-included bundle.
 * @param previousBurstSize        	  The burst size we used the first time we send our bundles.
 * @param newBurstSize             	  The new burst size we would like to use when retrying to work the job.
 * @param regenerateTxs            	  An optional callback function that generates the new set of transactions to be included
 *								   	  in the next retry bundles. If not provided, the new bundles will use the previous
 									  set of txs provided on the txs parameter.
 * @param bundleRegenerationMethod 	  An optional parameter instructing what bundle creation method we should use to
 * 									  create the new bundles. Defaults to createBundlesWithSameTxs.
 * @param recalculatePriorityFeeInWei An optional callback function instructing what priority fee should the new batch
 * 									  of bundles use, along with whether it should use that priority fee or discard the
 * 									  new batch and restart execution. If not provided bundles will use the value
 * 									  provided in the priorityFeeInWei parameter to sendAndRetryUntilNotWorkable.
 *
 * @return Array of bundles formatted to type 2, or a boolean when a bundle in a previous batch is included and another batch with the
 * 		   same nonce has been sent to blocks that have not arrived yet.
 */
export async function prepareFlashbotBundleForRetry(
	props: PrepareFlashbotBundleForRetryProps
): Promise<BundleBurstGroup[] | boolean> {
	const {
		txs,
		provider,
		signer,
		notIncludedBlock,
		previousBurstSize,
		newBurstSize,
		regenerateTxs,
		bundleRegenerationMethod = 'createBundlesWithSameTxs',
		recalculatePriorityFeeInWei,
	} = props;
	const firstBundleBlock = await provider.getBlock(notIncludedBlock);
	if (!firstBundleBlock) return false;
	const firstBlockOfNextBatch = notIncludedBlock + previousBurstSize;
	const blocksAhead = previousBurstSize + newBurstSize - 1;
	const latestNonce = await provider.getTransactionCount(signer.address);
	let newTxs: TransactionRequest[] = txs;

	if (regenerateTxs) {
		newTxs = (await regenerateTxs(newBurstSize, firstBlockOfNextBatch)).map((tx) => ({ ...tx, nonce: latestNonce }));
	}

	let bundles: BundleBurstGroup[];

	if (bundleRegenerationMethod === 'createBundlesWithSameTxs') {
		bundles = createBundlesWithSameTxs({
			unsignedTxs: newTxs,
			burstSize: newBurstSize,
			firstBlockOfBatch: firstBlockOfNextBatch,
		});
	}

	if (bundleRegenerationMethod === 'createBundlesWithDifferentTxs') {
		bundles = createBundlesWithDifferentTxs({
			unsignedTxs: newTxs,
			burstSize: newBurstSize,
			firstBlockOfBatch: firstBlockOfNextBatch,
		});
	}

	if (recalculatePriorityFeeInWei) {
		const { newPriorityFeeInWei, cancelBatchAndRestart } = await recalculatePriorityFeeInWei(
			bundles!,
			firstBundleBlock,
			firstBlockOfNextBatch
		);
		if (cancelBatchAndRestart) {
			console.log('Restarting execution due to low or negative profitability.');
			return false;
		}
		props.priorityFeeInWei = newPriorityFeeInWei;
	}

	return formatBundlesTxsToType2({
		bundlesTxs: bundles!,
		block: firstBundleBlock,
		priorityFeeInWei: props.priorityFeeInWei,
		blocksAhead,
	});
}
