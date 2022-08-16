import { TransactionRequest } from '@ethersproject/abstract-provider';

export interface BundleBurstGroup {
	targetBlock: number;
	txs: TransactionRequest[];
	id?: string;
}
