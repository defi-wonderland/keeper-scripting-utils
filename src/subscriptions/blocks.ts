import { Block } from '@ethersproject/abstract-provider';
import chalk from 'chalk';
import { BigNumber, providers } from 'ethers';
import { from, fromEvent, merge, mergeMap, Observable, Subject, Subscription } from 'rxjs';
import { filter, shareReplay } from 'rxjs/operators';

export class BlockListener {
	private count = 0;
	private block$ = new Subject<Block>();
	private subs: Subscription[] = [];
	constructor(private provider: providers.BaseProvider) {}

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

//TODO: Add detailed documentation
export function getNewBlocks(provider: providers.BaseProvider): Observable<Block> {
	console.log('start get new blocks');
	return merge(from(provider.getBlock('latest')), blockListener(provider)).pipe(shareReplay(1));
}

function blockListener(provider: providers.BaseProvider): Observable<Block> {
	const onBlock$ = fromEvent(provider, 'block') as Observable<number>;
	return onBlock$.pipe(mergeMap((block) => provider.getBlock(block)));
}

export function emitWhenCloseToBlock(
	provider: providers.BaseProvider,
	targetBlock: number,
	blocksBefore: number
): Observable<Block> {
	const block$ = getNewBlocks(provider);
	const targetBlockBefore = targetBlock - blocksBefore;
	return block$.pipe(filter((block) => block.number >= targetBlockBefore));
}

export function stopBlocks(provider: providers.BaseProvider): void {
	console.log('------ STOP LISTENING -----');

	provider.removeAllListeners('block');
}
