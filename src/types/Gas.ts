import { BigNumber } from 'ethers';

export interface GasType2Parameters {
	priorityFee: BigNumber;
	maxFeePerGas: BigNumber;
}

export interface GasFees {
	gasPrice?: number;
	maxFeePerGas: number;
	maxPriorityFeePerGas: number;
}
