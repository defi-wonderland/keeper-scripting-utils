import BasicJob from '../abi/BasicJob.json';
import { Flashbots } from './flashbots/flashbots';
import { getNewBlocks, stopBlocks } from './subscriptions/blocks';
import { prepareFirstBundlesForFlashbots, sendAndRetryUntilNotWorkable } from './transactions';
import { getNodeUrlWss, getPrivateKey } from './utils';
import { providers, Wallet, Contract, BigNumber } from 'ethers';
import { mergeMap, take, timer } from 'rxjs';

const dotenv = require('dotenv');
dotenv.config();

const network = 'goerli';
const chainId = 5;
const nodeUrl = getNodeUrlWss(network);
const provider = new providers.WebSocketProvider(nodeUrl);
const JOB_ADDRESS = '0x4C8DB41095cD6fb755466463F0C6B2Ab9C826804';
const PK = getPrivateKey(network);
const FLASHBOTS_PK = process.env.FLASHBOTS_APIKEY;
const FLASHBOTS_RPC = 'https://relay-goerli.flashbots.net';

const signer = new Wallet(PK, provider);
const job = new Contract(JOB_ADDRESS, BasicJob, signer);
const secondsBefore = 10;
const priorityFee = 10; // TODO DEHARDCODE

let flashbots: Flashbots;

export async function runBasicJob(): Promise<void> {
	if (!flashbots) {
		flashbots = await Flashbots.init(signer, new Wallet(FLASHBOTS_PK as string), provider, [FLASHBOTS_RPC], false, chainId);
	}

	// 0 = basic
	// 1 = complex
	const [lastWorkAt, cooldown]: BigNumber[] = await Promise.all([job.lastWorkAt(0), job.workCooldown()]);

	const readyTime = lastWorkAt.add(cooldown);
	const notificationTime = readyTime.sub(secondsBefore);
	const time = notificationTime.mul(1000).sub(Date.now()).toNumber();

	console.log('started cooldown observable');
	const sub = timer(time)
		.pipe(
			mergeMap(() => getNewBlocks(provider)),
			take(1)
		)
		.subscribe(async (block) => {
			console.log('enter subscribe');
			console.log('block in main ', block.number);
			console.log('Job is close to be off cooldown');
			const currentNonce = await provider.getTransactionCount(signer.address);
			const options = {
				gasLimit: 1_000_000, // TODO DEHARDCODE
				nonce: currentNonce,
			};

			const { txs, formattedBundles } = await prepareFirstBundlesForFlashbots({
				contract: job,
				functionName: 'basicWork',
				block,
				priorityFee,
				futureBlocks: 2,
				burstSize: 2,
				functionArgs: [[200]],
				options,
			});

			console.log('SENDING TX...');

			const result = await sendAndRetryUntilNotWorkable({
				txs,
				provider,
				priorityFee,
				bundles: formattedBundles,
				newBurstSize: 3,
				flashbots,
				signer,
				sendThroughStealthRelayer: false,
				isWorkableCheck: async () => await job.basicWorkable(),
			});

			console.log('===== Tx SUCCESS =====');

			stopBlocks(provider);
			sub.unsubscribe();
			runBasicJob();
		});
}

if (!process.env.TEST_MODE) {
	(async () => {
		runBasicJob();
	})();
}
