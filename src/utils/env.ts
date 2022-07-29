import 'dotenv/config';

const MAX_ACCOUNTS = 10;

export function getNodeUrl(network: string, wss = false): string {
	if (network) {
		let envKey = `NODE_URI_${network.toUpperCase()}`;
		if (wss) envKey = envKey + '_WSS';
		const uri = process.env[envKey];
		if (uri && uri !== '') {
			return uri;
		}
	}
	console.warn(`No node uri for network ${network}`);
	return '';
}

export function getNodeUrlWss(network: string): string {
	return getNodeUrl(network, true);
}

export function getPrivateKeys(network: string): string[] {
	const privateKeys = [];
	for (let i = 1; i <= MAX_ACCOUNTS; i++) {
		const privateKey = process.env[`${network.toUpperCase()}_${i}_PRIVATE_KEY`];
		if (privateKey) privateKeys.push(privateKey);
	}
	if (privateKeys.length === 0) {
		console.warn(`No private keys for network ${network}`);
	}
	return privateKeys;
}

export function getPrivateKey(network: string): string {
	const privateKey = process.env[`${network.toUpperCase()}_1_PRIVATE_KEY`];
	if (!privateKey) {
		console.warn(`No private key for network ${network}`);
		return '';
	}
	return privateKey;
}
