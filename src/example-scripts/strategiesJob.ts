import StrategiesJob from '../../abi/StrategiesJob.json';
import {
	getNodeUrlWss,
	getPrivateKey,
	FLASHBOTS_RPC_BY_NETWORK,
	NETWORKS_IDS_BY_NAME,
	SUPPORTED_NETWORKS,
	Address,
} from '../utils';
import { Flashbots } from './../flashbots/flashbots';
import { BlockListener } from './../subscriptions/blocks';
import {
	getMainnetGasType2Parameters,
	createBundlesWithSameTxs,
	sendAndRetryUntilNotWorkable,
	populateTransactions,
} from './../transactions';
import { stopAndRestartWork } from './../utils/stopAndRestartWork';
import { TransactionRequest } from '@ethersproject/abstract-provider';
import { makeid } from '@keep3r-network/cli-utils';
import { providers, Wallet, Contract, BigNumber, Overrides } from 'ethers';
import { mergeMap, timer, filter } from 'rxjs';

const dotenv = require('dotenv');
dotenv.config();

/*
	Note: This job is a simplified version of harvest-v2-keep3r-v2 script. It uses strategies, but doesn't add the complexity of
		  using the StealthRelayer contract.
*/

/*==============================================================/*
		                      SETUP
/*==============================================================*/

const network: SUPPORTED_NETWORKS = 'goerli';
const chainId: number = NETWORKS_IDS_BY_NAME[network];
const nodeUrl = getNodeUrlWss(network);
const provider = new providers.WebSocketProvider(nodeUrl);
const JOB_ADDRESS = '0xbA3ae0D23D3CFb74d829615b304F02C366e75d5E';
const PK = getPrivateKey(network);
const FLASHBOTS_PK = process.env.FLASHBOTS_BUNDLE_SIGNING_KEY;
const FLASHBOTS_RPC: string = FLASHBOTS_RPC_BY_NETWORK[network];
const blockListener = new BlockListener(provider);

const signer = new Wallet(PK, provider);
const job = new Contract(JOB_ADDRESS, StrategiesJob, signer);
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

	const allLastWorksAt: BigNumber[] = await Promise.all(strategies.map((strategy) => job.lastWorkAt(strategy)));
	strategies.forEach((strategy, i) => {
		lastWorkAt[strategy] = allLastWorksAt[i];
	});

	strategies.forEach((strategy) => {
		tryToWorkStrategy(strategy);
	});
}

function tryToWorkStrategy(strategy: Address) {
	console.log('\nStart Working on strategy: ', strategy);

	const readyTime = lastWorkAt[strategy].add(cooldown);
	const notificationTime = readyTime;
	const time = notificationTime.mul(1000).sub(Date.now()).toNumber();

	const sub = timer(time)
		.pipe(
			mergeMap(() => blockListener.stream(strategy)),
			filter(() => {
				return !strategyWorkInProgress[strategy];
			})
		)
		.subscribe(async (block) => {
			console.log('\nblock: ', block.number);

			console.log('\nStrategy cooldown completed: ', strategy);

			const trigger = true;
			const isWorkable = await job.workable(strategy, trigger);
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
			console.log('\nStrategy is workable: ', strategy);

			strategyWorkInProgress[strategy] = true;

			const currentNonce = await provider.getTransactionCount(signer.address);

			const blocksAhead = FUTURE_BLOCKS + FIRST_BURST_SIZE;

			const { priorityFeeInGwei, maxFeePerGas } = getMainnetGasType2Parameters({
				block,
				blocksAhead,
				priorityFeeInWei: PRIORITY_FEE,
			});

			const options: Overrides = {
				gasLimit: 10_000_000,
				nonce: currentNonce,
				maxFeePerGas,
				maxPriorityFeePerGas: priorityFeeInGwei,
				type: 2,
			};

			const txs: TransactionRequest[] = await populateTransactions({
				chainId,
				contract: job,
				functionArgs: [[strategy, trigger, 10]],
				functionName: 'work',
				options,
			});

			const firstBlockOfBatch = block.number + FUTURE_BLOCKS;
			const bundles = createBundlesWithSameTxs({
				unsignedTxs: txs,
				burstSize: FIRST_BURST_SIZE,
				firstBlockOfBatch,
			});
			const dynamicDebugId = makeid(5);
			const result = await sendAndRetryUntilNotWorkable({
				txs,
				provider,
				priorityFeeInWei: PRIORITY_FEE,
				signer,
				bundles,
				newBurstSize: RETRY_BURST_SIZE,
				flashbots,
				isWorkableCheck: () => job.workable(strategy, trigger),
				staticDebugId: strategy,
				dynamicDebugId,
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
