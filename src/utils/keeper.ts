import { BigNumber, Contract, ethers, providers } from 'ethers';

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
	gasUsed: number | BigNumber,
	keep3rHelper: Contract,
	provider: providers.BaseProvider
): Promise<BigNumber> => {
	return await keep3rHelper.getRewardAmountFor(keeperAddress, gasUsed, provider);
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
	gasUsed: number | BigNumber,
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
