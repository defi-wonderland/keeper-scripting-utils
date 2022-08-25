import { Flashbots } from '../flashbots/flashbots';
import { TransactionRequest, TransactionResponse, Block } from '@ethersproject/abstract-provider';
import { BundleBurstGroup } from '@types';
import { Contract, Signer, providers, Wallet, Overrides } from 'ethers';

export interface PrepareFirstBundlesForFlashbotsProps {
	contract: Contract;
	functionName: string;
	block: Block;
	priorityFee: number;
	futureBlocks: number;
	burstSize: number;
	functionArgs: any[];
	options?: Overrides;
}

export interface PrepareFirstBundlesForFlashbotsReturnValue {
	txs: TransactionRequest[];
	formattedBundles: BundleBurstGroup[];
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

export interface SendMainnetTxProps {
	contract: Contract;
	functionName: string;
	block: Block;
	priorityFee: number;
	gasLimit: number;
	chainId: number;
	functionArgs: any[];
}

export interface PopulateTransactionsProps {
	contract: Contract;
	functionName: string;
	functionArgs: any[][];
	burstSize: number;
	options?: Overrides;
}

export interface SendTxProps {
	contractCall: () => Promise<TransactionResponse>;
	explorerUrl?: string;
}

export type GetGasType2ParametersForBundleProps = FormatTxsBase;

export interface FormatTxsToType2NextBlockProps {
	unsignedTxs: TransactionRequest[];
	block: Block;
	priorityFee: number;
}

export interface FormatTxsToType2Props extends FormatTxsBase {
	unsignedTxs: TransactionRequest[];
}

export interface FormatBundlesTxsToType2Props extends FormatTxsBase {
	bundlesTxs: BundleBurstGroup[];
}

export interface FormatTxsBase {
	block: Block;
	priorityFee: number;
	blocksAhead: number;
}

export interface SendLegacyTransactionProps {
	chainId: number;
	workFunction: () => Promise<TransactionResponse>;
	explorerUrl?: string;
	options?: Overrides;
}
