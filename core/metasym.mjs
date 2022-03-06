import _ from "lodash";

/**
 * This file contains only calculations (logic), and is seperated from input/output.
 * 
 * Input: Data is provided by the etl.mjs module (extract-transform-load) which uses the iconomi.mjs API
 * Output: Rebalancing is done by the rebalancing.mjs module.
 * 
 * General flow of calculations:
 * 
 * 1. scoreStrategies: calculates the score for every strategy (and the score for every asset in that strategy)
 * 2. scoreAssets: pivots the scored strategies to create a list of assets with a score (that is the sum of strategies).
 * 3. metasym: Takes the top N (10) assets and calculates the weights based on the score.
 */

export const validateNumber = (name, n, min = 0, max = 1) => {
    if (!_.isNumber(n)) throw new Error(`${name} is not a number`);
    if (n < min) throw new Error(`${name} is less than ${min}`);
    if (n > max) throw new Error(`${name} is more than ${max}`);
}

export const validateBool = (config, name) => {
    if (typeof _.get(config, name) !== "boolean") throw new Error(`${name} should be true or false`);
}

export const ensureDefaultConfig = (config, strategies) => {
    // const multiplier = {};
    // const verified = {};
    // if (strategies) {
    //     Object.keys(strategies).forEach(ticker => {
    //         multiplier[ticker] = 1.0;
    //         verified[ticker] = null;
    //     })
    // }
    _.defaultsDeep(config, {
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
            excluded: ["USDT", "DAI", "TUSD"]   // except these assets!
        },
        multiplier: {},         // map from { ticker: multiplier }, use to boost/reduce/ignore strategies
        verified: {},           // manually verify strategies to be eligble for METASYM
        minStrategies: 10,
        assetMultiplier: {
            BNB: 0              // assets (e.g. coins) can also be boosted/reduced/ignored 
        },
        metasymSize: 10         // how many assets should be in the METASYM strategy?
    });

    // Validation
    validateNumber('diversify.maxWeight', config.diversify.maxWeight, 0, 1);
    validateNumber('metasymSize', config.metasymSize, 0, 1000);
    validateNumber('minStrategies', config.minStrategies, 1, 1000);
    validateNumber('filters.minAUM', config.filters.minAUM, 0, 1000000000);
    validateNumber('filters.minRebalanceCount', config.filters.minRebalanceCount, 0, 1000); 
    config.weights.forEach((w, i) => validateNumber(`weights[${i}]`, w, 0, 100));
    _.map(config.multiplier, (n, ticker) => validateNumber(`multiplier[${ticker}]`, n, 0, 100));
    _.map(config.assetMultiplier, (n, ticker) => validateNumber(`assetMultiplier[${ticker}]`, n, 0, 100));
    validateBool(config, "filters.verified");
    validateBool(config, "filters.positive");
    validateBool(config, "filters.mature");

    return config;
}

// Score the strategies based on a weighted average of the returns.
// Also score the assets in the portfolio by distributing the strategy score according to the asset weight.
// Will use strategy and asset multipliers to subjectively boost/reduce/ignore certain strategies and assets.
export const scoreStrategies = (strategies, config) => {
    if (!strategies || Object.keys(strategies).length < 400) {
        throw new Error("missing strategies");
    }
    if (!config) {
        throw new Error("missing config");
    }
    const { mature, verified, positive, minRebalanceCount, minCopiers, minAUM } = config.filters;
    const sumWeights = _.sum(config.weights.map(x => Number(x)));
    const returnFields = ["DAY", "WEEK", "MONTH", "THREE_MONTH", "SIX_MONTH", "YEAR"];

    // Pass 1 - Filter strategies & Calculate scores
    const result = _(strategies)
        .map((s,ticker) => {
            s.ticker = ticker;
            return s;
        })
        .filter(s => {
            // Apply filters
            return (!mature || !!s.statistics.returns.THREE_MONTH) &&
                (!verified || config.verified[s.ticker] === true) &&
                (minAUM === 0 || s.price.aum >= minAUM) &&
                (minRebalanceCount === 0 || s.structure.monthlyRebalancedCount >= minRebalanceCount)
        })
        .map(s => {
            // Calculate a weighted average based on DAY / WEEK / 1M / 3M / 6M / 1Y returns.
            s.score = 0;
            returnFields.forEach((field, i) => {
                s.score += (s.statistics.returns[field] || 0) * Number(config.weights[i]);
            });
            const rawscore = s.score / sumWeights;
            s.rscore = rawscore;
            
            // Apply the multiplier to boost/reduce/ignore strategies
            const multiplier = _.isNumber(config.multiplier[s.ticker]) ? config.multiplier[s.ticker] : 1.0;
            s.score = rawscore * multiplier;

            // Distribute the strategy-score over the assets
            s.structure.values.forEach(c => {
                const cmultiplier = _.isNumber(config.assetMultiplier[c.ticker]) ? config.assetMultiplier[c.ticker] : 1.0;
                c.rscore = c.rebalancedWeight * s.rscore;   //rscore = raw score
                c.score = c.rebalancedWeight * s.score * cmultiplier; // score = multiplier score
            });
            return s;
        })
        .filter(s => {
            // Apply filters
            return (!positive || s.rscore > 0);
        })
        .sortBy("score")
        .reverse()
        .value();

    // Pass 2 - Normalized & Fraction Scores
    const min = _.minBy(result, "score")?.score || 0;
    const max = _.maxBy(result, "score")?.score || 0;
    const sumScore = _.sum(result.map(s => s.score - min));
    const numStrategies = _.filter(result, s => s.score !== 0).length;
    if (sumScore === 0 || numStrategies < config.minStrategies) {
        console.warn(`Ensure at least ${config.minStrategies} strategies have config.verified[TICKER] = true and a config.multiplier[ticker] > 0`);
        throw new Error(`Less than ${config.minStrategies} strategies have a score > 0 (${numStrategies})`);
    }

    _.forEach(result, s => {
        // Normalized score [0...1]
        s.nscore = Number((s.score - min) / (max - min) * 1)

        // Fraction score; the sum of selected strategies is 1 (can be used for visualisation purposes later)
        s.fscore = Number((s.score - min) / sumScore);

        // Apply normalized and fraction score to the assets.
        s.structure.values.forEach(c => {
            const cmultiplier = _.isNumber(config.assetMultiplier[c.ticker]) ? config.assetMultiplier[c.ticker] : 1.0;
            c.nscore = c.rebalancedWeight * s.nscore * cmultiplier;
            c.fscore = c.rebalancedWeight * s.fscore * cmultiplier;
        });

    });

    return result;
}

// Pivot the list of scored strategies to a list of assets.
//
// Every asset may be use in zero, one more strategies.
// The asset score is based on the sum of strategies.
//
// USD stable coins are collapsed into USDC to provide a more honest scoring (instead of 'duplicates')
export const scoreAssets = (scoredStrategies) => {
    return _(scoredStrategies)
        .map(s => s.structure.values)
        .flatten()
        .filter(c => !!c.ticker)
        .map(c => {
            c.metasymTicker = c.ticker;
            if (["USDT", "DAI", "TUSD"].indexOf(c.ticker) >= 0) {
                c.metasymTicker = "USDC";
            }
            return c;
        })
        .groupBy("metasymTicker")
        .mapValues(assets => _.sumBy(assets, "nscore"))
        .map((nscore, ticker) => ({ ticker, nscore }))
        .sortBy("nscore")
        .reverse()
        .value();
}

const round = (x,n=2) => parseFloat(x.toFixed(n))

// Take the top N (10) assets from the scored assets list and calculate the weights.
export const metasymFromScoredAssets = (scoredAssets, config) => {
    const assets = _.cloneDeep(scoredAssets.slice(0, config.metasymSize));
    if (assets.length === 0 || assets.length < config.metasymSize) {
        throw new Error(`Less than ${config.metasymSize || 1} assets`);
    }
    const total = _.sumBy(assets, "nscore");
    assets.forEach(c => c.weight = round(c.nscore / total));
    
    if (config.diversify.maxWeight < 1.0) {
        const maxWeight = config.diversify.maxWeight;
        const assetsTooHigh = assets.filter(c => c.weight > maxWeight && config.diversify.excluded.indexOf(c.metasymTicker) < 0);
        const assetsTooHighTotal = _.sumBy(assetsTooHigh, "nscore"); 

        const assetsOK = assets.filter(c => c.weight <= maxWeight);
        const nscorePerPercentagePoint = _.sumBy(assetsOK, "nscore") / (1 - (assetsTooHigh.length * maxWeight));
        const newAssetsTooHighTotal = (assetsTooHigh.length * maxWeight) * nscorePerPercentagePoint;

        const nscoreCorrectionMultiplier = newAssetsTooHighTotal / assetsTooHighTotal;

        assetsTooHigh.forEach(c => c.correctedNscore = c.nscore * nscoreCorrectionMultiplier);
        assetsOK.forEach(c => c.correctedNscore = c.nscore);
        const correctedTotal = _.sumBy(assets, "correctedNscore");
        assets.forEach(c => c.weight = round(c.correctedNscore / correctedTotal));
    } 
    
    const sum = _.sumBy(assets, "weight");
    assets[0].weight = round(assets[0].weight + (1 - sum)); // rounding error correction
    return assets;
}

// Convienence function to perform all calculation steps
export const metasymFromStrategies = (strategies, config) => {
    ensureDefaultConfig(config);
    const scoredStrategies = scoreStrategies(strategies, config);
    const scoredAssets = scoreAssets(scoredStrategies)
    return metasymFromScoredAssets(scoredAssets, config);
}