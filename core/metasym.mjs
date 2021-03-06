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
export const ensureDefaultConfig = (config) => {
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
            excluded: ["USDT", "DAI", "TUSD","USDC"]   // except these assets!
        },
        maReturns: {       // use Moving Average Returns instead of ICONOMI's returns.
            enabled: false,
            n: [0, 0, 7, 30, 30, 30],
            method: "hull"
        },
        normalize: {
            strategy: 1,        // the weight of strategy score as power; 0 = every strategy is equally important; 1 = linear; 2 = quadratic
            asset: 1            // the weight of an asset as power; 0 = how many times it is mentioned; 1 = linear; 2 = quadratic;
        },
        multiplier: {},         // map from { ticker: multiplier }, use to boost/reduce/ignore strategies
        verified: {},           // manually verify strategies to be eligble for METASYM
        minStrategies: 10,
        assetMultiplier: {},     // assets (e.g. coins) can also be boosted/reduced/ignored
        metasymSize: 10,         // how many assets should be in the METASYM strategy?
        etlExpiration: 45,       // how quick should strategy data expire? (in minutes)
        rebalance: {
            min: 60,            // how QUICK is rebalancing allowed? (in minutes)
            max: 7 * 24 * 60,   // how SLOW is rebalancing allowed? (in minutes)
            threshold: 0.0      // how much should the actual and calculated weights differ before rebalancing?
        }
    });

    // Validation - TODO use a proper library or JSON scheme for this, or even typescript...
    validateNumber('diversify.maxWeight', config.diversify.maxWeight, 0, 1);
    validateNumber('metasymSize', config.metasymSize, 3, 1000);
    validateNumber('minStrategies', config.minStrategies, 1, 1000);
    validateNumber('filters.minAUM', config.filters.minAUM, 0, 1000000000);
    validateNumber('filters.minRebalanceCount', config.filters.minRebalanceCount, 0, 1000); 
    config.weights.forEach((w, i) => validateNumber(`weights[${i}]`, w, 0, 100));
    if (_.sum(config.weights) === 0) throw new Error("At least one weight should be more than 0");
    if (config.weights.length !== 6) throw new Error("Expecting 6 weights");
    _.map(config.multiplier, (n, ticker) => validateNumber(`multiplier[${ticker}]`, n, 0, 100));
    _.map(config.assetMultiplier, (n, ticker) => validateNumber(`assetMultiplier[${ticker}]`, n, 0, 100));
    validateBool(config, "filters.verified");
    validateBool(config, "filters.positive");
    validateBool(config, "filters.mature");

    return config;
}

const validateNumber = (name, n, min = 0, max = 1) => {
    if (!_.isNumber(n)) throw new Error(`${name} is not a number`);
    if (n < min) throw new Error(`${name} is less than ${min}`);
    if (n > max) throw new Error(`${name} is more than ${max}`);
}

const validateBool = (config, name) => {
    if (typeof _.get(config, name) !== "boolean") throw new Error(`${name} should be true or false`);
}

// Score the strategies based on a weighted average of the returns.
// Also score the assets in the portfolio by distributing the strategy score according to the asset weight.
// Will use strategy and asset multipliers to subjectively boost/reduce/ignore certain strategies and assets.
export const scoreStrategies = (strategies, config) => {
    if (!strategies || Object.keys(strategies).length < config.minStrategies) {
        throw new Error("missing strategies");
    }
    if (!config) {
        throw new Error("missing config");
    }
    ensureDefaultConfig(config);
    const { mature, verified, positive, minRebalanceCount, minCopiers, minAUM } = config.filters;
    const sumWeights = _.sum(config.weights.map(x => Number(x)));
    const returnFields = ["DAY", "WEEK", "MONTH", "THREE_MONTH", "SIX_MONTH", "YEAR"];

    // Pass 1 - Filter strategies & Calculate scores
    const result = _(strategies)
        .map((s,ticker) => {
            s.ticker = ticker;
            return s;
        })
        // .filter(s => {
        //     // Apply filters
        //     return (!mature || _.has(s,"statistics.returns.THREE_MONTH")) &&
        //         (!verified || config.verified[s.ticker] === true) &&
        //         (minAUM === 0 || s.price.aum >= minAUM) &&
        //         (minRebalanceCount === 0 || s.structure.monthlyRebalancedCount >= minRebalanceCount)
        // })
        .map(s => {
            // Calculate a weighted average based on DAY / WEEK / 1M / 3M / 6M / 1Y returns.
            const returnBaseField = config.maReturns.enabled ? "ma" : "statistics.returns";
            s.score = 0;
            returnFields.forEach((field, i) => {
                s.score += _.get(s, `${returnBaseField}.${field}`,0) * Number(config.weights[i]);
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
            return (!positive || s.rscore > 0) &&
                (!mature || _.has(s, "statistics.returns.THREE_MONTH")) &&
                (!verified || config.verified[s.ticker] === true) &&
                (minAUM === 0 || s.price.aum >= minAUM) &&
                (minRebalanceCount === 0 || s.structure.monthlyRebalancedCount >= minRebalanceCount)
        })
        .sortBy("score")
        .reverse()
        .value();

    // Pass 2 - Normalized & Fraction Scores
    const min = _.minBy(result, "score")?.score || 0;
    const max = _.maxBy(result, "score")?.score || 0;
    const sumScore = _.sum(result.map(s => Math.pow(s.score - min, config.normalize.strategy)));
    const numStrategies = _.filter(result, s => s.score !== 0).length;
    if (_.sumBy(result,"score") === 0 || numStrategies < config.minStrategies) {
        console.warn(`Ensure at least ${config.minStrategies} strategies have config.verified[TICKER] = true and a config.multiplier[ticker] > 0`);
        throw new Error(`Less than ${config.minStrategies} strategies have a score > 0 (${numStrategies})`);
    }

    _.forEach(result, s => {
        // Normalized score [0...1]
        s.nscore = Math.pow(Number((s.score - min) / (max - min) * 1), config.normalize.strategy);

        // Fraction score; the sum of selected strategies is 1 (can be used for visualisation purposes later)
        s.fscore = Number(Math.pow(s.score - min, config.normalize.strategy) / sumScore);

        // Apply normalized and fraction score to the assets.
        s.structure.values.forEach(c => {
            const cmultiplier = _.isNumber(config.assetMultiplier[c.ticker]) ? config.assetMultiplier[c.ticker] : 1.0;
            c.nscore = Math.pow(c.rebalancedWeight * s.nscore * cmultiplier, config.normalize.asset);
            c.fscore = Math.pow(c.rebalancedWeight * s.fscore * cmultiplier, config.normalize.asset);
        });

        const key = "nscore";
        const assetSumScore = _.sumBy(s.structure.values, key);
        s.structure.values.forEach(c => {
            c.normalizedWeight = c[key] / assetSumScore;
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

const round = (x, n = 4) => parseFloat(x.toFixed(n)); // 2 works...

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