import { createBundles, formatBundlesTxsToType2 } from './';
import { BundleBurstGroup, PrepareFlashbotBundleForRetryProps } from '@types';

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
