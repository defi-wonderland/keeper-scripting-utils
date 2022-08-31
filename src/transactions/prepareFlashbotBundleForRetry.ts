import { formatBundlesTxsToType2, createBundlesWithSameTxs, createBundlesWithDifferentTxs } from './';
import { TransactionRequest } from '@ethersproject/abstract-provider';
import { BundleBurstGroup, PrepareFlashbotBundleForRetryProps } from '@types';

// TODO take off id argument from createBundle, both prepeare functions, sendRetry and remove from BundleBurstGroup type
export async function prepareFlashbotBundleForRetry(props: PrepareFlashbotBundleForRetryProps): Promise<BundleBurstGroup[]> {
	const {
		txs,
		provider,
		signer,
		priorityFee,
		notIncludedBlock,
		previousBurstSize,
		newBurstSize,
		id,
		regenerateTxs,
		bundleRegenerationMethod = 'createBundlesWithSameTxs',
	} = props;
	const firstBundleBlock = await provider.getBlock(notIncludedBlock);
	const firstBlockOfNextBatch = notIncludedBlock + previousBurstSize;
	const blocksAhead = previousBurstSize + newBurstSize - 1;
	const latestNonce = await provider.getTransactionCount(signer.address);
	let newTxs: TransactionRequest[] = txs;

	if (regenerateTxs) {
		newTxs = (await regenerateTxs(newBurstSize, firstBlockOfNextBatch)).map((tx) => ({ ...tx, nonce: latestNonce }));
	}

	let bundles: BundleBurstGroup[];

	if (bundleRegenerationMethod === 'createBundlesWithSameTxs') {
		bundles = createBundlesWithSameTxs({
			unsignedTxs: newTxs,
			burstSize: newBurstSize,
			firstBlockOfBatch: firstBlockOfNextBatch,
			id,
		});
	}

	if (bundleRegenerationMethod === 'createBundlesWithDifferentTxs') {
		bundles = createBundlesWithDifferentTxs({
			unsignedTxs: newTxs,
			burstSize: newBurstSize,
			firstBlockOfBatch: firstBlockOfNextBatch,
			id,
		});
	}

	return formatBundlesTxsToType2({ bundlesTxs: bundles!, block: firstBundleBlock, priorityFee, blocksAhead });
}
