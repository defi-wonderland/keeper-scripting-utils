// TODO: deprecate ethersproject
import { BaseProvider } from '@ethersproject/providers';
import {
	FlashbotsBundleProvider,
	FlashbotsBundleRawTransaction,
	FlashbotsBundleResolution,
	SimulationResponse,
} from '@flashbots/ethers-provider-bundle';
import chalk from 'chalk';
import { JsonRpcProvider, WebSocketProvider, Signer, ContractTransaction } from 'ethers';

/**
 * Class in charge of simulating and sending bundles through the different private relayer providers.
 *
 * @dev
 * This class is able to have multiple private relayer providers (Flashbots, Eden, ...) instantiated in it and
 * use them to send bundles to every one of them.
 * It is important to know that this class should only use the flashbots provider for simulations but will send the bundle
 * through every private relayer provider.
 */
export class Flashbots {
	/**
	 * @param txSigner - 						 Instance of signer to sign the required transactions.
	 * @param flashbotsProviders - 	 Array of different private relayer providers that will be used to send the same
	 * 														 	 bundle to each provider. Very important notice: Flashbot provider should be in
	 * 															 the first position of the array always. This is due to simulations.
	 * @param shouldSimulateBundle - Flag to simulate bundles before being send.
	 */
	private constructor(
		private txSigner: Signer,
		private flashbotsProviders: FlashbotsBundleProvider[],
		private shouldSimulateBundle: boolean
	) {}

	/**
	 * Will initialize and return an instance of a Flashbots class.
	 *
	 * @dev
	 * It will create an array of providers for every private relayer provider url passed in the parameters and use them
	 * to create a new instance of Flashbots class.
	 *
	 * @param txSigner - 				 Instance of signer to sign the required transactions.
	 * @param bundleSigner - 		 Instance of a bundle signer.
	 * @param provider -         Network provider.
	 * @param flashbotRelayers - Array of private relayer providers urls. Flashbot provider should always be first in the array.
	 * @param simulateBundle -   Flag to simulate bundles before being send.
	 * @param chainId - 				 Id of the network in use.
	 *
	 * @returns 	A new instance of the Flashbots class with all the relayers providers instantiated.
	 */
	static async init(
		txSigner: Signer,
		bundleSigner: Signer,
		provider: JsonRpcProvider | WebSocketProvider,
		flashbotRelayers: string[],
		simulateBundle: boolean,
		chainId: number
	): Promise<Flashbots> {
		const flashbotsProviders = await Promise.all(
			flashbotRelayers.map((relay) => {
				return FlashbotsBundleProvider.create(provider as unknown as BaseProvider, bundleSigner, relay, chainId);
			})
		);

		return new Flashbots(txSigner, flashbotsProviders, simulateBundle);
	}

	/**
	 * First step in the process of sending a bundle through flashbots. Will take the transactions, sign them and form the bundle
	 * to be sent. Will also simulate the bundle if the option is provided in initialization. And finally will broadcast
	 * the bundle.
	 *
	 * @param unsignedTxs - 	 Array of unsigned transactions that will form the bundle.
	 * @param targetBlock - 	 The block in which the bundle should be included and mined.
	 * @param staticDebugId -  Optional static id to help with debugging. Every bundle will share this id.
	 * @param dynamicDebugId - Optional dynamic id to help with debugging. Every bundle will have a different dynamic id. This dynamic id will
	 * 						  					 be recalculated every time a bundle is created.
	 *
	 * @returns 	A boolean that says if the bundle was included successfully or not.
	 */
	async send(
		unsignedTxs: ContractTransaction[],
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

	/**
	 * Simulates the bundle to see if the transactions in it will go through without reverting.
	 *
	 * @dev
	 * If simulations are enabled, the Flashbots provider should be first in the array of private relayers.
	 *
	 * @param provider - 	 	Private relayer provider instance.
	 * @param bundle - 	 		The bundle that should be simulated.
	 * @param targetBlock - The block number where the bundle should be simulated.
	 *
	 * @returns 	A boolean that says if the bundle simulation passed without reverts.
	 */
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

	/**
	 * Function in charge of broadcasting the bundle through all the different private relayers providers.
	 *
	 * @dev
	 * Will create an array of sentBundles (inclusions) promises and wait for all of them to be resolved. After that it will
	 * check if any of the responses was true which means the bundle was included in one of the private relayers.
	 *
	 * @param provider - 	 		 Private relayer provider instance.
	 * @param bundle - 	 			 The bundle that should be simulated.
	 * @param targetBlock - 	 The block number where the bundle should be included and mined.
	 * @param staticDebugId -  Optional static id to help with debugging. Every bundle will share this id.
	 * @param dynamicDebugId - Optional dynamic id to help with debugging. Every bundle will have a different dynamic id. This dynamic id will
	 * 						  					 be recalculated every time a bundle is created.
	 *
	 * @returns 	A boolean that says if the bundle was included in any private relayer or not.
	 */
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

	/**
	 * Function in charge of sending the bundle through the specified private relayer provider.
	 *
	 * @dev
	 * Will send the bundle to the relayer provider and wait for its resolution. Depending on the type of resolution
	 * it will return if the bundle was included or not.
	 *
	 * @param provider - 	 		 Private relayer provider instance.
	 * @param bundle - 	 			 The bundle that should be simulated.
	 * @param targetBlock - 	 The block number where the bundle should be included and mined.
	 * @param staticDebugId -  Optional static id to help with debugging. Every bundle will share this id.
	 * @param dynamicDebugId - Optional dynamic id to help with debugging. Every bundle will have a different dynamic id. This dynamic id will
	 * 						  					 be recalculated every time a bundle is created.
	 *
	 * @returns 	A boolean that says if the bundle was included in the private relayer or not.
	 */
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
