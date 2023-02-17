import { parseUnits } from 'ethers';

export const toGwei = (value: number): bigint => {
	return parseUnits(value.toString(), 'gwei');
};
