export type SUPPORTED_NETWORKS = 'mainnet' | 'goerli' | 'polygon' | 'fantom' | 'optimism_mainnet' | 'optimism_goerli';
export type FLASHBOTS_SUPPORTED_NETWORKS = 'mainnet' | 'goerli';
export type ChainId = number;
export type Address = string;

export const NETWORKS_IDS_BY_NAME: Record<SUPPORTED_NETWORKS, ChainId> = {
	mainnet: 1,
	goerli: 5,
	polygon: 137,
	fantom: 250,
	optimism_mainnet: 10,
	optimism_goerli: 420,
};

export const NETWORKS_EXPRORERS_BY_NAME: Record<SUPPORTED_NETWORKS, string> = {
	mainnet: 'https://etherscan.io',
	goerli: 'https://goerli.etherscan.io',
	polygon: 'https://polygonscan.com',
	fantom: 'https://ftmscan.com',
	optimism_mainnet: 'https://optimistic.etherscan.io',
	optimism_goerli: 'https://blockscout.com/optimism/goerli',
};

export const FLASHBOTS_RPC_BY_NETWORK: Record<FLASHBOTS_SUPPORTED_NETWORKS, string> = {
	mainnet: 'https://relay.flashbots.net',
	goerli: 'https://relay-goerli.flashbots.net',
};
