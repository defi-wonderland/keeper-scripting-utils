import { prepareFlashbotBundleForRetry, sendBundlesToFlashbots } from './';
import { makeid } from '@keep3r-network/cli-utils';
import { BundleBurstGroup, SendAndRetryUntilNotWorkableProps } from '@types';

/**
 * @notice Sends new bundles to different targetBlocks until the job is successfully worked, or another keeper works it.
 *
 * @dev If the last bundle was sent to block 100, 101, 102, and 100 was not included, a new bundle will be sent to blocks 103 + newBurstSize
 *      if the job is still workable.
 *
 * @param txs             The transactions to be retried if nothing is provided in the regenerateTxs parameter.
 * @param provider        A provider. It will be used to fetch the first block in which each of our bundle batches were not included.
 * @param priorityFee     The priority fee to be paid to the miner.
 * @param bundles         The batches of bundles to send to flashbots.
 * @param newBurstSize    Amount of consecutive blocks we want to send the transactions to try to work the job.
 * @param flashbots       An instance of Flashbots.
 * @param signer          A signer.
 * @param isWorkableCheck A callback to the function that checks the workability of the job we are trying to work.
 * @param staticDebugId   Optional static id to help with debugging. Every bundle will share this id.
 * @param dynamicDebugId  Optional dynamic id to help with debugging. Every bundle will have a different dynamic id. This dynamic id will
 * 						  be recalculated every time a bundle is created.
 *
 * @returns A boolean to know whether the bundle was included or not
 */

export async function sendAndRetryUntilNotWorkable(props: SendAndRetryUntilNotWorkableProps): Promise<boolean> {
	const { bundles, flashbots, isWorkableCheck, staticDebugId, dynamicDebugId } = props;

	const jobIsStillWorkable = await isWorkableCheck();
	if (!jobIsStillWorkable) {
		console.log('Job is not workable');
		return false;
	}
	const firstBundleIncluded = await sendBundlesToFlashbots(bundles, flashbots, staticDebugId, dynamicDebugId);
	if (firstBundleIncluded) return true;

	const retryBundle = await prepareFlashbotBundleForRetry({
		...props,
		notIncludedBlock: bundles[0].targetBlock,
		previousBurstSize: bundles.length,
		id: bundles[0].id,
	});

	if (!retryBundle) {
		return false;
	}
	//TODO: do this dynamically
	const recalculatedDynamicId = makeid(5);

	return sendAndRetryUntilNotWorkable({
		...props,
		bundles: retryBundle as BundleBurstGroup[],
		dynamicDebugId: recalculatedDynamicId,
	});
}
