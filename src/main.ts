import { emitWhenCloseToBlock, stopBlocks } from './subscriptions/blocks';
import { Config, loadConfig } from './utils/config';
import { Logger } from './utils/logger';
import { providers } from 'ethers';

export async function run(config: Config): Promise<void> {
	const provider = new providers.WebSocketProvider('wss://eth-mainnet.g.alchemy.com/v2/<ALCHEMY_KEY>');
	const now = Date.now() / 1000;
	const seconds = 10;

	console.log('started cooldown observable');
	emitWhenCloseToBlock(provider, now + seconds, 5).subscribe(async (block) => {
		console.log('Job is close to be off cooldown');

		// on complex job run some extra needed checks like job.workable().

		// ready to work:
		stopBlocks(provider);
		// send tx with flashbots
		run(config);
	});
}

if (!process.env.TEST_MODE) {
	(async () => {
		const config = await loadConfig();

		Logger.setLogConfig(config.log);
		run(config);
	})();
}
