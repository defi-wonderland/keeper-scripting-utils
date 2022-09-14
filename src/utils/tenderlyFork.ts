import axios, { AxiosResponse } from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

export const createTenderlyFork = async (blockNumber: number): Promise<void | AxiosResponse> => {
	const { TENDERLY_USER, TENDERLY_PROJECT, TENDERLY_ACCESS_KEY } = process.env;

	if (!TENDERLY_ACCESS_KEY || !TENDERLY_PROJECT || !TENDERLY_ACCESS_KEY) {
		throw new Error(
			'Please make sure you have set your TENDERLY_ACCESS_KEY, TENDERLY_PROJECT and TENDERLY_ACCESS_KEY env variables in an .env'
		);
	}

	const TENDERLY_FORK_API = `https://api.tenderly.co/api/v1/account/${TENDERLY_USER}/project/${TENDERLY_PROJECT}/fork`;

	const opts = {
		headers: {
			'X-Access-Key': TENDERLY_ACCESS_KEY as string,
		},
	};

	const body = {
		network_id: '1',
		block_number: blockNumber,
	};

	try {
		const response = await axios.post(TENDERLY_FORK_API, body, opts);
		console.log(`Forked with fork ID ${response.data.simulation_fork.id}`);
		return response;
	} catch (error) {
		console.error(error);
		return;
	}
};

export const deleteTenderlyFork = async (forkId: string): Promise<void> => {
	const { TENDERLY_USER, TENDERLY_PROJECT, TENDERLY_ACCESS_KEY } = process.env;

	if (!TENDERLY_ACCESS_KEY || !TENDERLY_PROJECT || !TENDERLY_ACCESS_KEY) {
		throw new Error(
			'Please make sure you have set your TENDERLY_ACCESS_KEY, TENDERLY_PROJECT and TENDERLY_ACCESS_KEY env variables in an .env'
		);
	}

	const TENDERLY_FORK_ACCESS_URL = `https://api.tenderly.co/api/v1/account/${TENDERLY_USER}/project/${TENDERLY_PROJECT}/fork/${forkId}`;
	const opts = {
		headers: {
			'X-Access-Key': TENDERLY_ACCESS_KEY as string,
		},
	};
	await axios.delete(TENDERLY_FORK_ACCESS_URL, opts);
};
