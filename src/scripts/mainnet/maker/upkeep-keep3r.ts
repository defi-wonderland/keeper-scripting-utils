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
	getNodeUrlWss,
	getPrivateKey,
	ChainId,
	FLASHBOTS_RPC_BY_NETWORK,
	NETWORKS_IDS_BY_NAME,
	SUPPORTED_NETWORKS,
	Address,
} from '../../../utils';
import { stopAndRestartWorkUpkeep } from '../../../utils/stopAndRestartWork';
import { TransactionRequest, Block } from '@ethersproject/abstract-provider';
import { makeid } from '@keep3r-network/cli-utils';
import { providers, Wallet, Contract, BigNumber, Overrides, ethers } from 'ethers';
import { formatBytes32String } from 'ethers/lib/utils';
import { mergeMap, timer } from 'rxjs';

const dotenv = require('dotenv');
dotenv.config();

/*
	First of all it is very important to explain a little bit about how MakerDAO's Upkeep job works. One of the key elements
	to address is that this job can be worked by a list of whitelisted keepers called networks. Each of them is gonna
	have a specific window of time (13 blocks) to work. This is to democratize the process and avoid competition
	between them. The keeper that si allowed to work in the current window is called master.
	This workflow is devided in three vital parts:
	- Upkeep job contract: this is a contract that manages and call the underlying workable jobs contracts. This is the
												 contract we are gonna be calling to work.
	- Sequencer contract: this contract is in charge of managing the windown time of each keeper and ensure that only
												the master keeper of that window is able to call the work function on the Upkeep contract.
	- Workable jobs: These are the underlying jobs that have the logic that needs to be execute.
*/

/*==============================================================/*
		                      SETUP
/*==============================================================*/

// Set the network we will be working jobs on.
const network: SUPPORTED_NETWORKS = 'mainnet';

// Set the chainId of that network.
const chainId: ChainId = NETWORKS_IDS_BY_NAME[network];

// Set the rpc we'll be using for the network. Use websockets.
const nodeUrl = getNodeUrlWss(network);

// Create a new provider for the rpc
const provider = new providers.WebSocketProvider(nodeUrl);

// Set the address of the upkeep job from where we'll be working the workable jobs on.
const UPKEEP_JOB_ADDRESS = '0x5D469E1ef75507b0E0439667ae45e280b9D81B9C';

// Set the PK of the keeper we'll be using to run the jobs
const PK = getPrivateKey(network);

// Set the PK we'll be using to sign flashbot bundles
const FLASHBOTS_PK = process.env.FLASHBOTS_BUNDLE_SIGNING_KEY;

// Set the RPC for flashbots. We can also set other private relayer rpcs in an array if we wished to
// send the bundles to multiple private relayers like eden.
const FLASHBOTS_RPC: string = FLASHBOTS_RPC_BY_NETWORK[network];

// Create an instance of our BlockListener class
const blockListener = new BlockListener(provider);

// Create a signer using the provider and the PK of our keeper. This will be used to sign the transactions we want to send.
const signer = new Wallet(PK, provider);

// Upkeep contract has a list of whitelisted keepers called networks. We need to know the position of our keeper in that list.
const KEEP3R_SEQUENCER_POSITION = 2;

// Set the address of the sequencer contract.
const SEQUENCER = '0x9566eB72e47E3E20643C0b1dfbEe04Da5c7E4732';

// Set the keeper name identifier to use in the sequencer and upkeep job contracts. This is used by the contract
// to identify a specific keeper. This is stored in bytes32 in the contracts.
const KEEP3R_NETWORK_TAG = formatBytes32String('KEEP3R');

// instantiates the Upkeep job contract.
const upkeepJob = new Contract(UPKEEP_JOB_ADDRESS, MakerDAOUpkeepABI, signer);

// instantiates the Sequencer contract.
const sequencer = new Contract(SEQUENCER, SequencerABI, signer);

// Create a mapping that keeps track of whether we have sent a bundle to try to work a job.
const jobWorkInProgress: Record<string, boolean> = {};

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

// Create a variable that will hold the amount of blocks in which each keeper will be able to work.
let blocksWindow: number;

/**
 *
 * @notice Fetches the amount of blocks the work window has. Also fetches and instantiate every workable job that
 * 			 the Upkeep job manages.
 * 		   Lastly, it calls the function startWindow.
 *
 * @dev    This function is run only once per execution.
 *
 */
export async function runUpkeepJob(): Promise<void> {
	console.log('START runUpkeepJob()');
	if (!flashbots) {
		flashbots = await Flashbots.init(signer, new Wallet(FLASHBOTS_PK as string), provider, [FLASHBOTS_RPC], false, chainId);
	}
	if (!blocksWindow) {
		// fetches the amount of blocks the work windows has. Fetched only once.
		blocksWindow = (await sequencer.window()).toNumber();
	}

	// Amount of workable jobs.
	const jobsAmount = await sequencer.numJobs();

	// Array of promises to fetch every workable job address.
	const jobsAddressesPromises: Promise<string>[] = [];
	for (let index = 0; index < jobsAmount; index++) {
		jobsAddressesPromises.push(sequencer.jobAt(index));
	}

	// Fetches every workable job address.
	const jobsAddresses: Address[] = await Promise.all(jobsAddressesPromises);

	// Psudo workable job interface with only needed method we will use in this script.
	const makerJobAbiLike = ['function workable(bytes32 network) view returns (bool canWork, bytes memory args)'];

	// Instantiate every workable job contract.
	const jobsContracts = await Promise.all(
		jobsAddresses.map((address) => {
			return new ethers.Contract(address, makerJobAbiLike, signer);
		})
	);

	startWindow(jobsContracts);
}

/**
 *
 * @notice Fetches all the needed data to calculate the next workable window's first and last block and
 * 				 how much time is left.
 * 				 Once calculated it sets a timer to start fetching blocks after that timer passes.
 * 				 Will fetch blocks and try to work each  workable job calling tryToWorkJob function for each available job.
 *
 * @dev    We have set and average block time of 12 seconds since we are in PoS and also a toleranceThreshold of 120 seconds
 * 				 to start listening blocks 2 minutes before our work window. This way we can have a tolerance of at least 10 blocks
 * 				 being skipped in the network.
 * 				 This is because we want to be sure that we are going to always start fetching blocks before our window to
 * 				 minimize the risk of starting to fetch in the middle of our own workable window.
 * 				 This function will iterate through every workable job and try to work all of them.
 *
 * @param jobsContracts - Array of all the workable jobs already instantiated.
 *
 */
async function startWindow(jobsContracts: Contract[]) {
	console.log('Start Working on window');

	// Fetches current block number.
	const currentBlock = await provider.getBlock('latest');

	// Fetches amount of keepers/networks whitelisted.
	const networksAmount: BigNumber = await sequencer.numNetworks();

	// Calculates the first block of our next work window.
	const windowStart = calculateNextMasterWindow(currentBlock.number, blocksWindow, networksAmount.toNumber());

	// Calculates the last block of our next work window.
	const windowEnd = windowStart + blocksWindow;

	// Amount of blocks missing until our next work window.
	const reminderBlocks = windowStart - currentBlock.number;

	// Average duration of a block in ethereum mainnet in seconds.
	const blockDuration = 12 * 1000; // 12 seconds since PoS.

	// Amount of seconds we subtract from missing blocks time to ensure to always be listening before the window starts.
	// In this case it will be 2 minutes before window starts which gives us a tolerance of 10 skipped blocks by the network.
	const toleranceThreshold = 120 * 1000; // 120 seconds per blocks

	// Amount of seconds to wail to start fetching blocks.
	const time = reminderBlocks * blockDuration - toleranceThreshold;

	console.log({ windowStart });
	console.log({ windowEnd });
	console.log({ reminderBlocks });

	console.log({ time: `${time / 1000} seconds` });

	// When time elapses, create a subscription and start listening to upcoming blocks.
	const sub = timer(time)
		.pipe(mergeMap(() => blockListener.stream()))
		.subscribe(async (block) => {
			// Current block is previous to the window start block. Will stop and wait for next block.
			if (block.number < windowStart) {
				console.log('Still not in window. Current Block: ', block.number);
				return;
			}

			// Current block is bigger that last work window block. It will finish this subscription and will call
			// the startWindow function again to start the calculations for the next workable window.
			if (block.number >= windowEnd) {
				console.log('Window finished!');
				stopAndRestartWorkUpkeep(jobsContracts, blockListener, sub, startWindow);
				return;
			}

			// If inside of work window, will iterate through each job and will try to work it using the tryToWorkJob method.
			jobsContracts.forEach((job) => {
				tryToWorkJob(job, block);
			});
		});
}

/**
 *
 * @notice Attempts to work a workable job.
 *
 * @dev  Workable jobs have two different parameters to establish whether they're workable or not:
 * 			 - If the keeper trying to work is the master of the current work window.
 * 			 - A trigger which depends on external metrics and logic inside each job contract that can't be
 * 				 accurately predicted.
 * 			 For this reason, this function is only called when we know we are inside a work window.
 * 			 But because this also depends on external metrics that are unpredictable, once inside the work window,
 *       the function will always use and call the workable function of the job to check if job is actually workable.
 *       If it is, it will send the transaction to try to work it. Otherwise, it will not continue with it execution.
 *
 * @param job - Instance of a job contract that will be worked.
 * @param block - Current block data.
 *
 */
async function tryToWorkJob(job: Contract, block: Block) {
	// Check if job is trying to be worked already.
	if (jobWorkInProgress[job.address]) {
		console.log('Work in progress for job: ', job.address);
		return;
	}

	// Calls job contract to check if actually workable. Receives a boolean and also the args that must be sent
	// to the work function of the Upkeep contract.
	const [isWorkable, args]: [boolean, string] = await job.workable(KEEP3R_NETWORK_TAG);

	// If the job is not workable for any reason, execution of function is stopped.
	if (!isWorkable) {
		console.log(`Job ${job.address} is not workable`);
		return;
	}

	console.log('Job is workable: ', job.address);

	// Sets job as in progress since at this point it means that job is not being worked and is workable.
	jobWorkInProgress[job.address] = true;

	// Get the signer's (keeper) current nonce
	const currentNonce = await provider.getTransactionCount(signer.address);

	/*
			We are going to send this through Flashbots, which means we will be sending multiple bundles to different
			blocks inside a batch. Here we are calculating which will be the last block of our batch of bundles.
			This information is needed to calculate what will the maximum possible base fee be in that block, so we can
			calculate the maxFeePerGas parameter for all our transactions.
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

	// We populate the transactions we will use in our bundles. Notice we are calling the upkeepJob's work function
	// with the args that the job.workable function gaves us.
	const txs: TransactionRequest[] = await populateTransactions({
		chainId,
		contract: upkeepJob,
		functionArgs: [[args]],
		functionName: 'work',
		options,
	});

	/*
		We create our batch of bundles. In this case this will be a batch of two bundles that will contain the same transaction.
	*/
	const bundles = createBundlesWithSameTxs({
		unsignedTxs: txs,
		burstSize: FIRST_BURST_SIZE,
		firstBlockOfBatch,
	});

	/*
		We send our batch of bundles and recreate new ones until we work it or our work window finishes.
		It's also worth noting that for ease of debugging we are passing the job address as static id, and a random 5 digit id to identify each batch.
		Each batch would look something like this in the console: JOB_ADDRESS#12345
	*/
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

	// If the bundle was included, we console log the success
	if (result) console.log('===== Tx SUCCESS ===== ', job.address);
	// We also need to set the job as not in progress anymore.
	jobWorkInProgress[job.address] = false;
}

/**
 *
 * @notice Calculates if the keeper is the master and whether the provided block is the first block of the window.
 *
 * @param blockNumber - Number of block to check.
 * @param blocksWindow - Amount of blocks a work window has.
 * @param networksAmount - Amount of whitelisted keepers/networks.
 *
 * @returns A boolean that indicates if keeper is master and block provided is the first block of the window.
 */
function isMasterFirstBlock(blockNumber: number, blocksWindow: number, networksAmount: number): boolean {
	const master = KEEP3R_SEQUENCER_POSITION == Math.floor(blockNumber / blocksWindow) % networksAmount;

	// If blockNumber % blocksWindow is zero it means it doesnt have decimals which means the block number is the
	// first of the window since block number is divisible by blocksWindow.
	const isFirstBlockOfWindow = blockNumber % blocksWindow === 0;
	if (master && isFirstBlockOfWindow) return true;
	return false;
}

/**
 *
 * @notice Calculates the next block number in which the keeper is master.
 *
 * @dev It will iterate adding one block each time and calling isMasterFirstBlock function until true.
 *
 * @param blockNumber - Number of block to check.
 * @param blocksWindow - Amount of blocks a work window has.
 * @param networksAmount - Amount of whitelisted keepers/networks.
 *
 * @returns Number representing the next block number in which the keeper is master.
 */
function calculateNextMasterWindow(blockNumber: number, blocksWindow: number, networksAmount: number): number {
	let nextMasterStart: number = blockNumber;
	let nextMasterStartFounded = false;
	while (!nextMasterStartFounded) {
		const master = isMasterFirstBlock(nextMasterStart, blocksWindow, networksAmount);
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
