import StrategiesJob from '../../abi/StrategiesJob.json';
import { BlockListener } from './../subscriptions/blocks';
import { getMainnetGasType2Parameters, sendTx } from './../transactions';
import { getPrivateKey, getNodeUrlWss } from './../utils';
import { stopAndRestartWork } from './../utils/stopAndRestartWork';
import { providers, Wallet, Contract, BigNumber, Overrides } from 'ethers';
import { mergeMap, timer } from 'rxjs';

const dotenv = require('dotenv');
dotenv.config();

const network = 'goerli';
const nodeUrl = getNodeUrlWss(network);
const provider = new providers.WebSocketProvider(nodeUrl);
const blockListener = new BlockListener(provider);
const JOB_ADDRESS = '0xbA3ae0D23D3CFb74d829615b304F02C366e75d5E';
const PK = getPrivateKey(network);
const BLOCKS_TO_WAIT = 2;
const PRIORITY_FEE = 10; // Dehardcode

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

	const sub = timer(time)
		.pipe(mergeMap(() => blockListener.stream()))
		.subscribe(async (block) => {
			if (txInProgress) return;
			console.log('block: ', block.number);

			console.log('Strategy cooldown completed: ', strategy);

			if (strategyWorkInQueue[strategy] && block.number < targetBlocks[strategy]) {
				console.log('Strategy WORK IN QUEUE BUT WAITING TO REACH TARGET BLOCK: ', strategy);
				return;
			}

			const trigger = true;
			let isWorkable = false;
			try {
				isWorkable = await job.workable(strategy, trigger);
			} catch (error: any) {
				console.log('message: ', error.message);
				console.log({ strategy });
			}
			if (!isWorkable) {
				console.log('NOT WORKABLE: ', block.number, ' strategy: ', strategy);
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
				const { maxFeePerGas, priorityFee } = getMainnetGasType2Parameters({ block, blocksAhead: 0, priorityFee: PRIORITY_FEE });
				const options: Overrides = {
					gasLimit: 10_000_000,
					maxFeePerGas,
					maxPriorityFeePerGas: priorityFee,
					type: 2,
				};

				const explorerUrl = 'https://goerli.etherscan.io';
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
			} catch (error: any) {
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
