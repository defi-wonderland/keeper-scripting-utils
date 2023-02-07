import type { Contract } from 'ethers';

/**
 * @notice Helper function to check if is workable
 *
 * @param contract     An instance of the contract we wish to call.
 * @param methodArguments The arguments of the work function we wish to call.
 *
 * @return True if is workable.
 */
export async function checkIsWorkable(job: Contract, methodArguments: Array<number | string>): Promise<boolean> {
	try {
		await job.callStatic.work(...methodArguments);
		return true;
	} catch (error: unknown) {
		if (
			error instanceof Error &&
			!error.message.includes('NotWorkable()') &&
			!error.message.includes('V2Keep3rJob::work:not-workable')
		) {
			console.log(`Failed when attempting to call work statically. Message: ${error.message}. Returning.`);
		}

		return false;
	}
}
