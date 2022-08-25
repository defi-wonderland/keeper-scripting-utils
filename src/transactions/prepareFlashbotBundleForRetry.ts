import { createBundles, formatBundlesTxsToType2 } from './';
import { TransactionRequest } from '@ethersproject/abstract-provider';
import { BundleBurstGroup, PrepareFlashbotBundleForRetryProps } from '@types';
import { BytesLike, hexConcat, hexDataSlice, hexlify, hexZeroPad } from 'ethers/lib/utils';

// TODO take off id argument from createBundle, both prepeare functions, sendRetry and remove from BundleBurstGroup type
export async function prepareFlashbotBundleForRetry(props: PrepareFlashbotBundleForRetryProps): Promise<BundleBurstGroup[]> {
	const { txs, provider, signer, priorityFee, notIncludedBlock, previousBurstSize, newBurstSize, sendThroughStealthRelayer, id } =
		props;
	const firstBundleBlock = await provider.getBlock(notIncludedBlock);
	const targetBlock = notIncludedBlock + previousBurstSize;
	const blocksAhead = previousBurstSize + newBurstSize - 1;
	const latestNonce = await provider.getTransactionCount(signer.address);

	let newTxs: TransactionRequest[] = [];

	if (sendThroughStealthRelayer) {
		const tx = txs[0];
		newTxs = new Array(newBurstSize).fill(null).map((_, index) => {
			const blockNumber = targetBlock + index;
			const data = hexZeroPad(hexlify(blockNumber), 32); // calculates the hex value of blockNumber and pads it until it has a length of 32
			const slicedData = hexDataSlice(tx.data as BytesLike, 0, 100); // stores all the bytes from 0 - 100
			return {
				...tx,
				data: hexConcat([slicedData, data]),
				nonce: latestNonce,
			};
		});
	} else {
		newTxs = txs.map((tx) => ({ ...tx, nonce: latestNonce }));
	}

	const bundles = createBundles({ unsignedTxs: newTxs, burstSize: newBurstSize, targetBlock, id });
	return formatBundlesTxsToType2({ bundlesTxs: bundles, block: firstBundleBlock, priorityFee, blocksAhead });
}
