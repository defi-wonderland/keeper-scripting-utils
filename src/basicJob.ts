import BasicJob from '../abi/BasicJob.json';
import { Flashbots } from './flashbots/flashbots';
import { getNewBlocks, stopBlocks } from './subscriptions/blocks';
import { prepareFirstBundlesForFlashbots, sendAndRetryUntilNotWorkable } from './transactions';
import { loadConfig } from './utils/config';
import { getNodeUrlWss, getPrivateKey } from './utils/env';
import { Logger } from './utils/logger';
import { providers, Wallet, Contract, BigNumber } from 'ethers';
import { mergeMap, take, timer } from 'rxjs';

const dotenv = require('dotenv');
dotenv.config();

const network = 'goerli';
const chainId = 5;
const nodeUrl = getNodeUrlWss(network);
const provider = new providers.WebSocketProvider(nodeUrl);
const JOB_ADDRESS = '0x4C8DB41095cD6fb755466463F0C6B2Ab9C826804';
const PK = getPrivateKey(network);
const FLASHBOTS_PK = process.env.FLASHBOTS_APIKEY;
const FLASHBOTS_RPC = 'https://relay-goerli.flashbots.net';

const signer = new Wallet(PK);
const job = new Contract(JOB_ADDRESS, BasicJob, provider);

export async function runBasicJob(): Promise<void> {
	const winston = Logger.getServiceLogger('test');
	const flashbots = await Flashbots.init(
		signer,
		new Wallet(FLASHBOTS_PK as string),
		provider,
		[FLASHBOTS_RPC],
		false,
		chainId,
		winston
	);

	// 0 = basic
	// 1 = complex
	const [lastWorkAt, cooldown]: BigNumber[] = await Promise.all([job.lastWorkAt(0), job.workCooldown()]);
	const secondsBefore = 10;
	const priorityFee = 10; // TODO DEHARDCODE
	const gasLimit = 1_000_000; // TODO DEHARDCODE

	const readyTime = lastWorkAt.add(cooldown);
	const notificationTime = readyTime.sub(secondsBefore);
	const time = notificationTime.mul(1000).sub(Date.now()).toNumber();

	console.log('started cooldown observable');
	timer(time)
		.pipe(
			mergeMap(() => getNewBlocks(provider)),
			take(1)
		)
		.subscribe(async (block) => {
			console.log('enter subscribe');
			console.log('block in main ', block.number);
			console.log('Job is close to be off cooldown');
			const currentNonce = await provider.getTransactionCount(signer.address);
			// stop if tx in progress...
			const { tx, formattedBundles } = await prepareFirstBundlesForFlashbots(
				job,
				'basicWork',
				signer,
				block,
				priorityFee,
				gasLimit,
				chainId,
				currentNonce,
				2,
				1,
				[200]
			);

			console.log('SENDING TX...');

			const result = await sendAndRetryUntilNotWorkable(
				tx,
				provider,
				priorityFee,
				formattedBundles,
				3,
				flashbots,
				async () => await job.basicWorkable()
			);

			console.log('===== Tx SUCCESS =====');

			// on complex job run some extra needed checks like job.workable().

			// ready to work:
			stopBlocks(provider);
			// send tx with flashbots
			runBasicJob();
		});
}

if (!process.env.TEST_MODE) {
	(async () => {
		const config = await loadConfig();
		console.log({ config: config.log });

		Logger.setLogConfig(config.log);
		runBasicJob();
	})();
}
