import { GasFees } from '@types';
import axios from 'axios';

export type Wei = string;

export class GasService {
	private GAS_FEES_API = `https://api.blocknative.com/gasprices/blockprices`;
	private DEFAULT_CONFIDENCE_LEVEL = 95;
	private headers = {};

	public async getGasFees(chainId: number): Promise<GasFees> {
		this.headers = {
			Authorization: process.env.BLOCK_NATIVE_KEY,
		};

		const response = await axios.get(this.GAS_FEES_API, { params: { chainid: chainId }, headers: this.headers });
		const { price, maxFeePerGas, maxPriorityFeePerGas } = response.data.blockPrices
			.shift()
			.estimatedPrices.find(({ confidence }: { confidence: number }) => confidence === this.DEFAULT_CONFIDENCE_LEVEL);
		return {
			gasPrice: price,
			maxFeePerGas: maxFeePerGas,
			maxPriorityFeePerGas: maxPriorityFeePerGas,
		};
	}
}
