import { calculateKP3RNetProfitV1, calculateKP3RNetProfitV2 } from '../../src/utils';
import { createTenderlyFork, deleteTenderlyFork } from '../../src/utils/tenderlyFork';
import { AxiosResponse } from 'axios';
import { Contract, ethers, providers, Signer } from 'ethers';

describe('Keeper', () => {
	let keep3rHelper: Contract;
	let provider: providers.JsonRpcProvider;
	let signer: Signer;
	let forkId: string;

	beforeEach(async () => {
		const blockNumberToFork = 15524971;
		const res: void | AxiosResponse = await createTenderlyFork(blockNumberToFork);
		if (res) {
			forkId = res.data.simulation_fork.id;
			const forkRPC = `https://rpc.tenderly.co/fork/${forkId}`;

			provider = new ethers.providers.JsonRpcProvider(forkRPC);
			signer = provider.getSigner();

			const keep3rHelperABILike = ['function quote(uint256 _eth) view returns (uint256 _amountOut)'];
			keep3rHelper = new Contract('0xedde080e28eb53532bd1804de51bd9cd5cadf0d4', keep3rHelperABILike, signer);
		}
	});

	afterEach(async () => {
		deleteTenderlyFork(forkId);
	});

	describe('calculateKP3RNetProfitV2', () => {
		it('should return the right reward', async () => {
			const txHash = '0x04648f93b4cef45c513d37aa40ee403105f3f82222085c92b16ff45371165288';
			const estimatedKP3RPrice = 105;
			const kp3rPayment = 0.05291836119319494;
			const estimatedProfitInUsd = estimatedKP3RPrice * kp3rPayment;
			const txCostInUsd = 6.78;
			const estimatedNetProfitInUsd = estimatedProfitInUsd - txCostInUsd;
			const reward = await calculateKP3RNetProfitV2(txHash, keep3rHelper, provider);
			if (reward) {
				const rewardInUSD = reward.mul(estimatedKP3RPrice).div(1e9).toNumber() / 1e9;
				expect(rewardInUSD).toBeCloseTo(estimatedNetProfitInUsd, 1);
			}
		});
	});

	describe('calculateKP3RNetProfitV1', () => {
		it('should return the right reward', async () => {
			const txHash = '0x02824f01c6932a81052d1ab6695962c4af0c50e319d87bd376dad690378a8abd';
			const estimatedKP3RPrice = 105;
			const estimatedProfitInUsd = 8.47;
			const txCostInUsd = 8.02;
			const estimatedNetProfitInUsd = estimatedProfitInUsd - txCostInUsd;
			const reward = await calculateKP3RNetProfitV1(txHash, keep3rHelper, provider);
			if (reward) {
				const rewardInUSD = reward.mul(estimatedKP3RPrice).div(1e9).toNumber() / 1e9;
				expect(rewardInUSD).toBeCloseTo(estimatedNetProfitInUsd, 1);
			}
		});
	});
});
