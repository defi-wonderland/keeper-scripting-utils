import TendV2KeeperV2ABI from '../../../abi/TendV2KeeperV2ABI.json';
import { Flashbots } from '../../../flashbots/flashbots';
import { BlockListener } from '../../../subscriptions/blocks';
import {
	getMainnetGasType2Parameters,
	createBundlesWithSameTxs,
	sendAndRetryUntilNotWorkable,
	populateTransactions,
} from '../../../transactions';
import {
	getNodeUrlWss,
	getPrivateKey,
	ChainId,
	FLASHBOTS_RPC_BY_NETWORK,
	NETWORKS_IDS_BY_NAME,
	SUPPORTED_NETWORKS,
	Address,
} from '../../../utils';
import { stopAndRestartWork } from '../../../utils/stopAndRestartWork';
import { TransactionRequest } from '@ethersproject/abstract-provider';
import { makeid } from '@keep3r-network/cli-utils';
import { providers, Wallet, Contract, BigNumber, Overrides } from 'ethers';
import { mergeMap, timer, filter } from 'rxjs';

const dotenv = require('dotenv');
dotenv.config();

const network: SUPPORTED_NETWORKS = 'mainnet';
const chainId: ChainId = NETWORKS_IDS_BY_NAME[network];
const FLASHBOTS_RPC: string = FLASHBOTS_RPC_BY_NETWORK[network];
const nodeUrl = getNodeUrlWss(network);
const provider = new providers.WebSocketProvider(nodeUrl);
const JOB_ADDRESS = '0xcd7f72f12c4b87dabd31d3aa478a1381150c32b3';
const PK = getPrivateKey(network);
const FLASHBOTS_PK = process.env.FLASHBOTS_BUNDLE_SIGNING_KEY;
const blockListener = new BlockListener(provider);

const signer = new Wallet(PK, provider);
const job = new Contract(JOB_ADDRESS, TendV2KeeperV2ABI, signer);
const lastWorkAt: Record<string, BigNumber> = {};
const strategyWorkInProgress: Record<string, boolean> = {};

const FIRST_BURST_SIZE = 2;
const FUTURE_BLOCKS = 0;
const RETRY_BURST_SIZE = 3;
const PRIORITY_FEE = 2.1;

let flashbots: Flashbots;

let cooldown: BigNumber;

export async function runStrategiesJob(): Promise<void> {
	if (!flashbots) {
		flashbots = await Flashbots.init(signer, new Wallet(FLASHBOTS_PK as string), provider, [FLASHBOTS_RPC], false, chainId);
	}
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

function tryToWorkStrategy(strategy: Address) {
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
			let isWorkable;

			try {
				isWorkable = await job.workable(strategy);
			} catch (error: any) {
				console.log('message: ', error.message);
				console.log({ strategy });
			}

			if (!isWorkable) {
				console.log('NOT WORKABLE: ', block.number, ' strategy: ', strategy);
				const tempLastWorkAt: BigNumber = await job.lastWorkAt(strategy);
				if (!tempLastWorkAt.eq(lastWorkAt[strategy])) {
					lastWorkAt[strategy] = tempLastWorkAt;
					strategyWorkInProgress[strategy] = false;
					stopAndRestartWork(strategy, blockListener, sub, tryToWorkStrategy);
				}
				return;
			}
			console.log('Strategy is workable: ', strategy);

			strategyWorkInProgress[strategy] = true;

			const currentNonce = await provider.getTransactionCount(signer.address);

			const blocksAhead = FUTURE_BLOCKS + FIRST_BURST_SIZE;

			const { priorityFeeInGwei, maxFeePerGas } = getMainnetGasType2Parameters({
				block,
				blocksAhead,
				priorityFeeInWei: PRIORITY_FEE,
			});

			const options: Overrides = {
				gasLimit: 1_000_000,
				nonce: currentNonce,
				maxFeePerGas,
				maxPriorityFeePerGas: priorityFeeInGwei,
				type: 2,
			};

			const txs: TransactionRequest[] = await populateTransactions({
				chainId,
				contract: job,
				functionArgs: [[strategy]],
				functionName: 'work',
				options,
			});

			const firstBlockOfBatch = block.number + FUTURE_BLOCKS;
			const bundles = createBundlesWithSameTxs({
				unsignedTxs: txs,
				burstSize: FIRST_BURST_SIZE,
				firstBlockOfBatch,
			});

			const result = await sendAndRetryUntilNotWorkable({
				txs,
				provider,
				priorityFeeInWei: PRIORITY_FEE,
				signer,
				bundles,
				newBurstSize: RETRY_BURST_SIZE,
				flashbots,
				isWorkableCheck: () => job.workable(strategy),
				staticDebugId: strategy,
				dynamicDebugId: makeid(5),
			});

			if (result) console.log('===== Tx SUCCESS ===== ', strategy);
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
