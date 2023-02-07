import { Flashbots, makeid } from '../flashbots';
import {
	createBundlesWithSameTxs,
	sendAndRetryUntilNotWorkable,
	getMainnetGasType2Parameters,
	populateTransactions,
} from '../transactions';
import { TransactionRequest } from '@ethersproject/abstract-provider';
import type { providers, Wallet, Overrides, Contract } from 'ethers';

/**
 * @notice Creates and populate a transaction for work in a determinated job using flashbots
 *
 * @param provider			The provider which can be Json or Wss
 * @param flashbots			The flashbot that will send the bundle
 * @param burstSize 		The burst size
 * @param futureBlocks		The amount of future blocks.
 * @param priorityFeeInWei 	The priority fee in wei
 * @param gasLimit			The gas limit determines the maximum gas that can be spent in the transaction
 *
 */
export class FlashbotBroadcastor {
	public provider: providers.JsonRpcProvider | providers.WebSocketProvider;
	public flashbots: Flashbots;
	public burstSize: number;
	public futureBlocks: number;
	public priorityFeeInWei: number;
	public gasLimit: number;

	constructor(
		provider: providers.JsonRpcProvider,
		flashbots: Flashbots,
		burstSize: number,
		futureBlocks: number,
		priorityFeeInWei: number,
		gasLimit: number
	) {
		this.provider = provider;
		this.flashbots = flashbots;
		this.burstSize = burstSize;
		this.futureBlocks = futureBlocks;
		this.priorityFeeInWei = priorityFeeInWei;
		this.gasLimit = gasLimit;
	}

	async tryToWorkOnFlashbots(
		jobContract: Contract,
		workMethod: string,
		methodArguments: Array<number | string>,
		isWorkable: boolean
	) {
		const block = await this.provider.getBlock('latest');
		const blocksAhead = this.futureBlocks + this.burstSize;
		const firstBlockOfBatch = block.number + this.futureBlocks;

		const { priorityFeeInGwei, maxFeePerGas } = getMainnetGasType2Parameters({
			block,
			blocksAhead,
			priorityFeeInWei: this.priorityFeeInWei,
		});
		const txSigner = jobContract.signer as Wallet;

		const currentNonce = await txSigner.getTransactionCount();

		const options: Overrides = {
			gasLimit: this.gasLimit,
			nonce: currentNonce,
			maxFeePerGas,
			maxPriorityFeePerGas: priorityFeeInGwei,
			type: 2,
		};

		const txs: TransactionRequest[] = await populateTransactions({
			chainId: this.provider.network.chainId,
			contract: jobContract,
			functionArgs: new Array(this.burstSize).fill(null).map(() => [methodArguments]),
			functionName: workMethod,
			options,
		});

		console.log('Transactions populated successfully. Creating bundles...');

		const bundles = createBundlesWithSameTxs({
			unsignedTxs: txs,
			burstSize: this.burstSize,
			firstBlockOfBatch,
		});

		console.log('Bundles created successfuly');

		const result = await sendAndRetryUntilNotWorkable({
			txs,
			provider: this.provider,
			priorityFeeInWei: this.priorityFeeInWei,
			signer: txSigner,
			bundles,
			newBurstSize: this.burstSize,
			flashbots: this.flashbots,
			isWorkableCheck: async () => isWorkable,
			staticDebugId: String(methodArguments),
			dynamicDebugId: makeid(5),
		});

		if (result) console.log('===== Tx SUCCESS =====');
	}
}
