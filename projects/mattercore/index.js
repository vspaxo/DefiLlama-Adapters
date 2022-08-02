const axios = require('axios');
const BigNumber = require("bignumber.js");
const { get } = require('../helper/http');
const { RPC_ENDPOINT } = require('../helper/tezos');
const { PromisePool } = require('@supercharge/promise-pool');
const { getTokenBalances } = require('../helper/tezos');

const DATA_URL = 'https://spicya.sdaotools.xyz/api/rest';
const MATTER_CONTRACT = 'KT1K4jn23GonEmZot3pMGth7unnzZ6EaMVjY';

async function grabTokenBalances (contract) {
  const sslp = await getTokenBalances(contract);
  
  return Object.entries(sslp).filter(token => token[1] = new BigNumber(token[1]));
}

async function grabSupply (contract) {
  const supply = await get(`${RPC_ENDPOINT}/v1/contracts/${contract}/bigmaps/token_total_supply/keys?limit=1`);
  
  return new BigNumber(supply[0].value);
}

async function matchToMatter (pool, matterBalances) {
  if(matterBalances.find(balances => balances[0] == pool.contract)) {
    const index = matterBalances.findIndex(i => i[0] === pool.contract);

    pool.matterBalance = matterBalances[index][1];
    pool.totalBalance = await grabSupply(pool.contract);
    
    return pool;
  }
}

async function fetchSpicyPoolsAndMatch () {
  const spicyPools = (await axios(`${DATA_URL}/PoolListAll/`)).data.pair_info;
  const formatted = spicyPools.map(token => ({ contract: token.contract, reservextz: token.reservextz }));
  const matterBalances = await grabTokenBalances(MATTER_CONTRACT);

  const { results, errors } = await PromisePool.withConcurrency(10)
    .for(formatted)
    .process(async (pool) => matchToMatter(pool, matterBalances))

  if (errors && errors.length) {
    throw errors[0];
  }

  return results.filter(result => result);
}

async function fetchFarmsTvl(farms) {
  const { results, errors } = await PromisePool.withConcurrency(10)
    .for(farms)
    .process(async ({reservextz, matterBalance, totalBalance}) => lpToTez(reservextz, matterBalance, totalBalance))

  if (errors && errors.length) {
    throw errors[0]
  }

  return results.reduce((previous, current) => previous.plus(current))
}

async function lpToTez(reservextz, matterBalance, totalBalance) {
  const reserveXtz = new BigNumber(reservextz);
  const tezPerLp = reserveXtz.dividedBy(totalBalance.shiftedBy(-18));

  return tezPerLp.multipliedBy(matterBalance.shiftedBy(-18));
}

async function tvl() {
  const spicyPools = await fetchSpicyPoolsAndMatch();
  const farmsTvl = await fetchFarmsTvl(spicyPools);

  return {
      tezos: farmsTvl.toFixed(0)
  };
}

module.exports = {
    methodology: `TVL counts the liquidity of Matter Core farms..`,
    misrepresentedTokens: true,
    tezos: {
      tvl
    }
}
