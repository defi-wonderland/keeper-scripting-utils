import { Flashbots } from '../flashbots/flashbots';
import { TransactionRequest, TransactionResponse, Block } from '@ethersproject/abstract-provider';
import { BundleBurstGroup } from '@types';
import { Contract, providers, Wallet, Overrides } from 'ethers';

/**
 * @notice Union type used to enforce the user to specify what bundle creation function to use when regenerating a bundle.
 */
type BundleCreationType = 'createBundlesWithSameTxs' | 'createBundlesWithDifferentTxs';

/**
 * @notice RecalculatePriorityFeeInWeiReturnValue specifies the structure of the object the recalculatePriorityFeeInWei callback function should return.
 *
 * @param newPriorityFeeInWei   The new priority fee to use for the transactions within the new bundles. Should be expressed in Wei.
 * @param cancelBatchAndRestart A boolean indicating whether or not the new batch of bundles should be discarded and exection restarted.
 */
export interface RecalculatePriorityFeeInWeiReturnValue {
	newPriorityFeeInWei: number;
	cancelBatchAndRestart: boolean;
}

/**
 * @notice SendAndRetryUntilNotWorkableProps specifies the properties to provide to the sendAndRetryUntilNotWorkable function.
 *
 * @param txs                         The transactions to be retried if nothing is provided in the regenerateTxs parameter.
 * @param provider                    Network provider. It will be used to fetch the first block in which each of our bundle batches were not included.
 * @param priorityFee                 The priority fee to be paid to the miner.
 * @param bundles                     The batches of bundles to send to flashbots.
 * @param newBurstSize                Amount of consecutive blocks we want to send the transactions to try to work the job.
 * @param flashbots                   An instance of Flashbots.
 * @param signer                      A signer.
 * @param isWorkableCheck             A callback to the function that checks the workability of the job we are trying to work.
 * @param regenerateTxs               An optional callback function that generates the new set of transactions to be included
 *								      in the next retry bundles. If not provided, the new bundles will use the previous set of txs provided
 *								      on the txs parameter.
 * @param bundleRegenerationMethod    An optional parameter instructing what bundle creation method we should use to create the new bundles.
 * 								      Defaults to createBundlesWithSameTxs.
 * @param recalculatePriorityFeeInWei An optional callback function instructing what priority fee should the new batch of bundles use, along with whether it
 * 									  should use that priority fee or discard the new batch and restart execution.
 *									  If not provided bundles will use the value provided in the priorityFeeInWei parameter.
 * @param staticDebugId               Optional static id to help with debugging. Every bundle will share this id.
 * @param dynamicDebugId              Optional dynamic id to help with debugging. Every bundle will have a different dynamic id. This dynamic id will
 * 						              be recalculated every time a bundle is created.
 *
 */
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
	) => Promise<RecalculatePriorityFeeInWeiReturnValue>;
	staticDebugId?: string;
	dynamicDebugId?: string;
}

/**
 * @notice PrepareFlashbotBundleForRetryProps specifies the properties to provide to the prepareFlashbotBundleForRetry function.
 *
 * @param txs                      	  An array of our previously sent transactions.
 * @param provider                 	  Network provider. It will be used to fetch specific blocks and get the latest nonce.
 * @param signer                   	  A signer. It will be used to sign the new transactions.
 * @param priorityFeeInWei         	  The priority fee in wei we would like to use in our next batch of bundles.
 * @param notIncludedBlock         	  The target block of our first non-included bundle.
 * @param previousBurstSize        	  The burst size we used the first time we send our bundles.
 * @param newBurstSize             	  The new burst size we would like to use when retrying to work the job.
 * @param regenerateTxs            	  An optional callback function that generates the new set of transactions to be included
 *								   	  in the next retry bundles. If not provided, the new bundles will use the previous set of txs provided
 *								   	  on the txs parameter.
 * @param bundleRegenerationMethod 	  An optional parameter instructing what bundle creation method we should use to create the new bundles.
 * 								   	  Defaults to createBundlesWithSameTxs.
 * @param recalculatePriorityFeeInWei An optional callback function instructing what priority fee should the new batch of bundles use, along with whether it
 * 									  should use that priority fee or discard the new batch and restart execution.
 * 									  If not provided bundles will use the value provided in the priorityFeeInWei parameter to sendAndRetryUntilNotWorkable.
 *
 */
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
	) => Promise<RecalculatePriorityFeeInWeiReturnValue>;
}

/**
 * @notice CreateBundlesProps specifies the properties to be provided to the createBundles functions.
 *
 * @param unsignedTxs       An array of unsigned transactions.
 * @param burstSize			The amount of bundles to create and send to consecutive blocks.
 * @param firstBlockOfBatch The first block to target for the first bundle. For example, say we are in block 100
 * 							and we want to send our bundles to block 105. In that case, block 105 will be the
 * 							firstBlockOfBatch.
 */
export interface CreateBundlesProps {
	unsignedTxs: TransactionRequest[];
	burstSize: number;
	firstBlockOfBatch: number;
}

/**
 * @notice PopulateTransactionsProps includes all properties required by the populateTransactions function.
 *
 * @param contract     An instance of the contract we wish to call.
 * @param functionName The name of the function we wish to call.
 * @param functionArgs The arguments for the different transactions we want to populate. The function arguments must be provided
 *                     as an array of arrays, each array containing the arguments for a different transaction in case transactions
 *                     with different data are needed. If this were the case, ensure functionArgs' length is the same as burstSize.
 * 					   For example: if we were to send [[arg1, arg2], [arg3, arg4]] as functionArgs, the resulting transactions would be:
 * 					                [tx1[arg1, arg2], tx2[arg3, arg4]]
 * @param chainId      The chainId of the network to which we will be sending our bundles.
 * @param options      Optional parameter. It includes all optional properties to add to a transaction. See ethers Overrides type.
 */
export interface PopulateTransactionsProps {
	contract: Contract;
	functionName: string;
	functionArgs: any[][];
	chainId: number;
	options?: Overrides;
}

/**
 * @notice SendTxProps includes all properties required to send a transaction to the public mempool using the sendTx function.
 *
 * @param contractCall A callback function of the function to call on-chain.
 * @param explorerUrl  The url of the explorer of the chain where the transaction will be sent.
 */
export interface SendTxProps {
	contractCall: () => Promise<TransactionResponse>;
	explorerUrl?: string;
}

/**
 * @notice Identical to FormatTxsBase. Only the name differs to improve code readability. Used in GetMainnetGasType2Parameters function.
 */
export type GetMainnetGasType2ParametersProps = FormatTxsBase;

/**
 * @notice FormatBundlesTxsToType2Props includes all properties required to format a bundle to type when calling the formatBundlesTxsToType2 function.
 *
 * @param bundlesTxs The bundles containing the transactions being formatted to type 2.
 */
export interface FormatBundlesTxsToType2Props extends FormatTxsBase {
	bundlesTxs: BundleBurstGroup[];
}

/**
 * @notice FormatTxsBase includes all base properties required to compute the maxFeePerGas property
 * 		   in order to format a transaction to type 2.
 *
 * @param block            The current block.
 * @param priorityFeeInWei The priority fee that will be used for the transaction being formatted.
 * @param blocksAhead      The number of blocks into the future to use when calculating the maximum base fee.
 */
export interface FormatTxsBase {
	block: Block;
	priorityFeeInWei: number;
	blocksAhead: number;
}
