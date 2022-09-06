import { Flashbots } from '../flashbots/flashbots';
import { BundleBurstGroup } from '../types';
import chalk from 'chalk';

export async function sendBundlesToFlashbots(
	bundle: BundleBurstGroup[],
	flashbots: Flashbots,
	staticDebugId?: string,
	dynamicDebugId?: string
): Promise<boolean> {
	const targetBlocks = bundle.map((bundle) => bundle.targetBlock);
	console.log(
		`${chalk.cyanBright('---------\n')}Sending bundle with id: ${chalk.green(staticDebugId)}#${chalk.cyanBright(
			dynamicDebugId
		)} to blocks ${chalk.bgGray(targetBlocks.join(', '))}`
	);

	const included = bundle.map((bundle) => {
		return flashbots.send(bundle.txs, bundle.targetBlock, staticDebugId, dynamicDebugId);
	});

	return included[0];
}
