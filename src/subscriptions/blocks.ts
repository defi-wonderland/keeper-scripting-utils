import { UnsubscribeFunction } from '../types/Blocks';
import { Block } from '@ethersproject/abstract-provider';
import chalk from 'chalk';
import { providers } from 'ethers';
import { fromEvent, mergeMap, Observable, Subject, Subscription } from 'rxjs';

type CallbackFunction = (block: Block) => Promise<void>;

/**
 * Class in charge of managing the fetching of blocks and how they are provided acoss the app.
 *
 */
export class BlockListener {
	// Amount of live subscriptions to block$ observable.
	private count = 0;

	// Observable in charge of emitting and providing new Blocks.
	private block$ = new Subject<Block>();

	// Array of generated internal subscriptions. Used mainly to be able to unsubscribe from them when needed.
	private getBlockSubscription: Subscription | undefined;

	/**
	 * @param provider - JsonRpc provider that has the methods needed to fetch and listen for new blocks.
	 */
	constructor(private provider: providers.BaseProvider) {}

	/**
	 * This function is able to provide a listener for new incoming blocks with all their data.
	 *
	 * @dev
	 * Block listener is initialized only if the subscriptions account is zero. Otherwise it will skip the initialization
	 * and just return the block$ observable where the new blocks are being pushed.
	 * For the fetching part we need to combine two different functions to fetch and deliver new blocks:
	 *  - One that fetches the current block just once when this function is called and push it to block$ observable.
	 *  - One that hooks to the 'block' event of the provider that returns just the number of the new block, and then use
	 * 		provider.getBlock(blockNumber) method to fetch all the data of that block and push it to block$ observable.
	 *
	 * @returns A callback that will be called in every new block
	 */
	stream(cb: CallbackFunction): UnsubscribeFunction {
		// initialize block subscription if necessary, and increase subscribers count
		if (this.count++ === 0) {
			this.initBlockSubscription();
		}

		// log subscribers count
		this.logSubscribersCount();

		// create a new block subscription that will call the callback for every new block
		const observable = this.block$.subscribe((block) => cb(block));

		// return an unsubscription function
		return () => {
			observable.unsubscribe();

			this.count--;
			this.logSubscribersCount();

			// uninitialize state if there are no current subscribers
			if (this.count === 0) {
				console.info(chalk.redBright('\n------ STOP BLOCK LISTENING -----'));

				this.getBlockSubscription?.unsubscribe();
				this.provider.removeAllListeners('block');
			}
		};
	}

	private initBlockSubscription(): void {
		// push latest block to the subject asap
		this.provider.getBlock('latest').then((block) => {
			console.info(`${chalk.bgGray('\nblock arrived:', block.number)}\n`);
			this.block$.next(block);
		});

		// listen to new blocks from the provider
		console.info(chalk.redBright('\n------ START BLOCK LISTENING -----'));
		const onBlockNumber$ = fromEvent(this.provider, 'block') as Observable<number>;
		const onBlock$ = onBlockNumber$.pipe(mergeMap((blockNumber) => this.provider.getBlock(blockNumber)));

		// push them to the subject as they arrive
		this.getBlockSubscription = onBlock$.subscribe((block) => {
			console.info(`${chalk.bgGray('\nblock arrived:', block.number)}\n`);
			this.block$.next(block);
		});
	}

	private logSubscribersCount(): void {
		console.debug('\nOpen BlockListener subscriptions count:', chalk.redBright(this.count));
	}
}
