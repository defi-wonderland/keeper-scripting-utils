import { Address } from './networks';
import { BigNumber, Contract, ethers, providers } from 'ethers';

const KP3RV1_KEEPER_WORK_EVENT_TOPIC = '0x3cda93551ad083704be19fabbd7c3eb94d88f6e72ff221bdea9017e52e4144e8';
const KP3RV2_KEEPER_WORK_EVENT_TOPIC = '0x46f2180879a7123a197cc3828c28955d70d661c70acbdc02450daf5f9a9c1cfa';

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
	provider: providers.BaseProvider
): Promise<BigNumber | void> => {
	const txReceipt = await provider.getTransactionReceipt(txHash);
	const gasPrice = txReceipt.effectiveGasPrice;
	const gasUsed = txReceipt.gasUsed;
	const txCostInEth = gasPrice.mul(gasUsed);
	const txCostInKp3r = await keep3rHelper.quote(txCostInEth);

	const tx = txReceipt.logs.find((log) => log.topics[0] === KP3RV1_KEEPER_WORK_EVENT_TOPIC);

	if (!tx) return console.log('Could not find a matching event. Are you certain this job is registered in Keep3rV1?');

	const paymentString = '0x' + tx.data.substring(66, 132);
	const parsedPayment = BigNumber.from(paymentString);

	const netProfit = parsedPayment.sub(txCostInKp3r);

	return netProfit;
};

/**
 * @notice Calculates the net profit in KP3R a keeper would get for working a job registered in Keep3rV2.
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
export const calculateKP3RNetProfitV2 = async (
	txHash: string,
	keep3rHelper: Contract,
	provider: providers.BaseProvider
): Promise<BigNumber | void> => {
	const txReceipt = await provider.getTransactionReceipt(txHash);
	const gasPrice = txReceipt.effectiveGasPrice;
	const gasUsed = txReceipt.gasUsed;
	const txCostInEth = gasPrice.mul(gasUsed);
	const txCostInKp3r = await keep3rHelper.quote(txCostInEth);

	const tx = txReceipt.logs.find((log) => log.topics[0] === KP3RV2_KEEPER_WORK_EVENT_TOPIC);

	if (!tx) return console.log('Could not find a matching event. Are you certain this job is registered in Keep3rV2?');

	const paymentString = tx.data.substring(0, 66);
	const parsedPayment = BigNumber.from(paymentString);

	const netProfit = parsedPayment.sub(txCostInKp3r);

	return netProfit;
};
