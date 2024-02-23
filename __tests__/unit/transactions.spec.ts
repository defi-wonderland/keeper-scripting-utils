import * as gasModule from '../../src/transactions/getMainnetGasType2Parameters';
import { Block } from '@ethersproject/abstract-provider';
import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
import { BigNumber } from 'ethers';
import { when } from 'jest-when';

const dotenv = require('dotenv');
dotenv.config();

jest.mock('../../src/transactions/getMainnetGasType2Parameters.ts', () => {
	return {
		__esModule: true,
		...jest.requireActual('../../src/transactions/getMainnetGasType2Parameters'),
		default: jest.fn(),
	};
});

jest.mock('@flashbots/ethers-provider-bundle');

const FAKE_BLOCK: Block = {
	baseFeePerGas: BigNumber.from(10),
	gasUsed: BigNumber.from(10_000),
	gasLimit: BigNumber.from(10_000_000),
} as Block;

describe('transactions', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('getMainnetGasType2Parameters', () => {
		const priorityFeeInWei = 10;
		const mockFlashbotsResponse = BigNumber.from('1000');
		it('should throw an error if the block does not have the base fee', async () => {
			const emptyBlock = {} as Block;
			const priorityFeeInWei = 10;
			const expectedError = new Error('Missing property baseFeePerGas on block');

			try {
				gasModule.getMainnetGasType2Parameters({ block: emptyBlock, blocksAhead: 2, priorityFeeInWei });
			} catch (err) {
				expect(err).toStrictEqual(expectedError);
			}
		});

		it('should call getBaseFeeInNextBlock when blocksAhead is 0', async () => {
			const blocksAhead = 0;
			when(FlashbotsBundleProvider.getBaseFeeInNextBlock).mockReturnValue(mockFlashbotsResponse);

			gasModule.getMainnetGasType2Parameters({ block: FAKE_BLOCK, blocksAhead, priorityFeeInWei });

			expect(FlashbotsBundleProvider.getBaseFeeInNextBlock).toHaveBeenCalledWith(
				FAKE_BLOCK.baseFeePerGas,
				FAKE_BLOCK.gasUsed,
				FAKE_BLOCK.gasLimit
			);
		});

		it('should call getBaseFeeInNextBlock when blocksAhead is 1', async () => {
			const blocksAhead = 1;
			when(FlashbotsBundleProvider.getBaseFeeInNextBlock).mockReturnValue(mockFlashbotsResponse);

			gasModule.getMainnetGasType2Parameters({ block: FAKE_BLOCK, blocksAhead, priorityFeeInWei });

			expect(FlashbotsBundleProvider.getBaseFeeInNextBlock).toHaveBeenCalledWith(
				FAKE_BLOCK.baseFeePerGas,
				FAKE_BLOCK.gasUsed,
				FAKE_BLOCK.gasLimit
			);
		});

		it('should call getMaxBaseFeeInFutureBlock when blocksAhead is more than 1', async () => {
			const blocksAhead = 2;
			when(FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock).mockReturnValue(mockFlashbotsResponse);

			gasModule.getMainnetGasType2Parameters({ block: FAKE_BLOCK, blocksAhead, priorityFeeInWei });

			expect(FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock).toHaveBeenCalledWith(FAKE_BLOCK.baseFeePerGas, blocksAhead);
		});

		it('should return the right maxFeePerGas', async () => {
			const priorityFeeInWei = 1000e9;

			when(FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock).mockReturnValue(mockFlashbotsResponse);

			const maxFeePerGas = BigNumber.from(priorityFeeInWei).add(mockFlashbotsResponse);

			const fnCall = gasModule.getMainnetGasType2Parameters({ block: FAKE_BLOCK, blocksAhead: 2, priorityFeeInWei });
			expect(fnCall.maxFeePerGas).toEqual(maxFeePerGas);
		});

		it('it should return an object with priorityFee and maxFeePerGas', async () => {
			const priorityFeeInWei = 1000e9;

			when(FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock).mockReturnValue(mockFlashbotsResponse);

			const maxFeePerGas = BigNumber.from(priorityFeeInWei).add(mockFlashbotsResponse);
			expect(gasModule.getMainnetGasType2Parameters({ block: FAKE_BLOCK, blocksAhead: 2, priorityFeeInWei })).toEqual({
				priorityFee: BigNumber.from(priorityFeeInWei),
				maxFeePerGas,
			});
		});
	});
});
