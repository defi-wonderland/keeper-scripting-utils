import BasicJob from '../abi/BasicJob.json';
import { Flashbots } from './flashbots/flashbots';
import { getNewBlocks, stopBlocks } from './subscriptions/blocks';
import { prepareFirstBundlesForFlashbots, sendAndRetryUntilNotWorkable } from './transactions';
import { getNodeUrlWss, getPrivateKey } from './utils';
import { providers, Wallet, Contract, BigNumber } from 'ethers';
import { mergeMap, timer } from 'rxjs';

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
let flashbots: Flashbots;

export async function runComplexJob(): Promise<void> {
	if (!flashbots) {
		flashbots = await Flashbots.init(signer, new Wallet(FLASHBOTS_PK as string), provider, [FLASHBOTS_RPC], false, chainId);
	}

	// 0 = basic
	// 1 = complex
	const [lastWorkAt, cooldown]: BigNumber[] = await Promise.all([job.lastWorkAt(1), job.workCooldown()]);
	const secondsBefore = 0;
	const priorityFee = 10; // TODO DEHARDCODE
	const gasLimit = 10_000_000; // TODO DEHARDCODE

	const readyTime = lastWorkAt.add(cooldown);
	const notificationTime = readyTime.sub(secondsBefore);
	const time = notificationTime.mul(1000).sub(Date.now()).toNumber();
	let txInProgress: boolean;
	let counter = 0; // TODO remove

	console.log('started cooldown observable');
	const sub = timer(time)
		.pipe(mergeMap(() => getNewBlocks(provider)))
		.subscribe(async (block) => {
			counter++;
			console.log('Job is close to be off cooldown');
			if (txInProgress) {
				console.log('TX IN PROGRESS: ', block.number);
				return;
			}

			const trigger = true; // counter > 2;  // TODO REMOVE HARDCOD
			const isWorkable = await job.complexWorkable(trigger);
			if (!isWorkable) {
				console.log('NOT WORKABLE: ', block.number);
				return;
			}

			txInProgress = true;
			const currentNonce = await provider.getTransactionCount(signer.address);

			const { tx, formattedBundles } = await prepareFirstBundlesForFlashbots({
				job,
				functionName: 'complexWork',
				block,
				priorityFee,
				gasLimit,
				chainId,
				nonce: currentNonce,
				futureBlocks: 0,
				burstSize: 2,
				functionArgs: [trigger, 2],
			});

			console.log('SENDING TX...');

			const result = await sendAndRetryUntilNotWorkable({
				tx,
				provider,
				priorityFee,
				bundles: formattedBundles,
				newBurstSize: 3,
				flashbots,
				signer,
				isWorkableCheck: () => job.complexWorkable(trigger),
			});

			console.log('===== Tx SUCCESS =====');

			txInProgress = false;
			stopBlocks(provider);
			sub.unsubscribe();
			runComplexJob();
		});
}

if (!process.env.TEST_MODE) {
	(async () => {
		runComplexJob();
	})();
}
