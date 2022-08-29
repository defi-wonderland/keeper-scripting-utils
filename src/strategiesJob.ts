import StrategiesJob from '../abi/StrategiesJob.json';
import { Flashbots } from './flashbots/flashbots';
import { BlockListener } from './subscriptions/blocks';
import { getMainnetGasType2Parameters, prepareFirstBundlesForFlashbots, sendAndRetryUntilNotWorkable } from './transactions';
import { getNodeUrlWss, getPrivateKey } from './utils';
import { stopAndRestartWork } from './utils/stopAndRestartWork';
import { providers, Wallet, Contract, BigNumber, Overrides } from 'ethers';
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
const blockListener = new BlockListener(provider);

const signer = new Wallet(PK, provider);
const job = new Contract(JOB_ADDRESS, StrategiesJob, signer);
const lastWorkAt: Record<string, BigNumber> = {};
const strategyWorkInProgress: Record<string, boolean> = {};

const FIRST_BURST_SIZE = 2;
const FUTURE_BLOCKS = 0;
const RETRY_BURST_SIZE = 3;
const PRIORITY_FEE = 10; // Dehardcode

let flashbots: Flashbots;

let cooldown: BigNumber;

export async function runStrategiesJob(): Promise<void> {
	if (!flashbots) {
		flashbots = await Flashbots.init(signer, new Wallet(FLASHBOTS_PK as string), provider, [FLASHBOTS_RPC], false, chainId);
	}
	const [strategies, cd]: [string[], BigNumber] = await Promise.all([job.strategies(), job.workCooldown()]);
	cooldown = cd;

	const allLastWorksAt: BigNumber[] = await Promise.all(strategies.map((strategy) => job.lastWorkAt(strategy)));
	strategies.forEach((strategy, i) => {
		lastWorkAt[strategy] = allLastWorksAt[i];
	});

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
		.pipe(
			mergeMap(() => blockListener.stream()),
			filter(() => {
				return !strategyWorkInProgress[strategy];
			})
		)
		.subscribe(async (block) => {
			console.log('block: ', block.number);

			console.log('Strategy cooldown completed: ', strategy);

			const trigger = true;
			const isWorkable = await job.workable(strategy, trigger);
			if (!isWorkable) {
				console.log('NOT WORKABLE: ', block.number, ' strategy: ', strategy);
				lastWorkAt[strategy] = await job.lastWorkAt(strategy);
				strategyWorkInProgress[strategy] = false;
				stopAndRestartWork(strategy, blockListener, sub, tryToWorkStrategy);
				return;
			}
			console.log('Strategy is workable: ', strategy);

			strategyWorkInProgress[strategy] = true;

			const currentNonce = await provider.getTransactionCount(signer.address);

			const blocksAhead = FUTURE_BLOCKS + FIRST_BURST_SIZE;

			const { priorityFee, maxFeePerGas } = getMainnetGasType2Parameters({ block, blocksAhead, priorityFee: PRIORITY_FEE });

			const options: Overrides = {
				gasLimit: 10_000_000,
				nonce: currentNonce,
				maxFeePerGas,
				maxPriorityFeePerGas: priorityFee,
				type: 2,
			};

			const { txs, bundles } = await prepareFirstBundlesForFlashbots({
				contract: job,
				functionName: 'work',
				block,
				futureBlocks: FUTURE_BLOCKS,
				burstSize: FIRST_BURST_SIZE,
				functionArgs: [[strategy, trigger, 10]],
				options,
			});

			await sendAndRetryUntilNotWorkable({
				txs,
				provider,
				priorityFee: PRIORITY_FEE,
				signer,
				bundles,
				newBurstSize: RETRY_BURST_SIZE,
				flashbots,
				sendThroughStealthRelayer: false,
				isWorkableCheck: () => job.workable(strategy, trigger),
			});

			console.log('===== Tx SUCCESS ===== ', strategy);
			lastWorkAt[strategy] = await job.lastWorkAt(strategy);
			strategyWorkInProgress[strategy] = false;
			stopAndRestartWork(strategy, blockListener, sub, tryToWorkStrategy);
		});
}

if (!process.env.TEST_MODE) {
	(async () => {
		runStrategiesJob();
	})();
}
