import { TwitterApi } from 'twitter-api-v2';
import { createPublicClient, encodeFunctionData, formatEther, http, parseEther } from 'viem';
import { arbitrum } from 'viem/chains';
import * as dotenv from 'dotenv';
import {
  dbAcquireTweetLock,
  dbFinalizeDailyBudget,
  dbGetLastSinceId,
  dbRecordTweetFailure,
  dbReserveDailyBudget,
  dbSetLastSinceId,
  dbUpdateReplyStatus,
  dbUpdateTxStatus,
} from './supabase-client';

dotenv.config();

export const DOTI_DOMAIN_PRICE_ETH = process.env.DOMAIN_PRICE_ETH || '0.001';
export const MAX_DAILY_SPEND_ETH = Number(process.env.MAX_DAILY_SPEND_ETH || '0.003');

export const REGISTRY_ABI = [
  {
    inputs: [
      { internalType: 'string', name: 'label', type: 'string' },
      { internalType: 'uint64', name: 'targetChainSelector', type: 'uint64' },
    ],
    name: 'register',
    outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'registrant', type: 'address' },
      { internalType: 'string', name: 'label', type: 'string' },
      { internalType: 'uint64', name: 'targetChainSelector', type: 'uint64' },
      { internalType: 'bytes32', name: 'paymentRequestId', type: 'bytes32' },
      { internalType: 'uint256', name: 'maxTotalCost', type: 'uint256' },
      { internalType: 'uint256', name: 'nonce', type: 'uint256' },
      { internalType: 'uint256', name: 'deadline', type: 'uint256' },
      { internalType: 'bytes', name: 'signature', type: 'bytes' },
    ],
    name: 'registerFor',
    outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'string', name: 'label', type: 'string' },
      { internalType: 'uint64', name: 'targetChainSelector', type: 'uint64' },
      { internalType: 'address', name: 'registrant', type: 'address' },
    ],
    name: 'estimateRegistrationCost',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
    name: 'registry',
    outputs: [
      { internalType: 'bytes32', name: 'domainHash', type: 'bytes32' },
      { internalType: 'string', name: 'canonicalName', type: 'string' },
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'uint64', name: 'activeChainSelector', type: 'uint64' },
      { internalType: 'uint256', name: 'activeTokenId', type: 'uint256' },
      { internalType: 'uint8', name: 'state', type: 'uint8' },
      { internalType: 'uint64', name: 'registrationTimestamp', type: 'uint64' },
      { internalType: 'uint64', name: 'profileVersion', type: 'uint64' },
      { internalType: 'uint64', name: 'ownershipVersion', type: 'uint64' },
      { internalType: 'uint64', name: 'bridgeNonce', type: 'uint64' },
      { internalType: 'uint64', name: 'bridgeValidUntil', type: 'uint64' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'from', type: 'address' }, { internalType: 'address', name: 'to', type: 'address' }, { internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'transferFrom',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'from', type: 'address' }, { internalType: 'address', name: 'to', type: 'address' }, { internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'safeTransferFrom',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'primaryDomains',
    outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export interface ParsedCommand {
  type: 'register' | 'check' | 'transfer' | 'send_eth' | 'balance' | 'my_domains';
  domain?: string;
  to?: string;
  amountEth?: string;
}

export function parseBotCommand(text: string): ParsedCommand | null {
  const clean = text.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();

  // 1. REGISTER / MINT
  const regPattern = /(?:@[\w]+\s+)?(?:!|\/)?(?:register|mint)\s+([a-zA-Z0-9_\-]+)(?:\.i)?(?:\s+to\s+(0x[a-fA-F0-9]{40}))?\b/i;
  const regMatch = clean.match(regPattern);
  if (regMatch) {
    const raw = regMatch[1].replace(/\.i$/i, '').toLowerCase().trim();
    const toAddress = regMatch[2];
    if (raw && raw !== 'name' && raw !== 'your' && raw.length >= 1 && raw.length <= 64) {
      return { type: 'register', domain: `${raw}.i`, to: toAddress };
    }
  }

  // 2. CHECK / AVAILABILITY
  const checkPattern = /(?:@[\w]+\s+)?(?:!|\/)?(?:check|is available|lookup|avail)\s+([a-zA-Z0-9_\-]+)(?:\.i)?\b/i;
  const checkMatch = clean.match(checkPattern);
  if (checkMatch) {
    const raw = checkMatch[1].replace(/\.i$/i, '').toLowerCase().trim();
    if (raw && raw !== 'name' && raw.length >= 1 && raw.length <= 64) {
      return { type: 'check', domain: `${raw}.i` };
    }
  }

  // 3. TRANSFER DOMAIN
  const transPattern = /(?:@[\w]+\s+)?(?:!|\/)?(?:transfer)\s+([a-zA-Z0-9_\-]+)(?:\.i)?\s+to\s+(0x[a-fA-F0-9]{40})/i;
  const transMatch = clean.match(transPattern);
  if (transMatch) {
    const raw = transMatch[1].replace(/\.i$/i, '').toLowerCase().trim();
    const to = transMatch[2];
    if (raw && raw.length >= 1) {
      return { type: 'transfer', domain: `${raw}.i`, to };
    }
  }

  // 4. SEND ETH
  const sendPattern = /(?:@[\w]+\s+)?(?:!|\/)?send\s+([0-9\.]+)\s+eth\s+to\s+(0x[a-fA-F0-9]{40})/i;
  const sendMatch = clean.match(sendPattern);
  if (sendMatch) {
    const amountEth = sendMatch[1];
    const to = sendMatch[2];
    if (Number(amountEth) > 0) {
      return { type: 'send_eth', amountEth, to };
    }
  }

  // 5. BALANCE
  if (/(?:@[\w]+\s+)?(?:!|\/)?(?:balance|my balance)\b/i.test(clean)) {
    return { type: 'balance' };
  }

  // 6. MY DOMAINS
  if (/(?:@[\w]+\s+)?(?:!|\/)?(?:my domains|domains|portfolio)\b/i.test(clean)) {
    return { type: 'my_domains' };
  }

  return null;
}

/**
 * Fetch Privy User by Twitter Username with pagination support
 */
async function getPrivyWalletByTwitter(
  username: string,
  appId: string,
  appSecret: string
): Promise<{ walletAddress?: string; walletId?: string; privyUserId?: string } | null> {
  if (!appId || !appSecret || !username) {
    return null;
  }

  try {
    const cleanUsername = username.replace(/^@/, '').toLowerCase().trim();
    const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString('base64');
    let cursor: string | null = null;
    let maxPages = 5;

    while (maxPages > 0) {
      maxPages--;
      const url = cursor 
        ? `https://auth.privy.io/api/v1/users?cursor=${encodeURIComponent(cursor)}&limit=50`
        : `https://auth.privy.io/api/v1/users?limit=50`;

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'privy-app-id': appId,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) return null;

      const data: any = await res.json();
      const users: any[] = data?.data || (Array.isArray(data) ? data : []);

      for (const user of users) {
        const linked = user.linked_accounts || [];
        const hasTwitter = linked.some((acc: any) => {
          const type = (acc.type || '').toLowerCase();
          const uname = (acc.username || acc.name || acc.screen_name || '').toLowerCase().replace(/^@/, '');
          return (type === 'twitter_oauth' || type === 'twitter') && uname === cleanUsername;
        });

        if (hasTwitter) {
          const smartWalletAcc = linked.find((acc: any) => (acc.type || '').toLowerCase() === 'smart_wallet' && acc.address);
          const embeddedWalletAcc = linked.find((acc: any) => (acc.type || '').toLowerCase() === 'wallet' && acc.address);

          const walletAddress = smartWalletAcc?.address || user.wallet?.address || embeddedWalletAcc?.address;
          const walletId = smartWalletAcc?.id || user.wallet?.id || embeddedWalletAcc?.id;

          return {
            walletAddress,
            walletId,
            privyUserId: user.id,
          };
        }
      }

      cursor = data?.next_cursor || null;
      if (!cursor) break;
    }
  } catch (err) {
    console.error('Privy fetch error:', err);
  }

  return null;
}

export async function pollAndProcessMentions() {
  const twitterAppKey = process.env.TWITTER_API_KEY || '';
  const twitterAppSecret = process.env.TWITTER_API_SECRET || '';
  const twitterAccessToken = process.env.TWITTER_ACCESS_TOKEN || '';
  const twitterAccessSecret = process.env.TWITTER_ACCESS_SECRET || '';
  const twitterBearerToken = process.env.TWITTER_BEARER_TOKEN || '';
  const botUsername = (process.env.BOT_USERNAME || 'dotibot').replace(/^@/, '');

  const privyAppId = process.env.PRIVY_APP_ID || process.env.VITE_PRIVY_APP_ID || '';
  const privyAppSecret = process.env.PRIVY_APP_SECRET || '';
  const contractAddress = (process.env.DOTI_REGISTRY_CONTRACT_ADDRESS || '0xf853F8243F10a57CF5e43A49F156F132c05C21a6') as `0x${string}`;
  const rpcUrl = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';

  const publicClient = createPublicClient({
    chain: arbitrum,
    transport: http(rpcUrl),
  });

  const hasUserAuth = Boolean(twitterAppKey && twitterAccessToken && twitterAppSecret && twitterAccessSecret);
  const hasBearer = Boolean(twitterBearerToken);

  if (!hasUserAuth && !hasBearer) {
    console.warn('[DotiBot] Missing Twitter API keys');
    return { tweetsFound: 0, actions: [] };
  }

  const twitterUserClient = hasUserAuth
    ? new TwitterApi({
        appKey: twitterAppKey,
        appSecret: twitterAppSecret,
        accessToken: twitterAccessToken,
        accessSecret: twitterAccessSecret,
      })
    : null;

  const twitterAppClient = hasBearer
    ? new TwitterApi(twitterBearerToken)
    : twitterUserClient;

  const lastSinceId = await dbGetLastSinceId();
  const tweetsToProcess: Array<{ id: string; text: string; username: string }> = [];
  const seenTweetIds = new Set<string>();
  let highestTweetId = lastSinceId;

  try {
    if (twitterAppClient) {
      const searchQuery = `@${botUsername} -is:retweet`;
      const searchParams: any = {
        max_results: 20,
        expansions: ['author_id'],
        'user.fields': ['username'],
      };

      if (lastSinceId && lastSinceId !== '0') {
        searchParams.since_id = lastSinceId;
      }

      const searchRes = await twitterAppClient.v2.search(searchQuery, searchParams);

      if (searchRes.data?.data) {
        for (const t of searchRes.data.data) {
          if (!seenTweetIds.has(t.id)) {
            seenTweetIds.add(t.id);
            const author = searchRes.includes?.users?.find((u: any) => u.id === t.author_id);
            tweetsToProcess.push({
              id: t.id,
              text: t.text,
              username: author?.username || 'user',
            });
            if (BigInt(t.id) > BigInt(highestTweetId || '0')) {
              highestTweetId = t.id;
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[DotiBot] Search fetch error:', err);
  }

  if (highestTweetId && highestTweetId !== lastSinceId && highestTweetId !== '0') {
    await dbSetLastSinceId(highestTweetId);
  }

  console.log(`[DotiBot] Found ${tweetsToProcess.length} new tweets to process.`);
  return { tweetsFound: tweetsToProcess.length };
}

// Continuous worker if executed directly
if (process.argv[1]?.endsWith('twitter-bot.ts')) {
  console.error('[DotiBot] Standalone polling is disabled. Use the authenticated /api/bot endpoint with an external scheduler.');
  process.exitCode = 1;
}
