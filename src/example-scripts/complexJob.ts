import BasicJob from '../abi/BasicJob.json';
import { Flashbots } from './../flashbots/flashbots';
import { BlockListener } from './../subscriptions/blocks';
import {
	createBundlesWithSameTxs,
	getMainnetGasType2Parameters,
	sendAndRetryUntilNotWorkable,
	populateTransactions,
} from './../transactions';
import { getNodeUrlWss, getPrivateKey, FLASHBOTS_RPC_BY_NETWORK, NETWORKS_IDS_BY_NAME, SUPPORTED_NETWORKS } from './../utils';
import { TransactionRequest } from '@ethersproject/abstract-provider';
import { providers, Wallet, Contract, BigNumber } from 'ethers';
import { mergeMap, timer } from 'rxjs';

const dotenv = require('dotenv');
dotenv.config();

/*==============================================================/*
		                      SETUP
/*==============================================================*/

const network: SUPPORTED_NETWORKS = 'goerli';
const chainId = NETWORKS_IDS_BY_NAME[network];
const nodeUrl = getNodeUrlWss(network);
const provider = new providers.WebSocketProvider(nodeUrl);
const blockListener = new BlockListener(provider);
const JOB_ADDRESS = '0x4C8DB41095cD6fb755466463F0C6B2Ab9C826804';
const PK = getPrivateKey(network);
const FLASHBOTS_PK = process.env.FLASHBOTS_BUNDLE_SIGNING_KEY;
const FLASHBOTS_RPC = FLASHBOTS_RPC_BY_NETWORK[network];
const secondsBefore = 0;

const FIRST_BURST_SIZE = 2;
const FUTURE_BLOCKS = 0;
const RETRY_BURST_SIZE = 3;
const PRIORITY_FEE = 2.1;

const signer = new Wallet(PK, provider);
const job = new Contract(JOB_ADDRESS, BasicJob, signer);
let flashbots: Flashbots;

/*==============================================================/*
		                   MAIN SCRIPT
/*==============================================================*/

export async function runComplexJob(): Promise<void> {
	// If there's not a Flashbots instance instantiated, instantiate it.
	if (!flashbots) {
		flashbots = await Flashbots.init(signer, new Wallet(FLASHBOTS_PK as string), provider, [FLASHBOTS_RPC], false, chainId);
	}

	// 0 = basic => basicJob doesn't include a variable cooldown (a trigger after workCooldown has elapsed).
	// 1 = complex => complexJob includes a variable cooldown.
	// Fetch the lastWorkAt variable as well as the workCooldown of the job and store it.
	const [lastWorkAt, cooldown]: BigNumber[] = await Promise.all([job.lastWorkAt(1), job.workCooldown()]);

	// Calculate how long to wait until the job is workable by doing: currentTimeStamp - (lastWorkAt + cooldown)
	const readyTime = lastWorkAt.add(cooldown);
	const notificationTime = readyTime.sub(secondsBefore);
	const time = notificationTime.mul(1000).sub(Date.now()).toNumber();

	// Flag to track if there's a transaction in progress. If this is true, then we won't execute the main logic.
	let txInProgress: boolean;

	console.log('started cooldown observable');

	// When the time until the job is workable elapses, create a subscription and start listening to upcoming blocks.
	const sub = timer(time)
		.pipe(mergeMap(() => blockListener.stream()))
		.subscribe(async (block) => {
			console.log('Job is close to be off cooldown');
			// If the job is workable, and a new block comes, check if there's already a transaction in progress. Return if there is one.
			// We do this to avoid sending multiple transactions that try to work the same job.
			if (txInProgress) {
				console.log('TX IN PROGRESS: ', block.number);
				return;
			}

			// Trigger is our mock variable to simulate a variable cooldown. We require this to be true and the cooldown to have elapsed
			// for the job to be workable.
			const trigger = true;

			// We check that the job is really workable.
			const isWorkable = await job.complexWorkable(trigger);

			// If it isn't, we return as there's no point in trying to work a job that is not workable.
			if (!isWorkable) {
				console.log('NOT WORKABLE: ', block.number);
				return;
			}

			// If we arrived here, it means we will be sending a transaction, so we optimistically set this to true.
			txInProgress = true;

			/*
				We are going to send this through Flashbots, which means we will be sending multiple bundles to different
				blocks inside a batch. Here we are calculating which will be the last block we will be sending the
				last bundle of our first batch to. This information is needed to calculate what will the maximum possible base
				fee be in that block, so we can calculate the maxFeePerGas parameter for all our transactions.
				For example: we are in block 100 and we send to 100, 101, 102. We would like to know what is the maximum possible
				base fee at block 102 to make sure we don't populate our transactions with a very low maxFeePerGas, as this would
				cause our transaction to not be mined until the max base fee lowers.
			*/
			const blocksAhead = FUTURE_BLOCKS + FIRST_BURST_SIZE;

			// Get the signer's (keeper) current nonce.
			const currentNonce = await provider.getTransactionCount(signer.address);

			// Fetch the priorityFeeInGwei and maxFeePerGas parameters from the getMainnetGasType2Parameters function
			// NOTE: this just returns our priorityFee in GWEI, it doesn't calculate it, so if we pass a priority fee of 10 wei
			//       this will return a priority fee of 10 GWEI. We need to pass it so that it properly calculated the maxFeePerGas
			const { priorityFeeInGwei, maxFeePerGas } = getMainnetGasType2Parameters({
				block,
				blocksAhead,
				priorityFeeInWei: PRIORITY_FEE,
			});

			// We declare what options we would like our transaction to have
			const options = {
				gasLimit: 10_000_000,
				nonce: currentNonce,
				maxFeePerGas,
				maxPriorityFeePerGas: priorityFeeInGwei,
				type: 2,
			};

			// We populate the transactions we will use in our bundles
			const txs: TransactionRequest[] = await populateTransactions({
				chainId,
				contract: job,
				functionArgs: [[trigger, 2]],
				functionName: 'complexWork',
				options,
			});

			// We calculate the first block that the first bundle in our batch will target.
			// Example, if future blocks is 2, and we are in block 100, it will send a bundle to blocks 102, 103, 104 (assuming a burst size of 3)
			// and 102 would be the firstBlockOfBatch
			const firstBlockOfBatch = block.number + FUTURE_BLOCKS;

			// We create our batch of bundles. In this case we use createBundlesWithSameTxs, as all bundles use the same transaction
			const bundles = createBundlesWithSameTxs({
				unsignedTxs: txs,
				burstSize: FIRST_BURST_SIZE,
				firstBlockOfBatch,
			});

			console.log('SENDING TX...');

			// We send our bundles to Flashbots and retry until the job is worked by us or another keeper.
			await sendAndRetryUntilNotWorkable({
				txs,
				provider,
				priorityFeeInWei: PRIORITY_FEE,
				bundles,
				newBurstSize: RETRY_BURST_SIZE,
				flashbots,
				signer,
				isWorkableCheck: () => job.complexWorkable(trigger),
			});

			console.log('===== Tx SUCCESS =====');

			// If us or another keeper worked the job, that means we should wait and send a new transaction so we set txInProgress to false.
			txInProgress = false;
			// We remove our listener.
			blockListener.stop();
			// We unsubscribe from our Observable.
			sub.unsubscribe();
			// We call our main function recursively so that it waits until the job is workable again to try to work the job again.
			runComplexJob();
		});
}

if (!process.env.TEST_MODE) {
	(async () => {
		runComplexJob();
	})();
}
