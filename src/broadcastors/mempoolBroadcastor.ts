import { sendTx } from '../transactions';
import { providers, Overrides, BigNumber, Wallet } from 'ethers';
import { BroadcastorProps } from 'types';

/**
 * @notice Creates and populate a transaction for work in a determinated job using mempool
 *
 * @param provider		 The provider which can be Json or Wss
 * @param priorityFeeInWei 	The priority fee in wei
 * @param gasLimit		 The gas limit determines the maximum gas that can be spent in the transaction
 * @param doStaticCall Flag to determinate whether to perform a callStatic to work or not. Defaults to true.
 *
 *
 */
export class MempoolBroadcastor {
	constructor(
		public provider: providers.JsonRpcProvider | providers.WebSocketProvider,
		public priorityFeeInWei: number,
		public gasLimit: number,
		public doStaticCall = true
	) {}

	tryToWork = async (props: BroadcastorProps): Promise<void> => {
		const { jobContract, workMethod, workArguments, block } = props;

		const txSigner = jobContract.signer as Wallet;
		const currentNonce = await txSigner.getTransactionCount();

		// Create an object containing the fields we would like to add to our transaction.
		let options: Overrides;
		if (!block.baseFeePerGas) {
			// Type 0 tx
			const gasPrice = jobContract.provider.getGasPrice();

			options = {
				gasLimit: this.gasLimit,
				gasPrice,
				nonce: currentNonce,
				type: 0,
			};
		} else {
			// Type 2 tx
			const maxBaseFeePerGas = block.baseFeePerGas.mul(15).div(10);
			const maxPriorityFeePerGas = BigNumber.from(this.priorityFeeInWei);
			const maxFeePerGas = maxBaseFeePerGas.add(maxPriorityFeePerGas);

			options = {
				gasLimit: this.gasLimit,
				maxFeePerGas,
				maxPriorityFeePerGas,
				nonce: currentNonce,
				type: 2,
			};
		}

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

		// Send the transaction
		await sendTx({
			contractCall: () =>
				jobContract[workMethod](...workArguments, {
					...options,
				}),
		});

		console.log(`===== Tx SUCCESS =====`);
	};
}
