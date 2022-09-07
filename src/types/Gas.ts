import { BigNumber } from 'ethers';

export interface GasType2Parameters {
	priorityFeeInGwei: BigNumber;
	maxFeePerGas: BigNumber;
}

// TODO: remove this from library when separating scripts. Only used in polygon script
export interface GasFees {
	gasPrice?: number;
	maxFeePerGas: number;
	maxPriorityFeePerGas: number;
}
