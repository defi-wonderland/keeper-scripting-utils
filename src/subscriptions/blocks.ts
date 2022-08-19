import { emitWhenCloseToCooldown } from './cooldown';
import { Block } from '@ethersproject/abstract-provider';
import { BigNumber, providers } from 'ethers';
import { from, fromEvent, merge, mergeMap, Observable } from 'rxjs';
import { filter, shareReplay } from 'rxjs/operators';

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
	provider.removeAllListeners('block');
}
