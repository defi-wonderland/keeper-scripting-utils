import { providers, Wallet } from 'ethers';

export const generateRandom = async (provider: providers.BaseProvider) => {
	const wallet = (await Wallet.createRandom()).connect(provider);
	return wallet;
};
