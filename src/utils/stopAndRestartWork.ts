import { BlockListener } from '../subscriptions/blocks';
import { Subscription } from 'rxjs';

export function stopAndRestartWork(
	strategy: string,
	blockListener: BlockListener,
	sub: Subscription,
	tryToWorkFunction: (strategy: string) => void
): void {
	sub.unsubscribe();
	blockListener.stop();
	tryToWorkFunction(strategy);
}
