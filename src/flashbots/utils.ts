import { ethers } from 'ethers';

export function makeid(length: number): string {
	let result = '';
	const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	const charactersLength = characters.length;
	for (let i = 0; i < length; i++) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
	}
	return result;
}

export function getStealthHash(): string {
	return ethers.utils.solidityKeccak256(['string'], [makeid(32)]);
}

export function calculateTargetBlocks(burstSize: number, nextBlock: number): number[] {
	if (burstSize === 0 || burstSize === 1) {
		return [nextBlock];
	}

	const targetBlocks: number[] = [];

	for (let i = 0; i < burstSize; i++) {
		targetBlocks[i] = nextBlock + i;
	}

	return targetBlocks;
}
