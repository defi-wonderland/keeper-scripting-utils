import { Flashbots } from '../flashbots/flashbots';
import { TransactionRequest, TransactionResponse, Block } from '@ethersproject/abstract-provider';
import { BundleBurstGroup } from '@types';
import { Contract, providers, Wallet, Overrides } from 'ethers';

export interface PrepareFirstBundlesForFlashbotsProps {
	contract: Contract;
	functionName: string;
	block: Block;
	futureBlocks: number;
	burstSize: number;
	functionArgs: any[];
	options?: Overrides;
}

export interface PrepareFirstBundlesForFlashbotsReturnValue {
	txs: TransactionRequest[];
	bundles: BundleBurstGroup[];
}

export interface SendAndRetryUntilNotWorkableProps {
	txs: TransactionRequest[];
	provider: providers.BaseProvider;
	priorityFee: number;
	bundles: BundleBurstGroup[];
	newBurstSize: number;
	flashbots: Flashbots;
	sendThroughStealthRelayer: boolean;
	isWorkableCheck: () => Promise<boolean>;
	signer: Wallet;
}

export interface PrepareFlashbotBundleForRetryProps {
	txs: TransactionRequest[];
	provider: providers.BaseProvider;
	notIncludedBlock: number;
	priorityFee: number;
	previousBurstSize: number;
	newBurstSize: number;
	signer: Wallet;
	sendThroughStealthRelayer: boolean;
	id?: string;
}

export interface CreateBundlesProps {
	unsignedTxs: TransactionRequest[];
	burstSize: number;
	targetBlock: number;
	id?: string;
}

export interface PopulateTransactionsProps {
	contract: Contract;
	functionName: string;
	functionArgs: any[][];
	burstSize: number;
	chainId: number;
	options?: Overrides;
}

export interface SendTxProps {
	contractCall: () => Promise<TransactionResponse>;
	explorerUrl?: string;
}

export type GetMainnetGasType2ParametersProps = FormatTxsBase;

export interface FormatBundlesTxsToType2Props extends FormatTxsBase {
	bundlesTxs: BundleBurstGroup[];
}

export interface FormatTxsBase {
	block: Block;
	priorityFee: number;
	blocksAhead: number;
}
