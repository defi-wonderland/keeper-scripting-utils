import axios from 'axios';
import { SendPrivateBundleProps } from 'types';

export async function sendBundle(props: SendPrivateBundleProps): Promise<void> {
	const { endpoints, privateTx, targetBlock } = props;

	const requestData = {
		jsonrpc: '2.0',
		method: 'eth_sendBundle',
		params: [
			{
				txs: [privateTx],
				blockNumber: targetBlock,
			},
		],
		id: '1',
	};

	const promises = endpoints.map(async (endpoint) => {
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
	});

	await Promise.all(promises);
}
