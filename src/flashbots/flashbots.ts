import { TransactionRequest } from '@ethersproject/abstract-provider';
import { Signer } from '@ethersproject/abstract-signer';
import {
	FlashbotsBundleProvider,
	FlashbotsBundleRawTransaction,
	FlashbotsBundleResolution,
	SimulationResponse,
} from '@flashbots/ethers-provider-bundle';
import chalk from 'chalk';
import { providers } from 'ethers';

export class Flashbots {
	private constructor(
		private txSigner: Signer,
		private flashbotsProviders: FlashbotsBundleProvider[],
		private shouldSimulateBundle: boolean
	) {}

	static async init(
		txSigner: Signer,
		bundleSigner: Signer,
		provider: providers.JsonRpcProvider | providers.WebSocketProvider,
		flashbotRelayers: string[],
		simulateBundle: boolean,
		chainId: number
	): Promise<Flashbots> {
		// create a provider for every relay defined in the config
		const flashbotsProviders = await Promise.all(
			flashbotRelayers.map((relay) => {
				return FlashbotsBundleProvider.create(provider, bundleSigner, relay, chainId);
			})
		);

		return new Flashbots(txSigner, flashbotsProviders, simulateBundle);
	}

	async send(
		unsignedTxs: TransactionRequest[],
		targetBlock: number,
		staticDebugId?: string,
		dynamicDebugId?: string
	): Promise<boolean> {
		// prepare txs and bundle
		const signedTxs = await Promise.all(unsignedTxs.map((unsignedTx) => this.txSigner.signTransaction(unsignedTx)));
		const bundle: FlashbotsBundleRawTransaction[] = signedTxs.map((signedTransaction) => ({
			signedTransaction,
		}));

		// simulate bundle if needed
		const simulationPassed = this.shouldSimulateBundle
			? await this.simulateBundle(this.flashbotsProviders[0], bundle, targetBlock)
			: true;

		if (simulationPassed) {
			return this.broadcastBundle(this.flashbotsProviders, bundle, targetBlock, staticDebugId, dynamicDebugId);
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
				console.error(`Bundle simulation error`, simulation);
				return false;
			}
		} catch (error) {
			let errorMessage;
			if (error instanceof Error) errorMessage = error.message;
			else errorMessage = String(error);

			console.error(`Bundle simulation error`, { errorMessage });
			return false;
		}

		console.debug(`Bundle simulation success`, simulation);
		return true;
	}

	async broadcastBundle(
		providers: FlashbotsBundleProvider[],
		bundle: FlashbotsBundleRawTransaction[],
		targetBlock: number,
		staticDebugId?: string,
		dynamicDebugId?: string
	): Promise<boolean> {
		const inclusions = await Promise.all(
			providers.map((provider) => {
				return this.sendBundle(provider, bundle, targetBlock, staticDebugId, dynamicDebugId);
			})
		);

		return inclusions.find((inclusion) => inclusion) || false;
	}

	async sendBundle(
		provider: FlashbotsBundleProvider,
		bundle: FlashbotsBundleRawTransaction[],
		targetBlock: number,
		staticDebugId?: string,
		dynamicDebugId?: string
	): Promise<boolean> {
		try {
			const response = await provider.sendBundle(bundle, targetBlock);

			if ('error' in response) {
				console.warn(`Bundle execution error`, response.error);
				return false;
			}

			const resolution = await response.wait();

			if (resolution == FlashbotsBundleResolution.BundleIncluded) {
				console.log(
					`${chalk.red('============\n')}Bundle status ${chalk.bgGray(targetBlock)}: ${chalk.green(
						'BundleIncluded'
					)} ---> ${chalk.green(staticDebugId)}#${chalk.cyanBright(dynamicDebugId)}`
				);
				return true;
			} else if (resolution == FlashbotsBundleResolution.BlockPassedWithoutInclusion) {
				console.log(
					`${chalk.red('============\n')}Bundle status at ${chalk.bgGray(targetBlock)}: ${chalk.bgGray(
						'BlockPassedWithoutInclusion'
					)} ---> ${chalk.green(staticDebugId)}#${chalk.cyanBright(dynamicDebugId)}`
				);
			} else if (resolution == FlashbotsBundleResolution.AccountNonceTooHigh) {
				console.warn(
					`${chalk.red('============\n')}Bundle status at ${chalk.bgGray(targetBlock)}: ${chalk.green(
						'AccountNonceTooHigh'
					)} ---> ${chalk.bgRed(staticDebugId)}#${chalk.cyanBright(
						dynamicDebugId
					)}\nReason: A previous bundle using the same nonce was included. All bundles sent with that nonce will be cancelled automatically and new bundles with updated nonces will be sent if the job is still workable.`
				);
			}
		} catch (err: unknown) {
			console.error(`Failed to send bundle`, { error: err });
		}

		return false;
	}
}
