import { getStealthHash } from '../flashbots';
import { getGasParametersNextBlock, populateTx, sendPrivateTransaction } from '../transactions';
import type { TransactionRequest } from '@ethersproject/abstract-provider';
import { Contract, Overrides, Wallet, ethers } from 'ethers';
import { BroadcastorProps } from 'types';

/**
 * @notice Creates and populate a private transaction to work a specific job
 *
 * @param endpoint          The endpoint url
 * @param stealthRelayer    The address of the StealthRelayer contract.
 * @param priorityFeeInWei  The priority fee in wei
 * @param gasLimit			The gas limit determines the maximum gas that can be spent in the transaction
 * @param doStaticCall		Flag to determinate whether to perform a callStatic to work or not. Defaults to true.
 * @param chainId		    The chainId.
 *
 */
export class PrivateBroadcastor {
	constructor(
		public endpoint: string,
		public stealthRelayer: Contract,
		public priorityFeeInWei: number,
		public gasLimit: number,
		public doStaticCall = true,
		public chainId: number
	) {}

	async tryToWorkOnStealthRelayer(props: BroadcastorProps): Promise<void> {
		const { jobContract, workMethod, workArguments, block } = props;

		const stealthHash = getStealthHash();
		const workData = jobContract.interface.encodeFunctionData(workMethod, [...workArguments]);

		if (this.doStaticCall) {
			try {
				await this.stealthRelayer.callStatic.execute(jobContract.address, workData, stealthHash, block.number);
			} catch (error: unknown) {
				if (error instanceof Error) {
					console.log(`Static call failed with ${error.message}`);
				}
				return;
			}
		}

		console.log(`Attempting to work strategy statically succeeded. Preparing real transaction...`);

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
			contract: this.stealthRelayer,
			functionName: 'execute',
			functionArgs: [jobContract.address, workData, stealthHash, block.number],
			options,
			chainId: this.chainId,
		});

		const privateTx = await txSigner.signTransaction(tx);

		console.log(`Transaction populated successfully. Sending private transaction for strategy: ${workArguments}`);

		await sendPrivateTransaction({
			endpoint: this.endpoint,
			privateTx,
			maxBlockNumber: ethers.utils.hexlify(block.number).toString(),
		});
	}
}
