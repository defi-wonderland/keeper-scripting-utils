export interface BasicConfig {
	localRpc: string;
	chainId: number;
}

export interface Config extends BasicConfig {
	txRpc: string;
	flashbotRelays: string[];
	simulateBundle: boolean;
}
