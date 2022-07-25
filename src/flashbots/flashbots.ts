import { Config } from '../types';
import { TransactionRequest } from '@ethersproject/abstract-provider';
import { Signer } from '@ethersproject/abstract-signer';
import {
	FlashbotsBundleProvider,
	FlashbotsBundleRawTransaction,
	FlashbotsBundleResolution,
	SimulationResponse,
} from '@flashbots/ethers-provider-bundle';
import { providers } from 'ethers';
import winston from 'winston';

export class Flashbots {
	private constructor(
		private txSigner: Signer,
		private flashbotsProviders: FlashbotsBundleProvider[],
		private config: Config,
		private log: winston.Logger
	) {}

	static async init(txSigner: Signer, bundleSigner: Signer, config: Config, log: winston.Logger): Promise<Flashbots> {
		const localProvider = new providers.JsonRpcProvider({ url: config.localRpc }, config.chainId);

		// create a provider for every relay defined in the config
		const flashbotsProviders = await Promise.all(
			config.flashbotRelays.map((relay) => {
				return FlashbotsBundleProvider.create(localProvider, bundleSigner, relay, config.chainId);
			})
		);

		return new Flashbots(txSigner, flashbotsProviders, config, log);
	}

	async send(unsignedTxs: TransactionRequest[], targetBlock: number): Promise<boolean> {
		// prepare txs and bundle
		const signedTxs = await Promise.all(unsignedTxs.map((unsignedTx) => this.txSigner.signTransaction(unsignedTx)));
		const bundle: FlashbotsBundleRawTransaction[] = signedTxs.map((signedTransaction) => ({
			signedTransaction,
		}));

		// simulate bundle if needed
		const simulationPassed = this.config.simulateBundle
			? await this.simulateBundle(this.flashbotsProviders[0], bundle, targetBlock)
			: true;

		if (simulationPassed) {
			return this.broadcastBundle(this.flashbotsProviders, bundle, targetBlock);
		}

		return false;
	}

	async simulateBundle(
		provider: FlashbotsBundleProvider,
		bundle: FlashbotsBundleRawTransaction[],
		targetBlock: number
	): Promise<boolean> {
		let simulation: SimulationResponse;

		try {
			const singedBundle = await provider.signBundle(bundle);
			simulation = await provider.simulate(singedBundle, targetBlock);
			if ('error' in simulation || simulation.firstRevert) {
				this.log.debug(`Bundle simulation error`, simulation);
				return false;
			}
		} catch (error) {
			let errorMessage;
			if (error instanceof Error) errorMessage = error.message;
			else errorMessage = String(error);

			this.log.debug(`Bundle simulation error`, { errorMessage });
			return false;
		}

		this.log.debug(`Bundle simulation success`, simulation);
		return true;
	}

	async broadcastBundle(
		providers: FlashbotsBundleProvider[],
		bundle: FlashbotsBundleRawTransaction[],
		targetBlock: number
	): Promise<boolean> {
		const inclusions = await Promise.all(
			providers.map((provider) => {
				return this.sendBundle(provider, bundle, targetBlock);
			})
		);

		return inclusions.find((inclusion) => inclusion) || false;
	}

	async sendBundle(
		provider: FlashbotsBundleProvider,
		bundle: FlashbotsBundleRawTransaction[],
		targetBlock: number
	): Promise<boolean> {
		this.log.debug(`Sending bundle`);

		try {
			const response = await provider.sendBundle(bundle, targetBlock);

			if ('error' in response) {
				this.log.debug(`Bundle execution error`, response.error);
				return false;
			}

			const resolution = await response.wait();

			if (resolution == FlashbotsBundleResolution.BundleIncluded) {
				this.log.info(`Bundle status: BundleIncluded`);
				return true;
			} else if (resolution == FlashbotsBundleResolution.BlockPassedWithoutInclusion) {
				this.log.info(`Bundle status: BlockPassedWithoutInclusion`);
			} else if (resolution == FlashbotsBundleResolution.AccountNonceTooHigh) {
				this.log.warn(`AccountNonceTooHigh`);
			}
		} catch (err: unknown) {
			this.log.warn(`Failed to send bundle`, { error: err });
		}

		return false;
	}
}
