import { TransactionRequest } from '@ethersproject/abstract-provider';
import { BigNumber } from 'ethers';

export interface BasicConfig {
	localRpc: string;
	chainId: number;
}

export interface Config extends BasicConfig {
	txRpc: string;
	flashbotRelays: string[];
	simulateBundle: boolean;
}

export interface GenericJSONValidator<T> {
	validate: (fileToValidate: Record<string, any>) => T;
}

export interface BundleBurstGroup {
	targetBlock: number;
	txs: TransactionRequest[];
}

export interface GasType2Parameters {
	priorityFee: BigNumber;
	maxFeePerGas: BigNumber;
}

export interface PrepareFirstBundlesForFlashbotsReturnValue {
	tx: TransactionRequest;
	formattedBundles: BundleBurstGroup[];
}
