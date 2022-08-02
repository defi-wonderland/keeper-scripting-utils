import { startCooldown } from './cooldown';
import { Block } from '@ethersproject/abstract-provider';
import { BigNumber, providers } from 'ethers';
import { mergeMap, Observable, share, Subject } from 'rxjs';

export function getNewBlocks(provider: providers.BaseProvider): Observable<Block> {
	const blockSubject$ = new Subject<Block>();
	provider.on('block', async (blockNumber) => {
		console.log('new Block number: ', blockNumber);
		const block = await provider.getBlock(blockNumber);
		blockSubject$.next(block);
	});

	return blockSubject$.pipe(share());
}

export function emitWhenCloseToBlock(
	provider: providers.BaseProvider,
	readyToWorkAt: BigNumber,
	emitSecondsBefore: number
): Observable<Block> {
	const block$ = getNewBlocks(provider);
	return startCooldown(readyToWorkAt, emitSecondsBefore).pipe(mergeMap(() => block$));
}

export function stopBlocks(provider: providers.BaseProvider): void {
	provider.removeAllListeners('block');
}
