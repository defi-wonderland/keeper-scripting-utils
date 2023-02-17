import { BigNumberish, Contract, WebSocketProvider, JsonRpcProvider } from 'ethers';

const KP3RV1_KEEPER_WORK_EVENT_TOPIC = '0x3cda93551ad083704be19fabbd7c3eb94d88f6e72ff221bdea9017e52e4144e8';

/**
 * @notice Calculates the net profit in KP3R a keeper would get for working a job registered in Keep3rV1.
 *
 * @dev This function should only be used for mainnet jobs that pay in KP3R or bonded KP3R. The main use of this
 * 		function is to use it after a simulation and before sending the bundles to gauge whether working would be
 * 		profitable or not with that priority fee.
 *
 * @param txHash 			 Hash of the transaction in which the keeper worked the job.
 * @param keep3rHelper       Instance of the keep3rHelper contract.
 * @param provider	         The provider to use to make a call to the keep3rHelper contract.
 *
 * @return The net profit for working a job denominated in KP3R.
 */
export const calculateKP3RNetProfitV1 = async (
	txHash: string,
	keep3rHelper: Contract,
	provider: WebSocketProvider | JsonRpcProvider
): Promise<BigNumberish | void> => {
	const txReceipt = await provider.getTransactionReceipt(txHash);
	const gasPrice = txReceipt!.gasPrice;
	const gasUsed = txReceipt!.gasUsed;
	const txCostInEth = gasPrice * gasUsed;
	const txCostInKp3r: BigNumberish = await keep3rHelper.quote(txCostInEth);

	const tx = txReceipt!.logs.find((log) => log.topics[0] === KP3RV1_KEEPER_WORK_EVENT_TOPIC);

	if (!tx) return console.log('Could not find a matching event. Are you certain this job is registered in Keep3rV1?');

	// TODO: parse event with ethers (instead of substring)
	const paymentString = '0x' + tx.data.substring(66, 132);
	const parsedPayment = BigInt(paymentString);

	const netProfit = parsedPayment - BigInt(txCostInKp3r);

	return netProfit;
};
