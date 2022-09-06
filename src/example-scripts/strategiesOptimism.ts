import StrategiesJob from '../../abi/StrategiesJob.json';
import { BlockListener } from './../subscriptions/blocks';
import { sendTx } from './../transactions';
import { getNodeUrlWss, getPrivateKey } from './../utils';
import { stopAndRestartWork } from './../utils/stopAndRestartWork';
import { providers, Wallet, Contract, BigNumber } from 'ethers';
import { mergeMap, timer } from 'rxjs';

const dotenv = require('dotenv');
dotenv.config();

const network = 'optimism';
const nodeUrl = getNodeUrlWss(network);
const provider = new providers.WebSocketProvider(nodeUrl);
const blockListener = new BlockListener(provider);
const JOB_ADDRESS = '0x647Fdb71eEA4f9A94E14964C40027718C931bEe5';
const PK = getPrivateKey(network);
const BLOCKS_TO_WAIT = 2;

const signer = new Wallet(PK, provider);
const job = new Contract(JOB_ADDRESS, StrategiesJob, signer);
const lastWorkAt: Record<string, BigNumber> = {};
const strategyWorkInQueue: Record<string, boolean> = {};
const targetBlocks: Record<string, number> = {};
const options = {
	gasLimit: 1_000_000, // TODO DEHARDCODE
};

let txInProgress = false;
let cooldown: BigNumber;

export async function runStrategiesJob(): Promise<void> {
	const [strategies, cd]: [string[], BigNumber] = await Promise.all([job.strategies(), job.workCooldown()]);
	cooldown = cd;

	const allLastWorksAt: BigNumber[] = await Promise.all(strategies.map((strategy) => job.lastWorkAt(strategy)));
	strategies.forEach((strategy, i) => {
		lastWorkAt[strategy] = allLastWorksAt[i];
	});

	strategies.slice(0, 1).forEach((strategy) => {
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

			console.log(`${strategy} cooldown completed at block: ${block.number}`);

			if (strategyWorkInQueue[strategy] && block.number < targetBlocks[strategy]) {
				console.warn('Strategy WORK IN QUEUE BUT NOT READY: ', strategy);
				return;
			}

			const trigger = true;
			const isWorkable = await job.workable(strategy, trigger);
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

				const explorerUrl = 'https://blockscout.com/optimism/goerli';
				await sendTx({
					contractCall: () =>
						job.work(strategy, trigger, 10, {
							...options,
						}),
					explorerUrl,
				});

				console.log('===== Tx SUCCESS ===== ', strategy);
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