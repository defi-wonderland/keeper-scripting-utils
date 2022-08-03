import { Block } from '@ethersproject/abstract-provider';
import { providers } from 'ethers';
import { BehaviorSubject, Observable, share } from 'rxjs';
import { filter } from 'rxjs/operators';

//TODO: Document

/**
 * @dev Should only subscribe to this once, and reuse the observable throughout the code
 */
export async function getNewBlocks(provider: providers.BaseProvider): Promise<Observable<Block>> {
	console.log('1');
	const blockSubject$ = new BehaviorSubject<Block>(await provider.getBlock('latest'));
	console.log('2');
	provider.on('block', async (blockNumber) => {
		console.log('new Block number: ', blockNumber);
		const block = await provider.getBlock(blockNumber);
		blockSubject$.next(block);
	});

	return blockSubject$.pipe(share());
}

export async function emitWhenCloseToBlock(
	provider: providers.BaseProvider,
	targetBlock: number,
	blocksBefore: number
): Promise<Observable<Block>> {
	const block$ = getNewBlocks(provider);
	const targetBlockBefore = targetBlock - blocksBefore;
	return (await block$).pipe(filter((block) => block.number >= targetBlockBefore));
}

export function stopBlocks(provider: providers.BaseProvider): void {
	provider.removeAllListeners('block');
}
