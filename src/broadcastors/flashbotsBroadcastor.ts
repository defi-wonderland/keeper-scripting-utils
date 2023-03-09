import { getGasParametersNextBlock, populateTx, sendAndHandleResponse } from '../transactions';
import type { TransactionRequest } from '@ethersproject/abstract-provider';
import type { FlashbotsBundleTransaction, FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
import type { Wallet, Overrides } from 'ethers';
import { BroadcastorProps } from 'types';

/**
 * @notice Creates and populate a transaction for work in a determinated job using flashbots
 *
 * @param flashbotsProvider The flashbot provider that will send the bundle
 * @param priorityFeeInWei 	The priority fee in wei
 * @param gasLimit			    The gas limit determines the maximum gas that can be spent in the transaction
 * @param doStaticCall			Flag to determinate whether to perform a callStatic to work or not. Defaults to true.
 *
 */
export class FlashbotsBroadcastor {
	public chainId: number;

	constructor(
		public flashbotsProvider: FlashbotsBundleProvider,
		public priorityFeeInWei: number,
		public gasLimit: number,
		public doStaticCall = true
	) {
		this.chainId = flashbotsProvider.network.chainId;
	}

	async tryToWorkOnFlashbots(props: BroadcastorProps): Promise<void> {
		const { jobContract, workMethod, workArguments, block } = props;

		if (this.doStaticCall) {
			try {
				await jobContract.callStatic[workMethod](...workArguments);
			} catch (error: unknown) {
				if (error instanceof Error) {
					console.log(`Static call failed with ${error.message}`);
				}
				return;
			}
		}

		const { priorityFee, maxFeePerGas } = getGasParametersNextBlock({ block, priorityFeeInWei: this.priorityFeeInWei });

		const txSigner = jobContract.signer as Wallet;

		const currentNonce = await txSigner.getTransactionCount();

		const options: Overrides = {
			gasLimit: this.gasLimit,
			nonce: currentNonce,
			maxFeePerGas,
			maxPriorityFeePerGas: priorityFee,
			type: 2,
		};

		const tx: TransactionRequest = await populateTx({
			contract: jobContract,
			functionName: workMethod,
			functionArgs: [...workArguments],
			options,
			chainId: this.chainId,
		});

		const privateTx: FlashbotsBundleTransaction = {
			transaction: tx,
			signer: txSigner,
		};

		console.log('Transaction populated successfully. Sending bundle...');

		await sendAndHandleResponse({ flashbotsProvider: this.flashbotsProvider, privateTx });
	}
}
