import { Flashbots } from '../../src/flashbots/flashbots';
import { createBundlesWithDifferentTxs } from '../../src/transactions/createBundlesWithDifferentTxs';
import { createBundlesWithSameTxs } from '../../src/transactions/createBundlesWithSameTxs';
import { formatBundlesTxsToType2 } from '../../src/transactions/formatBundlesTxsToType2';
import * as gasModule from '../../src/transactions/getMainnetGasType2Parameters';
import { populateTransactions } from '../../src/transactions/populateTransactions';
import * as retryModule from '../../src/transactions/prepareFlashbotBundleForRetry';
import * as sendAndRetry from '../../src/transactions/sendAndRetryUntilNotWorkable';
import * as sendToFlashbots from '../../src/transactions/sendBundlesToFlashbots';
import * as format from '../../src/utils/format';
import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
import {
	Contract,
	JsonRpcProvider,
	Wallet,
	Block,
	encodeBytes32String,
	keccak256,
	toUtf8Bytes,
	zeroPadBytes,
	ContractTransaction,
} from 'ethers';
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

jest.mock('../../src/transactions/sendBundlesToFlashbots.ts', () => {
	return {
		__esModule: true,
		...jest.requireActual('../../src/transactions/sendBundlesToFlashbots'),
		default: jest.fn(),
	};
});

jest.mock('@flashbots/ethers-provider-bundle');

const mockGetMainnetGasType2Parameters = jest.spyOn(gasModule, 'getMainnetGasType2Parameters');
const mockSendBundlesToFlashbots = jest.spyOn(sendToFlashbots, 'sendBundlesToFlashbots');
const mockSendAndRetryUntilNotWorkable = jest.spyOn(sendAndRetry, 'sendAndRetryUntilNotWorkable');

const FAKE_BLOCK: Block = {
	baseFeePerGas: BigInt(10),
	gasUsed: BigInt(10_000),
	gasLimit: BigInt(10_000_000),
} as Block;
const PRIORITY_FEE = BigInt(10);
const DYNAMIC_PRIORITY_FEE = BigInt(20);
const MAX_FEE = BigInt(20);
const nodeUrl = process.env.NODE_URI_ETHEREUM;
const provider = new JsonRpcProvider(nodeUrl);
const FAKE_PK = '222333334444555587a6d8b56b68f67111152b3f0ae2c0702b486412a07e80d5';
const signer = new Wallet(FAKE_PK, provider);
const relayer = 'https://relay.flashbots.net';

const fakeUnsignedTx: ContractTransaction = {
	to: '0x57B067e4E27558FE2c60fCE86941011cB5F5A4FD',
	data: '',
};

const fakeUnsignedTx2 = {
	to: '0x57B067e4E27558FE2c60fCE86941011cB5F5A4FE',
	data: '',
};

const fakeUnsignedTxType2 = {
	to: '0x57B067e4E27558FE2c60fCE86941011cB5F5A4FD',
	data: '',
	type: 2,
	maxPriorityFeePerGas: PRIORITY_FEE,
	maxFeePerGas: MAX_FEE,
};

const fakeUnsignedTxType2Two = {
	to: '0x57B067e4E27558FE2c60fCE86941011cB5F5A4FE',
	data: '',
	type: 2,
	maxPriorityFeePerGas: PRIORITY_FEE,
	maxFeePerGas: MAX_FEE,
};

const fakeUnsignedTxType2Three = {
	to: '0x57B067e4E27558FE2c60fCE86941011cB5S5A4FE',
	data: '',
	type: 2,
	maxPriorityFeePerGas: PRIORITY_FEE,
	nonce: 0,
	maxFeePerGas: MAX_FEE,
};

const fakeUnsignedTxType2Four = {
	to: '0x57B067e4E27558FE2c60fCE86941011cBAF5A4FE',
	data: '',
	type: 2,
	maxPriorityFeePerGas: PRIORITY_FEE,
	nonce: 0,
	maxFeePerGas: MAX_FEE,
};

const fakeUnsignedTxType2Five = {
	to: '0x57B067e4E27558FE2c60fCE86941011cB5S5A4FE',
	data: '',
	type: 2,
	maxPriorityFeePerGas: DYNAMIC_PRIORITY_FEE,
	nonce: 0,
	maxFeePerGas: MAX_FEE,
};

const fakeUnsignedTxType2Six = {
	to: '0x57B067e4E27558FE2c60fCE86941011cBAF5A4FE',
	data: '',
	type: 2,
	maxPriorityFeePerGas: DYNAMIC_PRIORITY_FEE,
	nonce: 0,
	maxFeePerGas: MAX_FEE,
};

const firstBundle = {
	targetBlock: 10000,
	txs: [fakeUnsignedTx],
	id: undefined,
};
const secondBundle = {
	targetBlock: 10001,
	txs: [fakeUnsignedTx],
	id: undefined,
};

const type2BundleOne = {
	targetBlock: 10000,
	txs: [fakeUnsignedTxType2],
	id: undefined,
};

const type2BundleTwo = {
	targetBlock: 10001,
	txs: [fakeUnsignedTxType2],
	id: undefined,
};

const bundles = [firstBundle, secondBundle];

describe('transactions', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('sendBundlesToFlashbots', () => {
		it('should call the send flashbots method', async () => {
			const fbInstance = await Flashbots.init(signer, signer, provider, [relayer], false, 1);
			const mockMethod = jest.spyOn(fbInstance, 'send');
			mockMethod.mockResolvedValue(true);
			await sendToFlashbots.sendBundlesToFlashbots([firstBundle], fbInstance);
			expect(mockMethod).toHaveBeenCalled();
		});

		it('should return a boolean', async () => {
			const fbInstance = await Flashbots.init(signer, signer, provider, [relayer], false, 1);
			const mockMethod = jest.spyOn(fbInstance, 'send');
			mockMethod.mockResolvedValue(true);
			const result = await sendToFlashbots.sendBundlesToFlashbots([firstBundle], fbInstance);
			expect(result).toBe(true);
		});
	});

	describe('createBundlesWithSameTxs', () => {
		it('should create the right amount of bundles', async () => {
			const bundles = createBundlesWithSameTxs({
				unsignedTxs: [fakeUnsignedTx],
				burstSize: 3,
				firstBlockOfBatch: 10000,
			});
			expect(bundles.length).toBe(3);
		});

		it('should only change the target block for the bundles', async () => {
			const firstBundle = {
				targetBlock: 10000,
				txs: [fakeUnsignedTx],
				id: undefined,
			};
			const secondBundle = {
				targetBlock: 10001,
				txs: [fakeUnsignedTx],
				id: undefined,
			};

			const expectedReturnValue = [firstBundle, secondBundle];
			const createdBundles = createBundlesWithSameTxs({
				unsignedTxs: [fakeUnsignedTx],
				burstSize: 2,
				firstBlockOfBatch: 10000,
			});

			expect(createdBundles).toEqual(expectedReturnValue);
		});
	});

	describe('createBundlesWithDifferentTxs', () => {
		const firstBundle = {
			targetBlock: 10000,
			txs: [fakeUnsignedTx],
			id: undefined,
		};
		const secondBundle = {
			targetBlock: 10001,
			txs: [fakeUnsignedTx2],
			id: undefined,
		};

		it('should throw an error if the amount of transaction is <= 1', async () => {
			const expectedError = new Error(
				'Your transaction is a single one, make sure this is correct. If it is correct, please use createBundlesWithSameTxs'
			);

			try {
				createBundlesWithDifferentTxs({
					unsignedTxs: [fakeUnsignedTx],
					burstSize: 1,
					firstBlockOfBatch: 10000,
				});
			} catch (err) {
				expect(err).toStrictEqual(expectedError);
			}
		});

		it('should throw an error if the burst size does not coincide with the amount of transactions', async () => {
			const expectedError = new Error('If the txs are different, they must have the same length as the burstSize');

			try {
				createBundlesWithDifferentTxs({
					unsignedTxs: [fakeUnsignedTx, fakeUnsignedTx2],
					burstSize: 3,
					firstBlockOfBatch: 10000,
				});
			} catch (err) {
				expect(err).toStrictEqual(expectedError);
			}
		});

		it('should create the right amount of bundles', async () => {
			const bundles = createBundlesWithDifferentTxs({
				unsignedTxs: [fakeUnsignedTx, fakeUnsignedTx2],
				burstSize: 2,
				firstBlockOfBatch: 10000,
			});
			expect(bundles.length).toBe(2);
		});

		it('should populate each bundle with a consecutive target block', async () => {
			const expectedReturnValue = [firstBundle, secondBundle];
			const createdBundles = createBundlesWithDifferentTxs({
				unsignedTxs: [fakeUnsignedTx, fakeUnsignedTx2],
				burstSize: 2,
				firstBlockOfBatch: 10000,
			});

			expect(createdBundles).toEqual(expectedReturnValue);
		});

		it('should include a different tx in each bundle', async () => {
			const createdBundles = createBundlesWithDifferentTxs({
				unsignedTxs: [fakeUnsignedTx, fakeUnsignedTx2],
				burstSize: 2,
				firstBlockOfBatch: 10000,
			});

			expect(createdBundles[0].txs[0]).toEqual(fakeUnsignedTx);
			expect(createdBundles[1].txs[0]).toEqual(fakeUnsignedTx2);
		});
	});

	describe('getMainnetGasType2Parameters', () => {
		const priorityFeeInWei = 10;
		const mockFlashbotsResponse = BigInt('1000');
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

		it('should transform the priorityFee from Wei to Gwei', async () => {
			const priorityFeeInWei = 1000;

			when(FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock).mockReturnValue(mockFlashbotsResponse);

			const priorityFeeInGwei = format.toGwei(priorityFeeInWei);

			const fnCall = gasModule.getMainnetGasType2Parameters({ block: FAKE_BLOCK, blocksAhead: 2, priorityFeeInWei });
			expect(fnCall.priorityFeeInGwei).toEqual(priorityFeeInGwei);
		});

		it('should return the right maxFeePerGas', async () => {
			const priorityFeeInWei = 1000;

			when(FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock).mockReturnValue(mockFlashbotsResponse);

			const priorityFeeInGwei = format.toGwei(priorityFeeInWei);
			const maxFeePerGas = priorityFeeInGwei + mockFlashbotsResponse;

			const fnCall = gasModule.getMainnetGasType2Parameters({ block: FAKE_BLOCK, blocksAhead: 2, priorityFeeInWei });
			expect(fnCall.maxFeePerGas).toEqual(maxFeePerGas);
		});

		it('it should return an object with priorityFee and maxFeePerGas', async () => {
			const priorityFeeInWei = 1000;

			when(FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock).mockReturnValue(mockFlashbotsResponse);

			const priorityFeeInGwei = format.toGwei(priorityFeeInWei);
			const maxFeePerGas = priorityFeeInGwei + mockFlashbotsResponse;
			expect(gasModule.getMainnetGasType2Parameters({ block: FAKE_BLOCK, blocksAhead: 2, priorityFeeInWei })).toEqual({
				priorityFeeInGwei,
				maxFeePerGas,
			});
		});
	});

	describe('formatBundlesTxsToType2', () => {
		it('should call getMainnetGasType2Parameters', async () => {
			const expectedReturnValue = [type2BundleOne, type2BundleTwo];

			formatBundlesTxsToType2({
				block: FAKE_BLOCK,
				blocksAhead: expectedReturnValue.length,
				bundlesTxs: bundles,
				priorityFeeInWei: 10,
			});

			expect(mockGetMainnetGasType2Parameters).toHaveBeenCalledWith({
				block: FAKE_BLOCK,
				priorityFeeInWei: 10,
				blocksAhead: expectedReturnValue.length,
			});
		});

		it('should add the correct values for maxPriorityFee and maxFeePerGas', async () => {
			mockGetMainnetGasType2Parameters.mockReturnValue({
				priorityFeeInGwei: PRIORITY_FEE,
				maxFeePerGas: MAX_FEE,
			});

			const expectedReturnValue = [type2BundleOne, type2BundleTwo];

			const createdBundles = formatBundlesTxsToType2({
				block: FAKE_BLOCK,
				blocksAhead: expectedReturnValue.length,
				bundlesTxs: bundles,
				priorityFeeInWei: 10,
			});

			expect(createdBundles).toStrictEqual(expectedReturnValue);
		});
	});

	describe('populateTransactions', () => {
		const jobAddress = '0x95416069ad8756f123Ad48fDB6fede7179b9Ecae';
		const chainId = BigInt(1);
		const mockArg = encodeBytes32String('KEEP3R');
		const makerJobAbiLike = ['function workable(bytes32 network) view returns (bool canWork, bytes memory args)'];
		const mockContract = new Contract(jobAddress, makerJobAbiLike);
		const expectedFnSelector = keccak256(toUtf8Bytes('workable(bytes32)')).substring(0, 10);
		const expectedData = zeroPadBytes(mockArg, 32).substring(2);
		const expectedCallData = expectedFnSelector.concat(expectedData);
		const expectedTx = {
			data: expectedCallData,
			to: jobAddress,
			chainId,
		};
		const expectedTxWithOptions = {
			data: expectedCallData,
			to: jobAddress,
			chainId,
			gasLimit: BigInt(10_000_000),
		};

		it('should return a single populated transaction when passing one function argument', async () => {
			const resultingTx = await populateTransactions({
				contract: mockContract,
				chainId,
				functionArgs: [[mockArg]],
				functionName: 'workable',
			});

			expect([expectedTx]).toStrictEqual(resultingTx);
		});

		it('should return a two populated transaction when passing two function argument', async () => {
			const resultingTx = await populateTransactions({
				contract: mockContract,
				chainId,
				functionArgs: [[mockArg], [mockArg]],
				functionName: 'workable',
			});

			expect(expectedTx).toStrictEqual(resultingTx[0]);
			expect(expectedTx).toStrictEqual(resultingTx[1]);
		});

		it('should add options to the resulting transaction', async () => {
			const options = {
				gasLimit: 10_000_000,
			};

			const resultingTx = await populateTransactions({
				contract: mockContract,
				chainId,
				functionArgs: [[mockArg]],
				functionName: 'workable',
				options,
			});

			expect([expectedTxWithOptions]).toMatchObject(resultingTx);
		});
	});

	describe('prepareFlashbotsBundleForRetry', () => {
		beforeEach(() => {
			mockGetMainnetGasType2Parameters.mockReturnValue({
				priorityFeeInGwei: PRIORITY_FEE,
				maxFeePerGas: MAX_FEE,
			});
		});

		const previousBurstSize = 3;

		it('should return false if firstBundleBlock is undefined', async () => {
			const latestBlock = (await provider.getBlock('latest'))!.number;
			const fnCall = retryModule.prepareFlashbotBundleForRetry({
				newBurstSize: 2,
				notIncludedBlock: latestBlock + 10,
				previousBurstSize: 2,
				priorityFeeInWei: 10,
				txs: [fakeUnsignedTxType2],
				provider,
				signer,
			});

			expect(await fnCall).toStrictEqual(false);
		});

		it('should return false if cancelBatchAndRestart is true', async () => {
			const latestBlock = (await provider.getBlock('latest'))!.number;
			const fnCall = retryModule.prepareFlashbotBundleForRetry({
				newBurstSize: 2,
				notIncludedBlock: latestBlock + 10,
				previousBurstSize: 2,
				priorityFeeInWei: 10,
				txs: [fakeUnsignedTxType2],
				provider,
				signer,
				recalculatePriorityFeeInWei: async () => {
					return {
						newPriorityFeeInWei: 20,
						cancelBatchAndRestart: true,
					};
				},
			});

			expect(await fnCall).toStrictEqual(false);
		});
		it('should prepare a new bundle with same transaction and updated target blocks', async () => {
			const latestBlock = (await provider.getBlock('latest'))!.number;
			const recentBlock = latestBlock - 50;
			const firstBlockOfNextBatch = recentBlock + 3;
			const newBundle = await retryModule.prepareFlashbotBundleForRetry({
				newBurstSize: 2,
				notIncludedBlock: recentBlock,
				previousBurstSize,
				priorityFeeInWei: 10,
				txs: [fakeUnsignedTxType2],
				provider,
				signer,
			});

			const expectedBundle = [
				{ targetBlock: firstBlockOfNextBatch, txs: [fakeUnsignedTxType2] },
				{ targetBlock: firstBlockOfNextBatch + 1, txs: [fakeUnsignedTxType2] },
			];

			expect(newBundle).toStrictEqual(expectedBundle);
		});
		it('should prepare a new bundle with different transactions and updated target blocks', async () => {
			const latestBlock = (await provider.getBlock('latest'))!.number;
			const recentBlock = latestBlock - 50;
			const firstBlockOfNextBatch = recentBlock + 3;

			const newBundle = await retryModule.prepareFlashbotBundleForRetry({
				newBurstSize: 2,
				notIncludedBlock: recentBlock,
				previousBurstSize,
				priorityFeeInWei: 10,
				txs: [fakeUnsignedTxType2, fakeUnsignedTxType2Two],
				provider,
				signer,
				bundleRegenerationMethod: 'createBundlesWithDifferentTxs',
			});

			const expectedBundle = [
				{ targetBlock: firstBlockOfNextBatch, txs: [fakeUnsignedTxType2] },
				{ targetBlock: firstBlockOfNextBatch + 1, txs: [fakeUnsignedTxType2Two] },
			];

			expect(newBundle).toStrictEqual(expectedBundle);
		});
		it('should prepare a new bundle with new transactions and updated target blocks', async () => {
			const latestBlock = (await provider.getBlock('latest'))!.number;
			const recentBlock = latestBlock - 50;
			const firstBlockOfNextBatch = recentBlock + 3;

			const newBundle = await retryModule.prepareFlashbotBundleForRetry({
				newBurstSize: 2,
				notIncludedBlock: recentBlock,
				previousBurstSize,
				priorityFeeInWei: 10,
				txs: [fakeUnsignedTxType2, fakeUnsignedTxType2Two],
				provider,
				signer,
				bundleRegenerationMethod: 'createBundlesWithDifferentTxs',
				regenerateTxs: async () => {
					return [fakeUnsignedTxType2Three, fakeUnsignedTxType2Four];
				},
			});

			const expectedBundle = [
				{ targetBlock: firstBlockOfNextBatch, txs: [fakeUnsignedTxType2Three] },
				{ targetBlock: firstBlockOfNextBatch + 1, txs: [fakeUnsignedTxType2Four] },
			];

			expect(newBundle).toStrictEqual(expectedBundle);
		});
		it('should prepare a new bundle with new transactions and new priority fee', async () => {
			const latestBlock = (await provider.getBlock('latest'))!.number;
			const recentBlock = latestBlock - 50;
			const previousBurstSize = 3;
			const firstBlockOfNextBatch = recentBlock + 3;

			mockGetMainnetGasType2Parameters.mockReturnValue({
				priorityFeeInGwei: BigInt(20),
				maxFeePerGas: MAX_FEE,
			});

			const newBundle = await retryModule.prepareFlashbotBundleForRetry({
				newBurstSize: 2,
				notIncludedBlock: recentBlock,
				previousBurstSize,
				priorityFeeInWei: 10,
				txs: [fakeUnsignedTxType2, fakeUnsignedTxType2Two],
				provider,
				signer,
				bundleRegenerationMethod: 'createBundlesWithDifferentTxs',
				regenerateTxs: async () => {
					return [fakeUnsignedTxType2Three, fakeUnsignedTxType2Four];
				},
				recalculatePriorityFeeInWei: async () => {
					return {
						newPriorityFeeInWei: 20,
						cancelBatchAndRestart: false,
					};
				},
			});

			const expectedBundle = [
				{ targetBlock: firstBlockOfNextBatch, txs: [fakeUnsignedTxType2Five] },
				{ targetBlock: firstBlockOfNextBatch + 1, txs: [fakeUnsignedTxType2Six] },
			];

			expect(newBundle).toStrictEqual(expectedBundle);
		});
	});

	describe('sendAndRetryUntilNotWorkable', () => {
		const nodeUrl = process.env.NODE_URI_ETHEREUM;
		const provider = new JsonRpcProvider(nodeUrl);
		const FAKE_PK = '222333334444555587a6d8b56b68f67111152b3f0ae2c0702b486412a07e80d5';
		const signer = new Wallet(FAKE_PK, provider);
		const mockFnFalse = async () => false;
		const mockFnTrue = async () => true;
		const mockFlashbots = {} as Flashbots;

		it('should return false if the function is not workable', async () => {
			const fnCall = sendAndRetry.sendAndRetryUntilNotWorkable({
				bundles: [firstBundle],
				flashbots: mockFlashbots,
				isWorkableCheck: mockFnFalse,
				newBurstSize: 2,
				priorityFeeInWei: 10,
				provider,
				signer,
				txs: [fakeUnsignedTx],
			});

			expect(await fnCall).toBe(false);
		});
		it('should return true if the first bundle was included', async () => {
			mockSendBundlesToFlashbots.mockResolvedValue(true);

			const fnCall = sendAndRetry.sendAndRetryUntilNotWorkable({
				bundles: [firstBundle],
				flashbots: mockFlashbots,
				isWorkableCheck: mockFnTrue,
				newBurstSize: 2,
				priorityFeeInWei: 10,
				provider,
				signer,
				txs: [fakeUnsignedTx],
			});

			expect(await fnCall).toBe(true);
		});
		it('should return false if retryBundle returns false', async () => {
			const latestBlock = (await provider.getBlock('latest'))!.number;
			const unexistentBlock = latestBlock + 10;
			const bundles = {
				targetBlock: unexistentBlock,
				txs: [fakeUnsignedTx],
				id: undefined,
			};
			mockSendBundlesToFlashbots.mockResolvedValue(false);

			const fnCall = sendAndRetry.sendAndRetryUntilNotWorkable({
				bundles: [bundles],
				flashbots: mockFlashbots,
				isWorkableCheck: mockFnTrue,
				newBurstSize: 2,
				priorityFeeInWei: 10,
				provider,
				signer,
				txs: [fakeUnsignedTx],
			});

			expect(await fnCall).toBe(false);
		});
		it('should return false if retryBundle returns false', async () => {
			const latestBlock = (await provider.getBlock('latest'))!.number;
			const bundles = {
				targetBlock: latestBlock,
				txs: [fakeUnsignedTx],
				id: undefined,
			};
			mockSendBundlesToFlashbots.mockResolvedValue(false);

			sendAndRetry.sendAndRetryUntilNotWorkable({
				bundles: [bundles],
				flashbots: mockFlashbots,
				isWorkableCheck: mockFnTrue,
				newBurstSize: 2,
				priorityFeeInWei: 10,
				provider,
				signer,
				txs: [fakeUnsignedTx],
			});

			expect(mockSendAndRetryUntilNotWorkable).toBeCalled();

			mockSendBundlesToFlashbots.mockResolvedValue(true);
		});
	});
});
