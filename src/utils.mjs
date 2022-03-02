export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const printStructure = structure => console.log(`${structure.ticker}:\n${structure.values.map(v => `- ${v.assetTicker}: ${v.rebalancedWeight}`).join("\n")}`)

