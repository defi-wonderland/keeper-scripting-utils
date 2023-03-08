import type { Block } from '@ethersproject/abstract-provider';
import { Contract } from 'ethers';

/**
 * @notice The required arguments for the broadcastors.
 *
 * @param jobContract   The contract of the job we are going to work
 * @param workMethod    The function signature of the method we are going to work.
 * @param workArguments The arguments we need to pass to workMethod
 * @param block         Current block
 *
 */
export interface BroadcastorProps {
	jobContract: Contract;
	workMethod: string;
	workArguments: any[];
	block: Block;
}
