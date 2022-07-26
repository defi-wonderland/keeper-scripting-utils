import { Observable, share, Subject } from 'rxjs';

export function startCooldown(readyToWorkAt: number, emitSecondsBefore: number): Observable<void> {
	const cooldown$ = new Subject<void>();
	const notificationTime = readyToWorkAt - emitSecondsBefore;
	const intervalId = setInterval(() => {
		cooldown$.next();
		clearInterval(intervalId);
	}, notificationTime * 1000 - Date.now()); // notificationTime: seconds => milliseconds

	return cooldown$.pipe(share());
}
