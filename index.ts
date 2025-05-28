// index.ts
import 'dotenv/config';
import { getFullnodeUrl, SuiClient } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { fromB64 } from '@mysten/sui.js/utils';
import { buildSwapTransactionPayload, SwapParams, Percentage } from '@mmt-finance/clmm-sdk';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { exec } from 'child_process';

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

const MNEMONIC = process.env.MNEMONIC;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SLIPPAGE_PERCENTAGE = parseFloat(process.env.SLIPPAGE_PERCENTAGE || '0.1');
const DELAY_MS = 61000; // 61 detik
const ITERATIONS = 100;

const client = new SuiClient({ url: getFullnodeUrl('mainnet') });
const keypair = PRIVATE_KEY
  ? Ed25519Keypair.fromSecretKey(fromB64(PRIVATE_KEY))
  : Ed25519Keypair.deriveKeypair({ mnemonic: MNEMONIC! });
const address = keypair.getPublicKey().toSuiAddress();

async function getTokenBalance(coinType: string): Promise<bigint> {
  const balance = await client.getBalance({ owner: address, coinType });
  return BigInt(balance.totalBalance);
}

async function performSwap(inputToken: keyof typeof TOKENS, outputToken: keyof typeof TOKENS) {
  const input = TOKENS[inputToken];
  const output = TOKENS[outputToken];
  const inputBalance = await getTokenBalance(input.type);
  if (inputBalance <= 0n) return console.log(`Saldo ${inputToken} kosong.`);

  const amount = inputBalance;
  const params: SwapParams = {
    pool_id: POOL.poolId,
    coin_in_type: input.type,
    coin_out_type: output.type,
    amount_in: amount.toString(),
    a_to_b: inputToken === 'USDT',
    by_amount_in: true,
    slippage: Percentage.fromDecimal(SLIPPAGE_PERCENTAGE / 100),
  };

  const tx = new TransactionBlock();
  const payload = await buildSwapTransactionPayload(client, tx, params);
  const result = await client.signAndExecuteTransactionBlock({
    transactionBlock: payload,
    signer: keypair,
    options: { showEffects: true },
  });

  console.log(`${inputToken} -> ${outputToken} | Status:`, result.effects?.status.status);
}

(async () => {
  for (let i = 0; i < ITERATIONS; i++) {
    console.log(`\n[${i + 1}/${ITERATIONS}] Swapping USDT -> USDC`);
    await performSwap('USDT', 'USDC');
    console.log(`[${i + 1}/${ITERATIONS}] Delay 61s...`);
    await new Promise((r) => setTimeout(r, DELAY_MS));

    console.log(`\n[${i + 1}/${ITERATIONS}] Swapping USDC -> USDT`);
    await performSwap('USDC', 'USDT');
    console.log(`[${i + 1}/${ITERATIONS}] Delay 61s...`);
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
})();
