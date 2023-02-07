import { sendTx, checkIsWorkable } from '../transactions';
import type { providers, Overrides, Contract } from 'ethers';

export class MempoolBroadcastor {
	private readonly provider: providers.JsonRpcProvider | providers.WebSocketProvider;

	private readonly gasLimit: number;

	constructor(provider: providers.JsonRpcProvider | providers.WebSocketProvider, gasLimit: number) {
		this.provider = provider;
		this.gasLimit = gasLimit;
	}

	tryToWorkOnMempool = async (
		jobContract: Contract,
		workMethod: string,
		methodArguments: Array<number | string>,
		isWorkable: boolean
	) => {
		if (isWorkable != (await checkIsWorkable(jobContract, methodArguments))) return;
		const gasFees = await this.provider.getGasPrice();

		// Create an object containing the fields we would like to add to our transaction.
		const options: Overrides = {
			gasLimit: this.gasLimit,
			gasPrice: gasFees.mul(11).div(10).toNumber(),
			// MaxPriorityFeePerGas:
			// TODO: add support for type2 mempool txs
			type: 0,
		};

		// Send the transaction
		await sendTx({
			contractCall: () =>
				jobContract.work[workMethod](methodArguments, {
					...options,
				}),
		});

		console.log(`===== Tx SUCCESS =====`);
	};
}
