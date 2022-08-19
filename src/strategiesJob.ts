import StrategiesJob from '../abi/StrategiesJob.json';
import { Flashbots } from './flashbots/flashbots';
import { getNewBlocks } from './subscriptions/blocks';
import { prepareFirstBundlesForFlashbots, sendAndRetryUntilNotWorkable } from './transactions';
import { Logger, getNodeUrlWss, getPrivateKey, loadConfig } from './utils';
import { providers, Wallet, Contract, BigNumber } from 'ethers';
import { mergeMap, timer, filter } from 'rxjs';

const dotenv = require('dotenv');
dotenv.config();

const network = 'goerli';
const chainId = 5;
const nodeUrl = getNodeUrlWss(network);
const provider = new providers.WebSocketProvider(nodeUrl);
const JOB_ADDRESS = '0xbA3ae0D23D3CFb74d829615b304F02C366e75d5E';
const PK = getPrivateKey(network);
const FLASHBOTS_PK = process.env.FLASHBOTS_APIKEY;
const FLASHBOTS_RPC = 'https://relay-goerli.flashbots.net';

const signer = new Wallet(PK, provider);
const job = new Contract(JOB_ADDRESS, StrategiesJob, signer);
const lastWorkAt2: Record<string, BigNumber> = {};
const strategyWorkInProgress: Record<string, boolean> = {};

export async function runStrategiesJob(): Promise<void> {
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

	const [strategies, cooldown2]: [string[], BigNumber] = await Promise.all([job.strategies(), job.workCooldown()]);
	// fetch 20 strats
	// split in 4 forts

	// INSIDE FORK

	const allLastWorksAt: BigNumber[] = await Promise.all(strategies.map((strategy) => job.lastWorkAt(strategy)));
	strategies.forEach((strategy, i) => {
		lastWorkAt2[strategy] = allLastWorksAt[i];
	});

	strategies.slice(0, 3).forEach((strategy) => {
		tryToWorkStrategy(strategy, cooldown2, flashbots);
	});
}

function tryToWorkStrategy(strategy: string, cooldown: BigNumber, flashbots: Flashbots) {
	console.log('Start Working on strategy: ', strategy);

	const readyTime = lastWorkAt2[strategy].add(cooldown);
	const notificationTime = readyTime;
	const time = notificationTime.mul(1000).sub(Date.now()).toNumber();
	const priorityFee = 10; // TODO DEHARDCODE
	const gasLimit = 10_000_000; // TODO DEHARDCODE

	timer(time)
		.pipe(
			mergeMap(() => getNewBlocks(provider)),
			filter(() => {
				// if (strategyWorkInProgress[strategy]) console.log('strategy work in progress: ', strategy);
				return lastWorkAt2[strategy].add(cooldown).lt(Date.now()) && !strategyWorkInProgress[strategy];
			})
		)
		.subscribe(async (block) => {
			console.log('block: ', block.number);

			console.log('Strategy cooldown completed: ', strategy);

			if (strategyWorkInProgress[strategy]) {
				console.log('Strategy WORK IN PROGRESS: ', strategy);
				return;
			}

			const trigger = true;
			const isWorkable = await job.workable(strategy, trigger);
			if (!isWorkable) {
				console.log('NOT WORKABLE: ', block.number, ' strategy: ', strategy);
				return;
			}
			console.log('Strategy is workable: ', strategy);

			// prepareFirstBundlesForFlashbots
			strategyWorkInProgress[strategy] = true;
			const currentNonce = await provider.getTransactionCount(signer.address);
			const { tx, formattedBundles } = await prepareFirstBundlesForFlashbots({
				job,
				functionName: 'work',
				block,
				priorityFee,
				gasLimit,
				chainId,
				nonce: currentNonce,
				futureBlocks: 0, // future blocks
				burstSize: 2, // bundle size
				functionArgs: [strategy, trigger, 10],
			});

			// sendAndRetryUntilNotWorkable
			const result = await sendAndRetryUntilNotWorkable({
				tx,
				provider,
				priorityFee,
				signer,
				bundles: formattedBundles,
				newBurstSize: 3, // new bundle size
				flashbots,
				isWorkableCheck: () => job.workable(strategy, trigger),
			});
			console.log('===== Tx SUCCESS ===== ', strategy);
			// actualizar lastWorkAt a mano
			lastWorkAt2[strategy] = await job.lastWorkAt(strategy);
			strategyWorkInProgress[strategy] = false;
		});
}

if (!process.env.TEST_MODE) {
	(async () => {
		const config = await loadConfig();
		console.log({ config: config.log });

		Logger.setLogConfig(config.log);
		runStrategiesJob();
	})();
}
