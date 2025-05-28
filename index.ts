import 'dotenv/config';
import { Decimal } from 'decimal.js';
import { SuiClient, getFullnodeUrl, SuiTransactionBlockResponse } from '@mysten/sui';
import { buildSdk, Trade, Percentage } from '@mmt-finance/clmm-sdk';
import { fromHEXKeyPair } from 'navi-sdk/dist/utils/keypair';

const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const SLIPPAGE = new Percentage(Number(process.env.SLIPPAGE_PERCENTAGE || 0.1), 100);

const client = new SuiClient({ url: getFullnodeUrl('mainnet') });
const sdk = buildSdk({ client });

const keypair = fromHEXKeyPair(PRIVATE_KEY);
const address = keypair.getPublicKey().toSuiAddress();

const USDT = '0x...'; // Ganti dengan address coin USDT
const USDC = '0x...'; // Ganti dengan address coin USDC

async function swap(tokenIn: string, tokenOut: string): Promise<SuiTransactionBlockResponse> {
  const pool = await sdk.Pool.getPool(tokenIn, tokenOut);
  const coinInBalance = await sdk.Token.getBalance(address, tokenIn);
  const amountIn = new Decimal(coinInBalance.totalBalance);

  const trade: Trade = {
    pool,
    tokenIn,
    tokenOut,
    amount: amountIn,
    amountSpecifiedIsInput: true,
    slippage: SLIPPAGE,
  };

  const tx = await sdk.Trader.buildSwapTransaction(trade, keypair);
  return await client.signAndExecuteTransactionBlock({ transactionBlock: tx, signer: keypair });
}

(async () => {
  for (let i = 0; i < 100; i++) {
    try {
      console.log(`[${i + 1}/100] Swapping USDT → USDC...`);
      const tx1 = await swap(USDT, USDC);
      console.log('Success:', tx1.digest);

      console.log('Tunggu 61 detik...');
      await new Promise((r) => setTimeout(r, 61000));

      console.log(`[${i + 1}/100] Swapping USDC → USDT...`);
      const tx2 = await swap(USDC, USDT);
      console.log('Success:', tx2.digest);

      console.log('Tunggu 61 detik...');
      await new Promise((r) => setTimeout(r, 61000));
    } catch (err) {
      console.error('Error:', err);
    }
  }
})();
