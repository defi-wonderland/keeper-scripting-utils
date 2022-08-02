import { Block, TransactionResponse, TransactionRequest } from '@ethersproject/abstract-provider';
import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
import { BigNumber, Contract, providers, Signer, utils } from 'ethers';
import { Flashbots } from 'src/flashbots/flashbots';
import { BundleBurstGroup, GasType2Parameters, PrepareFirstBundlesForFlashbotsReturnValue } from 'src/types';

/**
 * @notice Prepares the first set of flashbot bundles to be sent.
 *
 * @param job The instance of the job Contract to be worked
 * @param functionName The name of the function to be called in order to work the job
 * @param signer The signer of the transaction
 * @param block Current block
 * @param priorityFee The priority fee to be paid to the miner
 * @param gasLimit The desired gas limit to set for the transaction request
 * @param chainId The chainId of the chain where this job is located
 * @param nonce The nonce to use for the submission of the transaction
 * @param futureBlocks How many blocks in the future to send the bundle
 * @param burstSize How many consecutives blocks do we want to send the bundle to
 * @param functionArgs The arguments of the function to be called. This will be used to populate the transaction fields
 * @returns An array of equal bundles with different target blocks
 */

export async function prepareFirstBundlesForFlashbots(
	job: Contract,
	functionName: string,
	signer: Signer,
	block: Block,
	priorityFee: number,
	gasLimit: number,
	chainId: number,
	nonce: number,
	futureBlocks: number,
	burstSize: number,
	...functionArgs: any[]
): Promise<PrepareFirstBundlesForFlashbotsReturnValue> {
	const tx: TransactionRequest = await job.connect(signer).populateTransaction[functionName](...functionArgs, {
		gasLimit,
	});

	tx.chainId = chainId;
	tx.nonce = nonce;

	const targetBlock = block.number + futureBlocks;
	const blocksAhead = futureBlocks + burstSize; // done
	const bundles = createBundles(tx, burstSize, targetBlock);
	const formattedBundles = formatBundlesTxsToType2(bundles, block, priorityFee, blocksAhead);

	// This should probably return the transaction aswell
	return {
		tx,
		formattedBundles,
	};
}

/**
 * @notice Sends new bundles with the same transaction to different targetBlocks until the job is successfully worked, or another keeper works it.
 *
 * @dev If out last bundle was sent to block 100, 101, 102, and 100 was not included, a new bundle will be sent to blocks 103 + newBurstSize
 *      if the job is still workable. This process will continue until the job is worked.
 *
 * @param tx The transaction to be retried.
 * @param provider A provider used to fetch the block after the target block of the first bundle
 * @param priorityFee The priority fee to be paid to the miner
 * @param bundle The bundles previously sent to flashbots
 * @param newBurstSize How many consecutive blocks after our last bundle's target block we want to send the new bundle to
 * @param flashbots Flashbots instance
 * @param job The instance of the job Contract to be worked. This will be used to check if it's still workable.
 * @param functionName The function name to call in order to check if the job is still workable
 * @param functionArgs The function args that function takes, if any.
 * @returns A boolean to know whether the bundle was included or not
 */

export async function sendAndRetryUntilNotWorkable(
	tx: TransactionRequest,
	provider: providers.BaseProvider,
	priorityFee: number,
	bundles: BundleBurstGroup[],
	newBurstSize: number,
	flashbots: Flashbots,
	job: Contract,
	functionName: string,
	...functionArgs: any[]
): Promise<boolean> {
	const firstBundleIncluded = await sendBundlesToFlashbots(bundles, flashbots);
	if (!firstBundleIncluded) {
		const jobIsStillWorkable = await job.functions[functionName](...functionArgs);
		if (!jobIsStillWorkable) {
			console.log('Job is not workable');
			return false;
		}
		const retryBundle = await prepareFlashbotBundleForRetry(
			tx,
			provider,
			bundles[0].targetBlock,
			priorityFee,
			bundles.length,
			newBurstSize
		);
		sendAndRetryUntilNotWorkable(
			tx,
			provider,
			priorityFee,
			retryBundle,
			newBurstSize,
			flashbots,
			job,
			functionName,
			...functionArgs
		);
	}
	console.log('Bundle submitted successfuly');
	return true;
}

export async function prepareFlashbotBundleForRetry(
	tx: TransactionRequest,
	provider: providers.BaseProvider,
	notIncludedBlock: number,
	priorityFee: number,
	previousBurstSize: number,
	newBurstSize: number
): Promise<BundleBurstGroup[]> {
	const firstBundleBlock = await provider.getBlock(notIncludedBlock);
	const targetBlock = notIncludedBlock + previousBurstSize;
	const blocksAhead = previousBurstSize + newBurstSize - 1;
	const bundles = createBundles(tx, newBurstSize, targetBlock);

	return formatBundlesTxsToType2(bundles, firstBundleBlock, priorityFee, blocksAhead);
}

export async function sendBundlesToFlashbots(bundle: BundleBurstGroup[], flashbots: Flashbots): Promise<boolean> {
	console.log('Sending txs', bundle);

	const included = bundle.map((bundle) => {
		return flashbots.send(bundle.txs, bundle.targetBlock);
	});

	return included[0];
}

export function createBundles(unsignedTx: TransactionRequest, burstQuantity: number, targetBlock: number): BundleBurstGroup[] {
	return new Array(burstQuantity).fill(null).map((_, index) => ({
		targetBlock: targetBlock + index,
		txs: [unsignedTx],
	}));
}

export async function sendSingleTx(
	contract: Contract,
	functionName: string,
	signer: Signer,
	block: Block,
	priorityFee: number,
	gasLimit: number,
	chainId: number,
	...functionArgs: any[]
): Promise<boolean> {
	const { priorityFee: priorityFeeToGwei, maxFeePerGas } = getGasType2Parameters(block, priorityFee);
	const tx: TransactionResponse = await contract.connect(signer).functions[functionName](...functionArgs, {
		maxFeePerGas,
		priorityFee: priorityFeeToGwei,
		gasLimit,
		type: 2,
		chainId,
	});

	console.log(`Transaction submitted: https://etherscan.io/tx/${tx.hash}`);

	try {
		await tx.wait();
		console.log('Transaction executed successfully.');
		return true;
	} catch (err) {
		console.log(`Transaction failed. Reason: ${err.reason}`);
		return false;
	}
}

export function getGasType2Parameters(block: Block, priorityFee: number): GasType2Parameters {
	const nextBlockBaseFee = FlashbotsBundleProvider.getBaseFeeInNextBlock(block.baseFeePerGas!, block.gasUsed, block.gasLimit);
	const priorityFeeToGwei = toGwei(priorityFee);
	const maxFeePerGas = priorityFeeToGwei.add(nextBlockBaseFee);
	return {
		priorityFee: priorityFeeToGwei,
		maxFeePerGas,
	};
}

export function getGasType2ParametersForBundle(block: Block, priorityFee: number, blocksAhead: number): GasType2Parameters {
	const maxBlockBaseFee = FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock(block.baseFeePerGas!, blocksAhead);
	const priorityFeeToGwei = toGwei(priorityFee);
	const maxFeePerGas = priorityFeeToGwei.add(maxBlockBaseFee);
	return {
		priorityFee: priorityFeeToGwei,
		maxFeePerGas,
	};
}

export function formatTxsToType2NextBlock(
	unsignedTxs: TransactionRequest[],
	block: Block,
	priorityFee: number
): TransactionRequest[] {
	const { priorityFee: priorityFeeToGwei, maxFeePerGas } = getGasType2Parameters(block, priorityFee);
	return unsignedTxs.map((tx) => ({
		...tx,
		type: 2,
		maxPriorityFeePerGas: priorityFeeToGwei,
		maxFeePerGas,
	}));
}

export function formatTxsToType2(
	unsignedTxs: TransactionRequest[],
	block: Block,
	priorityFee: number,
	blocksAhead: number
): TransactionRequest[] {
	const { priorityFee: priorityFeeToGwei, maxFeePerGas } = getGasType2ParametersForBundle(block, priorityFee, blocksAhead);
	return unsignedTxs.map((tx) => ({
		...tx,
		type: 2,
		maxPriorityFeePerGas: priorityFeeToGwei,
		maxFeePerGas,
	}));
}

export function formatBundlesTxsToType2(
	bundlesTxs: BundleBurstGroup[],
	block: Block,
	priorityFee: number,
	blocksAhead: number
): BundleBurstGroup[] {
	const { priorityFee: priorityFeeToGwei, maxFeePerGas } = getGasType2ParametersForBundle(block, priorityFee, blocksAhead);
	return bundlesTxs.map((bundle) => ({
		...bundle,
		txs: bundle.txs.map((tx) => ({
			...tx,
			type: 2,
			maxPriorityFeePerGas: priorityFeeToGwei,
			maxFeePerGas,
		})),
	}));
}

export const toGwei = (value: number): BigNumber => {
	return utils.parseUnits(value.toString(), 'gwei');
};
