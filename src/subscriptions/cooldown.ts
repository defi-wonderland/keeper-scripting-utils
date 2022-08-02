import { BigNumber } from 'ethers';
import { Observable, share, Subject } from 'rxjs';

export function startCooldown(readyToWorkAt: BigNumber, emitSecondsBefore: number): Observable<void> {
	const cooldown$ = new Subject<void>();
	const notificationTime = readyToWorkAt.sub(emitSecondsBefore);
	const time = notificationTime.mul(1000).sub(Date.now()).toNumber(); // notificationTime: seconds => milliseconds
	const intervalId = setInterval(() => {
		cooldown$.next();
		clearInterval(intervalId);
	}, time);

	return cooldown$.pipe(share());
}
