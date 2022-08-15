import StrategiesJob from '../abi/StrategiesJob.json';
import { getNewBlocks } from './subscriptions/blocks';
import { sendSingleTx } from './transactions';
import { loadConfig } from './utils/config';
import { getNodeUrlWss, getPrivateKey } from './utils/env';
import { Logger } from './utils/logger';
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
const BLOCKS_TO_WAIT = 2;

const signer = new Wallet(PK, provider);
const job = new Contract(JOB_ADDRESS, StrategiesJob, signer);
const lastWorkAt2: Record<string, BigNumber> = {};
const strategyWorkInQueue: Record<string, boolean> = {};
const targetBlocks: Record<string, number> = {};

const readyStrategies: string[] = [];
let txInProgress = false;

export async function runStrategiesJob(): Promise<void> {
	const [strategies, cooldown2]: [string[], BigNumber] = await Promise.all([job.strategies(), job.workCooldown()]);
	// fetch 20 strats
	// split in 4 forts

	// INSIDE FORK

	const allLastWorksAt: BigNumber[] = await Promise.all(strategies.map((strategy) => job.lastWorkAt(strategy)));
	strategies.forEach((strategy, i) => {
		lastWorkAt2[strategy] = allLastWorksAt[i];
	});

	strategies.slice(0, 3).forEach((strategy) => {
		tryToWorkStrategy(strategy, cooldown2);
	});
}

function tryToWorkStrategy(strategy: string, cooldown: BigNumber) {
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
				return lastWorkAt2[strategy].add(cooldown).lt(Date.now());
			})
		)
		.subscribe(async (block) => {
			console.log('block: ', block.number);

			console.log('Strategy cooldown completed: ', strategy);

			if (strategyWorkInQueue[strategy] && block.number < targetBlocks[strategy]) {
				console.log('Strategy WORK IN QUEUE BUT NOT READY: ', strategy);
				return;
			}

			const trigger = true;
			const isWorkable = await job.workable(strategy, trigger);
			if (!isWorkable) {
				console.log('NOT WORKABLE: ', block.number, ' strategy: ', strategy);
				removeElement(readyStrategies, strategy);
				lastWorkAt2[strategy] = await job.lastWorkAt(strategy);
				strategyWorkInQueue[strategy] = false;
				targetBlocks[strategy] = 0;
				return;
			}
			if (!readyStrategies.includes(strategy) && (!targetBlocks[strategy] || targetBlocks[strategy] == 0)) {
				strategyWorkInQueue[strategy] = true;
				targetBlocks[strategy] = block.number + BLOCKS_TO_WAIT;
				return;
			}

			try {
				if (txInProgress) return;
				txInProgress = true;
				readyStrategies.push(strategy);
				await sendSingleTx(job, 'work', signer, block, priorityFee, gasLimit, chainId, [strategy, trigger, 10]);
				console.log('===== Tx SUCCESS ===== ', strategy);
				lastWorkAt2[strategy] = await job.lastWorkAt(strategy);
				strategyWorkInQueue[strategy] = false;
				targetBlocks[strategy] = 0;
				removeElement(readyStrategies, strategy);
				txInProgress = false;
			} catch (error) {
				console.log('===== Tx FAILED ===== ', strategy);
				console.log(`Transaction failed. Reason: ${error.reason}`);
			}
		});
}

function removeElement(arr: any[], element: any) {
	const index = arr.indexOf(element);
	if (index == -1) return arr;
	arr.splice(index, 1);
}

if (!process.env.TEST_MODE) {
	(async () => {
		const config = await loadConfig();
		console.log({ config: config.log });

		Logger.setLogConfig(config.log);
		runStrategiesJob();
	})();
}
