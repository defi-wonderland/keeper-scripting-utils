import MakerDAOUpkeepABI from '../../../../abi/MakerDAOUpkeep.json';
import SequencerABI from '../../../../abi/Sequencer.json';
import { Flashbots } from '../../../flashbots/flashbots';
import { BlockListener } from '../../../subscriptions/blocks';
import {
	getMainnetGasType2Parameters,
	sendAndRetryUntilNotWorkable,
	populateTransactions,
	createBundlesWithSameTxs,
} from '../../../transactions';
import {
	ChainId,
	FLASHBOTS_RPC_BY_NETWORK,
	getNodeUrlWss,
	getPrivateKey,
	NETWORKS_IDS_BY_NAME,
	SUPPORTED_NETWORKS,
} from '../../../utils';
import { TransactionRequest } from '@ethersproject/abstract-provider';
import { makeid } from '@keep3r-network/cli-utils';
import { providers, Wallet, Contract, Overrides, ethers } from 'ethers';
import { formatBytes32String } from 'ethers/lib/utils';

const dotenv = require('dotenv');
dotenv.config();

const network: SUPPORTED_NETWORKS = 'mainnet';
const chainId: ChainId = NETWORKS_IDS_BY_NAME[network];
const UPKEEP_JOB_ADDRESS = '0x5D469E1ef75507b0E0439667ae45e280b9D81B9C';
const SEQUENCER = '0x9566eB72e47E3E20643C0b1dfbEe04Da5c7E4732';
const nodeUrl = getNodeUrlWss(network);
const provider = new providers.WebSocketProvider(nodeUrl);
const PK = getPrivateKey(network);
const FLASHBOTS_PK = process.env.FLASHBOTS_APIKEY;
const FLASHBOTS_RPC: string = FLASHBOTS_RPC_BY_NETWORK[network];
const blockListener = new BlockListener(provider);
const KEEP3R_NETWORK_TAG = formatBytes32String('KEEP3R');

const signer = new Wallet(PK, provider);
const upkeepJob = new Contract(UPKEEP_JOB_ADDRESS, MakerDAOUpkeepABI, signer);
const sequencer = new Contract(SEQUENCER, SequencerABI, signer);

const jobWorkInProgress: Record<string, boolean> = {};

const FIRST_BURST_SIZE = 2;
const FUTURE_BLOCKS = 0;
const RETRY_BURST_SIZE = 3;
const PRIORITY_FEE = 2.1;

let flashbots: Flashbots;

let blocksWindow: number;

export async function runUpkeepJob(): Promise<void> {
	console.log('START runUpkeepJob()');
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
	const makerJobAbiLike = ['function workable(bytes32 network) view returns (bool canWork, bytes memory args)'];
	const jobsContracts = await Promise.all(
		jobsAddresses.map((address) => {
			return new ethers.Contract(address, makerJobAbiLike, signer);
		})
	);

	jobsContracts.forEach((job) => {
		tryToWorkJob(job);
	});
}

async function tryToWorkJob(job: Contract) {
	const sub = blockListener.stream().subscribe(async (block) => {
		if (jobWorkInProgress[job.address]) {
			console.log('Work in progress for job: ', job.address);
			return;
		}
		const [isWorkable, args]: [boolean, string] = await job.workable(KEEP3R_NETWORK_TAG);

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
			functionArgs: [[args]],
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
			isWorkableCheck: () => job.workable(KEEP3R_NETWORK_TAG),
			staticDebugId: job.address,
			dynamicDebugId: makeid(5),
		});

		if (result) console.log('===== Tx SUCCESS ===== ', job.address);
		jobWorkInProgress[job.address] = false;
		sub.unsubscribe();
		blockListener.stop();
		tryToWorkJob(job);
	});
}

if (!process.env.TEST_MODE) {
	(async () => {
		runUpkeepJob();
	})();
}
