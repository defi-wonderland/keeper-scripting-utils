import { Flashbots } from '../flashbots/flashbots';
import { TransactionRequest, TransactionResponse, Block } from '@ethersproject/abstract-provider';
import { BundleBurstGroup } from '@types';
import { Contract, providers, Wallet, Overrides } from 'ethers';

type BundleCreationType = 'createBundlesWithSameTxs' | 'createBundlesWithDifferentTxs';

export interface DynamicPriorityFeeReturnValue {
	newPriorityFeeInWei: number;
	cancelBatchAndRestart: boolean;
}

export interface SendAndRetryUntilNotWorkableProps {
	txs: TransactionRequest[];
	provider: providers.BaseProvider;
	priorityFeeInWei: number;
	bundles: BundleBurstGroup[];
	newBurstSize: number;
	flashbots: Flashbots;
	signer: Wallet;
	isWorkableCheck: () => Promise<boolean>;
	regenerateTxs?: (burstSize: number, lastBlockNumberUsed: number) => Promise<TransactionRequest[]>;
	bundleRegenerationMethod?: BundleCreationType;
	recalculatePriorityFeeInWei?: (
		updatedBundles: BundleBurstGroup[],
		notIncludedBlockOfPreviousBundle: Block,
		firstBlockOfNextBatch: number
	) => Promise<DynamicPriorityFeeReturnValue>;
	staticDebugId?: string;
	dynamicDebugId?: string;
}

export interface PrepareFlashbotBundleForRetryProps {
	txs: TransactionRequest[];
	provider: providers.BaseProvider;
	notIncludedBlock: number;
	priorityFeeInWei: number;
	previousBurstSize: number;
	newBurstSize: number;
	signer: Wallet;
	regenerateTxs?: (burstSize: number, lastBlockNumberUsed: number) => Promise<TransactionRequest[]>;
	bundleRegenerationMethod?: BundleCreationType;
	recalculatePriorityFeeInWei?: (
		updatedBundles: BundleBurstGroup[],
		notIncludedBlockOfPreviousBundle: Block,
		firstBlockOfNextBatch: number
	) => Promise<DynamicPriorityFeeReturnValue>;
	id?: string;
}

export interface CreateBundlesWithSameTxProps {
	unsignedTx: TransactionRequest;
	burstSize: number;
	firstBlockOfBatch: number;
	id?: string;
}

export interface CreateBundlesProps {
	unsignedTxs: TransactionRequest[];
	burstSize: number;
	firstBlockOfBatch: number;
	id?: string;
}

export interface PopulateTransactionsProps {
	contract: Contract;
	functionName: string;
	functionArgs: any[][];
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
	priorityFeeInWei: number;
	blocksAhead: number;
}
