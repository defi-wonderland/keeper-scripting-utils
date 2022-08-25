import { emitWhenCloseToCooldown } from './cooldown';
import { Block } from '@ethersproject/abstract-provider';
import { BigNumber, providers } from 'ethers';
import { from, fromEvent, merge, mergeMap, Observable, Subject, Subscription } from 'rxjs';
import { debounceTime, filter, share, shareReplay } from 'rxjs/operators';

export class BlockListener {
	private count = 0;
	private block$ = new Subject<Block>();
	private subs: Subscription[] = [];
	constructor(private provider: providers.BaseProvider) {}

	stream(): Observable<Block> {
		if (this.count++ === 0) {
			console.log('%c ------ START BLOCK LISTENING -----', 'background: #56b576; color: white');
			const onBlockNumber$ = fromEvent(this.provider, 'block') as Observable<number>;
			const sub = onBlockNumber$
				.pipe(
					debounceTime(250),
					mergeMap((blockNumber) => this.provider.getBlock(blockNumber))
				)
				.subscribe((block) => {
					this.block$.next(block);
				});
			this.subs.push(sub);
		}
		console.log({ count: this.count });

		return merge(from(this.provider.getBlock('latest')), this.block$).pipe(shareReplay(1));
	}

	stop(): void {
		if (--this.count === 0) {
			console.log('%c ------ STOP BLOCK LISTENING -----', 'background: #56b576; color: white');
			this.subs.forEach((sub) => sub.unsubscribe());
			this.provider.removeAllListeners('block');
		}
		console.log({ count: this.count });
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

export function emitWhenCloseToWorkable(
	provider: providers.BaseProvider,
	lastWorkAt: BigNumber,
	workCooldown: BigNumber,
	emitSecondsBefore: number
): Observable<Block> {
	const block$ = getNewBlocks(provider);
	return emitWhenCloseToCooldown(lastWorkAt, workCooldown, emitSecondsBefore).pipe(mergeMap(() => block$));
}

export function stopBlocks(provider: providers.BaseProvider): void {
	console.log('------ STOP LISTENING -----');

	provider.removeAllListeners('block');
}
