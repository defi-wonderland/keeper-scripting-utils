import HarvestV2ABI from '../../../../abi/HarvestV2.json';
import StealthRelayerABI from '../../../../abi/StealthRelayer.json';
import { Flashbots } from '../../../flashbots/flashbots';
import { BlockListener } from '../../../subscriptions/blocks';
import {
	getMainnetGasType2Parameters,
	sendAndRetryUntilNotWorkable,
	populateTransactions,
	createBundlesWithDifferentTxs,
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
import { getStealthHash, makeid } from '@keep3r-network/cli-utils';
import { providers, Wallet, Contract, BigNumber, Overrides } from 'ethers';
import { mergeMap, timer, filter } from 'rxjs';

const dotenv = require('dotenv');
dotenv.config();

/*
	This job has the particularity that the caller of the work function can only be
	a contract called stealthRelayer. This means we have to call the stealthRelayer execute's
	function, which in turn calls the job's work() function with specific parameters.
	Those parameters are:
	- The address of the job
	- The data indicating what function and with which parameters we should call the job
	- A unique hash called stealthHash
	- And the block in which we are calling work(). This block must always coincide with the actual
	  block.number. Meaning if we send a transaction indicating to the stealthRelayer that we are intend
	  to call job in work 1000, that transaction must be included in block 1000, otherwise it will fail.
	An important caveat is that transactions that call the stealthRelayer must be sent through Flashbots.
*/

/*==============================================================/*
		                      SETUP
/*==============================================================*/

// Set the network we will be working jobs on
const network: SUPPORTED_NETWORKS = 'mainnet';

// Set the chainId of that network
const chainId: ChainId = NETWORKS_IDS_BY_NAME[network];

// Set the rpc we'll be using for the network. Use websockets.
const nodeUrl = getNodeUrlWss(network);

// Create a new provider for the rpc
const provider = new providers.WebSocketProvider(nodeUrl);

// Set the address of the job we'll be working the strategies on.
const JOB_ADDRESS = '0xE6DD4B94B0143142E6d7ef3110029c1dcE8215cb';

// Set the address of the stealthRelayer
const stealthRelayerAddress = '0x0a61c2146A7800bdC278833F21EBf56Cd660EE2a';

// Set the PK of the keeper we'll be using to run the jobs
const PK = getPrivateKey(network);

// Set the PK we'll be using to sign flashbot bundles
const FLASHBOTS_PK = process.env.FLASHBOTS_BUNDLE_SIGNING_KEY;

// Set the RPC for flashbots. We can also set other private relayer rpcs in an array if we wished to
// send the bundles to multiple private relayers like eden
const FLASHBOTS_RPC: string = FLASHBOTS_RPC_BY_NETWORK[network];

// Create an instance of our BlockListener class
const blockListener = new BlockListener(provider);

// Create a signer using the provider and the PK of our keeper. This will be used to sign the transactions we want to send.
const signer = new Wallet(PK, provider);

// Instantiate the job's contract
const harvestJob = new Contract(JOB_ADDRESS, HarvestV2ABI, signer);
// Instantiate the stealthRelayer's contract
const stealthRelayer = new Contract(stealthRelayerAddress, StealthRelayerABI, signer);

/*
	Create a mapping that tracks which was the last timestamp at which a job was worked.
	Tracking this is useful for our script to know whether it should continue fetching blocks or wait unti the job is workable again to do so.
	If the job it has been worked by us/other keeper, there's no point in fetching blocks and enter the script for that specific job
	until its cooldown wears off.
*/
const lastWorkAt: Record<string, BigNumber> = {};
// Create a mapping that keeps track of whether we have sent a bundle to try to work a strategy
const strategyWorkInProgress: Record<string, boolean> = {};
// Create a mapping that will store the work data of each strategy. This is one of the stealthRelayer's execute function parameter.
const workData: Record<string, string> = {};

// Define the size of our first batch of bundles
const FIRST_BURST_SIZE = 2;
// Define how many blocks into the future to send our first batch of bundles
const FUTURE_BLOCKS = 0;
// Define the size of the batches after the first batch of bundles
const RETRY_BURST_SIZE = 3;
// Define the priority fee to use
const PRIORITY_FEE = 2.1;

// Create a variable that will hold our Flashbots instance
let flashbots: Flashbots;

// Create a varible that will hold the cooldown shared by all strategies
let cooldown: BigNumber;

/**
 *
 * @notice Fetches all the strategies in a job and their shared cooldown. It also fetches the last time each strategy was worked on,
 * 		   and the data needed to call the work() function in the job with a specific strategy, and stores the individual results
 * 		   in a mapping. Lastly, it calls the main function tryToWorkStrategy for each strategy.
 *
 * @dev    This function is run only once per execution. To avoid sending a barrage of http requests to the rpc, it batches the
 * 		   strategies into groups of 5 strategies, and waits for the requests of each batch to complete before continuing with the
 * 		   next batch.
 *
 */
export async function runStrategiesJob(): Promise<void> {
	if (!flashbots) {
		flashbots = await Flashbots.init(signer, new Wallet(FLASHBOTS_PK as string), provider, [FLASHBOTS_RPC], false, chainId);
	}

	// Fetch the addresses of all strategies along with their shared cooldown.
	const [strategies, cd]: [string[], BigNumber] = await Promise.all([harvestJob.strategies(), harvestJob.workCooldown()]);

	// Store the shared cooldown in the cooldown variable
	cooldown = cd;

	// Establish how many strategies to include in each batch
	const maxStrategiesPerBatch = 5;

	// Calculate how many batches to create
	const batchesToCreate = Math.ceil(strategies.length / maxStrategiesPerBatch);

	// Iterate through each batch, fetch the lastWorkAt of each strategy, and populate the lastWorkAt mapping for each strategy of that batch
	for (let index = 0; index < batchesToCreate; index++) {
		// Calculate the index of each batch
		const start = index * maxStrategiesPerBatch;
		// From the entirety of the strategies, get the strategies that belong to each batch
		const batch = strategies.slice(start, start + maxStrategiesPerBatch);
		console.log('Fetching batch number:', index + 1);

		// Fetch the last time the strategies in the batch were worked
		const lastWorksAt: BigNumber[] = await Promise.all(batch.map((strategy) => harvestJob.lastWorkAt(strategy)));
		// Populate the lastWorkAt mapping of each strategy with the last time they were worked
		batch.forEach((strategy, i) => {
			lastWorkAt[strategy] = lastWorksAt[i];
		});
	}

	// Store the data that would result of calling work() in our job with each strategy as parameter in an array
	const allWorkData: string[] = await Promise.all(
		strategies.map((strategy) => harvestJob.interface.encodeFunctionData('work', [strategy]))
	);

	// Populate the workData[strategy] mapping with the data stored in the allWorkData array
	strategies.forEach((strategy, i) => {
		workData[strategy] = allWorkData[i];
	});

	// Iterate through each strategy and start the process of trying to work them
	// Note if you wish to work with less strategies to debug more easily, you can do strategies.slice(0,5).forEach(...)
	strategies.forEach((strategy) => {
		tryToWorkStrategy(strategy);
	});
}

/**
 *
 * @notice Attempts to work a strategy.
 *
 * @dev  Strategies have two different parameters to establish whether they're workable or not. The cooldown between works, which is constant,
 *       and a trigger which is dependant on external metrics like amount of value deposited in a vault, which is dependant on user behavior
 *       and can't be accurately predicted. For this reason, the function calculates when the cooldown of the strategy wears off,
 *       and only then it starts trying to work it. Because the external metrics are unpredictable, once the cooldown has worn off,
 *       the function will ask if the function is workable or not.
 *       If it is, it will check if the blocks we established as delay have passed and if they've, it will check if the strategy is still
 *       workable. If it is, it will send the transaction to try to work it. Otherwise, it will check if other keeper worked it and
 *       recalculate the time at which it should start trying to work it again and sleep until then to avoid doing unnecessary http requests to
 *       fetch blocks.
 *
 * @param strategy The strategy to try to work
 *
 */
function tryToWorkStrategy(strategy: Address) {
	console.log('Start Working on strategy: ', strategy);

	// Calculate how long to wait until the strategy is workable by doing: currentTimeStamp - (lastWorkAt + cooldown)
	const readyTime = lastWorkAt[strategy].add(cooldown);
	const notificationTime = readyTime;
	const time = notificationTime.mul(1000).sub(Date.now()).toNumber();

	// When the time until the strategy is workable elapses, create a subscription and start listening to upcoming blocks.
	const sub = timer(time)
		.pipe(
			mergeMap(() => blockListener.stream()),
			filter(() => {
				// If a block arrives and there are bundles in progress, we return
				return !strategyWorkInProgress[strategy];
			})
		)
		.subscribe(async (block) => {
			// Create a unique stealthHash for this strategy
			const stealthHash = getStealthHash();

			// Initialize a variable that stores whether the strategy is truly workable or not
			let isWorkable;

			/*
			   Check if the strategy is really workable.
			   Remember that strategies like these have an unpredictable component that determines whether or not the strategy can be worked.
			   We start checking if the strategy can we worked as soon as the strategy's cooldown wears off, but we need to call workable
			   to see if the variable component has also been fulfilled.
			*/
			try {
				isWorkable = await harvestJob.workable(strategy);
			} catch (error: any) {
				console.log('message: ', error.message);
				console.log({ strategy });
			}

			/*
			   If the strategy is not workable we check whether it is because the variable component has not been fulfilled yet,
			   or due to another keeper having worked it.
			   To do this we check whether lastWorkAt has changed. If it changed then another keeper worked the strategy, meaning
			   we need to update the last time it was worked on in our mapping and set the strategyWorkInProgress of our strategy to false.
			   Lastly, we remove our subscriptions and listeners, and we restart the process by calling tryToWorkStrategy() again.
			   Otherwise, if the strategy is not workable because the variable component hasn't been fulfilled, we simply return and wait
			   for the next block to check again.
			*/
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
			// If the strategy is workable, we optimistically set the strategyWorkInProgress[strategy] mapping to true, as we will send a bundle
			strategyWorkInProgress[strategy] = true;
			// Get the signer's (keeper) current nonce
			const currentNonce = await provider.getTransactionCount(signer.address);
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

			// Fetch the priorityFeeInGwei and maxFeePerGas parameters from the getMainnetGasType2Parameters function
			// NOTE: this just returns our priorityFee in GWEI, it doesn't calculate it, so if we pass a priority fee of 10 wei
			//       this will return a priority fee of 10 GWEI. We need to pass it so that it properly calculated the maxFeePerGas
			const { priorityFeeInGwei, maxFeePerGas } = getMainnetGasType2Parameters({
				block,
				blocksAhead,
				priorityFeeInWei: PRIORITY_FEE,
			});

			// We declare what options we would like our transaction to have
			const options: Overrides = {
				gasLimit: 5_000_000,
				nonce: currentNonce,
				maxFeePerGas,
				maxPriorityFeePerGas: priorityFeeInGwei,
				type: 2,
			};

			// We calculate the first block that the first bundle in our batch will target.
			// Example, if future blocks is 2, and we are in block 100, it will send a bundle to blocks 102, 103, 104 (assuming a burst size of 3)
			// and 102 would be the firstBlockOfBatch
			const firstBlockOfBatch = block.number + FUTURE_BLOCKS;

			// We populate the transactions we will use in our bundles. Notice we are calling the stealthRelayer's execute function
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

			/*
			   We create our batch of bundles. In this case this will be a batch of two bundles that will contain different transactions.
			   The transactions will be different due to stealthRelayer's requirement of the block passed a parameter
			   being the same as the block in which the transaction is included and mined.
			*/
			const bundles = createBundlesWithDifferentTxs({
				unsignedTxs: txs,
				burstSize: FIRST_BURST_SIZE,
				firstBlockOfBatch,
			});

			/*
			   We send our batch of bundles and recreate new ones until we or another keeper works the strategy.
			   One very important detail here is that we need to provide the sendAndRetryUntilNotWorkable strategy with
			   instructions as to how to regenerate the transactions to include in the new batches in case the first one fails.
			   In this case, this is necessary because stealthRelayer has the requirement that one of the parameters we pass to its
			   execute function is the block number in which our transaction will be mined.
			   This means that with every bundle, the transaction to pass to execute will change.
			   For example: The first bundle is sent to blocks 100 and 101, so inside the bundle that goes to block 100 we include a transaction that
			   has block 100 as an argument and inside the bundle that goes to block 101, we include a transaction that has bock 101 as an argument.
			   When we apply our retry mechanism, we need to indicate whether it should use the same txs as before, or if should use new ones.
			   If it should use new ones, we need to provide the function with the logic as to how to create those new transactions.
			   We do that through the regenerateTxs callback. In this case we are telling the script: "Hey, when creating a new batch for retrying,
			   generate new transactions with the following function and arguments."
			   If we do this, we also need to tell the function what method to use to create the batches. In this case, we know each transaction will be
			   different so we just tell it to use the createBundlesWithDifferentTxs function by passing it in the bundleRegenerationMethod parameter.
			   It's also worth noting that for ease of debugging we are passing the strategy address as static id, and a random 5 digit id to identify each batch.
			   Each batch would look something like this in the console: STRATEGY_ADDRESS#12345
			*/
			const result = await sendAndRetryUntilNotWorkable({
				txs,
				provider,
				priorityFeeInWei: PRIORITY_FEE,
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
			// If the bundle was included, we console log the success
			if (result) console.log('===== Tx SUCCESS ===== ', strategy);
			// Whether us or another keeper worked, we need to update the lastWorkAt mapping for this strategy
			lastWorkAt[strategy] = await harvestJob.lastWorkAt(strategy);
			// We also need to set strategy as not in progress anymore.
			strategyWorkInProgress[strategy] = false;
			// We remove all listeners and subscriptions and restart the entire process by calling tryToWorkStrategy again
			stopAndRestartWork(strategy, blockListener, sub, tryToWorkStrategy);
		});
}

if (!process.env.TEST_MODE) {
	(async () => {
		runStrategiesJob();
	})();
}
