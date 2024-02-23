import axios from 'axios';
import { SendPrivateTransactionProps } from 'types';

export async function sendPrivateTransaction(props: SendPrivateTransactionProps) {
	const { endpoint, privateTx, maxBlockNumber } = props;
	const count = 0;

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

	if (count == 1) return;
	try {
		const response = await axios.post(endpoint, requestData, {
			headers: {
				'Content-Type': 'application/json',
			},
		});

		console.log(response.data);
		return;
	} catch (error) {
		if (axios.isAxiosError(error)) {
			console.error('Axios error message:', error.message);
			if (error.response) {
				console.log('Response data:', error.response.data);
			}
		} else {
			console.error('Unexpected error:', error);
		}
		return;
	}
}
