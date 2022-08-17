import { Flashbots } from '../flashbots/flashbots';
import { TransactionRequest, TransactionResponse, Block } from '@ethersproject/abstract-provider';
import { BundleBurstGroup } from '@types';
import { Contract, Signer, providers, Wallet } from 'ethers';

export interface PrepareFirstBundlesForFlashbotsProps {
	job: Contract;
	functionName: string;
	block: Block;
	priorityFee: number;
	gasLimit: number;
	chainId: number;
	nonce: number;
	futureBlocks: number;
	burstSize: number;
	functionArgs: any[];
}

export interface PrepareFirstBundlesForFlashbotsReturnValue {
	tx: TransactionRequest;
	formattedBundles: BundleBurstGroup[];
}

export interface SendAndRetryUntilNotWorkableProps {
	tx: TransactionRequest;
	provider: providers.BaseProvider;
	priorityFee: number;
	bundles: BundleBurstGroup[];
	newBurstSize: number;
	flashbots: Flashbots;
	isWorkableCheck: () => Promise<boolean>;
	signer: Wallet;
}

export interface PrepareFlashbotBundleForRetryProps {
	tx: TransactionRequest;
	provider: providers.BaseProvider;
	notIncludedBlock: number;
	priorityFee: number;
	previousBurstSize: number;
	newBurstSize: number;
	signer: Wallet;
	id?: string;
}

export interface CreateBundlesProps {
	unsignedTx: TransactionRequest;
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

export interface SendTxProps {
	contract: Contract;
	functionName: string;
	maxFeePerGas: number;
	maxPriorityFeePerGas: number;
	gasLimit: number;
	chainId: number;
	functionArgs: any[];
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
}
