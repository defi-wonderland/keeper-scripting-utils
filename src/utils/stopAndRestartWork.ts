import { BlockListener } from '../subscriptions/blocks';
import { Contract } from 'ethers';
import { Subscription } from 'rxjs';

/**
 *
 * @notice Stops and restarts the iterable work process of a strategy.
 *
 * @dev Removes all listeners and subscriptions and calls the tryToWorkFunction to start trying to work the strategies once again
 *
 * @param strategy - Address of the strategy trying to work.
 * @param blockListener - Instances of the block listener class.
 * @param sub - Subscription to the block listener.
 * @param tryToWorkFunction - Function to start the work process again to achieve recursivity.
 *
 */
export function stopAndRestartWork(
	strategy: string,
	blockListener: BlockListener,
	sub: Subscription,
	tryToWorkFunction: (strategy: string) => void
): void {
	// Stops listening blocks from observable.
	sub.unsubscribe();

	// Notify the blockListener that this subscription will stop listening blocks. Class will decrease the
	// subscriptions counter to check if it should stop fetching blocks from network provider. For more details
	// check Block Listener Class documentation on blocks.ts
	blockListener.stop(strategy);

	// Calls function to start the work process again to achieve recursivity.
	tryToWorkFunction(strategy);
}

/**
 *
 * @notice Stops and restarts the iterable work process of a upkeep job script.
 *
 * @dev Removes all listeners and subscriptions and calls the restartWork to start trying to work the job once again
 *
 * @param jobContracts -  Array of all the workable jobs already instantiated.
 * @param blockListener - Instances of the block listener class.
 * @param sub - Subscription to the block listener.
 * @param restartWork - Function to start the work process again to achieve recursivity.
 *
 */
export function stopAndRestartWorkUpkeep(
	jobContracts: Contract[],
	blockListener: BlockListener,
	sub: Subscription,
	restartWork: (jobContracts: Contract[]) => void
): void {
	// Stops listening blocks from observable.
	sub.unsubscribe();

	// Notify the blockListener that this subscription will stop listening blocks. Class will decrease the
	// subscriptions counter to check if it should stop fetching blocks from network provider. For more details
	// check Block Listener Class documentation on blocks.ts
	blockListener.stop();

	// Calls function to start the work process again to achieve recursivity.
	restartWork(jobContracts);
}
