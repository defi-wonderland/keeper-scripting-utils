- [Keep3r Scripting Utils](#keep3r-scripting-utils)
    + [Introduction](#introduction)
    + [Glossary](#glossary)
    + [Jobs](#jobs)
    + [Contents](#contents)
    + [Subscriptions](#subscriptions)
    + [Transactions](#transactions)
    + [Flashbots](#flashbots)
    + [Keeper Utils](#keeper-utils)
    + [Retrying Bundles](#retrying-bundles)
  * [Functions](#functions)
    + [`createBundlesWithDifferentTxs`](#transactions)
    + [`createBundlesWithSameTxs`](#transactions)
    + [`formatBundlesTxsToType2`](#transactions)
    + [`getMainnetGasType2Parameters`](#transactions)
    + [`populateTransactions`](#transactions)
    + [`prepareFlashbotBundleForRetry`](#transactions)
    + [`sendAndRetryUntilNotWorkable`](#transactions)
    + [`sendBundlesToFlashbots`](#transactions)
    + [`sendTx`](#transactions)
    + [`flashbots: init`](#flashbots)
    + [`flashbots: send`](#flashbots)
    + [`flashbots: simulateBundle`](#flashbots)
    + [`flashbots: broadcastBundle`](#flashbots)
    + [`flashbots: sendBundle`](#flashbots)
    + [`BlockListener Class`](#subscriptions)
    + [`blockListener: stream`](#subscriptions)
    + [`blockListener: stop`](#subscriptions)
    + [`calculateKP3RNetProfitV1`](#keeper-utils)
    + [`calculateKP3RNetProfitV2`](#keeper-utils)
  * [Return Types](#return-types)
    + [`BundleBurstGroup`](#-bundleburstgroup-)
    + [`GasType2Parameters`](#-gastype2parameters-)
# Keep3r Scripting Utils


### Introduction

Keep3r Scripting Utils provides keepers with a variety of helper functions in order to ease the process of creating a script to work a job. In <DIFFERENT_REPO> we provide examples of how these scripts can be implemented to serve as guidance.

### Glossary

- **Bundle**: A bundle is a Flashbots bundle. It includes one or more transactions aimed to be included together at a specific block. In this library, these transactions are the necessary transactions to work a job.

  ```tsx
  const bundle = {
    targetBlock; // block number to send the bundle to
    txs; // transactions to be executed in this bundle
  }
  ```

- **Batch:** A batch refers to a batch of bundles or many bundles grouped together.

    ```ts
    const bundle = {
    	100; // block number to send the bundle to
    	txs; // transactions to be executed in this bundle
    }

    const bundle1 = {
    	101; // block number to send the bundle to
    	txs; // transactions to be executed in this bundle
    }

    const bundle2 = {
    	102; // block number to send the bundle to
    	txs; // transactions to be executed in this bundle
    }

    const batch = [
    	bundle1,
    	bundle2,
    	bundle3,
    ]
    ```

    Batches are necessary to maximize the probability of our Flashbots bundles being included. It’s important to remember that not all blocks are Flashbots blocks, and even if they’re, our bundles may not be picked up. For this reason, it’s often a good idea to optimistically send bundles to consecutive blocks.

    Note: batches can be a pack of bundles containing the same transaction/s every time but each being sent to different blocks. Because the bundles inside each batch contain the same nonce, once one is included, the rest is dropped.

- **Burst size**: The number of bundles to be included in a batch. For example, if we wanted to work a job at block 100, and we want to maximize our chances of Flashbots including our bundle, we could set a burst size of 3. This would create a batch of bundles to be sent at blocks 100, 101, and 102 respectively.
- **Future Blocks:** The number of blocks into the future to send the first batch of bundles to. Maybe we know a job will be workable on block 100 and we want to be extra careful to not miss it, so we set future blocks to 5. If we do this, when block 95 arrives, the script will create and send the first batch of bundles targeting block 100 in block 95.

&nbsp;
### Jobs

When talking about `job contracts` we will be referring to two different types across this documentation:

- `basic job`: Most basic jobs are just a simple job contract that executes a work function that is in charge of executing one function of another contract. It could be written like this: `1 job => 1 workable contract`
- `complex job`: Some jobs are slightly more complex than just one `work` method in charge of executing one function from one contract. Sometimes one job is in charge of executing the same function but from multiple contracts with the same interface. So maybe you have multiple swapper contracts that all share the same interface and you need a keeper to execute the swap method of your contracts. To achieve that, you don’t need to deploy 3 different jobs contracts, you could have just one job that is able to manage and execute the swap method of each of your swappers. So you probably will have a map of each of the swapper contracts and also a way of tracking when exactly each of these 3 contracts were worked. So we are talking about something like this: `1 job => N workable contracts`

&nbsp;
### Contents

When creating a script to work a job, one important factor to decide how the script will work is whether the chain the job is implemented on supports Flashbots or not. At the time of this release, all existing jobs live on Mainnet, which along with Goerli, are the only chains that currently support Flashbots. Due to this, many of the functions provided by this library are aimed to aid with the creation, modification, and regeneration of correct Flashbots bundles.

Having said that, this library also provides useful functions and example scripts to build scripts that work on non-flashbots chains. This is due to Keep3r going multichain very soon.

Dissecting the library, the helper functions and methods it provides can be divided into four categories:

- [Subscriptions](#subscriptions)
- [Transactions](#transactions)
- [Flashbots](#flashbots)
- [Keeper Utils](#keeper-utils)

&nbsp;
### Subscriptions

Inside the `subscriptions` directory, the library provides helper functions and methods to help with the process of subscribing and unsubscribing from blocks.

Note: Click the functions/classes to find extended descriptions and code snippets.

- [`BlockListener Class`](#blocklistener-class): Class in charge of managing the fetching of blocks and how they are provided across the app and also track the number of subscriptions to it to determine if the class needs to start a new block listener or not. The main idea is to be able to stop listening blocks from the provider if there are no subscriptions to this class.
    - [`stream`](#blocklistener-stream): Called when we want to subscribe to blocks since this function is able to provide a listener for new incoming blocks with all their data. When called, it will register and add a subscription to the tracking count.
    - [`stop`](#blocklistener-stop): Called when a subscription was to unsubscribe from block listening provided by the `stream` function. The class will reduce the subscription count and when the subscriptions count reaches zero again, will stop block fetching from the provider.

&nbsp;
### Transactions

Inside the `transactions` directory, the library provides a variety of functions that aid in the process of populating, formatting, and sending transactions.

Note: Click the functions to find extended descriptions and code snippets.

- [`createBundlesWithDifferentTxs`](#createbundleswithdifferenttxs):  Creates a number of bundles equal to the burst size set. Each bundle will contain different transactions and be sent to consecutive blocks.
- [`createBundlesWithSameTxs`](#createbundleswithsametxs): Creates a number of bundles equal to the burst size set. Each bundle will contain the same transactions and be sent to consecutive blocks.
- [`formatBundlesTxsToType2`](#formatbundlestxstotype2): Formats the transactions in every bundle to type 2.
- [`getMainnetGasType2Parameters`](#getmainnetgastype2parameters): Calculates the `maxFeePerGas` parameter required for a transaction of type 2.
- [`populateTransactions`](#populatetransactions): Populates transactions with their respective data and parameters.
- [`prepareFlashbotBundleForRetry`](#prepareflashbotbundleforretry): Prepares a new batch of bundles after the first bundle of the previous batch failed.
- [`sendAndRetryUntilNotWorkable`](#sendandretryuntilnotworkable): Sends new bundles to different blocks until the job is successfully worked, or another keeper works it.
- [`sendBundlesToFlashbots`](#sendbundlestoflashbots): Sends bundles to Flashbots.
- [`sendTx`](#sendtx): Sends a transaction to the mempool.

&nbsp;
### Flashbots

Inside the `flashbots` directory, the library provides a `Flashbots class` containing all the necessary methods to simulate and send bundles through Flashbots or other providers of private mempools.

Note: Click the functions to find extended descriptions and code snippets.

- [`init`](#flashbots-init): Will initialize and return an instance of a Flashbots class.
- [`send`](#flashbots-send):  Will take the transactions, sign them and form the bundle to be sent. Will also simulate the bundle if the option is provided in initialization. And finally will broadcast the bundle.
- [`simulateBundle`](#flashbots-simulatebundle): Simulates the bundle to see if the transactions in it will go through without reverting.
- [`broadcastBundle`](#flashbots-broadcastbundle): Function in charge of broadcasting the bundle through all the different private relayers providers.
- [`sendBundle`](#flashbots-sendbundle): Function in charge of sending the bundle through the specified private relayer provider.

&nbsp;
### Keeper Utils

Inside the `utils/keeper.ts` directory, the library provides helper functions to calculate the net profit in KP3R when working a job.

- [`calculateKP3RNetProfitV1`](#calculatekp3rnetprofitv1): Calculates the net profit in KP3R a keeper would get for working a job registered in Keep3rV1.
- [`calculateKP3RNetProfitV2`](#calculatekp3rnetprofitv2): Calculates the net profit in KP3R a keeper would get for working a job registered in Keep3rV2.

&nbsp;
### Retrying Bundles

Although this section may sound self-explanatory, it’s one of the most important concepts to grasp in order to use this library to its maximum potential.

Retrying ****bundles means optimistically creating new batches aimed at consecutive blocks to ensure we don’t miss a block that could potentially be a Flashbots block.

For example, we set a burst size of 3, and we send our batch to blocks 100, 101, and 102. There’s a possibility that none of those blocks are Flashbots blocks. This means none of our bundles—and correspondingly the transactions to work the job contained within them—are included.
To avoid a scenario where we miss working a job due to missing a Flashbots block, we retry—or resend—a new batch after knowing whether the first bundle (the one targetting block 100) of the previous batch was included or not. **We repeat the process until we or another keeper works the job**. Here’s an illustrative example of the process:

- 1) Send batch to blocks 100, 101, 102
- 2) Bundle targeting block 100 is not included
- 3) New batch is created targeting blocks 103, 104, and 105 (assuming a burst size of 3)
- 4) Bundles targeting blocks 101 and 102 are not included either.
- 5) Block 103 arrives, and the first bundle of the new batch is not included
- 6) New batch is created targeting blocks 106, 107, and 108.
- 7) Bundle targeting block 104 is included. All other bundles are dropped as they share the same nonce as the one that was included, leaving that nonce to be obsolete, and therefore invalid.

One question that may arise is why don’t I just set a burst size of an absurd number and forget about it? That way there’s no need to generate new batches. There are many reasons not to do this, the most important ones being:

- Not spamming Flashbots.
- Another keeper works the job before we do. This would cause Flashbots’ simulation of whether our bundle will revert or not if included to always fail, and therefore the bundles to never be included (Flashbots, when a bundle’s simulation fails, doesn’t include those bundles as they would revert). Every time we retry sending bundles, we check to see if the job is still workable.
- Wanting to increase the priority fee for consecutive bundles. Because all bundles would be included in the same batch, they would all share the same gas parameters.
- Similar to the prior logic, the maxBaseFee calculated for such a burst size would be absurdly large. This would add an extra layer of unnecessary complexity to profit estimations.

&nbsp;
## Functions
### [`createBundlesWithDifferentTxs`](#transactions)

Creates a number of bundles equal to the burst size set aimed at consecutive target blocks. Each bundle will contain different transactions.

An example of the bundle structure this function creates would be the following: `[ bundle1[tx1], bundle2[tx2], bundle3[tx3] ]`.

**Args**

- `unsignedTxs`: An array of unsigned transactions.
- `burstSize`: The number of bundles to create and send to consecutive blocks.
- `firstBlockOfBatch`: The first block to target for the first bundle. For example, say we are in block 100 and we want to send our bundles to blocks 105, 106, and 107. In that case, block 105 will be the firstBlockOfBatch.

**Return Value**

`BundleBurstGroup[]:` Array containing all created bundles.

**Code Snippet**

```ts
const FIRST_BURST_SIZE = 2;
const FUTURE_BLOCKS = 3;
const firstBlockOfBatch = block.number + FUTURE_BLOCKS;
const txs: TransactionRequest[] = await populateTransactions({
  chainId,
  contract,
  functionArgs: [
    [arg1, arg2],
    [arg1, arg2 + 1],
  ],
  functionName,
  options,
});

const bundles = createBundlesWithDifferentTxs({
  unsignedTxs: txs,
  burstSize: FIRST_BURST_SIZE,
  firstBlockOfBatch,
});

// returns: [bundle1[tx1], bundle2[tx2]]
```

&nbsp;
### [`createBundlesWithSameTxs`](#transactions)

Creates a number of bundles equal to the burst size set aimed at consecutive target blocks. Each bundle will contain the same transactions and be sent to a consecutive block.

An example of the bundle structure this function creates is the following: `[ bundle1[tx1], bundle2[tx1], bundle3[tx1] ]` or `[ bundle1[tx1, tx2], bundle2[tx1, tx2], bundle3[tx1, tx2] ]`

**Args**

- `unsignedTxs`: An array of unsigned transactions.
- `burstSize`: The number of bundles to create and send to consecutive blocks.
- `firstBlockOfBatch`: The first block to target for the first bundle. For example, say we are in block 100 and we want to send our bundles to blocks 105, 106, and 107. In that case, block 105 will be the firstBlockOfBatch.

**Return Value**

`BundleBurstGroup[]:` Array containing all created bundles.

**Code Snippet**

```ts
const FIRST_BURST_SIZE = 2;
const FUTURE_BLOCKS = 3;
const firstBlockOfBatch = block.number + FUTURE_BLOCKS;
const txs: TransactionRequest[] = await populateTransactions({
  chainId,
  contract,
  functionArgs: [
    [arg1, arg2],
  ],
  functionName,
  options,
});

const bundles = createBundlesWithSameTxs({
  unsignedTxs: txs,
  burstSize: FIRST_BURST_SIZE,
  firstBlockOfBatch,
});

// returns: [ bundle1[tx1], bundle2[tx1] ]
```

&nbsp;
### [`formatBundlesTxsToType2`](#transactions)

Formats the transactions within every bundle to type 2.

This function will dynamically calculate the maximum possible base fee in N blocks ahead (this is determined through the `blocksAhead` property) and then calculate the `maxFeePerGas` by adding the `maxBaseFee` to the provided priority fee. If at the time of populating transactions the user provided these fields as part of the `options` parameter, then calling this function won’t be necessary.

**Args**

- `bundlesTxs:` An array of bundles to format to type 2.
- `block`: The current block. This is used to get the current base fee, which is required for the calculation of the `maxBaseFee`.
- `priorityFeeInWei`: The desired priority fee in Wei to use as `maxPriorityFeePerGas`.
- `blocksAhead:` How many blocks ahead to calculate the `maxFeePerGas` for. This parameter usually coincides with the burst size we use for our bundles, as we want to ensure our calculation of the `maxBaseFee` is correct.

**Return Value**

`BundleBurstGroup[]:` Array containing all formatted bundles.

**Code Snippet**

```ts
const FIRST_BURST_SIZE = 2;
const FUTURE_BLOCKS = 3;
const firstBlockOfBatch = block.number + FUTURE_BLOCKS;
const txs: TransactionRequest[] = await populateTransactions({...});
const currentBlock = await provider.getBlock();

const bundles = createBundlesWithSameTxs({
  unsignedTxs: txs,
  burstSize: FIRST_BURST_SIZE,
  firstBlockOfBatch,
});

const formattedBundles = formatBundlesTxsToType2({
  bundlesTxs: bundles,
  block: currentBlock,
  priorityFeeInWei: 10,
  blocksAhead: 2
})

// returns: [ bundle1[tx1], bundle2[tx1] ] where tx1 includes maxPriorityFeePerGas,
//          maxFeePerGas, and type: 2.
```

&nbsp;
### [`getMainnetGasType2Parameters`](#transactions)

Helper function to calculate the `maxFeePerGas` parameter required for a transaction of type 2.

**Args**

- `block`: The current block. This is used to get the current base fee, which is required for the calculation of the maxBaseFee which is then used to calculate `maxFeePerGas`.
- `priorityFeeInWei`: The desired priority fee in Wei. This parameter will be transformed into Gwei and added to `maxBaseFee` to get `maxFeePerGas`.
- `blocksAhead:` How many blocks ahead to calculate the `maxFeePerGas`. This parameter usually coincides with the burst size we use for our bundles, as we want to ensure our calculation of the `maxBaseFee` is correct.

**Return Value**

`GasType2Parameters:` An object containing the provided priority fee in Gwei and the calculated `maxFeePerGas`.

**Code Snippet**

```ts
const FIRST_BURST_SIZE = 2;
const FUTURE_BLOCKS = 3;
const firstBlockOfBatch = block.number + FUTURE_BLOCKS;
const currentBlock = await provider.getBlock();

// get the parameters
const { priorityFeeInGwei, maxFeePerGas } = getMainnetGasType2Parameters({
  block: currentBlock,
  blocksAhead,
  priorityFeeInWei: 10,
});

// pass them into the options object
const options = {
  gasLimit: 10_000_000,
  nonce: currentNonce,
  maxFeePerGas,
  maxPriorityFeePerGas: priorityFeeInGwei,
  type: 2,
};

// add the optional options field to populateTransactions
const txs: TransactionRequest[] = await populateTransactions({
  chainId,
  contract: jobInstance,
  functionArgs: [[200]],
  functionName: 'work',
  options,
});

// returns the transactions with all the parameters needed for type 2

```

&nbsp;
### [`populateTransactions`](#transactions)

Helper function to populate transactions with their respective data and parameters.

**Args**

- `contract`: An instance of the contract we wish to call.
- `functionName`: The name of the function we wish to call.
- `functionArgs`: The arguments for the different transactions we want to populate. The function arguments must be provided as an array of arrays, each array containing the arguments for a different transaction in case transactions with different data are needed. If this were the case, ensure `functionArgs`' length is the same as the burst size. For example: if we were to send `[ [arg1, arg2], [arg3, arg4] ]` as `functionArgs`, the resulting transactions would be:
`[ tx1[arg1, arg2], tx2[arg3, arg4] ]` and we would need a burst size of 2.
- `chainId:` The chainId of the network to which we will be sending our bundles.

**Return Value**

`TransactionRequest[]`: Array of populated transactions.

**Code Snippet**

```ts
const FIRST_BURST_SIZE = 2;
const FUTURE_BLOCKS = 3;
const firstBlockOfBatch = block.number + FUTURE_BLOCKS;
const currentBlock = await provider.getBlock();

// get the parameters
const { priorityFeeInGwei, maxFeePerGas } = getMainnetGasType2Parameters({
  block: currentBlock,
  blocksAhead,
  priorityFeeInWei: 10,
});

// pass them into the options object
const options = {
  gasLimit: 10_000_000,
  nonce: currentNonce,
  maxFeePerGas,
  maxPriorityFeePerGas: priorityFeeInGwei,
  type: 2,
};

// add the optional options field to populateTransactions
const txs: TransactionRequest[] = await populateTransactions({
  chainId,
  contract: jobInstance,
  functionArgs: [[200]],
  functionName: 'work',
  options,
});

// returns the populated transactions with all the parameters needed for type 2

```

&nbsp;
### [`prepareFlashbotBundleForRetry`](#transactions)

Helper function to prepare a new batch of bundles after the previous batch failed.

An important note regarding this function: users won't probably need it, but users should understand it. This is the core function inside `sendAndRetryUntilNotWorkable`, which is the function that handles the recursion required to send batch after batch until we or another keeper works the job.

Due to how recursion works, and the dynamic nature of certain bundles, it's complicated if not impossible for us to be certain of what the transactions within the bundles of new batches will require.

For example, imagine there's a job that requires one argument of their `work()` function to always coincide with the current block number. When we populate the transactions for our first batch, we would take this into account and create a batch that looks like this:

- Current block: 95
- Bundle1: `{ populatedTx1, targetBlock: 100 }` where populatedTx1 has been populated with block 100 as a parameter (so that it satisfies the condition that the argument of `work()` coincides with the `block.number`).
- Bundle2: `{ populatedTx2, targetBlock: 101 }` where populatedTx2 has been populated with block 101 as a parameter.
- Bundle3: `{ populatedTx3, targetBlock: 102 }` where populatedTx3 has been populated with block 102 as a parameter.

So far we are good. This would work if any of our bundles are included. However, due to the nature of Flashbots, we want to be extra careful to ensure a streak of non-flashbot blocks doesn't ruin our possibilities of working a job, so just in case we apply our Bundle Retry mechanism. This means that if the first bundle in our batch fails, we optimistically prepare and send a new batch for blocks 103, 104, and 105.

Here's where some issues arise. When creating the new batch, the function doesn't have a way of knowing exactly how the transactions inside the new bundles should be populated. Should it populate them with the same data as the transactions in the previous batch? Should it perform some crazy calculation after a specific block? Should it follow the same `block.number` and `targetBlock` matching pattern of the previous transactions?

Because the function needs to know what logic to implement when generating a new batch of bundles, we allow the user to provide the arbitrary 'regeneration' logic used to populate the transactions of the new batch in the shape of a callback function called `regenerateTxs`. If this parameter is not provided, the function will assume the transactions within the bundles of each batch are identical to the transactions within the bundles of the previous batch.

This solves the issue of how to populate the new transactions. However, we still don't know if the bundles containing those new transactions should be formatted the same way as we formatted the previous bundles. Will the new bundle contain single, identical transactions? Or will the new bundle contain multiple different transactions?

To solve this, we also provide the user with the option of specifying what function to use to format the new bundles. The argument that handles this is: `bundleRegenerationMethod` and it defaults to the function `createBundlesWithSameTxs`

Lastly, perhaps the user wants to dynamically calculate the priority fee that the bundles in his next batch will use instead of providing a fixed one. Again, we can't know what logic the user will use to calculate this dynamic priority fee, so we allow the user to provide us with a callback function that returns the new priority fee to use, and a boolean value indicating the script whether it should create that new batch or discard it completely, escaping the recursion and restarting the entire process from the beginning. The callback to do this is called `recalculatePriorityFeeInWei`. If this is not provided, the function will use the static priority fee provided in the `priorityFee` parameter.

It's important to note that all of these parameter are optional and used only for complex jobs. As of writing this, yearn's stealthRelayer jobs are the only ones that require regenerating transactions.

Most jobs are simple, and require a single transaction within each bundle, and that transaction is often the same for all bundles. For this reason, if the `regenerateTxs` and `bundleRegenerationMethod` parameters are not provided, the function will default to the simple, most common scenario.

In the simple scenario, the batches are identical except for the target blocks, and so are the bundles. They look like this:

```ts
  batchOne = [
    bundle1 = { tx1, targetBlock: 100 },
    bundle2 = { tx1, targetBlock: 101 },
    bundle3 = { tx1, targetBlock: 102 }
    ]

  batchTwo = [
    bundle4 = { tx1, targetBlock: 103 },
    bundle5 = { tx1, targetBlock: 104 },
    bundle6 = { tx1, targetBlock: 105 }
  ]
```

**Args**

- `txs`: An array of our previously sent transactions.
- `provider`: A provider. It will be used to fetch specific blocks and get the latest nonce.
- `signer`: A signer. It will be used to sign the new transactions.
- `priorityFeeInWei`: The priority fee in wei we would like to use in our next batch of bundles.
- `notIncludedBlock`: The target block of our first non-included bundle.
- `previousBurstSize`: The burst size we used the first time we send our bundles.
- `newBurstSize`: The new burst size we would like to use when retrying to work the job.
- `regenerateTxs`: An optional callback function that generates the new set of transactions to be included in the next retry bundles. If not provided, the new bundles will use the previous set of transactions provided on the transactions parameter.
- `bundleRegenerationMethod`: An optional parameter instructing what bundle creation method we should use to create the new bundles. Defaults to `createBundlesWithSameTxs`.
- `recalculatePriorityFeeInWei`: An optional callback function instructing what priority fee should the new batch of bundles use, along with whether it should use that priority fee or discard the new batch and restart execution. If not provided bundles will use the value provided in the `priorityFeeInWei` parameter to `sendAndRetryUntilNotWorkable`.

**Code Snippet**

Due to this function being used exclusively inside `sendAndRetryUntilNotWorkable`, I will provide a simplified snippet of how it looks inside it.

```ts
export async function sendAndRetryUntilNotWorkable(props: SendAndRetryUntilNotWorkableProps): Promise<boolean> {
	const { bundles, flashbots, isWorkableCheck } = props;

    // checks if job is still workable, returns otherwise
	const jobIsStillWorkable = await isWorkableCheck();
	if (!jobIsStillWorkable) {
		console.log('Job is not workable');
		return false;
	}

    // sends a batch to flashbots, returns whether or not the bundle in the first batch was included
	const firstBundleIncluded = await sendBundlesToFlashbots(bundles, flashbots);

    // if it was included, we return in order to exit recursion and restart the process
	if (firstBundleIncluded) return true;

	/*
       if it wasn't included, then this creates a new batch to retry working the job. It does this providing prepareFlashbotsBundleForRetry with all the necessary parameters to calculate the first target block of first bundle in the next batch, as well as the parameters needed to regenerate transactions, format the new bundles, and recalculate gas parameters.
    */
	const retryBundle = await prepareFlashbotBundleForRetry({
		...props,
		notIncludedBlock: bundles[0].targetBlock,
		previousBurstSize: bundles.length,
	});

    // early return if a bundle in the previous batch was included
	if (!retryBundle) {
		return false;
	}

    // recursive call, passing the retryBundle to do the new calculations.
	return sendAndRetryUntilNotWorkable({
		...props,
		bundles: retryBundle as BundleBurstGroup[],
	});
}

```

**Return Value**

`Promise<BundleBurstGroup[] | boolean>`: Array of bundles formatted to type 2, or a boolean when a bundle in a previous batch is included and another batch with the same nonce has been sent to blocks that have not arrived yet.

&nbsp;
### [`sendAndRetryUntilNotWorkable`](#transactions)

Sends new bundles to different target blocks until the job is successfully worked, or another keeper works it. If the last batch was sent to blocks 100, 101, 102, and 100 was not included, a new batch will be created and sent to blocks 103, 104, and 105 (assuming a `newBurstSize` of 3) if the job is still workable.

`sendAndRetryUntilNotWorkable` is a recursive function, and the main function behind the Bundle Retry mechanism. Recursion is a complicated concept to understand. Here when we say this is a recursive function, we mean that this function calls itself until some condition is met. In other words, it will try to send consecutive batches and try to work a job until something tells the function to stop. The conditions that stop the recursion are:

- The job we are trying to work is worked by us, or another keeper. Which can also be understood as the job not being workable anymore.
- Having a bundle in a previous batch included.
- Instructing the function through the `recalculatePriorityFeeInWei` to discard the new batch and retry the entire script execution.

One large part of `sendAndRetryUntilNotWorkable`'s logic is `prepareFlashbotBundleForRetry`, so I recommend reading what that function does to have a deep understanding of what can be accomplished with this function.

**Args**

- `txs`: The transactions to be retried if nothing is provided in the `regenerateTxs` parameter.
- `provider`: A provider. It will be used to fetch the block in which the first bundles of our batches were not included.
- `priorityFee`: The priority fee to be paid to the miner.
- `bundles`: The batches of bundles to send to Flashbots.
- `newBurstSize`: Amount of consecutive blocks we want to send the transactions to try to work the job.
- `flashbots`: An instance of Flashbots.
- `signer`: A signer.
- `isWorkableCheck`: A callback to the function that checks the workability of the job we are trying to work.
- `regenerateTxs`: An optional callback function that generates the new set of transactions to be included in the next retry bundles. If not provided, the new bundles will use the previous set of transactions provided on the `txs` parameter.
- `bundleRegenerationMethod`: An optional parameter instructing what bundle creation method we should use to create the new bundles. Defaults to createBundlesWithSameTxs.
- `recalculatePriorityFeeInWei`: An optional callback function instructing what priority fee should the new batch of bundles use, along with whether it should use that priority fee or discard the new batch and restart execution. If not provided bundles will use the value provided in the `priorityFeeInWei`parameter.
- `staticDebugId`: Optional static id to help with debugging. Every bundle will share this id.
- `dynamicDebugId`: Optional dynamic id to help with debugging. Every bundle will have a different dynamic id. This dynamic id will be recalculated every time a bundle is created.

**Code Snippet**

```ts
// calculate gas parameters
const { priorityFeeInGwei, maxFeePerGas } = getMainnetGasType2Parameters({
  block,
  blocksAhead,
  priorityFeeInWei: PRIORITY_FEE,
});

// populate options object
const options = {
  gasLimit: 10_000_000,
  nonce: currentNonce,
  maxFeePerGas,
  maxPriorityFeePerGas: priorityFeeInGwei,
  type: 2,
};

      // populate transactions
const txs: TransactionRequest[] = await populateTransactions({
  chainId,
  contract: job,
  functionArgs: [[trigger, 2]],
  functionName: 'complexWork',
  options,
});

// calculate the block that the first bundle in the first batch should target
const firstBlockOfBatch = block.number + FUTURE_BLOCKS;

// create bundles with the populated transactions, the burst size, and the first block of the batch
const bundles = createBundlesWithSameTxs({
  unsignedTxs: txs,
  burstSize: FIRST_BURST_SIZE,
  firstBlockOfBatch,
});

// having calculated this, call sendAndRetryUntiNotWorkable to try and work the job
await sendAndRetryUntilNotWorkable({
  txs,
  provider,
  priorityFeeInWei: PRIORITY_FEE,
  bundles,
  newBurstSize: RETRY_BURST_SIZE,
  flashbots,
  signer,
  isWorkableCheck: () => job.complexWorkable(trigger),
});

```

**Return Value**

`Promise<boolean>`: A boolean to know whether the bundle was included or not


&nbsp;
### [`sendBundlesToFlashbots`](#transactions)

Sends bundles to Flashbots and other specified private relayer providers. These other private relayers should be included at the time of instantiating the Flashbots instance. This function Returns whether or not the first bundle was included. The reason to only return the response of the first bundle is that we want to always start building the next batch of bundles as soon as the first bundle of the batch fails. This is to ensure our batches cover all possible blocks until the job is worked.

**Args**

- `bundles`: The bundles to send to Flashbots.
- `flashbots`: An instance of Flashbots.
- `staticDebugId`: Optional static id to help with debugging. Every batch will share this id.
- `dynamicDebugId`: Optional dynamic id to help with debugging. Every batch will have a different dynamic id. This dynamic id will be recalculated every time a bundle is created.

**Code Snippet**
This function is mostly used inside `sendAndRetryUntilNotWorkable`, so I will show a snippet of how it's used inside that function. It's straightforward.

```ts
export async function sendAndRetryUntilNotWorkable(props: SendAndRetryUntilNotWorkableProps): Promise<boolean> {
	const { bundles, flashbots, isWorkableCheck, staticDebugId, dynamicDebugId } = props;

    // checks if job is still workable, returns otherwise
	const jobIsStillWorkable = await isWorkableCheck();
	if (!jobIsStillWorkable) {
		console.log('Job is not workable');
		return false;
	}

    // sends a batch to flashbots, returns whether or not the bundle in the first batch was included
	const firstBundleIncluded = await sendBundlesToFlashbots(bundles, flashbots, staticDebugId, dynamicDebugId);

    // if it was included, we return in order to exit recursion and restart the process
	if (firstBundleIncluded) return true;

    /*
       if it wasn't included, then this creates a new batch to retry working the job. It does this by providing prepareFlashbotsBundleForRetry with all the necessary parameters to calculate the first target block of the first bundle in the next batch, as well as the parameters needed to regenerate transactions, format the new bundles, and recalculate gas parameters.
    */
	const retryBundle = await prepareFlashbotBundleForRetry({
		...props,
		notIncludedBlock: bundles[0].targetBlock,
		previousBurstSize: bundles.length,
		id: bundles[0].id,
	});

    // early return if a bundle in the previous batch was included
	if (!retryBundle) {
		return false;
	}

    // recalculate the DynamicId to use for the next batch
	const recalculatedDynamicId = makeid(5);

    // recursive call, passing the retryBundle to do the new calculations.
	return sendAndRetryUntilNotWorkable({
		...props,
		bundles: retryBundle as BundleBurstGroup[],
		dynamicDebugId: recalculatedDynamicId,
	});
}

```

**Return Value**

`Promise<boolean>`: A boolean to know whether the bundle was included or not.

&nbsp;
### [`sendTx`](#transactions)

Sends a transaction to the public mempool. This method should be used on chains that don't support Flashbots. Otherwise, sending through Flashbots can be a safer option to avoid reverts.

**Args**

- `contractCall`: A callback method for the function to call on-chain.
- `explorerUrl`: The url of the explorer of the chain to which the transaction will be sent.

**Code Snippet**

```ts
// get recommended maxFeePerGas and maxPriorityFeePerGas from an service like blocknative
const gasFees = await gasService.getGasFees(chainId);

// populate the optional parameters the transaction will have
const options: Overrides = {
    gasLimit: 10_000_000,
    maxFeePerGas: toGwei(Math.ceil(gasFees.maxFeePerGas)),
    maxPriorityFeePerGas: toGwei(Math.ceil(gasFees.maxPriorityFeePerGas)),
    type: 2,
};

// establish what is the url of the scanning tool of your chosen blockchain
const explorerUrl = '<https://polygonscan.com>';

/*
    send the transaction populating it with the parameters required for type 2. Passing the parameters for type 2 is optional, though. This function will still work for transactions of type 0.
*/
await sendTx({
    contractCall: () =>
        job.work(strategy, trigger, 10, {
            ...options,
        }),
    explorerUrl,
});

```

**Return Value**

`Promise<TransactionReceipt>`: A promise containing a transaction receipt.

&nbsp;
### [`flashbots: init`](#flashbots)

Will initialize and return a new instance of a Flashbots class.

**Args**

- `txSigner`: Instance of signer to sign the required transactions.
- `bundleSigner`: Instance of a bundle signer.
- `provider`: The provider of the network to which we will be sending our bundles.
- `flashbotRelayers`: Array of private relayer providers urls. Flashbot provider should always be first in the array. For example: `['flashbots.relayer.com', 'eden.replayer.com']`
- `simulateBundle`: Flag that determines if the bundles are going to be simulated before being sent.
- `chainId`: The chainId of the network to which we will be sending our bundles.

**Return Value**

`Flashbots`: New instance of a Flashbots class.

**Code Snippet**

```ts
const RETRY_BURST_SIZE = 3;
const SIMULATIONS_ON = true;
const provider = new providers.WebSocketProvider(nodeUrl);

// Get a flashbots class instance.
const flashbots = await Flashbots.init(signer, new Wallet(FLASHBOTS_PK), provider, [FLASHBOTS_RPC], SIMULATIONS_ON, chainId);

...
...
...

// Start trying to work the job passing flashbots as argument
await sendAndRetryUntilNotWorkable({
	txs,
	provider,
	priorityFeeInWei: PRIORITY_FEE,
	bundles,
	newBurstSize: RETRY_BURST_SIZE,
	flashbots,
	signer,
	isWorkableCheck: async () => await job.basicWorkable(),
});

...
```

&nbsp;
### [`flashbots: send`](#flashbots)

This is the main and probably only function that should be used to send a bundle. It uses every function inside flashbots class to form, test and send a bundle:
1) Will take the transactions, sign them and form the bundle to be sent.

2) Will simulate the bundle using the function `simulateBundle` if simulations are enabled.

3) Will broadcast the bundle to all the relayer provider using the function `broadcastBundle`.

**Args**

- `unsignedTxs`: Array of unsigned transactions that will form the bundle.
- `targetBlock`: The block in which the bundle should be included and mined.
- `staticDebugId`: Optional static id to help with debugging. Every bundle will share this id.
- `dynamicDebugId`: Optional dynamic id to help with debugging. Every bundle will have a different dynamic id. This dynamic id will be recalculated every time a bundle is created.

**Return Value**

`boolean`: A boolean that says if the bundle was successfully included and mined or not.

**Code Snippet**

```ts
async send(
  unsignedTxs: TransactionRequest[],
  targetBlock: number,
  staticDebugId?: string,
  dynamicDebugId?: string
): Promise<boolean> {

  // 1. prepare txs and bundle
  const signedTxs = await Promise.all(unsignedTxs.map((unsignedTx) => this.txSigner.signTransaction(unsignedTx)));
  const bundle: FlashbotsBundleRawTransaction[] = signedTxs.map((signedTransaction) => ({
    signedTransaction,
  }));

  // 2. simulate bundle if needed
  const simulationPassed = this.shouldSimulateBundle
    ? await this.simulateBundle(this.flashbotsProviders[0], bundle, targetBlock)
    : true;

  if (simulationPassed) {
    // 3. start the process of actually sending the bundle.
    return this.broadcastBundle(this.flashbotsProviders, bundle, targetBlock, staticDebugId, dynamicDebugId);
  }

  return false;
}

```

&nbsp;
### [`flashbots: simulateBundle`](#flashbots)

Simulates the bundle on the flashbots provider to see if the transactions in it will go through without reverting. In case of the simulation reverts, the bundle will not be send to the relayer providers.
This function can be enabled or disabled when creating a new instances of the class Flashbots with the `init` method.

**Args**

- `provider`: Private relayer provider instance.
- `bundle`: The bundle that should be simulated.
- `targetBlock`: The block number where the bundle should be simulated.

**Return Value**

`boolean`: A boolean that says if the bundle simulation passed without reverts.

&nbsp;
### [`flashbots: broadcastBundle`](#flashbots)

Function in charge of broadcasting the bundle through all the different relayer providers at the same time. It will iterate through every relayer provider and send the bundle to each of them calling the function `sendBundle`. Will also wait for every response and look if any of them were successfully included in the target block.

**Args**

- `provider`: Private relayer provider instance.
- `bundle`: The bundle that should be simulated.
- `targetBlock`: The block number where the bundle should be included and mined.
- `staticDebugId`: Optional static id to help with debugging. Every bundle will share this id.
- `dynamicDebugId`: Optional dynamic id to help with debugging. Every bundle will have a different dynamic id. This dynamic id will

**Return Value**

`boolean`: A boolean that says if the bundle was successfully included and mined in any private relayer or not.

&nbsp;
### [`flashbots: sendBundle`](#flashbots)

This is the final step in the process of sending a bundle where the actual bundle is sent to be included and mined. The relayer provider to use will be the one that is received as a parameter `provider`.  Will send the bundle and wait for its resolution. Depending on the type of resolution it gets, it will return if the bundle was included or not.

**Args**

- `provider`: Private relayer provider instance.
- `bundle`: The bundle that should be simulated.
- `targetBlock`: The block number where the bundle should be included and mined.
- `staticDebugId`: Optional static id to help with debugging. Every bundle will share this id.
- `dynamicDebugId`: Optional dynamic id to help with debugging. Every bundle will have a different dynamic id. This dynamic id will

**Return Value**

`boolean`: A boolean that says if the bundle was included in the provided private relayer or not.

&nbsp;
### [`BlockListener Class`](#subscriptions)

Class in charge of managing the fetching of blocks and how they are provided across the app. It also **tracks** the amount of subscriptions to it to determinate when start or stop fetching blocks from provider.
There’s two cases or scenarios to this:
- If subscription `counter` is zero: it will stop fetching blocks from the network provider.
- If subscription `counter` is more than zero: it will have a unique block listener from the network provider.

Also this class is smart enough to recognize when `counter` goes from 0 to 1 and start fetching blocks from provider again.

And will also recognize when `counter` reaches zero again and stop fetching blocks from provider.
A good example to see how this is useful:
**Example A**: Think that you have a job that needs to be worked, but this job has a cooldown of 6 hours and you also know when was the last time this job was worked. So our scripts can dynamically calculate how much time we need to wait for this job to be workable again. And in that window of time there’s no point for us to keep fetching blocks from the provider because we already know that the job is **on** cooldown. So what we should do is to set up some sort of timer and once that timer finishes we start listening for blocks again with the `stream` function provided in this class.

**Example B**: Same as example A but this time we have 3 different jobs running at the same time, each of them with same cooldown logic but different time windows. So to achieve this we will use one subscription to `stream()` **for each of them** when workable. The logic of our scripts will be pretty similar so we can say that if at least one of the jobs is **off** cooldown (aka ready to work) we will need the blockListener class to still be fetching new blocks from the network provider, that’s why we need to keep track of how many subscriptions to `stream()` function we have using the `counter` property. And as soon as we see that job goes **on** cooldown again (maybe you work it, maybe someone else) we would call the `stop()` function and the function will decrease and check how many subscriptions does it still have. If zero, it means that no piece of our code is currently in need of getting new blocks. But if is not zero, then that means theres another job in your script that still is workable and needs blocks to keep coming.

So we will be combining the `stream` and `stop` methods to ensure that we listen to blocks only when we know the job or jobs are probably gonna be workable.

**Constructor** **Args**

- `provider`: Provider of the network.

**Variables**

- `count`: Amount of live subscriptions to block$ observable.
- `block$`: Observable in charge of emitting and providing new Blocks.
- `subs`: Array of class’s internal subscriptions. This is not related to subscriptions to `stream` method.

**Functions**

Note: Click the functions to find extended descriptions and code snippets.

- `stream`: Called when we want to subscribe to blocks since this function is able to provide a listener for new incoming blocks with all their data. When called, it will register and add a subscription to the tracking count.
- `stop`: Called to notify the blockListener class that one of the subscriptions to `stream` will be stopped. Class will reduce the subscription count and when subscriptions count reaches zero, will stop fetching blocks from provider.

**Code Snippet**

```tsx
const provider = new providers.WebSocketProvider(nodeUrl);
const blockListener = new BlockListener(provider);

blockListener.stream.subscribe((block: Block) => {
  // ...
  // do stuff every time a new block arrives.
  // ...

  const shouldStop = x == y // some custom logic
  if (shouldStop) {
    // notify to blockListener class that you will stop listening blocks
    blockListener.stop();
  }
});
```

&nbsp;
### [`blockListener: stream`](#subscriptions)

Called when we want to subscribe to blocks since this function is able to provide a listener for new incoming blocks with all their data. Function will increase the subscriptions `counter` to keep track of them.

Note: we recommend reading the `Block Listener Class` documentation.

**Args**

- `debugId`: Optional id to help with debugging.

**Return value**

`Observable<Block>`: An observable that emits blocks.

**Code Snippet**

```tsx
const provider = new providers.WebSocketProvider(nodeUrl);
const blockListener = new BlockListener(provider);

blockListener.stream.subscribe((block: Block) => {
  ...
  // do stuff every time a new block arravies.
  ...
  block.number
  block.baseFeePerGas
  block.timestamp
  ...

});
```

&nbsp;
### [`blockListener: stop`](#subscriptions)

Called to notify the blockListener class that one of the subscriptions to `stream` will be stopped. Class will reduce the subscription count and when subscriptions count reaches zero, will stop fetching blocks from provider.

Note: we recommend reading the `Block Listener Class` documentation.

**Args**

- `debugId`: Optional id to help with debugging.

**Code Snippet**

```tsx
const provider = new providers.WebSocketProvider(nodeUrl);
const blockListener = new BlockListener(provider);

blockListener.stream.subscribe((block: Block) => {
  // ...
  // do stuff every time a new block arrives.
  // ...

  const shouldStop = x == y // some custom logic
  if (shouldStop) {
    // notify to blockListener class that you will stop listening blocks
    blockListener.stop();
  }
});
```

&nbsp;
### [`calculateKP3RNetProfitV1`](#keeper-utils)

Calculates the net profit in KP3R a keeper would get for working a job registered in Keep3rV1.

This function should only be used for mainnet jobs that pay in KP3R or bonded KP3R. The main use of this function is to use it after a simulation and before sending the bundles to gauge whether working would be profitable or not with that priority fee.

**Args**

- `txHash`: Hash of the transaction in which the keeper worked the job.
- `keep3rHelper`: Instance of the keep3rHelper contract.
- `provider`: The provider to use to make a call to the keep3rHelper contract.

**Code Snippet**

```ts
const keeperAddress = 'YOUR_KEEPER_ADDRESS'
const provider = new providers.WebSocketProvider(ENV_RPC_URL);

const keep3rHelper = new Contract('KEEP3R_HELPER_ADDRESS', KEEP3R_HELPER_ABI, provider)
const tx = await simulateTx(tx)
const netProfit = calculateKP3RNetProfitV1(tx.hash, keep3rHelper, provider)
if (netProfit > 0) {
  // illustrative code.
  return sendAndRetryUntilNotWorkable(...);
};
```

**Returns**
The net profit for working a job denominated in KP3R.

&nbsp;
### [`calculateKP3RNetProfitV2`](#keeper-utils)

Calculates the net profit in KP3R a keeper would get for working a job registered in Keep3rV2.

This function should only be used for mainnet jobs that pay in KP3R or bonded KP3R. The main use of this function is to use it after a simulation and before sending the bundles to gauge whether working would be profitable or not with that priority fee.

**Args**

- `txHash`: Hash of the transaction in which the keeper worked the job.
- `keep3rHelper`: Instance of the keep3rHelper contract.
- `provider`: The provider to use to make a call to the keep3rHelper contract.

**Code Snippet**

```tsx
const keeperAddress = 'YOUR_KEEPER_ADDRESS'
const provider = new providers.WebSocketProvider(ENV_RPC_URL);

const keep3rHelper = new Contract('KEEP3R_HELPER_ADDRESS', KEEP3R_HELPER_ABI, provider)
const tx = await simulateTx(tx)
const netProfit = calculateKP3RNetProfitV2(tx.hash, keep3rHelper, provider)
if (netProfit > 0) {
  // illustrative code.
  return sendAndRetryUntilNotWorkable(...);
};

```

**Returns**
The net profit for working a job denominated in KP3R.

## Return Types

### `BundleBurstGroup`

An object of type BundleBurstGroup contains all the properties of a valid Flashbots bundle.

**Args**

- `targetBlock`: The block to which the bundle will be sent to.
- `txs`: The transactions to include in that bundle.

### `GasType2Parameters`

The required gas parameters to include in a transaction of type 2.

**Args**

- `priorityFeeInGwei`: The priority fee to send with the transaction. Should be expressed in Gwei.
- `maxFeePerGas`: The max fee per gas to send with the transaction.