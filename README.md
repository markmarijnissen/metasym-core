# METASYM

METASYM, short for META SYMBIOSIS, is a metastrategy for ICONOMI.

This is an alternative implemantation of [Stephen Reid](https://stephenreid.net/metastrategy), in which you can set your own parameters for scoring strategies, and add innovations of your own. (Fork and send PR's!)

## Disclaimer: USE AT YOUR OWN RISK

> This code has **no unit tests** and has **not been audited**. As such, it may throw errors and exit. It may have errors in the calculation and provide inaccurate results, which might not be obvious at first glance. For use in production, there might be security issues (e.g. from third party libraries included). Furthermore, bugs in the ICONOMI api might skew the results or lead to unexpected outcomes. Finally, there might be issues, bugs and considerations that I have not considered. I advice you to extensively test and carefully verify both algorithm and results. This tool is not investment advice and offered for educational purposes only. Therefore, none of the authors, contributors or anyone else connected with this repository, in any way whatsoever, can be responsible for your use of the code contained in this repository. 

## Configuration (Hyperparameters)

When using this tool, a `metasym-config.mjs` file will be created, containinig all parameters you can change:

```js
export default {
    weights: [0, 0, 4, 3, 2, 1], // How to weigh returns for [ DAY, WEEK, 1M, 3M, 6M, 1Y ]
    filters: {
        verified: true,     // strategy must be manually verified
        positive: false,    // strategy score > 0
        mature: false,       // strategy has a 3M return value (suggesting it is >3 M old)
        minRebalanceCount: 0, // minimum rebalance count
        minCopiers: 0,         // minimum copiers
        minAUM: 0,             // minimum assets under management,
    },
    diversify: {            // prevent one asset from becoming dominant
        maxWeight: 1.0,     // max weight per asset
        excluded: ["USDT", "DAI", "TUSD","USDC"]   // except these assets!
    },
    multiplier: {},         // map from { ticker: multiplier }, use to boost/reduce/ignore strategies
    verified: {},           // manually verify strategies to be eligble for METASYM
    minStrategies: 10,
    assetMultiplier: {
        BNB: 0              // assets (e.g. coins) can also be boosted/reduced/ignored 
    },
    metasymSize: 10,         // how many assets should be in the METASYM strategy?
    etlExpiration: 45,       // how quick should strategy data expire? (in minutes)
    rebalance: {
        min: 60,            // how QUICK is rebalancing allowed? (in minutes)
        max: 7 * 24 * 60,   // how SLOW is rebalancing allowed? (in minutes)
        threshold: 0.0      // how much should the actual and calculated weights differ before rebalancing?
    }
}
```

## The Algorithm

See [metasym.mjs](./src/metasym.mjs) for the source code with comments.

## Installation

Install [nodejs](https://nodejs.org/en/) and open a Terminal (MacOS) or PowerShell (Windows).

Type the following commands:

```bash
npm install metasym-core -g
metasym etl                 # load strategies
metastym verify XXX         # verify at least 10 strategies (or change minimum number of strategies in metasym-config.mjs)
metasym rebalance METASYM   # run the rebalance algorithm to calculate weights
```

## Usage

Type `metasym` to get interactive help and see the various commands, such as:

- `metasym config` shows the parameters
- `metasym list` shows all strategies, and the ones you verified
- `metasym verify NAME` verifies a strategy
- `metasym etl` will ETL (extract-transform-load) all strategies to a database
- `metasym rebalance NAME` will calculate the new strategy, use `--save` to perform an actual rebalance.

For rebalncing, you must include the ICONOMI API keys in your environment, or in a `.env` file:

```
ICN_API_KEY=
ICN_SECRET=
STRATEGY=
```