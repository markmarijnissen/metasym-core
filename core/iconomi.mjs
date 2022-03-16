import axios from 'axios';
import axiosRetry from 'axios-retry';
import crypto from 'crypto';
import fastq from "fastq";
import dayjs from "dayjs";
import { sleep } from "../utils/utils.mjs";

// Retry requests 3 times before timing out
axiosRetry(axios, {
  retries: 3,
  retryCondition() {
    return true;
  },
  retryDelay(i) {
    return i < 3 ? 1000 : 60000
  },
});

/**
 * This file handles all API calls to ICONOMI.
 * 
 * To avoid rate-limits, it is implemented as a queue with a little delay (50ms) for every request.
 */

const API_URL = 'https://api.iconomi.com'

export function generateSignature(payload, requestType, requestPath, timestamp) {
  const index = requestPath.indexOf('?')
  if (index != -1) {
    requestPath = requestPath.substring(0, index)
  }
  const textToSign = timestamp + requestType + requestPath + payload;
  if (!timestamp) {
    throw new Error("Missing timestamp");
  }
  if (requestType !== "POST" && requestType !== "GET") {
    throw new Error("Invalid requestType");
  }
  if (!requestPath) {
    throw new Error("Missing requestPath");
  }
  if (!process.env.ICN_API_KEY) {
    throw new Error("Missing ICN_API_KEY");
  }
  if (!process.env.ICN_SECRET) {
    throw new Error("Missing ICN_SECRET");
  }
  return crypto.createHmac('sha512', process.env.ICN_SECRET).update(textToSign).digest("base64");
}

async function apiWorker({ method, api, payload = '', signed = false }) {
  await sleep(10);
  // console.log(`${method} ${api}`);
  let payloadText = '';
  if (method === 'POST') payloadText = JSON.stringify(payload);
  const request = {
    'url': API_URL + api,
    'method': method,
    'headers': {
      'Content-Type': 'application/json'
    },
    timeout: 15000
  }
  if (signed) {
    const timestamp = new Date().getTime();
    const hashSign = generateSignature(payloadText, method, api, timestamp)
    Object.assign(request.headers, {
      'ICN-API-KEY': process.env.ICN_API_KEY,
      'ICN-SIGN': hashSign,
      'ICN-TIMESTAMP': timestamp,
    });
  }
  if (method === 'POST') {
    // request.body = payloadText;
    request.data = payload;
  }
  const res = await axios(request);
  return res.data;
}

const q = fastq.promise(apiWorker, 5);
async function api(method, api, payload = '', signed = false) {
  return await q.push({ method, api, payload, signed });
};
api.get = (url, signed = false) => api('GET', url, '', signed);
api.post = (url, payload, signed = true) => api('POST', url, payload, signed);

const createPriceHistory =  path => {
  return async function pricehistory(ticker, from) {
    const now = dayjs().endOf("day");
    if (!from) from = now.year();
    const queue = [];
    for (let i = dayjs(`${from}-01-01`); i.isBefore(now); i = i.add(1, "year")) {
      const to = i.add(1, "year").isAfter(now) ? now.subtract(1, "day") : i.add(1,"year").subtract(1, "day");
      let res = api.get(`${path}/${ticker}/pricehistory?currency=EUR&granulation=DAILY&from=${i.unix()}&to=${to.unix()}`);
      queue.push(res);
    }
    const results = await Promise.all(queue);
    const result = results[0];
    result.to = results[results.length - 1].to;
    result.values = results.map(r => r.values).flat();
    return result;
  };
}

// Asset
api.assets = ticker => api.get(ticker ? '/v1/assets' : `/v1/assets/${ticker}`);
api.assets.statistics = ticker => api.get(`/v1/assets/${ticker}/statistics`);
api.assets.pricehistory = createPriceHistory('/v1/assets');

// Strategies
api.strategies = function (ticker, signed = false) { return api.get(ticker ? `/v1/strategies/${ticker}` : '/v1/strategies', signed) };
api.strategies.statistics = async function (ticker, signed = false) {
  return await api.get(`/v1/strategies/${ticker}/statistics`, signed);
};
api.strategies.price = async function (ticker, signed = false) {
  return await api.get(`/v1/strategies/${ticker}/price`, signed);
};
api.strategies.structure = async function (ticker, signed = false) {
  return await api.get(`/v1/strategies/${ticker}/structure`, signed);
};
api.strategies.pricehistory = createPriceHistory('/v1/strategies');

export default api;