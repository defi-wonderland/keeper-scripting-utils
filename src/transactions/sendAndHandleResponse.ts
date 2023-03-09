import { SendAndHandleResponseProps } from 'types';

export async function sendAndHandleResponse(props: SendAndHandleResponseProps) {
	const { flashbotsProvider, privateTx, maxBlockNumber } = props;

	try {
		const response = await flashbotsProvider.sendPrivateTransaction(privateTx, {
			maxBlockNumber,
		});

		if ('error' in response) {
			console.warn(`Transaction execution error`, response.error);
			return;
		}

		const simulation = await response.simulate();
		if ('error' in simulation || simulation.firstRevert) {
			console.error(`Transaction simulation error`, simulation);
			return;
		}

		console.debug(`Transaction simulation success`, simulation);

		const resolution = await response.wait();
		console.log(resolution);

		if (resolution === 0) {
			console.log(`=================== TX INCLUDED =======================`);
		} else if (resolution === 1) {
			console.log(`==================== TX DROPPED =======================`);
		}
	} catch (error: unknown) {
		if (error === 'Timed out') {
			console.debug(
				'One of the sent Transactions timed out. This means around 20 blocks have passed and Flashbots has ceased retrying it.'
			);
		}

		console.log(error);
	}
}
