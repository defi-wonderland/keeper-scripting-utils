import { Block } from '@ethersproject/abstract-provider';
import chalk from 'chalk';
import { providers } from 'ethers';
import { from, fromEvent, merge, mergeMap, Observable, Subject, Subscription } from 'rxjs';
import { shareReplay } from 'rxjs/operators';

/**
 * Class in charge of managing the fetching of blocks.
 *
 */
export class BlockListener {
	// Amount of live subscriptions to block$ observable.
	private count = 0;

	// Observable in charge of emiting and providing new Blocks.
	private block$ = new Subject<Block>();

	// Array of generated interal subscriptions. Used mainly to be able to unsubscribe from them when needed.
	private subs: Subscription[] = [];

	/**
	 * @param provider - JsonRpc provider that has the methods needed to fetch and listen for new blocks.
	 */
	constructor(private provider: providers.BaseProvider) {}

	/**
	 * This function is able to provide a listener for new incoming blocks with all their data.
	 * Returns and observable that emits an event every time a new block arrives.
	 *
	 * @dev
	 * Block listener is initialized only if the subscriptions account is zero. Otherwise it will skip the initialization
	 * and just return the block$ observable where the new blocks are being pushed.
	 * For the fetching part we need to combine two different functions to fetch and deliver new blocks:
	 *  - One that fetches the current block just once when this function is called and push it to block$ observable.
	 *  - One that hooks to the 'block' event of the provider that returns just the number of the new block, and then use
	 * 		provider.getBlock(blockNumber) method to fetch all the data of that block and push it to block$ observable.
	 *
	 * @param debugId - Optional id to help with debugging.
	 * @returns An observable that emits blocks
	 */
	stream(debugId?: string): Observable<Block> {
		if (this.count++ === 0) {
			this.provider.getBlock('latest').then((block) => {
				console.info(`${chalk.bgGray('\nblock arrived:', block.number)}\n`);
				this.block$.next(block);
			});
			console.info(chalk.redBright('\n------ START BLOCK LISTENING -----'));
			const onBlockNumber$ = fromEvent(this.provider, 'block') as Observable<number>;
			const sub = onBlockNumber$.pipe(mergeMap((blockNumber) => this.provider.getBlock(blockNumber))).subscribe((block) => {
				console.info(`${chalk.bgGray('\nblock arrived:', block.number)}\n`);
				this.block$.next(block);
			});
			this.subs.push(sub);
		}
		if (debugId)
			console.debug(
				`\nOpen BlockListener subscriptions count: ${chalk.redBright(this.count)} corresponded to ${chalk.green(debugId)}`
			);
		else console.debug('\nOpen BlockListener subscriptions count:', chalk.redBright(this.count));
		return this.block$;
	}

	/**
	 * Stops block fetching and remove all the interal subscriptions to blockNumber observable.
	 *
	 * @dev
	 * This will only stop block fetching and subscription to blockNumber IF the amount of subscriptions to block$ observable
	 * is zero. If amount is zero this means that theres no part of the code actually listening to the block$ observable
	 * so theres no need for us to keep listening for new blocks incoming.
	 *
	 * @param debugId - Optional id to help with debugging.
	 */
	stop(debugId?: string): void {
		if (--this.count === 0) {
			console.info(chalk.redBright('\n------ STOP BLOCK LISTENING -----'));
			this.subs.forEach((sub) => sub.unsubscribe());
			this.provider.removeAllListeners('block');
		}
		if (debugId)
			console.debug(
				`\nOpen BlockListener subscriptions count: ${chalk.redBright(this.count)} corresponded to ${chalk.green(debugId)}`
			);
		else console.debug('\nOpen BlockListener subscriptions count:', chalk.redBright(this.count));
	}
}

/**
 * This function is able to provide a listener for current and new incoming blocks with all their data.
 *
 * @dev
 * It combines two different methods to fetch new blocks:
 * - One that fetches the current block just once when this function is called.
 * - One that starts listening for new blocks until stopped. When started this method will wait til next new block
 * 	 to start emiting.
 * Important to notice that this method will emit the current block when being called and also start listening for
 * new incoming blocks.
 *
 * @param provider - JsonRpc provider that has the methods needed to fetch and listen for new blocks.
 */
export function getNewBlocks(provider: providers.BaseProvider): Observable<Block> {
	console.log('start get new blocks');
	return merge(from(provider.getBlock('latest')), blockListener(provider)).pipe(shareReplay(1));
}

/**
 * This function is able to provide a listener for new incoming blocks with all their data.
 *
 * @dev
 * It hooks to the 'block' event of the provider that returns just the number of the new block, to then use
 * provider.getBlock(blockNumber) method to fetch all the data of the block.
 * Important to notice that this method does not emit the current block when its called. First emition will be
 * the next new block received after being called.
 *
 * @param provider - JsonRpc provider that has the methods needed to fetch and listen for new blocks.
 */
function blockListener(provider: providers.BaseProvider): Observable<Block> {
	const onBlock$ = fromEvent(provider, 'block') as Observable<number>;
	return onBlock$.pipe(mergeMap((block) => provider.getBlock(block)));
}

/**
 * Removes block listener on the provider.
 *
 * @param provider - JsonRpc provider to that has the methods needed to fetch and listen for new blocks.
 */
export function stopBlocks(provider: providers.BaseProvider): void {
	console.log('------ STOP LISTENING -----');

	provider.removeAllListeners('block');
}
