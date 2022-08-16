export interface BasicConfig {
	localRpc: string;
	chainId: number;
}

export interface Config extends BasicConfig {
	txRpc: string;
	flashbotRelays: string[];
	simulateBundle: boolean;
}

export interface GenericJSONValidator<T> {
	validate: (fileToValidate: Record<string, any>) => T;
}
