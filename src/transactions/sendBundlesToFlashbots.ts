import { Flashbots } from '../flashbots/flashbots';
import { BundleBurstGroup } from '../types';
import chalk from 'chalk';

/**
 * @notice Sends bundles to flashbots.
 *
 * @dev Returns whether or not the first bundle was included. The reason to only return the response of the first bundle is because
 *      we want to always start building the next batch of bundles as soon as the first bundle of the batch fails. This is to ensure
 * 		our batches cover all possible blocks until the job is worked.
 *
 * @param bundles   The bundles to send to flashbots.
 * @param flashbots An instance of Flashbots.
 * @param staticDebugId   Optional static id to help with debugging. Every batch will share this id.
 * @param dynamicDebugId  Optional dynamic id to help with debugging. Every batch will have a different dynamic id. This dynamic id will
 * 						  be recalculated every time a bundle is created.
 *
 * @returns A boolean to know whether the bundle was included or not.
 */

export async function sendBundlesToFlashbots(
	bundles: BundleBurstGroup[],
	flashbots: Flashbots,
	staticDebugId?: string,
	dynamicDebugId?: string
): Promise<boolean> {
	const targetBlocks = bundles.map((bundle) => bundle.targetBlock);
	console.log(
		`${chalk.cyanBright('---------\n')}Sending bundle with id: ${chalk.green(staticDebugId)}#${chalk.cyanBright(
			dynamicDebugId
		)} to blocks ${chalk.bgGray(targetBlocks.join(', '))}`
	);

	const included = bundles.map((bundle) => {
		return flashbots.send(bundle.txs, bundle.targetBlock, staticDebugId, dynamicDebugId);
	});

	return included[0];
}
