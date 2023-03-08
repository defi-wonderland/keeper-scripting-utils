- [Keep3r Scripting Utils](#keep3r-scripting-utils)
    + [Introduction](#introduction)
    + [Broadcastors](#broadcastors)
      + [`Example Code`](#example-code)
  * [BlockListener](#blockListener)
# Keep3r Scripting Utils


### Introduction

Keep3r Scripting Utils provides a set of plug-and-play classes denominated broadcastors in charge of making the correct broadcasting of a transaction through different channels as simple as possible.

### Broadcastors

Broadcastors are the meat of this library. They are a set of classes in charge of handling the broadcasting of a transaction. This involves: 

- Ensuring the transaction won't encounter an error 
- Calculating the gas parameters
- Populating the transaction
- Sending the transaction
- Retrying in the case the transaction is sent through flashbots

As of this release, three broadcastors exists:
- `FlashbotsBroadcastor`: Broadcasts a transaction through flashbots. It will attempt to include the transaction for ~15 blocks before dropping it.
- `MempoolBroadcastor`: Broadcasts a transaction through the mempool.
- `StealthRelayerBroadcastor`: Broadcast a transaction through flashbots and through the `StealthRelayer` contract. This is a specific implementation for certain `Yearn` strategies, so chances are the keeper won't use it.

Broadcastors are designed to be extremely simple to use. All the keeper has to do is initialize them with his desired parameters and call the chosen broadcastor's `tryToWork` function. 

This allows a flexible and modularized approach where the keeper can separate the logic in charge of **what to broadcast** from the logic of **how to broadcast**. The former tends to be job-specific so creating abstractions for all cases is not scalable. The latter however is almost always the same logic, so abstracting it can reduce code duplication and save time.

This library takes care of the latter so the keeper can focus on the logic specific to what to broadcast.

### Example Code

Let's say there's a job with a `work(address _strategy)` method and we want to work it through flashbots. We will divide our script in two files:
- `init.ts:` Will handle all required initializations to work the job.
- `run.ts:` Will handle what to broadcast as well as the broadcasting.

**Init.ts**
```typescript
import {getMainnetSdk} from '@dethcrypto/eth-sdk-client';
import {providers, Wallet} from 'ethers';
import {FlashbotsBundleProvider} from '@flashbots/ethers-provider-bundle';
import {FlashbotsBroadcastor, getEnvVariable} from '@keep3r-network/keeper-scripting-utils';
import {run} from './run';

// Function name or signature of the function we need to call
const WORK_FUNCTION = 'work';
// Our preferred gas limit
const GAS_LIMIT = 10_000_000;
// What priority fee to use expressed in wei
const PRIORITY_FEE = 1.5e9;

(async () => {
  // Setup the provider we are going to use to send the transaction
  const provider = new providers.JsonRpcProvider(getEnvVariable('NODE_URI_MAINNET'));
  // Create a txSigner to sign the transaction we are going to send
  const txSigner = new Wallet(getEnvVariable('TX_SIGNER_PRIVATE_KEY'), provider);
  // Create a signer for the flashbots bundle we will include our transaction in
  const bundleSigner = new Wallet(getEnvVariable('BUNDLE_SIGNER_PRIVATE_KEY'), provider);

  // Instantiate the job we are going to work
  const jobToWork = getMainnetSdk(txSigner).exampleJob;

  // Instantiate the flashbots provider to use
  const flashbotsProvider = await FlashbotsBundleProvider.create(provider, bundleSigner);

  // Instantiate the FlashbotsBroadcastor
  const flashbotBroadcastor = new FlashbotsBroadcastor(flashbotsProvider, PRIORITY_FEE, GAS_LIMIT);

  // Call run with the parameters specified above.
  await run(jobToWork, provider, WORK_FUNCTION, flashbotBroadcastor.tryToWorkOnFlashbots.bind(flashbotBroadcastor));
})();
```

**run.ts**
```typescript
import type {providers, Contract} from 'ethers';
import type {Block} from '@ethersproject/abstract-provider';
import {BlockListener, BroadcastorProps} from '@keep3r-network/keeper-scripting-utils';
import {getStrategies} from './batch-requests';

export async function run(
  jobContract: Contract,
  provider: providers.WebSocketProvider | providers.JsonRpcProvider,
  workFunction: string,
  broadcastMethod: (props: BroadcastorProps) => Promise<void>,
) {
  // Instantiate a block listener
  const blockListener = new BlockListener(provider);

  // Listen to each upcoming block
  blockListener.stream(async (block: Block) => {
    // Fetch all strategies
    const allStrategies = await jobContract.strategies();
    // Filter out the non-workable strategies
    // Note: getStrategies implements a multi-call like method to batch many requests into one
    const workableStrategies = await getStrategies(jobContract, allStrategies);
    // Ensure there's something we can work on 
    if (workableStrategies.length === 0) {
      console.info('Found no workable strategies.');
      return
    }

    // Iterate through the workable strategies and try to work the first one
    for (const [_, strategy] of workableStrategies.entries()) {
      try {
        // Broadcast strategy through flashbots
        await broadcastMethod(jobContract, workFunction, [strategy], block);
        break;
      } catch (error: unknown) {
        // console.log any error
        if (error instanceof Error) console.log(`Strategy: ${strategy} failed with:`, error.message);
      }
    }
  });
}
```

And that's it. In about ~60 lines of code you can have a fully competitive and working keeper script.

### BlockListener

To make listening to blocks simple, the library provides the BlockListener class. 

As shown in the code snippet above, all the keeper has to do is instantiate the class and call the `stream` method. If the keeper wants to delete the subscription for any reason, this can be done so in the following manner:

```typescript
import {BlockListener} from '@keep3r-network/keeper-scripting-utils';

const blockListener = new BlockListener();

const clearSubscription = blockListener.stream(async(block: Block) => {
  // ...code

  // kill subscription
  clearSubscription();
})



```