import { TransactionResponse, Block } from '@ethersproject/abstract-provider';
import { FlashbotsBundleProvider, FlashbotsBundleTransaction } from '@flashbots/ethers-provider-bundle';
import { Contract, Overrides } from 'ethers';

/**
 * @notice PopulateTxProps includes all properties required by the populateTx function.
 *
 * @param contract     An instance of the contract we wish to call.
 * @param functionName The name of the function we wish to call.
 * @param functionArgs The arguments for the transaction we want to populate.
 * @param options      Optional parameter. It includes all optional properties to add to a transaction. See ethers Overrides type.
 * @param chainId      The chainId of the network to which we will be sending our bundles.
 */
export interface PopulateTxProps {
	contract: Contract;
	functionName: string;
	functionArgs: any[];
	options?: Overrides;
	chainId: number;
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
 * @notice GetMainnetGasType2ParametersProps includes all base properties required to compute the maxFeePerGas property
 * 		   in order to format a transaction to type 2.
 *
 * @param block            The current block.
 * @param priorityFeeInWei The priority fee that will be used for the transaction being formatted.
 * @param burstSize        The number blocks to send the transaction to. Can also be interpreted as the number of blocks into the future to use when calculating the maximum base fee.
 */
export interface GetMainnetGasType2ParametersProps {
	block: Block;
	priorityFeeInWei: number;
	burstSize: number;
}

/**
 * @notice sendAndHandleResponseProps includes all parameters required to call sendAndHandleResponse function
 *
 * @param flashbotsProvider A flashbots provider.
 * @param privateTx         The private flashbots transaction to send.
 * @param maxBlockNumber    The maximum block number at which flashbots will try to include the transaction. After this block, or after 25 blocks, it will stop retrying to include it.
 */
export interface SendAndHandleResponseProps {
	flashbotsProvider: FlashbotsBundleProvider;
	privateTx: FlashbotsBundleTransaction;
	maxBlockNumber?: number;
}

/**
 * @notice GetGasParametersNextBlockProps includes all base properties required to compute the maxFeePerGas property
 * 		   in order to format a transaction to type 2.
 *
 * @param block            The current block.
 * @param priorityFeeInWei The priority fee that will be used for the transaction being formatted.
 */
export interface GetGasParametersNextBlockProps {
	block: Block;
	priorityFeeInWei: number;
}
