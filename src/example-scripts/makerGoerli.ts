import MakerDAOUpkeepABI from '../../abi/MakerDAOUpkeep.json';
import SequencerABI from '../../abi/Sequencer.json';
import { Flashbots } from '../flashbots/flashbots';
import { BlockListener } from '../subscriptions/blocks';
import {
	getMainnetGasType2Parameters,
	sendAndRetryUntilNotWorkable,
	populateTransactions,
	createBundlesWithSameTxs,
} from '../transactions';
import { getNodeUrlWss, getPrivateKey } from '../utils';
import { stopAndRestartWorkUpkeep } from '../utils/stopAndRestartWork';
import { TransactionRequest, Block } from '@ethersproject/abstract-provider';
import { makeid } from '@keep3r-network/cli-utils';
import { providers, Wallet, Contract, BigNumber, Overrides, ethers } from 'ethers';
import { formatBytes32String } from 'ethers/lib/utils';
import { mergeMap, timer } from 'rxjs';

const dotenv = require('dotenv');
dotenv.config();

const KEEP3R_SEQUENCER_POSITION = 2;
const UPKEEP_JOB_ADDRESS = '0x29b1b692dc9fe35cb2ee28bd8ce1ef0edfd0bf37';
const SEQUENCER = '0xa8db33bEd8EC48737F54665D4eCD2e37977ea439';
const network = 'goerli';
const chainId = 5;
const nodeUrl = getNodeUrlWss(network);
const provider = new providers.WebSocketProvider(nodeUrl);
const PK = getPrivateKey(network);
const FLASHBOTS_PK = process.env.FLASHBOTS_APIKEY;
const FLASHBOTS_RPC = 'https://relay-goerli.flashbots.net';
const blockListener = new BlockListener(provider);
const KEEP3R_NETWORK_TAG = formatBytes32String('KEEP3R');

const signer = new Wallet(PK, provider);
const upkeepJob = new Contract(UPKEEP_JOB_ADDRESS, MakerDAOUpkeepABI, signer);
const sequencer = new Contract(SEQUENCER, SequencerABI, signer);

const jobWorkInProgress: Record<string, boolean> = {};

const FIRST_BURST_SIZE = 2;
const FUTURE_BLOCKS = 0;
const RETRY_BURST_SIZE = 3;
const PRIORITY_FEE = 10; // Dehardcode

let flashbots: Flashbots;

let blocksWindow: number;

export async function runUpkeepJob(): Promise<void> {
	console.log('Start runUpkeepJob()');
	if (!flashbots) {
		flashbots = await Flashbots.init(signer, new Wallet(FLASHBOTS_PK as string), provider, [FLASHBOTS_RPC], false, chainId);
	}
	if (!blocksWindow) {
		blocksWindow = (await sequencer.window()).toNumber();
	}

	const jobsAmount = await sequencer.numJobs();
	const jobsAddressesPromises: Promise<string>[] = [];
	for (let index = 0; index < jobsAmount; index++) {
		jobsAddressesPromises.push(sequencer.jobAt(index));
	}
	const jobsAddresses: string[] = await Promise.all(jobsAddressesPromises);
	const makerJobAbiLike = ['function workable(bytes32 network, bool trigger) view returns (bool canWork, bytes memory args)'];
	const jobsContracts = await Promise.all(
		jobsAddresses.map((address) => {
			return new ethers.Contract(address, makerJobAbiLike, signer);
		})
	);

	startWindow(jobsContracts);
}
async function startWindow(jobsContracts: Contract[]) {
	console.log('Start Working on window');

	const currentBlock = await provider.getBlock('latest');
	const networksAmount: BigNumber = await sequencer.numNetworks();
	const windowStart = calculateNextMasterWindow(currentBlock.number, blocksWindow, networksAmount.toNumber());
	const windowEnd = windowStart + blocksWindow;
	const toleranceTreshold = 6 * 1000; // 6 seconds per blocks
	const reminderBlocks = windowStart - currentBlock.number;
	const blockDuration = 15 * 1000; // 15 seconds
	const time = reminderBlocks * blockDuration - reminderBlocks * toleranceTreshold;

	console.log({ windowStart });
	console.log({ windowEnd });
	console.log({ reminderBlocks });

	console.log({ time: `${time / 1000} seconds` });

	const sub = timer(time)
		.pipe(mergeMap(() => blockListener.stream()))
		.subscribe(async (block) => {
			if (block.number < windowStart) {
				console.log('Still not in window. Current Block: ', block.number);
				return;
			}
			if (block.number >= windowEnd) {
				console.log('Window finished!');
				stopAndRestartWorkUpkeep(jobsContracts, blockListener, sub, startWindow);
				return;
			}

			jobsContracts.forEach((job) => {
				tryToWorkJob(job, block);
			});
		});
}

async function tryToWorkJob(job: Contract, block: Block) {
	console.log({ jobWorkInProgress: jobWorkInProgress[job.address] });

	if (jobWorkInProgress[job.address]) {
		console.log('Work in progress for job: ', job.address);
		return;
	}
	const [isWorkable, data]: [boolean, string] = await job.workable(KEEP3R_NETWORK_TAG, true);

	if (!isWorkable) {
		console.log(`Job ${job.address} is not workable`);
		return;
	}

	console.log('Job is workable: ', job.address);

	jobWorkInProgress[job.address] = true;

	const currentNonce = await provider.getTransactionCount(signer.address);

	const blocksAhead = FUTURE_BLOCKS + FIRST_BURST_SIZE;

	const { priorityFeeInGwei, maxFeePerGas } = getMainnetGasType2Parameters({
		block,
		blocksAhead,
		priorityFeeInWei: PRIORITY_FEE,
	});

	const options: Overrides = {
		gasLimit: 5_000_000,
		nonce: currentNonce,
		maxFeePerGas,
		maxPriorityFeePerGas: priorityFeeInGwei,
		type: 2,
	};

	const firstBlockOfBatch = block.number + FUTURE_BLOCKS;
	const txs: TransactionRequest[] = await populateTransactions({
		chainId,
		contract: upkeepJob,
		functionArgs: [[job.address, data]],
		functionName: 'work',
		options,
	});

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
		isWorkableCheck: () => job.workable(KEEP3R_NETWORK_TAG, true),
		staticDebugId: job.address,
		dynamicDebugId: makeid(5),
	});

	if (result) console.log('===== Tx SUCCESS ===== ', job.address);
	jobWorkInProgress[job.address] = false;
}

function isMaster(blockNumber: number, blocksWindow: number, networksAmount: number): boolean {
	const master = KEEP3R_SEQUENCER_POSITION == Math.floor(blockNumber / blocksWindow) % networksAmount;
	const isFirstBlockOfWindow = blockNumber % blocksWindow === 0;
	if (master && isFirstBlockOfWindow) return true;
	return false;
}

function calculateNextMasterWindow(blockNumber: number, blocksWindow: number, networksAmount: number): number {
	let nextMasterStart: number = blockNumber;
	let nextMasterStartFounded = false;
	while (!nextMasterStartFounded) {
		const master = isMaster(nextMasterStart, blocksWindow, networksAmount);
		if (master) {
			console.log('Found start block');
			console.log({ nextMasterStart });

			nextMasterStartFounded = true;
			return nextMasterStart;
		}
		nextMasterStart++;
	}
	return nextMasterStart;
}

if (!process.env.TEST_MODE) {
	(async () => {
		runUpkeepJob();
	})();
}
