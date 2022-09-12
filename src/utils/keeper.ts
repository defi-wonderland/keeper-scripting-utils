import { BigNumber, Contract, ethers, providers } from 'ethers';

const KP3RV1_KEEPER_WORK_EVENT_TOPIC = '0x3cda93551ad083704be19fabbd7c3eb94d88f6e72ff221bdea9017e52e4144e8';
const KP3RV2_KEEPER_WORK_EVENT_TOPIC = '0x46f2180879a7123a197cc3828c28955d70d661c70acbdc02450daf5f9a9c1cfa';

/**
 * @notice Calculates the keeper reward on mainnet based on the gas used.
 *
 * @dev This function uses the baseFee of the block when this function is called to calculate the keeper's rewards boost.
 *      This means this function is not extremely precise for projections in future blocks. It's also important to bear in
 *      mind that the Keep3rHelper contract can be redeployed. It's up to the dev to provide the correct instance. The
 *      correct instance can be fetched from the Keep3rV2 contract.
 *
 * @param keeperAddress Address of the keeper to calculate the rewards for.
 * @param gasUsed	    Amount of gas used in the work transaction.
 * @param keep3rHelper  Instance of the keep3rHelper contract.
 * @param provider	    The provider to use to make a call to the keep3rHelper contract.
 *
 * @return The amount of KP3R rewarded to the keeper expressed as a BigNumber.
 */
export const calculateKeeperRewardMainnet = async (
	keeperAddress: string,
	gasUsed: BigNumber,
	keep3rHelper: Contract,
	provider: providers.BaseProvider
): Promise<BigNumber> => {
	return await keep3rHelper.getRewardAmountFor(keeperAddress, gasUsed, provider);
};

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

/**
 * @notice Calculates the keeper reward on mainnet based on the gas used.
 *
 * @dev This function uses the baseFee of the block when this function is called to calculate the keeper's rewards boost.
 *      This means this function is not extremely precise for projections in future blocks. This function  returns the same value than
 *      calculateKeeperRewardMainnet but it's less performant.
 *      The difference is that this function instantiates Keep3rV2 and Keep3rHelper
 *      contracts, calculateKeeperRewardMainnet takes in an instance of Keep3rHelper as a parameter.
 *      A potential reason to use this function over calculateKeeperRewardMainnet is the Keep3rHelper contract can get redeployed to
 *      a different address. This means that if the dev is not aware that Keep3rV2 is pointing to a new Keep3rHelper, then his
 *      keep3rHelper instance may be outdated and calculateKeeperRewardMainnet may return an imprecise amount.
 *
 * @param keeperAddress Address of the keeper to calculate the rewards for.
 * @param gasUsed	    Amount of gas used in the work transaction.
 * @param provider	    The provider to use to make a call to the keep3rHelper contract.
 *
 * @return The amount of KP3R rewarded to the keeper expressed as a BigNumber.
 */
export const calculateKeeperRewardMainnetSlow = async (
	keeperAddress: string,
	gasUsed: BigNumber,
	provider: providers.BaseProvider
): Promise<BigNumber> => {
	const keep3rV2LikeABI = ['function keep3rHelper() view returns (address _kp3rHelper)'];
	const keep3rV2Address = '0xeb02addCfD8B773A5FFA6B9d1FE99c566f8c44CC';
	const keep3rV2 = new ethers.Contract(keep3rV2Address, keep3rV2LikeABI, provider);

	const keep3rHelperAddress = await keep3rV2.keep3rHelper();

	const keep3rHelperLikeABI = ['function getRewardAmountFor(address _keeper, uint256 _gasUsed) view returns (uint256 _kp3r)'];
	const keep3rHelper = new ethers.Contract(keep3rHelperAddress, keep3rHelperLikeABI, provider);
	return await keep3rHelper.getRewardAmountFor(keeperAddress, gasUsed);
};
