import BasicJob from '../abi/BasicJob.json';
import { Flashbots } from './flashbots/flashbots';
import { emitWhenCloseToBlock, stopBlocks } from './subscriptions/blocks';
import { prepareFirstBundlesForFlashbots, sendAndRetryUntilNotWorkable } from './transactions';
import { Config, loadConfig } from './utils/config';
import { getNodeUrlWss, getPrivateKey } from './utils/env';
import { Logger } from './utils/logger';
import { providers, Wallet, Contract, BigNumber } from 'ethers';
import { formatEther, parseUnits } from 'ethers/lib/utils';

const dotenv = require('dotenv');
dotenv.config();

const network = 'goerli';
const chainId = 5;
const nodeUrl = getNodeUrlWss(network);
const provider = new providers.WebSocketProvider(nodeUrl);
const JOB_ADDRESS = '0x2fF772E1264Eb4d58fF1B62EC0eCf13fc67d39F8';
const PK = getPrivateKey(network);
const FLASHBOTS_PK = process.env.FLASHBOTS_APIKEY;
const FLASHBOTS_RPC = 'https://relay-goerli.flashbots.net';

const signer = new Wallet(PK);
const job = new Contract(JOB_ADDRESS, BasicJob, provider);

export async function run(config?: Config): Promise<void> {
	const winston = Logger.getServiceLogger('test');
	const flashbots = await Flashbots.init(
		signer,
		new Wallet(FLASHBOTS_PK as string),
		provider,
		[FLASHBOTS_RPC],
		true,
		chainId,
		winston
	);

	// 0 = basic
	// 1 = complex
	const [lastWorkAt, cooldown]: BigNumber[] = await Promise.all([job.lastWorkAt(0), job.workCooldown()]);
	const readyToWorkAt = lastWorkAt.add(cooldown);

	const secondsBefore = 10;
	const priorityFee = 10; // TODO DEHARDCODE
	const gasLimit = 1_000_000; // TODO DEHARDCODE

	console.log('started cooldown observable');
	emitWhenCloseToBlock(provider, readyToWorkAt, secondsBefore).subscribe(async (block) => {
		console.log('Job is close to be off cooldown');
		const { tx, formattedBundles } = await prepareFirstBundlesForFlashbots(
			job,
			'basicWork',
			signer,
			block,
			priorityFee,
			gasLimit,
			chainId,
			5,
			1
		);

		console.log({ tx });
		console.log({ formattedBundles });

		console.log('SENDING TX...');

		const result = await sendAndRetryUntilNotWorkable(
			tx,
			provider,
			priorityFee,
			formattedBundles,
			3,
			flashbots,
			job,
			'basicWorkable'
		);

		console.log('Tx SUCCESS');

		// on complex job run some extra needed checks like job.workable().

		// ready to work:
		stopBlocks(provider);
		// send tx with flashbots
		// run();
	});
}

if (!process.env.TEST_MODE) {
	(async () => {
		const config = await loadConfig();
		console.log({ config: config.log });

		Logger.setLogConfig(config.log);
		run();
	})();
}
