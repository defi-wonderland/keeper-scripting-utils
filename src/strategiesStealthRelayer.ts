import StealthRelayer from '../abi/StealthRelayer.json';
import TestJob from '../abi/TestJob.json';
import { Flashbots } from './flashbots/flashbots';
import { getNewBlocks, stopBlocks } from './subscriptions/blocks';
import {
	getMainnetGasType2Parameters,
	createBundlesWithDifferentTxs,
	sendAndRetryUntilNotWorkable,
	populateTransactions,
} from './transactions';
import { getNodeUrlWss, getPrivateKey } from './utils';
import { TransactionRequest } from '@ethersproject/abstract-provider';
import { providers, Wallet, Contract, BigNumber } from 'ethers';
import { solidityKeccak256 } from 'ethers/lib/utils';
import { mergeMap, timer } from 'rxjs';

const dotenv = require('dotenv');
dotenv.config();

const network = 'goerli';
const chainId = 5;
const nodeUrl = getNodeUrlWss(network);
const provider = new providers.WebSocketProvider(nodeUrl);
const JOB_ADDRESS = '0x9DC52d978290f13b73692C5AeA21B4C8954e909A';
const PK = getPrivateKey(network);
const signer = new Wallet(PK, provider);
const FLASHBOTS_PK = process.env.FLASHBOTS_APIKEY;
const FLASHBOTS_RPC = 'https://relay-goerli.flashbots.net';
const secondsBefore = 0;
const job = new Contract(JOB_ADDRESS, TestJob, signer);

const STEALTH_RELAYER_ADDRESS = '0xD44A48001A4BAd6f23aD8750eaD0036765A35d4b';
const STEALTH_HASH = getStealthHash();
const stealthRelayer = new Contract(STEALTH_RELAYER_ADDRESS, StealthRelayer, signer);
const workData: string = job.interface.encodeFunctionData('work');

const FIRST_BURST_SIZE = 2;
const FUTURE_BLOCKS = 0;
const RETRY_BURST_SIZE = 2;
const PRIORITY_FEE = 10; // Dehardcode

let flashbots: Flashbots;

export async function runStealthRelayerJob(): Promise<void> {
	if (!flashbots) {
		flashbots = await Flashbots.init(signer, new Wallet(FLASHBOTS_PK as string), provider, [FLASHBOTS_RPC], true, chainId);
	}

	const lastWorkAt = BigNumber.from(await provider.getStorageAt(JOB_ADDRESS, 3));
	const cooldown = await job.COOLDOWN();

	const readyTime = lastWorkAt.add(cooldown);
	const notificationTime = readyTime.sub(secondsBefore);
	const time = notificationTime.mul(1000).sub(Date.now()).toNumber();
	let txInProgress: boolean;

	console.log('started cooldown observable');
	const sub = timer(time)
		.pipe(mergeMap(() => getNewBlocks(provider)))
		.subscribe(async (block) => {
			console.log('Job is close to be off cooldown');
			if (txInProgress) {
				console.log('TX IN PROGRESS: ', block.number);
				return;
			}

			const isWorkable = await job.workable();
			if (!isWorkable) {
				console.log('NOT WORKABLE: ', block.number);
				return;
			}

			txInProgress = true;

			const blocksAhead = FUTURE_BLOCKS + FIRST_BURST_SIZE;

			const currentNonce = await provider.getTransactionCount(signer.address);
			const { priorityFee, maxFeePerGas } = getMainnetGasType2Parameters({ block, blocksAhead, priorityFee: PRIORITY_FEE });

			const options = {
				gasLimit: 30_000_000,
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
					[JOB_ADDRESS, workData, STEALTH_HASH, firstBlockOfBatch],
					[JOB_ADDRESS, workData, STEALTH_HASH, firstBlockOfBatch + 1],
				],
				functionName: 'execute',
				options,
			});

			const bundles = createBundlesWithDifferentTxs({
				unsignedTxs: txs,
				burstSize: FIRST_BURST_SIZE,
				firstBlockOfBatch,
			});

			console.log('SENDING TX...');

			await sendAndRetryUntilNotWorkable({
				txs,
				provider,
				priorityFee: PRIORITY_FEE,
				bundles,
				newBurstSize: RETRY_BURST_SIZE,
				flashbots,
				signer,
				isWorkableCheck: () => job.workable(),
				regenerateTxs: async (burstSize, firstBlockOfNextBatch) => {
					const populateTxsPromises = new Array(burstSize).fill(null).map((_, index) => {
						return stealthRelayer.populateTransaction.execute(
							JOB_ADDRESS,
							workData,
							STEALTH_HASH,
							firstBlockOfNextBatch + index,
							{ ...options }
						);
					});

					return (await Promise.all(populateTxsPromises)).map((tx) => ({ ...tx, chainId }));
				},
				bundleRegenerationMethod: 'createBundlesWithDifferentTxs',
			});

			console.log('===== Tx SUCCESS =====');

			txInProgress = false;
			stopBlocks(provider);
			sub.unsubscribe();
			runStealthRelayerJob();
		});
}

if (!process.env.TEST_MODE) {
	(async () => {
		runStealthRelayerJob();
	})();
}

// TODO: import from keep3r utils
export function getStealthHash(): string {
	return solidityKeccak256(['string'], [makeid(32)]);
}

export function makeid(length: number): string {
	let result = '';
	const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	const charactersLength = characters.length;
	for (let i = 0; i < length; i++) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
	}
	return result;
}
