import { Block } from '@ethersproject/abstract-provider';
import chalk from 'chalk';
import { providers } from 'ethers';

type CallbackFunction = (block: Block) => Promise<void>;

/**
 * Class in charge of managing the fetching of blocks and how they are provided acoss the app.
 *
 */
export class BlockListener {
	/**
	 * @param provider - JsonRpc provider that has the methods needed to fetch and listen for new blocks.
	 */
	constructor(private provider: providers.BaseProvider) {}

	/**
	 * This function is able to provide a listener for new incoming blocks with all their data.
	 *
	 * @dev
	 * Block listener is initialized only if the subscriptions account is zero. Otherwise it will skip the initialization
	 * and just return the block$ observable where the new blocks are being pushed.
	 * For the fetching part we need to combine two different functions to fetch and deliver new blocks:
	 *  - One that fetches the current block just once when this function is called and push it to block$ observable.
	 *  - One that hooks to the 'block' event of the provider that returns just the number of the new block, and then use
	 * 		provider.getBlock(blockNumber) method to fetch all the data of that block and push it to block$ observable.
	 *
	 * @param cb Callback function which will receive each new block
	 * @param intervalDelay Get next block after X seconds of sleep. This number must be bigger than the time between 2 blocks.
	 * @param blockDelay After getting a new block, wait X seconds before calling the callback function.
	 *                   This is useful for descentralised node infrastructures which may need some time to sync, as Ankr.
	 */
	stream(cb: CallbackFunction, intervalDelay = 0, blockDelay = 0): void {
		const start = async () => {
			// save latest block number, in order to avoid old block dumps
			let latestBlockNumber = await this.provider.getBlockNumber();

			console.info(chalk.redBright(`\nWaiting for next block, latest block: ${latestBlockNumber}`));

			// listen for next block
			this.provider.on('block', async (blockNumber) => {
				// avoid having old dump of blocks
				if (blockNumber <= latestBlockNumber) return;
				latestBlockNumber = blockNumber;

				if (intervalDelay > 0) {
					// stop listening to new blocks
					this.stop();
				}

				// delay the block arrival a bit, for ankr to have time to sync
				setTimeout(async () => {
					// double check that the block to process is actually the latest
					if (blockNumber < latestBlockNumber) return;

					console.info(`${chalk.bgGray('block arrived:', blockNumber)}\n`);
					// get block data
					const block = await this.provider.getBlock(blockNumber);
					// call the given callback with the block data
					await cb(block);
				}, blockDelay);
			});
		};

		// get next block immediately
		start();

		if (intervalDelay > 0) {
			// get next block every {intervalDelay} of sleep
			setInterval(start, intervalDelay);
		}
	}

	stop(): void {
		this.provider.removeAllListeners('block');
	}
}
