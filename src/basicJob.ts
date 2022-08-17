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

const signer = new Wallet(PK, provider);
const job = new Contract(JOB_ADDRESS, BasicJob, signer);

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

			const { tx, formattedBundles } = await prepareFirstBundlesForFlashbots({
				job,
				functionName: 'basicWork',
				block,
				priorityFee,
				gasLimit,
				chainId,
				nonce: currentNonce,
				futureBlocks: 2,
				burstSize: 2,
				functionArgs: [200],
			});

			console.log('SENDING TX...');

			const result = await sendAndRetryUntilNotWorkable({
				tx,
				provider,
				priorityFee,
				bundles: formattedBundles,
				newBurstSize: 3,
				flashbots,
				signer,
				isWorkableCheck: async () => await job.basicWorkable(),
			});

			console.log('===== Tx SUCCESS =====');

			stopBlocks(provider);
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