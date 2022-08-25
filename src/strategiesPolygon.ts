import StrategiesJob from '../abi/StrategiesJob.json';
import { GasService } from './services/gas.service';
import { BlockListener } from './subscriptions/blocks';
import { sendTx } from './transactions';
import { getNodeUrlWss, getPrivateKey, toGwei } from './utils';
import { stopAndRestartWork } from './utils/stopAndRestartWork';
import { providers, Wallet, Contract, BigNumber, Overrides } from 'ethers';
import { mergeMap, timer } from 'rxjs';

const dotenv = require('dotenv');
dotenv.config();

const network = 'polygon';
const chainId = 137;
const nodeUrl = getNodeUrlWss(network);
const provider = new providers.WebSocketProvider(nodeUrl);
const blockListener = new BlockListener(provider);
const JOB_ADDRESS = '0x647Fdb71eEA4f9A94E14964C40027718C931bEe5';
const PK = getPrivateKey(network);
const BLOCKS_TO_WAIT = 2;
const gasService = new GasService();

const signer = new Wallet(PK, provider);
const job = new Contract(JOB_ADDRESS, StrategiesJob, signer);
const lastWorkAt: Record<string, BigNumber> = {};
const strategyWorkInQueue: Record<string, boolean> = {};
const targetBlocks: Record<string, number> = {};

let txInProgress = false;
let cooldown: BigNumber;

export async function runStrategiesJob(): Promise<void> {
	const [strategies, cd]: [string[], BigNumber] = await Promise.all([job.strategies(), job.workCooldown()]);
	cooldown = cd;

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
		tryToWorkStrategy(strategy);
	});
}

function tryToWorkStrategy(strategy: string) {
	console.log('Start Working on strategy: ', strategy);

	const readyTime = lastWorkAt[strategy].add(cooldown);
	const notificationTime = readyTime;
	const time = notificationTime.mul(1000).sub(Date.now()).toNumber();
	const gasLimit = 10_000_000; // TODO DEHARDCODE

	const sub = timer(time)
		.pipe(mergeMap(() => blockListener.stream()))
		.subscribe(async (block) => {
			if (txInProgress) return;
			console.log('block: ', block.number);

			console.log('Strategy cooldown completed: ', strategy);

			if (strategyWorkInQueue[strategy] && block.number < targetBlocks[strategy]) {
				console.warn('Strategy WORK IN QUEUE BUT NOT READY: ', strategy);
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
				console.warn('NOT WORKABLE: ', block.number, ' strategy: ', strategy);
				const tempLastWorkAt: BigNumber = await job.lastWorkAt(strategy);
				if (!tempLastWorkAt.eq(lastWorkAt[strategy])) {
					lastWorkAt[strategy] = tempLastWorkAt;
					strategyWorkInQueue[strategy] = false;
					targetBlocks[strategy] = 0;
					stopAndRestartWork(strategy, blockListener, sub, tryToWorkStrategy);
				}
				return;
			}
			if (!targetBlocks[strategy] || targetBlocks[strategy] === 0) {
				strategyWorkInQueue[strategy] = true;
				targetBlocks[strategy] = block.number + BLOCKS_TO_WAIT;
				return;
			}

			try {
				if (txInProgress) return;
				txInProgress = true;

				const gasFees = await gasService.getGasFees(chainId);
				const options: Overrides = {
					gasLimit: 10_000_000,
					maxFeePerGas: toGwei(Math.ceil(gasFees.maxFeePerGas) + 10),
					maxPriorityFeePerGas: toGwei(Math.ceil(gasFees.maxPriorityFeePerGas) + 10),
					type: 2,
				};
				const explorerUrl = 'https://polygonscan.com';
				await sendTx({
					contractCall: () =>
						job.work(strategy, trigger, 10, {
							...options,
						}),
					explorerUrl,
				});

				console.log(`===== Tx SUCCESS IN BLOCK ${block.number} ===== `, strategy);
				lastWorkAt[strategy] = await job.lastWorkAt(strategy);
				strategyWorkInQueue[strategy] = false;
				targetBlocks[strategy] = 0;
				txInProgress = false;
				stopAndRestartWork(strategy, blockListener, sub, tryToWorkStrategy);
			} catch (error) {
				console.log('===== Tx FAILED ===== ', strategy);
				console.log(`Transaction failed. Reason: ${error.message}`);
				txInProgress = false;
				stopAndRestartWork(strategy, blockListener, sub, tryToWorkStrategy);
			}
		});
}

if (!process.env.TEST_MODE) {
	(async () => {
		runStrategiesJob();
	})();
}
