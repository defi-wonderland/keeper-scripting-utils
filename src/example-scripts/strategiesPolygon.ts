import StrategiesJob from '../../abi/StrategiesJob.json';
import { GasService } from './../services/gas.service';
import { BlockListener } from './../subscriptions/blocks';
import { sendTx } from './../transactions';
import { getNodeUrlWss, getPrivateKey, toGwei, ChainId, NETWORKS_IDS_BY_NAME, SUPPORTED_NETWORKS, Address } from './../utils';
import { stopAndRestartWork } from './../utils/stopAndRestartWork';
import { providers, Wallet, Contract, BigNumber, Overrides } from 'ethers';
import { mergeMap, timer } from 'rxjs';

const dotenv = require('dotenv');
dotenv.config();

/*==============================================================/*
		                      SETUP
/*==============================================================*/

// Set the network we will be working jobs on
const network: SUPPORTED_NETWORKS = 'polygon';
// Set the chainId of that network
const chainId: ChainId = NETWORKS_IDS_BY_NAME[network];
// Set the rpc we'll be using for the network. Use websockets.
const nodeUrl = getNodeUrlWss(network);
// Create a new provider for the rpc
const provider = new providers.WebSocketProvider(nodeUrl);
// Set the address of the job we'll be working
const JOB_ADDRESS = '0x647Fdb71eEA4f9A94E14964C40027718C931bEe5';
// Create an instance of our BlockListener class
const blockListener = new BlockListener(provider);
// Set the PK of the keeper we'll be using to run the jobs
const PK = getPrivateKey(network);
// Set how many blocks we want to wait to work the job after the job is workable. This is to avoid reverts if we don't want to be competitive.
const BLOCKS_TO_WAIT = 2;
/*
	Initialize our GasService. This is used to fetch the gas prices of Polygon accurately, so we can correctly calculate the correct values to use
	and avoid having our txs stuck in the mempool.
*/
const gasService = new GasService();

// Create a signer using the provider and the PK of our keeper. This will be used to sign the transactions we want to send.
const signer = new Wallet(PK, provider);
// Initialize an instance of the job in order to be able to call its methods.
const job = new Contract(JOB_ADDRESS, StrategiesJob, signer);
/*
	Create a mapping that tracks which was the last timestamp at which a job was worked.
	Tracking this is useful for our script to know whether it should continue fetching blocks or wait unti the job is workable again to do so.
	If the job it has been worked by us/other keeper, there's no point in fetching blocks and enter the script for that specific job
	until its cooldown wears off.
*/
const lastWorkAt: Record<string, BigNumber> = {};
/*
	Create a mapping that stores whether a job is workable or not
	Remember that a job can be workable but our script won't try to work it if we have set a BLOCKS_TO_WAIT delay
	to avoid reverts in non-competitive environments.
	So, If the job is workable and is has not been worked, then this mapping will store: jobAddress => true
*/
const strategyWorkInQueue: Record<string, boolean> = {};
/*
	Create a mapping that stores the jobs to their respective targetBlocks. TargetBlocks are the blocks at which we want to work the jobs.
	For example, if a job is workable at block 100, but we have set a delay of 5 blocks, our targetBlock for that job would be block 105.
*/
const targetBlocks: Record<string, number> = {};

/*
	Creates a flag to track whether a transaction to work a job is currently in the mempool or not.
	This is used to avoid sending other transactions until that one is processed.
*/
let txInProgress = false;

// Variable to store the shared cooldown of the strategies
let cooldown: BigNumber;

/**
 *
 * @notice Fetches all the strategies in a job and their shared cooldown. It also fetches the last time each strategy was worked on
 * 		   and stores the individual results in a mapping. Lastly, it calls the main script tryToWorkStrategy for each strategy.
 *
 * @dev    This function is run only once per execution. To avoid sending a barrage of http requests to the rpc, it batches the
 * 		   strategies into groups of 5 strategies, and waits for the requests of each batch to complete before continuing with the
 * 		   next batch.
 *
 */
export async function runStrategiesJob(): Promise<void> {
	// Fetch the addresses of all strategies along with their shared cooldown.
	const [strategies, cd]: [string[], BigNumber] = await Promise.all([job.strategies(), job.workCooldown()]);

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
		const lastWorksAt: BigNumber[] = await Promise.all(batch.map((strategy) => job.lastWorkAt(strategy)));

		// Populate the lastWorkAt mapping of each strategy with the last time they were worked
		batch.forEach((strategy, i) => {
			lastWorkAt[strategy] = lastWorksAt[i];
		});
	}
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
		.pipe(mergeMap(() => blockListener.stream()))
		.subscribe(async (block) => {
			/*
			   If the strategy is workable, and a new block comes, check if there's already a transaction in progress. Return if there is one.
			   We do this to avoid sending multiple transactions that try to work the same strategy.
			*/
			if (txInProgress) return;
			console.log('block: ', block.number);

			console.log('Strategy cooldown completed: ', strategy);

			/*
				If there's not a transaction in progress, we check whether the blocks to wait to work the strategy have elapsed.
				If they haven't we return and wait for the next block to check again.
				For example: If the strategy is workable at block 100, but we have set our BLOCKS_TO_WAIT to 5, this check won't pass
							 until block 105 arrives (100 + 5)
				NOTE: the first time we enter this loop, this check will pass due to strategyWorkInQueue being false, and targetBlocks not
				      being defined for that strategy
			*/
			if (strategyWorkInQueue[strategy] && block.number < targetBlocks[strategy]) {
				console.warn('Strategy WORK IN QUEUE BUT NOT READY: ', strategy);
				return;
			}

			// Trigger is our mock variable to simulate a variable cooldown. We require this to be true and the cooldown to have elapsed
			// for the strategy to be workable.
			const trigger = true;

			// Initialize a variable that stores whether the strategy is truly workable or not
			let isWorkable = false;

			/*
			   Check if the strategy is really workable.
			   Remember that strategies like these have an unpredictable component that determines whether or not the strategy can be worked.
			   We start checking if the strategy can we worked as soon as the strategy's cooldown wears off, but we need to call workable
			   to see if the variable component has also been fulfilled.
			*/
			try {
				isWorkable = await job.workable(strategy, trigger);
			} catch (error: any) {
				console.log('message: ', error.message);
				console.log({ strategy });
			}

			/*
			   If the strategy is not workable we check whether it is because the variable component has not been fulfilled yet,
			   or due to another keeper having worked it.
			   To do this we check whether lastWorkAt has changed. If it changed then another keeper worked the strategy, meaning
			   we need to update the last time it was worked on in our mapping, set the strategyWorkInQueue of our strategy to false,
			   and set the targetBlocks of that strategy to 0. Lastly, we remove our subscriptions and listeners, and we restart the process
			   by calling tryToWorkStrategy() again.
			   Otherwise, if the strategy is not workable because the variable component hasn't been fulfilled, we simply return and wait
			   for the next block to check again.
			*/
			if (!isWorkable) {
				console.warn('NOT WORKABLE: ', block.number, ' strategy: ', strategy);
				const tempLastWorkAt: BigNumber = await job.lastWorkAt(strategy);
				if (!tempLastWorkAt.eq(lastWorkAt[strategy])) {
					lastWorkAt[strategy] = tempLastWorkAt;
					strategyWorkInQueue[strategy] = false;
					targetBlocks[strategy] = 0;
					stopAndRestartWork(strategy, blockListener, sub, tryToWorkStrategy);
				}
				return;
			}

			/*
			   There's a possibility that when we enter this function for the first time, a block arrives and the strategy is workable.
			   Because we need to know when the strategy is first workable to assign a targetBlocks[strategy] a value, we reach this if
			   block, and in here we check if it has an targetBlocks[strategy] assigned. If it doesn't, we assign one and return because
			   we need to wait for BLOCKS_TO_WAIT to have passed in order to work the strategy.
			   Otherwise we keep going.
			*/
			if (!targetBlocks[strategy] || targetBlocks[strategy] === 0) {
				strategyWorkInQueue[strategy] = true;
				targetBlocks[strategy] = block.number + BLOCKS_TO_WAIT;
				return;
			}

			try {
				// If there's a transaction in progress we return.
				if (txInProgress) return;

				// If there isn't a transaction in progress, we will send a transaction, so we optimistically set txInProgress to true.
				txInProgress = true;

				// Fetch the recommended gas fees from our service provider. We are using blocknative here.
				const gasFees = await gasService.getGasFees(chainId);

				// Create an object containing the fields we would like to add to our transaction.
				const options: Overrides = {
					gasLimit: 10_000_000,
					maxFeePerGas: toGwei(Math.ceil(gasFees.maxFeePerGas) + 10),
					maxPriorityFeePerGas: toGwei(Math.ceil(gasFees.maxPriorityFeePerGas) + 10),
					type: 2,
				};

				// Indicate the explorer used by the chain. This is to ease with debugging. It will print a link to the tx after we send it.
				const explorerUrl = 'https://polygonscan.com';

				// Send the transaction
				await sendTx({
					contractCall: () =>
						job.work(strategy, trigger, 10, {
							...options,
						}),
					explorerUrl,
				});

				console.log(`===== Tx SUCCESS IN BLOCK ${block.number} ===== `, strategy);

				// If the transaction didn't revert meaning the strategy was worked, we update the lastWorkAt mapping of this strategy
				lastWorkAt[strategy] = await job.lastWorkAt(strategy);
				// Set the strategyWorkInQueue mapping for this strategy to false, as we have effectively worked the strategy
				strategyWorkInQueue[strategy] = false;
				// We reset the targetBlocks mapping for this strategy
				targetBlocks[strategy] = 0;
				// We set txInProgress to false, as there's no transaction in progress anymore
				txInProgress = false;
				// We remove all listeners and subscriptions and restart the entire process by calling tryToWorkStrategy again
				stopAndRestartWork(strategy, blockListener, sub, tryToWorkStrategy);
			} catch (error: any) {
				console.log('===== Tx FAILED ===== ', strategy);
				console.log(`Transaction failed. Reason: ${error.message}`);
				// If something went wrong with our transaction, we set transaction in progress to false.
				txInProgress = false;
				// We remove all listeners and subscriptions and restart the entire process by calling tryToWorkStrategy again
				stopAndRestartWork(strategy, blockListener, sub, tryToWorkStrategy);
			}
		});
}

if (!process.env.TEST_MODE) {
	(async () => {
		runStrategiesJob();
	})();
}
