import 'dotenv/config';
import { MmtSDK, TickMath } from '@mmt-finance/clmm-sdk';
import { Transaction } from '@mysten/sui/transactions';
import { SuiClient, SuiHTTPTransport } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Buffer } from 'buffer';
import Decimal from 'decimal.js';

const TOKENS = {
  USDT: {
    type: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN',
    decimal: 6,
  },
  USDC: {
    type: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    decimal: 6,
  }
};

const POOL = {
  poolId: '0x8a86062a0193c48b9d7c42e5d522ed1b30ba1010c72e0cd0dad1525036775c8b',
  tokenXType: TOKENS.USDT.type,
  tokenYType: TOKENS.USDC.type,
  decimalX: TOKENS.USDT.decimal,
  decimalY: TOKENS.USDC.decimal,
  tickSpacing: 1,
};

const NETWORKS = {
  mainnet: 'https://fullnode.mainnet.sui.io:443',
  testnet: 'https://fullnode.testnet.sui.io:443',
};

const client = new SuiClient({
  transport: new SuiHTTPTransport({ url: NETWORKS[process.env.NETWORK || 'mainnet'] }),
});

const DEFAULT_PRICE = 1.0001;

async function fetchCurrentPrice(sdk, pool) {
  try {
    const poolData = await sdk.Pool.getPool(pool.poolId);
    if (!poolData?.current_sqrt_price) return new Decimal(DEFAULT_PRICE);
    return TickMath.sqrtPriceX64ToPrice(poolData.current_sqrt_price, pool.decimalX, pool.decimalY);
  } catch {
    return new Decimal(DEFAULT_PRICE);
  }
}

async function getAllCoins(coinType: string, owner: string) {
  const result = await client.getCoins({ owner, coinType });
  return result.data || [];
}

async function executeSwap(
  sdk, keypair, address, from, to, pool, slippagePct
) {
  const coinType = from === 'USDT' ? TOKENS.USDT.type : TOKENS.USDC.type;
  const coins = await getAllCoins(coinType, address);
  const amount = coins.reduce((sum, c) => sum + BigInt(c.balance), 0n);
  if (amount === 0n) {
    console.log(`⚠️ Tidak ada saldo ${from} untuk swap.`);
    return;
  }

  const tx = new Transaction();
  let inputCoin = coins[0].coinObjectId;

  if (coins.length > 1) {
    const primary = coins[0].coinObjectId;
    const rest = coins.slice(1).map(c => c.coinObjectId);
    tx.mergeCoins(primary, rest);
    inputCoin = tx.splitCoins(primary, [amount]);
  } else {
    inputCoin = tx.splitCoins(inputCoin, [amount]);
  }

  const isXtoY = from === 'USDT';
  const price = await fetchCurrentPrice(sdk, pool);
  const limitPrice = isXtoY
    ? price.mul(new Decimal(1 - slippagePct / 100))
    : new Decimal(1).div(price).mul(new Decimal(1 - slippagePct / 100));
  const limitSqrt = TickMath.priceToSqrtPriceX64(limitPrice, pool.decimalX, pool.decimalY);

  sdk.Pool.swap(
    tx,
    {
      objectId: pool.poolId,
      tokenXType: pool.tokenXType,
      tokenYType: pool.tokenYType,
      tickSpacing: pool.tickSpacing,
    },
    amount,
    inputCoin,
    isXtoY,
    address,
    limitSqrt
  );

  const result = await client.signAndExecuteTransaction({ signer: keypair, transaction: tx });
  console.log(`✅ Swap ${from} → ${to}: ${result.digest}`);
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const privateKey = process.env.PRIVATE_KEY?.replace(/^0x/, '');
  if (!privateKey || privateKey.length !== 64) throw new Error('PRIVATE_KEY invalid');

  const slippage = parseFloat(process.env.SLIPPAGE_PERCENTAGE || '0.1');
  const keypair = Ed25519Keypair.fromSecretKey(Uint8Array.from(Buffer.from(privateKey, 'hex')));
  const address = keypair.getPublicKey().toSuiAddress();

  const sdk = MmtSDK.NEW({ network: process.env.NETWORK || 'mainnet' });

  for (let i = 1; i <= 100; i++) {
    console.log(`\n🔁 Cycle ${i}/100`);

    try {
      await executeSwap(sdk, keypair, address, 'USDT', 'USDC', POOL, slippage);
      await delay(61000);
      await executeSwap(sdk, keypair, address, 'USDC', 'USDT', POOL, slippage);
    } catch (err) {
      console.error('❌ Swap error:', err.message);
    }

    if (i < 100) {
      console.log('⏳ Waiting 61s before next cycle...');
      await delay(61000);
    }
  }

  console.log('✅ Completed 100 cycles of bidirectional swap.');
}

main();
