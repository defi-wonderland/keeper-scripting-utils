import { Flashbots } from '../flashbots/flashbots';
import { BundleBurstGroup } from '../types';

export async function sendBundlesToFlashbots(bundle: BundleBurstGroup[], flashbots: Flashbots): Promise<boolean> {
	console.log('Sending txs', bundle);

	const included = bundle.map((bundle) => {
		return flashbots.send(bundle.txs, bundle.targetBlock);
	});

	return included[0];
}
