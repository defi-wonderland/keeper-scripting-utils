import { formatBundlesTxsToType2, createBundlesWithSameTxs, createBundlesWithDifferentTxs } from './';
import { TransactionRequest } from '@ethersproject/abstract-provider';
import { BundleBurstGroup, PrepareFlashbotBundleForRetryProps } from '@types';

// TODO take off id argument from createBundle, both prepeare functions, sendRetry and remove from BundleBurstGroup type

/**
 * @notice Helper function to prepare new batch of bundles after previous batch failed.
 *
 * @dev The first time we send a bundle, that bundle contains one or multiple populated transactions as well as a target block.
 *      If that bundle is not included, and the jobs are still workable, we want to keep trying to work it.
 *      However, our first bundle wouldn't work anymore as its target block would be outdated and potentially its txs would be
 *      aswell if they have dynamic parameters depending on something like the block number.
 * 		For this reason, we have to create new bundles to try working that job again. This function is in charge of that behavior.
 *
 * @param txs                      An array of our previously sent transactions.
 * @param provider                 A provider. It will be used to fetch specific blocks and get the latest nonce.
 * @param signer                   A signer. It will be used to sign the new transactions.
 * @param priorityFee              The priorityFee in wei we would like to use in our next batch of bundles.
 * @param notIncludedBlock         The target block of our first non-included bundle.
 * @param previousBurstSize        The burst size we used the first time we send our bundles.
 * @param newBurstSize             The new burst size we would like to use when retrying to work the job.
 * @param id                       An id to identify the bundles. //TODO erase this
 * @param regenerateTxs            An optional callback function that generates the new set of transactions to be included
 *								   in the next retry bundles. If not provided, the new bundles will use the previous set of txs provided
 *								   on the txs parameter.
 * @param bundleRegenerationMethod An optional parameter instructing what bundle creation method we should use to create the new bundles.
 * 								   Defaults to createBundlesWithSameTxs.
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
		priorityFee,
		notIncludedBlock,
		previousBurstSize,
		newBurstSize,
		id,
		regenerateTxs,
		bundleRegenerationMethod = 'createBundlesWithSameTxs',
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
			id,
		});
	}

	if (bundleRegenerationMethod === 'createBundlesWithDifferentTxs') {
		bundles = createBundlesWithDifferentTxs({
			unsignedTxs: newTxs,
			burstSize: newBurstSize,
			firstBlockOfBatch: firstBlockOfNextBatch,
			id,
		});
	}

	//TODO: This forbids the users from dynamically calculating the priorityFee based on profitability. We could allow another callback to fix this.
	return formatBundlesTxsToType2({ bundlesTxs: bundles!, block: firstBundleBlock, priorityFee, blocksAhead });
}
