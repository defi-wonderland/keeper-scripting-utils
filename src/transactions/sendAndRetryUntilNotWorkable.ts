import { prepareFlashbotBundleForRetry, sendBundlesToFlashbots } from './';
import { SendAndRetryUntilNotWorkableProps } from '@types';

/**
 * @notice Sends new bundles with the same transaction to different targetBlocks until the job is successfully worked, or another keeper works it.
 *
 * @dev If out last bundle was sent to block 100, 101, 102, and 100 was not included, a new bundle will be sent to blocks 103 + newBurstSize
 *      if the job is still workable. This process will continue until the job is worked.
 *
 * @param tx The transaction to be retried.
 * @param provider A provider used to fetch the block after the target block of the first bundle
 * @param priorityFee The priority fee to be paid to the miner
 * @param bundle The bundles previously sent to flashbots
 * @param newBurstSize How many consecutive blocks after our last bundle's target block we want to send the new bundle to
 * @param flashbots Flashbots instance
 * @param job The instance of the job Contract to be worked. This will be used to check if it's still workable.
 * @param functionName The function name to call in order to check if the job is still workable
 * @param functionArgs The function args that function takes, if any.
 * @returns A boolean to know whether the bundle was included or not
 */

export async function sendAndRetryUntilNotWorkable(props: SendAndRetryUntilNotWorkableProps): Promise<boolean> {
	const { bundles, flashbots, isWorkableCheck } = props;

	const firstBundleIncluded = await sendBundlesToFlashbots(bundles, flashbots);
	if (firstBundleIncluded) return true;
	const jobIsStillWorkable = await isWorkableCheck();
	if (!jobIsStillWorkable) {
		console.log('Job is not workable');
		return false;
	}

	const retryBundle = await prepareFlashbotBundleForRetry({
		...props,
		notIncludedBlock: bundles[0].targetBlock,
		previousBurstSize: bundles.length,
		id: bundles[0].id,
	});
	return sendAndRetryUntilNotWorkable({ ...props, bundles: retryBundle });
}
