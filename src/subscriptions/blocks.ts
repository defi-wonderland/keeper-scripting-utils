import { Block } from '@ethersproject/abstract-provider';
import { providers } from 'ethers';
import { Observable, share, Subject } from 'rxjs';

export function getNewBlocks(provider: providers.BaseProvider): Observable<Block> {
	const blockSubject$ = new Subject<Block>();
	provider.on('block', async (blockNumber) => {
		const block = await provider.getBlock(blockNumber);
		blockSubject$.next(block);
	});

	return blockSubject$.pipe(share());
}
