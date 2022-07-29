import { emitWhenCloseToBlock, stopBlocks } from './subscriptions/blocks';
import { Config, loadConfig } from './utils/config';
import { getNodeUrlWss, getPrivateKey } from './utils/env';
import { Logger } from './utils/logger';
import { providers } from 'ethers';

const dotenv = require('dotenv');
dotenv.config();

export async function run(config: Config): Promise<void> {
	const network = 'goerli';

	const nodeUrl = getNodeUrlWss(network);
	const provider = new providers.WebSocketProvider(nodeUrl);
	const PK = getPrivateKey(network);

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
