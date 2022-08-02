import { BigNumber } from 'ethers';
import { Observable, share, Subject } from 'rxjs';

export function emitWhenCloseToCooldown(
	lastWorkAt: BigNumber,
	workCooldown: BigNumber,
	emitSecondsBefore: number
): Observable<void> {
	const cooldown$ = new Subject<void>();
	const readyTime = lastWorkAt.add(workCooldown);
	const notificationTime = readyTime.sub(emitSecondsBefore);
	const interval = notificationTime.mul(1000).sub(Date.now()).toNumber(); // notificationTime: seconds => milliseconds
	const intervalId = setInterval(() => {
		cooldown$.next();
		clearInterval(intervalId);
	}, interval);

	return cooldown$.pipe(share());
}
