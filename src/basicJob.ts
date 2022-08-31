import BasicJob from '../abi/BasicJob.json';
import { Flashbots } from './flashbots/flashbots';
import { getNewBlocks, stopBlocks } from './subscriptions/blocks';
import {
	createBundlesWithSameTxs,
	getMainnetGasType2Parameters,
	sendAndRetryUntilNotWorkable,
	populateTransactions,
} from './transactions';
import { getNodeUrlWss, getPrivateKey } from './utils';
import { TransactionRequest } from '@ethersproject/abstract-provider';
import { providers, Wallet, Contract, BigNumber } from 'ethers';
import { mergeMap, take, timer } from 'rxjs';

const dotenv = require('dotenv');
dotenv.config();

const network = 'goerli';
const chainId = 5;
const nodeUrl = getNodeUrlWss(network);
const provider = new providers.WebSocketProvider(nodeUrl);
const JOB_ADDRESS = '0x4C8DB41095cD6fb755466463F0C6B2Ab9C826804';
const PK = getPrivateKey(network);
const FLASHBOTS_PK = process.env.FLASHBOTS_APIKEY;
const FLASHBOTS_RPC = 'https://relay-goerli.flashbots.net';

const signer = new Wallet(PK, provider);
const job = new Contract(JOB_ADDRESS, BasicJob, signer);
const secondsBefore = 10;

const FIRST_BURST_SIZE = 2;
const FUTURE_BLOCKS = 0;
const RETRY_BURST_SIZE = 3;
const PRIORITY_FEE = 10; // Dehardcode

let flashbots: Flashbots;

export async function runBasicJob(): Promise<void> {
	if (!flashbots) {
		flashbots = await Flashbots.init(signer, new Wallet(FLASHBOTS_PK as string), provider, [FLASHBOTS_RPC], false, chainId);
	}

	// 0 = basic
	// 1 = complex
	const [lastWorkAt, cooldown]: BigNumber[] = await Promise.all([job.lastWorkAt(0), job.workCooldown()]);

	const readyTime = lastWorkAt.add(cooldown);
	const notificationTime = readyTime.sub(secondsBefore);
	const time = notificationTime.mul(1000).sub(Date.now()).toNumber();

	console.log('started cooldown observable');
	const sub = timer(time)
		.pipe(
			mergeMap(() => getNewBlocks(provider)),
			take(1)
		)
		.subscribe(async (block) => {
			console.log('enter subscribe');
			console.log('block in main ', block.number);
			console.log('Job is close to be off cooldown');
			const blocksAhead = FUTURE_BLOCKS + FIRST_BURST_SIZE;

			const currentNonce = await provider.getTransactionCount(signer.address);
			const { priorityFee, maxFeePerGas } = getMainnetGasType2Parameters({ block, blocksAhead, priorityFee: PRIORITY_FEE });

			const options = {
				gasLimit: 10_000_000,
				nonce: currentNonce,
				maxFeePerGas,
				maxPriorityFeePerGas: priorityFee,
				type: 2,
			};

			const txs: TransactionRequest[] = await populateTransactions({
				chainId,
				contract: job,
				functionArgs: [[200]],
				functionName: 'basicWork',
				options,
			});

			const firstBlockOfBatch = block.number + FUTURE_BLOCKS;
			const bundles = createBundlesWithSameTxs({
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
				isWorkableCheck: async () => await job.basicWorkable(),
			});

			console.log('===== Tx SUCCESS =====');

			stopBlocks(provider);
			sub.unsubscribe();
			runBasicJob();
		});
}

if (!process.env.TEST_MODE) {
	(async () => {
		runBasicJob();
	})();
}
