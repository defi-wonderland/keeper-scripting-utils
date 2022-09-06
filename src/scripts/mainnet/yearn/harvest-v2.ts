import HarvestV2ABI from '../../../../abi/OldHarvestV2.json';
import StealthRelayerABI from '../../../../abi/StealthRelayer.json';
import { Flashbots } from '../../../flashbots/flashbots';
import { BlockListener } from '../../../subscriptions/blocks';
import {
	getMainnetGasType2Parameters,
	sendAndRetryUntilNotWorkable,
	populateTransactions,
	createBundlesWithDifferentTxs,
} from '../../../transactions';
import { getNodeUrlWss, getPrivateKey } from '../../../utils';
import { stopAndRestartWork } from '../../../utils/stopAndRestartWork';
import { TransactionRequest } from '@ethersproject/abstract-provider';
import { getStealthHash, makeid } from '@keep3r-network/cli-utils';
import { providers, Wallet, Contract, BigNumber, Overrides } from 'ethers';
import { mergeMap, timer, filter } from 'rxjs';

const dotenv = require('dotenv');
dotenv.config();

const network = 'mainnet';
const chainId = 1;
const nodeUrl = getNodeUrlWss(network);
const provider = new providers.WebSocketProvider(nodeUrl);
const JOB_ADDRESS = '0x2150b45626199CFa5089368BDcA30cd0bfB152D6';
const stealthRelayerAddress = '0x0a61c2146A7800bdC278833F21EBf56Cd660EE2a';
const PK = getPrivateKey(network);
const FLASHBOTS_PK = process.env.FLASHBOTS_APIKEY;
const FLASHBOTS_RPC = 'https://relay.flashbots.net';
const blockListener = new BlockListener(provider);

const signer = new Wallet(PK, provider);
const harvestJob = new Contract(JOB_ADDRESS, HarvestV2ABI, signer);
const stealthRelayer = new Contract(stealthRelayerAddress, StealthRelayerABI, signer);

const lastWorkAt: Record<string, BigNumber> = {};
const strategyWorkInProgress: Record<string, boolean> = {};
const workData: Record<string, string> = {};

const FIRST_BURST_SIZE = 2;
const FUTURE_BLOCKS = 0;
const RETRY_BURST_SIZE = 3;
const PRIORITY_FEE = 2.1; // Dehardcode

let flashbots: Flashbots;

let cooldown: BigNumber;

export async function runStrategiesJob(): Promise<void> {
	if (!flashbots) {
		flashbots = await Flashbots.init(signer, new Wallet(FLASHBOTS_PK as string), provider, [FLASHBOTS_RPC], false, chainId);
	}

	const [strategies, cd]: [string[], BigNumber] = await Promise.all([harvestJob.strategies(), harvestJob.workCooldown()]);
	cooldown = cd;

	const maxStrategiesPerBatch = 5;
	const batchesToCreate = Math.ceil(strategies.length / maxStrategiesPerBatch);

	for (let index = 0; index < batchesToCreate; index++) {
		const start = index * maxStrategiesPerBatch;
		const batch = strategies.slice(start, start + maxStrategiesPerBatch);
		console.log('Fetching batch number:', index + 1);

		const lastWorksAt: BigNumber[] = await Promise.all(batch.map((strategy) => harvestJob.lastWorkAt(strategy)));
		batch.forEach((strategy, i) => {
			lastWorkAt[strategy] = lastWorksAt[i];
		});
	}

	const allWorkData: string[] = await Promise.all(
		strategies.map((strategy) => harvestJob.interface.encodeFunctionData('work', [strategy]))
	);

	strategies.forEach((strategy, i) => {
		workData[strategy] = allWorkData[i];
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
			const stealthHash = getStealthHash();
			let isWorkable;

			try {
				isWorkable = await harvestJob.workable(strategy);
			} catch (error: any) {
				console.log('message: ', error.message);
				console.log({ strategy });
			}
			if (!isWorkable) {
				console.log('NOT WORKABLE: ', block.number, ' strategy: ', strategy);
				const tempLastWorkAt: BigNumber = await harvestJob.lastWorkAt(strategy);
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

			const { priorityFee, maxFeePerGas } = getMainnetGasType2Parameters({ block, blocksAhead, priorityFee: PRIORITY_FEE });

			const options: Overrides = {
				gasLimit: 5_000_000,
				nonce: currentNonce,
				maxFeePerGas,
				maxPriorityFeePerGas: priorityFee,
				type: 2,
			};

			const firstBlockOfBatch = block.number + FUTURE_BLOCKS;
			const txs: TransactionRequest[] = await populateTransactions({
				chainId,
				contract: stealthRelayer,
				functionArgs: [
					[JOB_ADDRESS, workData[strategy], stealthHash, firstBlockOfBatch],
					[JOB_ADDRESS, workData[strategy], stealthHash, firstBlockOfBatch + 1],
				],
				functionName: 'execute',
				options,
			});

			const bundles = createBundlesWithDifferentTxs({
				unsignedTxs: txs,
				burstSize: FIRST_BURST_SIZE,
				firstBlockOfBatch,
			});

			const result = await sendAndRetryUntilNotWorkable({
				txs,
				provider,
				priorityFee: PRIORITY_FEE,
				signer,
				bundles,
				newBurstSize: RETRY_BURST_SIZE,
				flashbots,
				isWorkableCheck: () => harvestJob.workable(strategy),
				regenerateTxs: async (burstSize, firstBlockOfNextBatch) => {
					const populateTxsPromises = new Array(burstSize).fill(null).map((_, index) => {
						return stealthRelayer.populateTransaction.execute(
							JOB_ADDRESS,
							workData[strategy],
							stealthHash,
							firstBlockOfNextBatch + index,
							{ ...options }
						);
					});

					return (await Promise.all(populateTxsPromises)).map((tx) => ({ ...tx, chainId }));
				},
				bundleRegenerationMethod: 'createBundlesWithDifferentTxs',
				staticDebugId: strategy,
				dynamicDebugId: makeid(5),
			});

			if (result) console.log('===== Tx SUCCESS ===== ', strategy);
			lastWorkAt[strategy] = await harvestJob.lastWorkAt(strategy);
			strategyWorkInProgress[strategy] = false;
			stopAndRestartWork(strategy, blockListener, sub, tryToWorkStrategy);
		});
}

if (!process.env.TEST_MODE) {
	(async () => {
		runStrategiesJob();
	})();
}
