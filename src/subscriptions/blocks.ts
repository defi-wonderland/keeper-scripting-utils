import { emitWhenCloseToCooldown } from './cooldown';
import { Block } from '@ethersproject/abstract-provider';
import { BigNumber, providers } from 'ethers';
import { from, merge, mergeMap, Observable, share, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';

//TODO: Add detailed documentation
export function getNewBlocks(provider: providers.BaseProvider): Observable<Block> {
	console.log('start get new blocks');
	return merge(from(provider.getBlock('latest')), blockListener(provider));
}

function blockListener(provider: providers.BaseProvider): Observable<Block> {
	const blockSubject$ = new Subject<Block>();
	provider.on('block', async (blockNumber) => {
		console.log('second ', blockNumber);
		const block = await provider.getBlock(blockNumber);
		blockSubject$.next(block);
	});
	return blockSubject$.pipe(share());
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
