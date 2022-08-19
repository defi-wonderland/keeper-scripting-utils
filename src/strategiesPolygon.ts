import StrategiesJob from '../abi/StrategiesJob.json';
import { GasService } from './services/gas.service';
import { getNewBlocks } from './subscriptions/blocks';
import { sendTx } from './transactions';
import { Logger, getNodeUrl, getPrivateKey, loadConfig } from './utils';
import { providers, Wallet, Contract, BigNumber } from 'ethers';
import { mergeMap, timer, filter } from 'rxjs';

const dotenv = require('dotenv');
dotenv.config();

const network = 'polygon';
const chainId = 137;
const nodeUrl = getNodeUrl(network);
const provider = new providers.JsonRpcProvider(nodeUrl);
// const nodeUrl = getNodeUrlWss(network);
// const provider = new providers.WebSocketProvider(nodeUrl);
const JOB_ADDRESS = '0x647Fdb71eEA4f9A94E14964C40027718C931bEe5';
const PK = getPrivateKey(network);
const BLOCKS_TO_WAIT = 2;
const gasService = new GasService();

const signer = new Wallet(PK, provider);
const job = new Contract(JOB_ADDRESS, StrategiesJob, signer);
const lastWorkAt: Record<string, BigNumber> = {};
const strategyWorkInQueue: Record<string, boolean> = {};
const targetBlocks: Record<string, number> = {};

const readyStrategies: string[] = [];
let txInProgress = false;

export async function runStrategiesJob(): Promise<void> {
	const [strategies, cooldown]: [string[], BigNumber] = await Promise.all([job.strategies(), job.workCooldown()]);

	const maxStrategiesPerBatch = 5;
	const batchesToCreate = Math.ceil(strategies.length / maxStrategiesPerBatch);

	for (let index = 0; index < batchesToCreate; index++) {
		const start = index * maxStrategiesPerBatch;
		const batch = strategies.slice(start, start + maxStrategiesPerBatch);
		console.log('Fetching batch number:', index + 1);

		const lastWorksAt: BigNumber[] = await Promise.all(batch.map((strategy) => job.lastWorkAt(strategy)));
		batch.forEach((strategy, i) => {
			lastWorkAt[strategy] = lastWorksAt[i];
		});
	}

	strategies.forEach((strategy) => {
		tryToWorkStrategy(strategy, cooldown);
	});
}

function tryToWorkStrategy(strategy: string, cooldown: BigNumber) {
	console.log('Start Working on strategy: ', strategy);

	const readyTime = lastWorkAt[strategy].add(cooldown);
	const notificationTime = readyTime;
	const time = notificationTime.mul(1000).sub(Date.now()).toNumber();
	const gasLimit = 10_000_000; // TODO DEHARDCODE

	timer(time)
		.pipe(
			mergeMap(() => getNewBlocks(provider)),
			filter(() => {
				return lastWorkAt[strategy].add(cooldown).lt(Date.now());
			})
		)
		.subscribe(async (block) => {
			if (txInProgress) return;
			console.log('block: ', block.number);

			console.log('Strategy cooldown completed: ', strategy);

			if (strategyWorkInQueue[strategy] && block.number < targetBlocks[strategy]) {
				console.log('Strategy WORK IN QUEUE BUT NOT READY: ', strategy);
				return;
			}

			const trigger = true;
			let isWorkable = false;
			try {
				isWorkable = await job.workable(strategy, trigger);
			} catch (error) {
				console.log('message: ', error.message);
				console.log({ strategy });
			}
			if (!isWorkable) {
				console.log('NOT WORKABLE: ', block.number, ' strategy: ', strategy);
				removeElement(readyStrategies, strategy);
				lastWorkAt[strategy] = await job.lastWorkAt(strategy);
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

				const gasFees = await gasService.getGasFees(chainId);
				const explorerUrl = 'https://polygonscan.com';
				await sendTx({
					contract: job,
					functionName: 'work',
					maxFeePerGas: gasFees.maxFeePerGas,
					maxPriorityFeePerGas: gasFees.maxPriorityFeePerGas,
					gasLimit,
					chainId,
					functionArgs: [strategy, trigger, 10],
					explorerUrl,
				});

				console.log('===== Tx SUCCESS ===== ', strategy);
				lastWorkAt[strategy] = await job.lastWorkAt(strategy);
				strategyWorkInQueue[strategy] = false;
				targetBlocks[strategy] = 0;
				removeElement(readyStrategies, strategy);
				txInProgress = false;
			} catch (error) {
				console.log('===== Tx FAILED ===== ', strategy);
				console.log(`Transaction failed. Reason: ${error.message}`);
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
