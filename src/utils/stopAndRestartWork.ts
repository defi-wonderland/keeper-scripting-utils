import { BlockListener } from '../subscriptions/blocks';
import { Contract } from 'ethers';
import { Subscription } from 'rxjs';

export function stopAndRestartWork(
	strategy: string,
	blockListener: BlockListener,
	sub: Subscription,
	tryToWorkFunction: (strategy: string) => void
): void {
	sub.unsubscribe();
	blockListener.stop(strategy);
	tryToWorkFunction(strategy);
}

export function stopAndRestartWorkUpkeep(
	jobContracts: Contract[],
	blockListener: BlockListener,
	sub: Subscription,
	tryToWorkFunction: (jobContracts: Contract[]) => void
): void {
	sub.unsubscribe();
	blockListener.stop();
	tryToWorkFunction(jobContracts);
}
