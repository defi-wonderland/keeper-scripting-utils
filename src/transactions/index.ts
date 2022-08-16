import { Flashbots } from '../flashbots/flashbots';
import { Block, TransactionResponse, TransactionRequest } from '@ethersproject/abstract-provider';
import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
import {
	SendTxProps,
	CreateBundlesProps,
	FormatBundlesTxsToType2Props,
	FormatTxsToType2NextBlockProps,
	FormatTxsToType2Props,
	GetGasType2ParametersForBundleProps,
	PrepareFirstBundlesForFlashbotsProps,
	PrepareFirstBundlesForFlashbotsReturnValue,
	PrepareFlashbotBundleForRetryProps,
	SendAndRetryUntilNotWorkableProps,
	SendMainnetTxProps,
	BundleBurstGroup,
	GasType2Parameters,
} from '@types';
import { BigNumber, providers, utils } from 'ethers';

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
 *
 * @returns An array of equal bundles with different target blocks
 */

export async function prepareFirstBundlesForFlashbots(
	props: PrepareFirstBundlesForFlashbotsProps
): Promise<PrepareFirstBundlesForFlashbotsReturnValue> {
	const { block, burstSize, chainId, functionArgs, functionName, futureBlocks, gasLimit, job, nonce, signer, priorityFee } =
		props;
	const tx: TransactionRequest = await job.connect(signer).populateTransaction[functionName](...functionArgs, {
		gasLimit,
	});
	tx.chainId = chainId;
	tx.nonce = nonce;

	const targetBlock = block.number + futureBlocks;
	const blocksAhead = futureBlocks + burstSize; // done
	const bundles = createBundles({ unsignedTx: tx, burstSize: burstSize, targetBlock, id: functionArgs[0] }); // TODO remove 3er paramenter. Its for loggin on dev phase
	const formattedBundles = formatBundlesTxsToType2({ bundlesTxs: bundles, block, priorityFee, blocksAhead });

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

export async function sendAndRetryUntilNotWorkable(props: SendAndRetryUntilNotWorkableProps): Promise<boolean> {
	const { bundles, flashbots, isWorkableCheck, newBurstSize, priorityFee, provider, signer, tx } = props;
	const firstBundleIncluded = await sendBundlesToFlashbots(bundles, flashbots);
	if (!firstBundleIncluded) {
		const jobIsStillWorkable = await isWorkableCheck();
		if (!jobIsStillWorkable) {
			console.log('Job is not workable');
			return false;
		}
		// check using state
		// strategiesStatus[strategy].includedIn return;
		const retryBundle = await prepareFlashbotBundleForRetry({
			tx,
			provider,
			notIncludedBlock: bundles[0].targetBlock,
			priorityFee,
			previousBurstSize: bundles.length,
			newBurstSize,
			signer,
			id: bundles[0].id,
		});
		return sendAndRetryUntilNotWorkable({ ...props, bundles: retryBundle });
	}
	return true;
}

// TODO take off id argument from createBundle, both prepeare functions, sendRetry and remove from BundleBurstGroup type
export async function prepareFlashbotBundleForRetry(props: PrepareFlashbotBundleForRetryProps): Promise<BundleBurstGroup[]> {
	const { tx, provider, signer, priorityFee, notIncludedBlock, previousBurstSize, newBurstSize, id } = props;
	const firstBundleBlock = await provider.getBlock(notIncludedBlock);
	const targetBlock = notIncludedBlock + previousBurstSize;
	const blocksAhead = previousBurstSize + newBurstSize - 1;
	tx.nonce = await provider.getTransactionCount(signer.address);
	const bundles = createBundles({ unsignedTx: tx, burstSize: newBurstSize, targetBlock, id });

	return formatBundlesTxsToType2({ bundlesTxs: bundles, block: firstBundleBlock, priorityFee, blocksAhead });
}

export async function sendBundlesToFlashbots(bundle: BundleBurstGroup[], flashbots: Flashbots): Promise<boolean> {
	console.log('Sending txs', bundle);

	const included = bundle.map((bundle) => {
		return flashbots.send(bundle.txs, bundle.targetBlock);
	});

	return included[0];
}

export function createBundles(props: CreateBundlesProps): BundleBurstGroup[] {
	const { targetBlock, burstSize, unsignedTx, id } = props;
	return new Array(burstSize).fill(null).map((_, index) => ({
		targetBlock: targetBlock + index,
		txs: [unsignedTx],
		id,
	}));
}

export async function sendMainnetTx(props: SendMainnetTxProps): Promise<providers.TransactionReceipt> {
	const { contract, signer, block, chainId, gasLimit, priorityFee, functionName, functionArgs } = props;
	const { priorityFee: priorityFeeToGwei, maxFeePerGas } = getGasType2Parameters(block, priorityFee);
	const tx: TransactionResponse = await contract.connect(signer).functions[functionName](...functionArgs, {
		maxFeePerGas,
		maxPriorityFeePerGas: priorityFeeToGwei,
		gasLimit,
		type: 2,
	});

	tx.chainId = chainId;
	console.log(`Transaction submitted: https://etherscan.io/tx/${tx.hash}`);

	return await tx.wait();
}

export async function sendTx(props: SendTxProps): Promise<providers.TransactionReceipt> {
	const { chainId, contract, functionArgs, functionName, gasLimit, maxFeePerGas, maxPriorityFeePerGas, signer, explorerUrl } =
		props;
	const maxFeePerGasGwei = toGwei(Math.ceil(maxFeePerGas) + 10); // TODO CHECK
	const maxPriorityFeePerGasGwei = toGwei(Math.ceil(maxPriorityFeePerGas) + 10); // TODO CHECK
	const tx: TransactionResponse = await contract.connect(signer).functions[functionName](...functionArgs, {
		maxFeePerGas: maxFeePerGasGwei,
		maxPriorityFeePerGas: maxPriorityFeePerGasGwei,
		gasLimit,
		type: 2,
	});

	tx.chainId = chainId;
	if (explorerUrl) {
		console.log(`Transaction submitted: ${explorerUrl}/tx/${tx.hash}`);
	} else {
		console.log(`Transaction submitted: ${tx.hash}`);
	}

	return await tx.wait();
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

export function getGasType2ParametersForBundle(props: GetGasType2ParametersForBundleProps): GasType2Parameters {
	const { block, blocksAhead, priorityFee } = props;
	const maxBlockBaseFee = FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock(block.baseFeePerGas!, blocksAhead);
	const priorityFeeToGwei = toGwei(priorityFee);
	const maxFeePerGas = priorityFeeToGwei.add(maxBlockBaseFee);
	return {
		priorityFee: priorityFeeToGwei,
		maxFeePerGas,
	};
}

export function formatTxsToType2NextBlock(props: FormatTxsToType2NextBlockProps): TransactionRequest[] {
	const { block, priorityFee, unsignedTxs } = props;
	const { priorityFee: priorityFeeToGwei, maxFeePerGas } = getGasType2Parameters(block, priorityFee);
	return unsignedTxs.map((tx) => ({
		...tx,
		type: 2,
		maxPriorityFeePerGas: priorityFeeToGwei,
		maxFeePerGas,
	}));
}

export function formatTxsToType2(props: FormatTxsToType2Props): TransactionRequest[] {
	const { block, blocksAhead, priorityFee, unsignedTxs } = props;
	const { priorityFee: priorityFeeToGwei, maxFeePerGas } = getGasType2ParametersForBundle({ block, priorityFee, blocksAhead });
	return unsignedTxs.map((tx) => ({
		...tx,
		type: 2,
		maxPriorityFeePerGas: priorityFeeToGwei,
		maxFeePerGas,
	}));
}

export function formatBundlesTxsToType2(props: FormatBundlesTxsToType2Props): BundleBurstGroup[] {
	const { block, blocksAhead, bundlesTxs, priorityFee } = props;
	const { priorityFee: priorityFeeToGwei, maxFeePerGas } = getGasType2ParametersForBundle({ block, priorityFee, blocksAhead });
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
