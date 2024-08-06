import axios from 'axios';
import { SendPrivateTransactionProps } from 'types';

export async function sendPrivateTransaction(props: SendPrivateTransactionProps): Promise<void> {
	const { endpoint, privateTx, maxBlockNumber } = props;

	const requestData = {
		jsonrpc: '2.0',
		method: 'eth_sendPrivateTransaction',
		params: [
			{
				privateTx,
				maxBlockNumber,
			},
		],
		id: '1',
	};

	try {
		const response = await axios.post(endpoint, requestData, {
			headers: {
				'Content-Type': 'application/json',
			},
		});

		console.log(response.data);
	} catch (error) {
		if (axios.isAxiosError(error)) {
			console.error('Axios error message:', error.message);
			if (error.response) {
				console.log('Response data:', error.response.data);
			}
		} else {
			console.error('Unexpected error:', error);
		}
	}
}
