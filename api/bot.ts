import type { Request, Response } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { TwitterApi } from 'twitter-api-v2';
import { createPublicClient, encodeFunctionData, formatEther, http, parseEther, keccak256, stringToBytes } from 'viem';
import { arbitrum } from 'viem/chains';
import { timingSafeEqual } from 'node:crypto';
import { PrivyClient } from '@privy-io/node';

function isAuthorizedCronRequest(req: any): boolean {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  if (!configuredSecret) return false;

  // 1. Check Authorization header
  const authHeader = req.headers?.authorization || req.headers?.Authorization || '';
  const headerStr = Array.isArray(authHeader) ? authHeader[0] || '' : String(authHeader);
  if (headerStr.startsWith('Bearer ')) {
    const provided = headerStr.slice(7).trim();
    if (provided === configuredSecret) return true;
    try {
      const pBuf = Buffer.from(provided);
      const eBuf = Buffer.from(configuredSecret);
      if (pBuf.length === eBuf.length && timingSafeEqual(pBuf, eBuf)) return true;
    } catch {}
  }

  // 2. Check query parameter (e.g. cron-job.org with ?secret=...)
  let querySecret = req.query?.secret || req.query?.key || req.query?.token;
  if (!querySecret && req.url) {
    try {
      const parsedUrl = new URL(req.url, 'http://localhost');
      querySecret = parsedUrl.searchParams.get('secret') || parsedUrl.searchParams.get('key') || parsedUrl.searchParams.get('token') || undefined;
    } catch {}
  }

  if (querySecret && typeof querySecret === 'string') {
    const trimmed = querySecret.trim();
    if (trimmed === configuredSecret) return true;
    try {
      const pBuf = Buffer.from(trimmed);
      const eBuf = Buffer.from(configuredSecret);
      if (pBuf.length === eBuf.length && timingSafeEqual(pBuf, eBuf)) return true;
    } catch {}
  }

  return false;
}

export const DOTI_DOMAIN_PRICE_ETH = process.env.DOMAIN_PRICE_ETH || '0.001';
const configuredDailySpendEth = Number(process.env.MAX_DAILY_SPEND_ETH || '0.003');
export const MAX_DAILY_SPEND_ETH = Number.isFinite(configuredDailySpendEth) && configuredDailySpendEth > 0
  ? Math.min(0.003, Math.max(0.000001, configuredDailySpendEth))
  : Number.NaN;
const configuredTransactionGasEth = Number(process.env.MAX_TRANSACTION_GAS_ETH || '0.0003');
export const MAX_TRANSACTION_GAS_ETH = Number.isFinite(configuredTransactionGasEth) && configuredTransactionGasEth > 0
  ? Math.min(0.005, Math.max(0.0000001, configuredTransactionGasEth))
  : Number.NaN;
const configuredTransactionGasLimit = Number(process.env.MAX_TRANSACTION_GAS_LIMIT || '750000');
export const MAX_TRANSACTION_GAS_LIMIT = Number.isSafeInteger(configuredTransactionGasLimit) &&
  configuredTransactionGasLimit > 0
  ? Math.min(2_000_000, Math.max(21_000, configuredTransactionGasLimit))
  : Number.NaN;
const ENABLE_TWITTER_ETH_SEND = process.env.TWITTER_ENABLE_ETH_SEND === 'true';
const ENABLE_TWITTER_DOMAIN_TRANSFER = process.env.TWITTER_ENABLE_DOMAIN_TRANSFER === 'true';
const ENABLE_TWITTER_DOMAIN_REGISTRATION = process.env.TWITTER_ENABLE_DOMAIN_REGISTRATION === 'true';
const MAX_MENTION_PAGE_SIZE = 20;

// Vercel Node API route configuration. Transactions are persisted as pending
// and confirmed by a later cron poll; this is not a background worker.
export const config = { maxDuration: 60 };

// -----------------------------------------------------------------------------
// Database Helpers (Self-Contained for Vercel Serverless Function)
// -----------------------------------------------------------------------------
let supabaseInstance: SupabaseClient | null = null;

function getSupabase(): SupabaseClient | null {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }

  if (!supabaseInstance) {
    supabaseInstance = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return supabaseInstance;
}

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

/**
 * Check domain availability both on-chain via registry(bytes32) and via Doti MCP
 */
export async function checkDomainAvailability(
  publicClient: any,
  contractAddress: `0x${string}`,
  rawDomain: string
): Promise<{ available: boolean; owner?: string; reason?: string; priceEth?: string }> {
  const clean = rawDomain.replace(/\.i$/i, '').toLowerCase().trim();
  const fullName = `${clean}.i`;

  // 1. Primary: Direct On-Chain Contract check via registry(bytes32 domainHash)
  try {
    const domainHash = keccak256(stringToBytes(clean));
    const result: any = await publicClient.readContract({
      address: contractAddress,
      abi: REGISTRY_ABI,
      functionName: 'registry',
      args: [domainHash],
    });

    if (result) {
      const owner = Array.isArray(result) ? result[2] : result?.owner;
      const regTimestamp = Array.isArray(result) ? result[6] : result?.registrationTimestamp;

      const isUnregistered =
        !owner ||
        owner === '0x0000000000000000000000000000000000000000' ||
        regTimestamp === 0n ||
        regTimestamp === 0;

      if (!isUnregistered) {
        return {
          available: false,
          owner: String(owner),
          reason: `Domain "${fullName}" is already registered on Arbitrum One (Owner: ${String(owner).slice(0, 6)}...${String(owner).slice(-4)})`,
        };
      }
    }
  } catch (contractErr) {
    console.warn('[DotiBot] Direct on-chain registry check note:', contractErr);
  }

  // 2. Secondary: Doti Protocol MCP Tool check
  try {
    const mcpRes = await fetch('https://doti.my/api/ai/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'check_domain_availability',
          arguments: { domainName: fullName },
        },
      }),
      signal: AbortSignal.timeout(6000),
    });

    if (mcpRes.ok) {
      const data: any = await mcpRes.json();
      const textContent = data?.result?.content?.[0]?.text;
      if (textContent) {
        const parsed = JSON.parse(textContent);
        if (parsed.available === false) {
          return {
            available: false,
            reason: parsed.message || `Domain "${fullName}" is already registered on Arbitrum One.`,
          };
        }
        if (parsed.available === true && parsed.priceEth) {
          return { available: true, priceEth: String(parsed.priceEth) };
        }
      }
    }
  } catch (mcpErr) {
    console.warn('[DotiBot] MCP check note:', mcpErr);
  }

  return {
    available: true,
    priceEth: DOTI_DOMAIN_PRICE_ETH,
  };
}

export interface ParsedCommand {
  type: 'register' | 'check' | 'transfer' | 'send_eth' | 'balance' | 'my_domains' | 'help' | 'unsupported';
  domain?: string;
  to?: string;
  amountEth?: string;
}

export function parseBotCommand(text: string, botUsername?: string): ParsedCommand {
  const configuredBot = (botUsername || process.env.BOT_USERNAME || 'dotibot').replace(/^@/, '');
  let clean = text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[,:]/g, ' ');

  if (configuredBot) {
    clean = clean.replace(new RegExp(`@?${configuredBot}\\b`, 'gi'), '');
  }

  clean = clean.replace(/\s+/g, ' ').trim();

  // 1. REGISTER / MINT
  const regPattern = /^(?:hi|hello|hey|please)?\s*(?:!|\/)?(?:register|mint|buy|claim)\s+([a-zA-Z0-9-]+)(?:\.i)?$/i;
  const regMatch = clean.match(regPattern);
  if (regMatch) {
    const raw = regMatch[1].replace(/\.i$/i, '').toLowerCase().trim();
    if (raw && raw !== 'name' && raw !== 'your' && raw.length <= 32 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(raw)) {
      return { type: 'register', domain: `${raw}.i` };
    }
  }

  // 2. CHECK / AVAILABILITY
  const checkPattern = /^(?:hi|hello|hey|please)?\s*(?:!|\/)?(?:check|is available|lookup|avail)\s+([a-zA-Z0-9-]+)(?:\.i)?$/i;
  const checkMatch = clean.match(checkPattern);
  if (checkMatch) {
    const raw = checkMatch[1].replace(/\.i$/i, '').toLowerCase().trim();
    if (raw && raw !== 'name' && raw.length <= 32 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(raw)) {
      return { type: 'check', domain: `${raw}.i` };
    }
  }

  // 3. TRANSFER DOMAIN
  // Matches: transfer <domain> to <0x... | @username>
  const transPattern = /^(?:hi|hello|hey|please)?\s*(?:!|\/)?(?:transfer|send)\s+([a-zA-Z0-9-]+)(?:\.i)?\s+to\s+(@[a-zA-Z0-9_]{1,15}|0x[a-fA-F0-9]{40})$/i;
  const transMatch = clean.match(transPattern);
  if (transMatch) {
    const raw = transMatch[1].replace(/\.i$/i, '').toLowerCase().trim();
    const to = transMatch[2].trim();
    if (raw && raw.length <= 32 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(raw)) {
      return { type: 'transfer', domain: `${raw}.i`, to };
    }
  }

  // 4. SEND ETH
  // Matches: send <amount> eth to <0x... | @username>
  const sendPattern = /^(?:hi|hello|hey|please)?\s*(?:!|\/)?(?:send|withdraw|transfer)\s+((?:0|[1-9]\d*)(?:\.\d{1,18})?)\s*(?:eth|ETH)?\s+to\s+(@[a-zA-Z0-9_]{1,15}|0x[a-fA-F0-9]{40})$/i;
  const sendMatch = clean.match(sendPattern);
  if (sendMatch) {
    const amountEth = sendMatch[1];
    const to = sendMatch[2].trim();
    try {
      if (parseEther(amountEth) > 0n) {
        return { type: 'send_eth', amountEth, to };
      }
    } catch {
      return { type: 'unsupported' };
    }
  }

  // 5. BALANCE
  if (/^(?:hi|hello|hey|please)?\s*(?:!|\/)?(?:balance|my balance)$/i.test(clean)) {
    return { type: 'balance' };
  }

  // 6. MY DOMAINS
  if (/^(?:hi|hello|hey|please)?\s*(?:!|\/)?(?:my domains|domains|portfolio)$/i.test(clean)) {
    return { type: 'my_domains' };
  }

  if (/^(?:hi|hello|hey|please)?\s*(?:!|\/)?(?:help|commands)$/i.test(clean)) {
    return { type: 'help' };
  }

  return { type: 'unsupported' };
}

/**
 * Resolve a Twitter handle or 0x address to an Arbitrum wallet address.
 * If the recipient has not linked their wallet in Privy, returns notRegistered: true.
 */
export async function resolveRecipientWallet(
  toTarget: string,
  appId: string,
  appSecret: string,
  twitterUserClient?: TwitterApi | null,
): Promise<{ address?: `0x${string}`; handle?: string; notRegistered?: boolean; error?: string }> {
  const trimmed = toTarget.trim();

  // 1. Direct 0x EVM Address
  if (/^0x[a-fA-F0-9]{40}$/i.test(trimmed)) {
    return { address: trimmed as `0x${string}` };
  }

  const cleanHandle = trimmed.replace(/^@/, '').toLowerCase().trim();
  if (!cleanHandle || !/^[a-z0-9_]{1,15}$/.test(cleanHandle)) {
    return { error: 'Invalid recipient format', handle: cleanHandle };
  }

  // 2. Fetch Twitter user ID from Twitter API v2 if available
  let recipientTwitterId: string | undefined;
  if (twitterUserClient) {
    try {
      const userRes = await twitterUserClient.v2.userByUsername(cleanHandle);
      recipientTwitterId = userRes?.data?.id;
    } catch (lookupErr) {
      console.warn(`[DotiBot] Twitter user lookup note for @${cleanHandle}:`, lookupErr);
    }
  }

  // 3. Check Privy user by immutable Twitter Subject ID
  if (recipientTwitterId && appId && appSecret) {
    const privyUser = await getPrivyWalletByTwitter(cleanHandle, appId, appSecret, recipientTwitterId);
    if (privyUser?.walletAddress && /^0x[a-fA-F0-9]{40}$/i.test(privyUser.walletAddress)) {
      return { address: privyUser.walletAddress as `0x${string}`, handle: cleanHandle };
    }
  }

  // 4. Fallback: Search Privy user accounts list by Twitter handle
  if (appId && appSecret) {
    try {
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
          signal: AbortSignal.timeout(8000),
          headers: {
            Authorization: `Basic ${basicAuth}`,
            'privy-app-id': appId,
            'Content-Type': 'application/json',
          },
        });

        if (res.ok) {
          const data: any = await res.json();
          const users: any[] = data?.data || (Array.isArray(data) ? data : []);

          for (const user of users) {
            const linked = user.linked_accounts || [];
            const hasTwitter = linked.some((acc: any) => {
              const type = String(acc.type || '').toLowerCase();
              const uname = String(acc.username || acc.name || acc.screen_name || '').toLowerCase().replace(/^@/, '');
              return (type === 'twitter_oauth' || type === 'twitter') && uname === cleanHandle;
            });

            if (hasTwitter) {
              const smartWalletAcc = linked.find((acc: any) => String(acc.type || '').toLowerCase() === 'smart_wallet' && acc.address);
              const embeddedWalletAcc = linked.find((acc: any) =>
                ['wallet', 'ethereum_embedded_wallet'].includes(String(acc.type || '').toLowerCase()) && acc.address);
              const walletAddress = smartWalletAcc?.address || user.wallet?.address || embeddedWalletAcc?.address;
              if (typeof walletAddress === 'string' && /^0x[a-fA-F0-9]{40}$/i.test(walletAddress)) {
                return { address: walletAddress as `0x${string}`, handle: cleanHandle };
              }
            }
          }

          cursor = data?.next_cursor || null;
          if (!cursor) break;
        } else {
          break;
        }
      }
    } catch (listErr) {
      console.warn(`[DotiBot] Privy user search fallback note:`, listErr);
    }
  }

  return { notRegistered: true, handle: cleanHandle };
}

/**
 * Fetch or Provision Privy Server Wallet for Twitter User
 */
async function getPrivyWalletByTwitter(
  username: string,
  appId: string,
  appSecret: string,
  twitterUserId?: string,
  sb?: SupabaseClient | null,
): Promise<{
  walletAddress?: string;
  walletId?: string;
  privyUserId?: string;
  isDelegated: boolean;
  twitterIdentityVerified: boolean;
} | null> {
  // Usernames can be renamed or reclaimed. X's immutable author ID is the
  // only acceptable key for authorizing a wallet operation.
  if (!appId || !appSecret || !twitterUserId) {
    return null;
  }

  const cleanUsername = username.replace(/^@/, '').toLowerCase().trim();

  // 1. Check Supabase user_delegations table if database client is available
  let dbDelegation: any = null;
  if (sb) {
    try {
      const { data } = await sb
        .from('user_delegations')
        .select('*')
        .eq('twitter_user_id', twitterUserId)
        .maybeSingle();
      if (data) {
        dbDelegation = data;
      }
    } catch (e) {
      console.warn('[DotiBot] Supabase delegation cache lookup note:', e);
    }
  }

  try {
    const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString('base64');
    const res = await fetch('https://api.privy.io/v1/users/twitter/subject', {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'privy-app-id': appId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ subject: twitterUserId }),
    });

    if (!res.ok) {
      // Fallback to Supabase delegation record if Privy subject endpoint returns not found
      if (dbDelegation && dbDelegation.wallet_address && dbDelegation.wallet_id) {
        return {
          walletAddress: dbDelegation.wallet_address,
          walletId: dbDelegation.wallet_id,
          privyUserId: dbDelegation.privy_user_id,
          isDelegated: Boolean(dbDelegation.is_delegated),
          twitterIdentityVerified: true,
        };
      }
      return null;
    }

    const user: any = await res.json();
    const linked: any[] = user?.linked_accounts || user?.data?.linked_accounts || [];
    const twitterAccount = linked.find((acc: any) => {
      const type = String(acc.type || '').toLowerCase();
      const linkedId = acc.subject ?? acc.user_id ?? acc.userId ?? acc.twitter_user_id ??
        acc.twitterUserId ?? acc.providerAccountId;
      return (type === 'twitter_oauth' || type === 'twitter') &&
        linkedId !== undefined && String(linkedId) === twitterUserId;
    });

    if (!twitterAccount) return null;

    const smartWalletAcc = linked.find((acc: any) =>
      String(acc.type || '').toLowerCase() === 'smart_wallet' && acc.address);
    const embeddedWalletAcc = linked.find((acc: any) =>
      ['wallet', 'ethereum_embedded_wallet'].includes(String(acc.type || '').toLowerCase()) && acc.address);

    const walletAddress = smartWalletAcc?.address || user.wallet?.address || embeddedWalletAcc?.address || dbDelegation?.wallet_address;
    // The delegated signing key on Privy is the embedded wallet ID
    const walletId = embeddedWalletAcc?.id || user.wallet?.id || dbDelegation?.wallet_id || smartWalletAcc?.id;

    if (typeof walletAddress !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) return null;
    if (typeof walletId !== 'string' || walletId.length === 0) return null;

    const isPrivyDelegated = Boolean(embeddedWalletAcc?.delegated);
    const isDbDelegated = Boolean(dbDelegation?.is_delegated);
    const isDelegated = isPrivyDelegated || isDbDelegated;

    // Cache/sync to Supabase if not yet persisted or changed
    if (sb && (!dbDelegation || dbDelegation.is_delegated !== isDelegated)) {
      try {
        await sb.from('user_delegations').upsert({
          privy_user_id: user.id || user.data?.id,
          twitter_user_id: twitterUserId,
          twitter_handle: cleanUsername,
          wallet_address: walletAddress.toLowerCase(),
          wallet_id: walletId,
          is_delegated: isDelegated,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'privy_user_id' });
      } catch {}
    }

    return {
      walletAddress,
      walletId,
      privyUserId: user.id || user.data?.id,
      isDelegated,
      twitterIdentityVerified: true,
    };
  } catch (err) {
    console.error('Privy fetch error:', err);
    if (dbDelegation && dbDelegation.wallet_address && dbDelegation.wallet_id) {
      return {
        walletAddress: dbDelegation.wallet_address,
        walletId: dbDelegation.wallet_id,
        privyUserId: dbDelegation.privy_user_id,
        isDelegated: Boolean(dbDelegation.is_delegated),
        twitterIdentityVerified: true,
      };
    }
  }

  return null;
}

export default async function handler(req: Request, res: Response) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ status: 'error', message: 'Only GET requests are supported' });
    }

    // This endpoint can trigger irreversible transactions. It must never be
    // reachable without an explicitly configured, header-only cron secret.
    if (!process.env.CRON_SECRET) {
      return res.status(503).json({
        status: 'error',
        errorCode: 'CRON_SECRET_NOT_CONFIGURED',
        message: 'Bot execution is disabled until CRON_SECRET is configured',
      });
    }
    if (!Number.isFinite(MAX_DAILY_SPEND_ETH)) {
      return res.status(503).json({
        status: 'error',
        errorCode: 'INVALID_SPENDING_LIMIT',
        message: 'Bot execution is disabled because MAX_DAILY_SPEND_ETH is invalid',
      });
    }
    if (!Number.isFinite(MAX_TRANSACTION_GAS_ETH) || !Number.isFinite(MAX_TRANSACTION_GAS_LIMIT)) {
      return res.status(503).json({
        status: 'error',
        errorCode: 'INVALID_TRANSACTION_GAS_LIMIT',
        message: 'Bot execution is disabled because the transaction gas policy is invalid',
      });
    }
    if (!isAuthorizedCronRequest(req)) {
      return res.status(401).json({
        status: 'unauthorized',
        message: 'Missing or invalid Authorization Bearer secret',
      });
    }

    const isDiagnostics = req.query?.mode === 'diagnostics';

    // 2. Initialize Twitter & Arbitrum Clients
    const twitterAppKey = process.env.TWITTER_API_KEY || '';
    const twitterAppSecret = process.env.TWITTER_API_SECRET || '';
    const twitterAccessToken = process.env.TWITTER_ACCESS_TOKEN || '';
    const twitterAccessSecret = process.env.TWITTER_ACCESS_SECRET || '';
    const botUsername = (process.env.BOT_USERNAME || 'dotibot').replace(/^@/, '');

    const privyAppId = process.env.PRIVY_APP_ID || process.env.VITE_PRIVY_APP_ID || '';
    const privyAppSecret = process.env.PRIVY_APP_SECRET || '';
    const contractAddress = (process.env.DOTI_REGISTRY_CONTRACT_ADDRESS || '0xf853F8243F10a57CF5e43A49F156F132c05C21a6') as `0x${string}`;
    const rpcUrl = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';

    if (!/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
      return res.status(503).json({
        status: 'error',
        errorCode: 'INVALID_REGISTRY_ADDRESS',
        message: 'Bot execution is disabled because the registry address is invalid',
      });
    }

    const publicClient = createPublicClient({
      chain: arbitrum,
      transport: http(rpcUrl),
    });

    const hasUserAuth = Boolean(twitterAppKey && twitterAccessToken && twitterAppSecret && twitterAccessSecret);
    // A bearer token can read tweets but cannot post replies. Do not execute
    // money-moving commands in that mode and leave users without a receipt.
    if (!hasUserAuth) {
      return res.status(200).json({
        status: 'warning',
        errorCode: 'TWITTER_WRITE_AUTH_REQUIRED',
        message: 'Twitter user OAuth credentials are required to process and reply to mentions',
      });
    }

    const twitterUserClient = hasUserAuth
      ? new TwitterApi({
          appKey: twitterAppKey,
          appSecret: twitterAppSecret,
          accessToken: twitterAccessToken,
          accessSecret: twitterAccessSecret,
        })
      : null;

    // 3. Twitter Diagnostic Test
    let verifiedBotHandle: string | null = null;
    let verifiedBotUserId: string | null = null;
    let twitterApiStatus = 'healthy';
    let twitterApiError: any = null;

    if (twitterUserClient) {
      try {
        const me = await twitterUserClient.v2.me();
        verifiedBotHandle = me.data?.username || null;
        verifiedBotUserId = me.data?.id || null;
        if (!verifiedBotHandle || !verifiedBotUserId ||
            verifiedBotHandle.toLowerCase() !== botUsername.toLowerCase()) {
          twitterApiStatus = 'configured_account_mismatch';
          twitterApiError = {
            code: 'BOT_IDENTITY_MISMATCH',
            message: 'Twitter credentials do not belong to BOT_USERNAME',
          };
        }
      } catch (meErr: any) {
        twitterApiStatus = 'user_auth_failed';
        twitterApiError = {
          code: meErr?.code || meErr?.status || 500,
          message: meErr?.message || String(meErr),
        };
      }
    }

    const sb = getSupabase();

    if (isDiagnostics) {
      return res.status(twitterApiError ? 502 : 200).json({
        status: 'diagnostics',
        botUsername: `@${botUsername}`,
        authenticatedTwitterAccount: verifiedBotHandle ? `@${verifiedBotHandle}` : null,
        twitterApiStatus,
        twitterApiError,
        databaseConnected: Boolean(sb),
        hasPrivySecret: Boolean(privyAppSecret),
        contractAddress,
        network: 'Arbitrum One',
        timestamp: new Date().toISOString(),
      });
    }

    if (twitterApiError) {
      return res.status(200).json({
        status: 'warning',
        errorCode: 'TWITTER_AUTH_FAILED',
        message: 'Twitter authentication failed; no commands were executed',
        twitterApiError,
      });
    }

    // Idempotency, budget reservations, and transaction recovery are security
    // controls, not optional enhancements. Fail closed if Supabase is absent.
    if (!sb) {
      return res.status(503).json({
        status: 'error',
        errorCode: 'DATABASE_REQUIRED',
        message: 'Bot execution is disabled until Supabase is configured',
      });
    }

    // Keep page-by-page poll state so high mention volume is drained over
    // successive cron runs rather than skipped by advancing since_id early.
    let pollState: {
      since_id: string;
      pagination_token: string | null;
      highest_seen_id: string | null;
    } = { since_id: '0', pagination_token: null, highest_seen_id: null };
    try {
      const { data: pollRow, error: pollError } = await sb
        .from('bot_state')
        .select('value')
        .eq('key', 'twitter_poll_state')
        .maybeSingle();
      if (pollError) throw pollError;
      if (pollRow?.value) {
        const parsed = JSON.parse(pollRow.value);
        if (!parsed || typeof parsed.since_id !== 'string' || !/^\d+$/.test(parsed.since_id) ||
            (parsed.pagination_token !== null && parsed.pagination_token !== undefined &&
              (typeof parsed.pagination_token !== 'string' || parsed.pagination_token.length > 4096)) ||
            (parsed.highest_seen_id !== null && parsed.highest_seen_id !== undefined &&
              (typeof parsed.highest_seen_id !== 'string' || !/^\d+$/.test(parsed.highest_seen_id)))) {
          throw new Error('Stored Twitter poll state is invalid');
        }
        pollState = {
          since_id: parsed.since_id,
          pagination_token: parsed.pagination_token || null,
          highest_seen_id: parsed.highest_seen_id || null,
        };
      } else {
        const { data: legacyRow, error: legacyError } = await sb
          .from('bot_state')
          .select('value')
          .eq('key', 'twitter_last_since_id')
          .maybeSingle();
        if (legacyError) throw legacyError;
        if (legacyRow?.value && /^\d+$/.test(legacyRow.value)) {
          pollState.since_id = legacyRow.value;
        }
      }
    } catch (stateError) {
      console.error('Could not read Twitter cursor:', stateError);
      return res.status(503).json({
        status: 'error',
        errorCode: 'DATABASE_UNAVAILABLE',
        message: 'Bot state could not be read; no commands were executed',
      });
    }

    const tweetsToProcess: Array<{ id: string; text: string; username: string; authorId: string }> = [];
    const seenTweetIds = new Set<string>();
    let highestTweetId = pollState.highest_seen_id || pollState.since_id;
    let nextPaginationToken: string | null = null;

    // Use only the authenticated bot account's mentions timeline. A failed
    // fetch is an error, not a successful empty poll; persist one page per run.
    try {
      if (!verifiedBotUserId || !twitterUserClient) {
        throw new Error('Authenticated bot account is unavailable');
      }
      const mentionParams: any = {
        max_results: MAX_MENTION_PAGE_SIZE,
        expansions: ['author_id'],
        'user.fields': ['username'],
      };
      if (pollState.pagination_token) {
        mentionParams.pagination_token = pollState.pagination_token;
      } else if (pollState.since_id !== '0') {
        mentionParams.since_id = pollState.since_id;
      }

      const mentions = await twitterUserClient.v2.userMentionTimeline(verifiedBotUserId, mentionParams);
      nextPaginationToken = mentions.meta?.next_token || null;
      if (mentions.data?.data) {
        for (const t of mentions.data.data) {
          if (!seenTweetIds.has(t.id)) {
            seenTweetIds.add(t.id);
            const author = mentions.includes?.users?.find((u: any) => u.id === t.author_id);
            tweetsToProcess.push({
              id: t.id,
              text: t.text,
              username: author?.username || 'user',
              authorId: t.author_id || '',
            });
            if (BigInt(t.id) > BigInt(highestTweetId || '0')) {
              highestTweetId = t.id;
            }
          }
        }
      }
    } catch (mentionErr: any) {
      console.error('Mentions timeline fetch failed:', mentionErr?.message || mentionErr);
      if (pollState.pagination_token) {
        const { error: resetError } = await sb.from('bot_state').upsert({
          key: 'twitter_poll_state',
          value: JSON.stringify({
            since_id: pollState.since_id,
            pagination_token: null,
            highest_seen_id: null,
          }),
          updated_at: new Date().toISOString(),
        });
        if (resetError) console.error('Could not reset stale Twitter pagination token:', resetError);
      }
      return res.status(200).json({
        status: 'ok',
        processed: 0,
        warning: 'TWITTER_MENTIONS_UNAVAILABLE',
        message: 'Twitter mentions could not be fetched (requires Twitter Basic tier or rate limit reset); no cursor was advanced',
      });
    }

    // 5. Process each tweet atomically
    const actionResults: any[] = [];
    let hasRetryableFailure = false;

    for (const tweet of tweetsToProcess) {
      if (tweet.username.toLowerCase() === botUsername.toLowerCase()) continue;
      // Every mention gets an idempotency record, including unsupported text.
      // Explicit help is handled separately; unrecognized mentions are ignored.
      const cmd = parseBotCommand(tweet.text, botUsername);

      let actionMode = 'full_execute';
      let existingTxHash: string | undefined;

      // Supabase atomic lock
      const { data: lockData, error: lockError } = await sb.rpc('acquire_tweet_lock', {
        p_tweet_id: tweet.id,
        p_author: tweet.username,
        p_command: cmd.type,
        p_raw_text: tweet.text,
        p_ttl_seconds: 300,
      });
      if (lockError || !lockData) {
        console.error('Lock error:', lockError);
        hasRetryableFailure = true;
        actionResults.push({ tweetId: tweet.id, skipped: true, reason: 'database_lock_failed' });
        continue;
      }

      if (!lockData.acquired) {
        if (lockData.reason === 'currently_locked_active' || lockData.reason === 'waiting_retry_backoff') {
          hasRetryableFailure = true;
        }
        actionResults.push({
          tweetId: tweet.id,
          skipped: true,
          reason: lockData.reason,
        });
        continue;
      }

      const { error: authorUpdateError } = await sb.from('processed_tweets')
        .update({ author_twitter_id: tweet.authorId })
        .eq('tweet_id', tweet.id);
      if (authorUpdateError) {
        await sb.rpc('record_tweet_failure', {
          p_tweet_id: tweet.id,
          p_error_msg: 'Could not persist verified Twitter author ID',
          p_error_code: 'AUTHOR_ID_PERSIST_FAILED',
          p_is_permanent: false,
        });
        hasRetryableFailure = true;
        actionResults.push({ tweetId: tweet.id, skipped: true, reason: 'author_id_persist_failed' });
        continue;
      }

      if (lockData.action_mode) {
        actionMode = lockData.action_mode;
        existingTxHash = lockData.tx_hash;
      }

      // A pending transaction is never broadcast again. It is checked until a
      // receipt is available, which prevents double registration/withdrawal.
      if (actionMode === 'verify_receipt_only' && existingTxHash) {
        try {
          const receipt = await publicClient.getTransactionReceipt({
            hash: existingTxHash as `0x${string}`,
          });
          const gasWei = receipt.gasUsed * receipt.effectiveGasPrice;
          const gasEth = formatEther(gasWei);
          if (receipt.status === 'success') {
            const { error: txUpdateError } = await sb.from('processed_tweets').update({
              tx_status: 'confirmed',
              gas_spent_eth: gasEth,
              updated_at: new Date().toISOString(),
            }).eq('tweet_id', tweet.id);
            if (txUpdateError) throw txUpdateError;
            const { error: finalizeError } = await sb.rpc('finalize_daily_budget', {
              p_tweet_id: tweet.id,
              p_actual_spent: formatEther(parseEther(String(lockData.spent_amount_eth || '0')) + gasWei),
              p_success: true,
            });
            if (finalizeError) throw finalizeError;
            const replyText = `✅ Confirmed on @arbitrum!\nTx: https://arbiscan.io/tx/${existingTxHash}\nManage at: https://x.doti.my`;
            const replyRes = await twitterUserClient!.v2.tweet({
              text: replyText,
              reply: { in_reply_to_tweet_id: tweet.id },
            });
            const { error: replyUpdateError } = await sb.from('processed_tweets').update({
              reply_status: 'sent',
              reply_text: replyText,
              reply_tweet_id: replyRes.data.id,
              execution_status: 'reply_sent',
              updated_at: new Date().toISOString(),
            }).eq('tweet_id', tweet.id);
            if (replyUpdateError) throw replyUpdateError;
            actionResults.push({ tweetId: tweet.id, command: cmd.type, replySent: true });
          } else {
            const { error: revertedUpdateError } = await sb.from('processed_tweets').update({
              tx_status: 'reverted',
              execution_status: 'permanent_failed',
              gas_spent_eth: gasEth,
              error_message: 'Transaction reverted on Arbitrum',
              last_error_code: 'TX_REVERTED',
              updated_at: new Date().toISOString(),
            }).eq('tweet_id', tweet.id);
            if (revertedUpdateError) throw revertedUpdateError;
            const { error: finalizeError } = await sb.rpc('finalize_daily_budget', {
              p_tweet_id: tweet.id,
              p_actual_spent: gasEth,
              p_success: false,
            });
            if (finalizeError) throw finalizeError;
            actionResults.push({ tweetId: tweet.id, command: cmd.type, skipped: true, reason: 'transaction_reverted' });
          }
        } catch (receiptError: any) {
          // Receipt-not-found means the transaction is still pending. Do not
          // mark it failed and, most importantly, do not send it again.
          await sb.from('processed_tweets').update({
            execution_status: 'retryable_failed',
            locked_until: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('tweet_id', tweet.id);
          hasRetryableFailure = true;
          actionResults.push({ tweetId: tweet.id, command: cmd.type, pending: true });
        }
        continue;
      }

      let replyText = '';
      let broadcastAttempted = false;
      let broadcastTxHash: string | undefined;
      let budgetReserved = false;

      try {
        // Branch 1: If transaction was already confirmed on chain, only reply!
        if (actionMode === 'reply_only' && existingTxHash) {
          const { error: finalizeError } = await sb.rpc('finalize_daily_budget', {
            p_tweet_id: tweet.id,
            p_actual_spent: formatEther(
              parseEther(String(lockData.spent_amount_eth || '0')) +
              parseEther(String(lockData.gas_spent_eth || '0')),
            ),
            p_success: true,
          });
          if (finalizeError) throw finalizeError;
          replyText = `✅ Confirmed on @arbitrum!\nTx: https://arbiscan.io/tx/${existingTxHash}\nManage at: https://x.doti.my`;
        }
        // Explicit help requests get a reply. Other mentions are recorded and
        // ignored to avoid replying to arbitrary posts or enabling reply spam.
        else if (cmd.type === 'help') {
          replyText = `👋 Hi @${tweet.username}! Supported commands:\n• register name.i\n• check name.i\n• send <amount> eth to @user (or 0x...)\n• transfer name.i to @user (or 0x...)\n• balance\n• my domains`;
        }
        else if (cmd.type === 'unsupported') {
          const { error: unsupportedError } = await sb.rpc('record_tweet_failure', {
            p_tweet_id: tweet.id,
            p_error_msg: 'Mention did not contain a supported command',
            p_error_code: 'UNSUPPORTED_COMMAND',
            p_is_permanent: true,
          });
          if (unsupportedError) throw unsupportedError;
          actionResults.push({ tweetId: tweet.id, skipped: true, reason: 'unsupported_command' });
          continue;
        }
        // Branch 2: CHECK DOMAIN
        else if (cmd.type === 'check' && cmd.domain) {
          const avail = await checkDomainAvailability(publicClient, contractAddress, cmd.domain);

          if (avail.available) {
            const price = avail.priceEth || DOTI_DOMAIN_PRICE_ETH;
            replyText = `🎉 ${cmd.domain} is AVAILABLE on @arbitrum!\nPrice: ${price} ETH\nTo register, reply:\n“@${botUsername} register ${cmd.domain}”`;
          } else {
            replyText = `❌ ${avail.reason || `${cmd.domain} is already registered on @arbitrum. Try another name!`}`;
          }
        }
        // Branch 3: BALANCE
        else if (cmd.type === 'balance') {
          const privyInfo = await getPrivyWalletByTwitter(tweet.username, privyAppId, privyAppSecret, tweet.authorId, sb);
          if (!privyInfo?.walletAddress || !privyInfo.twitterIdentityVerified) {
            replyText = `👋 Hi @${tweet.username}, please log in once at https://x.doti.my to link your wallet.`;
          } else {
            const bal = await publicClient.getBalance({ address: privyInfo.walletAddress as `0x${string}` });
            replyText = `💳 Wallet: ${privyInfo.walletAddress.slice(0, 6)}...${privyInfo.walletAddress.slice(-4)}\nBalance: ${Number(formatEther(bal)).toFixed(4)} ETH on @arbitrum`;
          }
        }
        // Branch 4: MY DOMAINS
        else if (cmd.type === 'my_domains') {
          replyText = `🌐 Manage and view all your .i domains securely on the official portal:\nhttps://x.doti.my/domains`;
        }
        // Branch 5: REGISTER / MINT / SEND ETH / TRANSFER (On-Chain Execution)
        else if ((cmd.type === 'register' && cmd.domain) || (cmd.type === 'send_eth' && cmd.amountEth && cmd.to) || (cmd.type === 'transfer' && cmd.domain && cmd.to)) {
          if (cmd.type === 'register' && !ENABLE_TWITTER_DOMAIN_REGISTRATION) {
            replyText = `🔒 Domain registration from Twitter is disabled until the operator enables it after verifying wallet policy and the spending cap.`;
            await sb.rpc('record_tweet_failure', {
              p_tweet_id: tweet.id,
              p_error_msg: 'Twitter domain registration disabled',
              p_error_code: 'TWITTER_DOMAIN_REGISTRATION_DISABLED',
              p_is_permanent: true,
            });
          } else {
          const privyInfo = await getPrivyWalletByTwitter(tweet.username, privyAppId, privyAppSecret, tweet.authorId, sb);
          if (!privyInfo?.walletAddress || !privyInfo.walletId || !privyInfo.twitterIdentityVerified) {
            replyText = `👋 Hi @${tweet.username}! To execute transactions via @${botUsername}, link your wallet once at https://x.doti.my`;
            await sb.rpc('record_tweet_failure', {
              p_tweet_id: tweet.id,
              p_error_msg: 'Twitter identity is not linked to a Privy wallet',
              p_error_code: 'USER_NOT_REGISTERED',
              p_is_permanent: true,
            });
          } else if (!privyInfo.isDelegated) {
            replyText = `👋 Hi @${tweet.username}! You haven't enabled bot delegation for @${botUsername} yet.\nPlease log in at https://x.doti.my and click "Enable Bot Delegation" to authorize transactions.`;
            await sb.rpc('record_tweet_failure', {
              p_tweet_id: tweet.id,
              p_error_msg: 'User wallet has not granted delegation',
              p_error_code: 'USER_NOT_DELEGATED',
              p_is_permanent: true,
            });
          } else if (cmd.type === 'send_eth' && !ENABLE_TWITTER_ETH_SEND) {
            replyText = `🔒 ETH transfers from Twitter are disabled for safety. Use the connected wallet interface at https://x.doti.my`;
            await sb.rpc('record_tweet_failure', {
              p_tweet_id: tweet.id,
              p_error_msg: 'Twitter ETH transfers disabled',
              p_error_code: 'TWITTER_ETH_SEND_DISABLED',
              p_is_permanent: true,
            });
          } else if (cmd.type === 'transfer' && !ENABLE_TWITTER_DOMAIN_TRANSFER) {
            replyText = `🔒 Domain transfers from Twitter are disabled for safety. Use the connected wallet interface at https://x.doti.my`;
            await sb.rpc('record_tweet_failure', {
              p_tweet_id: tweet.id,
              p_error_msg: 'Twitter domain transfers disabled',
              p_error_code: 'TWITTER_DOMAIN_TRANSFER_DISABLED',
              p_is_permanent: true,
            });
          } else {
            // Resolve recipient if command is send_eth or transfer
            let resolvedRecipientAddress: `0x${string}` | undefined;
            let resolvedRecipientDisplay: string = cmd.to || '';

            if (cmd.type === 'send_eth' || cmd.type === 'transfer') {
              if (!cmd.to) {
                replyText = `⚠️ Please specify a recipient Twitter handle (@username) or 0x address.`;
                await sb.rpc('record_tweet_failure', {
                  p_tweet_id: tweet.id,
                  p_error_msg: 'Recipient missing',
                  p_error_code: 'RECIPIENT_MISSING',
                  p_is_permanent: true,
                });
              } else {
                const resolved = await resolveRecipientWallet(cmd.to, privyAppId, privyAppSecret, twitterUserClient);
                if (resolved.notRegistered) {
                  replyText = `⚠️ @${resolved.handle || 'user'} has not linked their wallet with @${botUsername} yet!\nThey can join at https://x.doti.my to receive funds and domains.`;
                  await sb.rpc('record_tweet_failure', {
                    p_tweet_id: tweet.id,
                    p_error_msg: `Recipient @${resolved.handle} not registered in DotiBot`,
                    p_error_code: 'RECIPIENT_NOT_REGISTERED',
                    p_is_permanent: true,
                  });
                } else if (!resolved.address) {
                  replyText = `⚠️ Could not resolve recipient "${cmd.to}". Please specify a valid @username or 0x address.`;
                  await sb.rpc('record_tweet_failure', {
                    p_tweet_id: tweet.id,
                    p_error_msg: 'Invalid recipient address or handle',
                    p_error_code: 'INVALID_RECIPIENT',
                    p_is_permanent: true,
                  });
                } else {
                  resolvedRecipientAddress = resolved.address;
                  resolvedRecipientDisplay = resolved.handle ? `@${resolved.handle}` : `${resolved.address.slice(0, 6)}...${resolved.address.slice(-4)}`;
                }
              }
            }

            if (replyText === '') {
              const userWallet = privyInfo.walletAddress as `0x${string}`;
              const requiredValueWei = cmd.type === 'register'
                ? parseEther(DOTI_DOMAIN_PRICE_ETH)
                : (cmd.type === 'send_eth' && cmd.amountEth ? parseEther(cmd.amountEth) : 0n);
              const maxGasBudgetWei = parseEther(MAX_TRANSACTION_GAS_ETH.toString());
              const totalRequiredWei = requiredValueWei + maxGasBudgetWei;
              const totalRequiredEth = Number(formatEther(totalRequiredWei));
              const requiredValueEth = formatEther(requiredValueWei);

              if (!Number.isFinite(totalRequiredEth) || totalRequiredWei > parseEther(MAX_DAILY_SPEND_ETH.toString())) {
                replyText = `⚠️ Transaction rejected: the requested amount exceeds the server safety limit of ${MAX_DAILY_SPEND_ETH} ETH/day.`;
                await sb.rpc('finalize_daily_budget', { p_tweet_id: tweet.id, p_actual_spent: 0, p_success: false });
                await sb.rpc('record_tweet_failure', {
                  p_tweet_id: tweet.id,
                  p_error_msg: 'Requested amount exceeds server safety limit',
                  p_error_code: 'REQUEST_OVER_SERVER_CAP',
                  p_is_permanent: true,
                });
              } else {
                // Reserve daily budget in Supabase
                let budgetAllowed = true;
                const { data: budgetRes, error: budgetError } = await sb.rpc('reserve_daily_budget', {
                  p_tweet_id: tweet.id,
                  p_wallet: userWallet,
                  p_amount_eth: formatEther(totalRequiredWei),
                  p_daily_cap: MAX_DAILY_SPEND_ETH,
                });
                if (budgetError) {
                  throw budgetError;
                }
                if (!budgetRes?.allowed) {
                  budgetAllowed = false;
                  replyText = `⚠️ Transaction rejected: ${budgetRes?.reason || 'Daily spending cap exceeded'}.\nSafety limit: ${MAX_DAILY_SPEND_ETH} ETH/day.`;
                  await sb.rpc('record_tweet_failure', {
                    p_tweet_id: tweet.id,
                    p_error_msg: budgetRes?.reason || 'Daily limit exceeded',
                    p_error_code: 'SPEND_LIMIT_EXCEEDED',
                    p_is_permanent: true,
                  });
                } else {
                  budgetReserved = true;
                }

                if (budgetAllowed) {
                  // Check wallet balance against value + safety gas ceiling
                  const currentBalance = await publicClient.getBalance({ address: userWallet });

                  if (currentBalance < requiredValueWei) {
                    replyText = `⚠️ Insufficient ETH balance on @arbitrum!\nRequired: ${formatEther(requiredValueWei)} ETH\nYour balance: ${formatEther(currentBalance)} ETH`;
                    if (sb) {
                      const { error: releaseError } = await sb.rpc('finalize_daily_budget', { p_tweet_id: tweet.id, p_actual_spent: 0, p_success: false });
                      if (releaseError) throw releaseError;
                      budgetReserved = false;
                      await sb.rpc('record_tweet_failure', { p_tweet_id: tweet.id, p_error_msg: 'Insufficient balance', p_error_code: 'INSUFFICIENT_BALANCE', p_is_permanent: true });
                    }
                  } else {
                    // Prepare Transaction Data
                    let txData: `0x${string}` = '0x';
                    let txTo: `0x${string}` = contractAddress;
                    let txValue = '0x0';

                    if (cmd.type === 'register' && cmd.domain) {
                      const avail = await checkDomainAvailability(publicClient, contractAddress, cmd.domain);

                      if (!avail.available) {
                        replyText = `❌ Sorry @${tweet.username}, ${cmd.domain} is already registered!`;
                        if (sb) {
                          const { error: releaseError } = await sb.rpc('finalize_daily_budget', { p_tweet_id: tweet.id, p_actual_spent: 0, p_success: false });
                          if (releaseError) throw releaseError;
                          budgetReserved = false;
                          await sb.rpc('record_tweet_failure', { p_tweet_id: tweet.id, p_error_msg: 'Domain taken', p_error_code: 'DOMAIN_TAKEN', p_is_permanent: true });
                        }
                      } else {
                        const cleanLabel = cmd.domain.replace(/\.i$/i, '').toLowerCase();
                        try {
                          const mcpPayloadRes = await fetch('https://doti.my/api/ai/mcp', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              jsonrpc: '2.0',
                              id: Date.now(),
                              method: 'tools/call',
                              params: {
                                name: 'register_domain',
                                arguments: {
                                  domainName: `${cleanLabel}.i`,
                                  recipientAddress: userWallet,
                                  targetChainId: 42161,
                                },
                              },
                            }),
                            signal: AbortSignal.timeout(6000),
                          });

                          if (mcpPayloadRes.ok) {
                            const payloadData: any = await mcpPayloadRes.json();
                            const textContent = payloadData?.result?.content?.[0]?.text;
                            if (textContent) {
                              const parsed = JSON.parse(textContent);
                              if (parsed?.transactionPayload?.data && parsed?.transactionPayload?.to) {
                                txData = parsed.transactionPayload.data as `0x${string}`;
                                txTo = parsed.transactionPayload.to as `0x${string}`;
                                if (parsed.transactionPayload.valueWei) {
                                  txValue = `0x${BigInt(parsed.transactionPayload.valueWei).toString(16)}`;
                                }
                              }
                            }
                          }
                        } catch (mcpPayloadErr) {
                          console.warn('[DotiBot] MCP registration payload notice:', mcpPayloadErr);
                        }

                        if (txData === '0x') {
                          txData = encodeFunctionData({
                            abi: REGISTRY_ABI,
                            functionName: 'register',
                            args: [cleanLabel, 0n],
                          });
                          txValue = `0x${parseEther(avail.priceEth || DOTI_DOMAIN_PRICE_ETH).toString(16)}`;
                        }
                      }
                    } else if (cmd.type === 'send_eth' && cmd.amountEth && resolvedRecipientAddress) {
                      txTo = resolvedRecipientAddress;
                      txValue = `0x${parseEther(cmd.amountEth).toString(16)}`;
                    } else if (cmd.type === 'transfer' && cmd.domain && resolvedRecipientAddress) {
                      // For ERC-721 DotI domain registry
                      const cleanLabel = cmd.domain.replace(/\.i$/i, '').toLowerCase();
                      const domainHash = keccak256(stringToBytes(cleanLabel));
                      let activeTokenId = 0n;
                      try {
                        const regData: any = await publicClient.readContract({
                          address: contractAddress,
                          abi: REGISTRY_ABI,
                          functionName: 'registry',
                          args: [domainHash],
                        });
                        if (regData) {
                          activeTokenId = BigInt(Array.isArray(regData) ? regData[4] : regData.activeTokenId || 0n);
                        }
                      } catch {}

                      if (activeTokenId > 0n) {
                        txData = encodeFunctionData({
                          abi: REGISTRY_ABI,
                          functionName: 'transferFrom',
                          args: [userWallet, resolvedRecipientAddress, activeTokenId],
                        });
                      } else {
                        replyText = `❌ Domain "${cmd.domain}" could not be found for transfer on Arbitrum.`;
                      }
                    }

                // Broadcast Transaction via Privy Server RPC
                if (replyText === '') {
                  const transactionValueWei = BigInt(txValue);

                  // 1. Gas Estimation on Arbitrum One
                  let estimatedGas: bigint;
                  try {
                    estimatedGas = await publicClient.estimateGas({
                      account: userWallet,
                      to: txTo,
                      data: txData,
                      value: transactionValueWei,
                    });
                  } catch (estErr: any) {
                    const errorDetails = estErr?.shortMessage || estErr?.message || String(estErr);
                    throw new Error(`GAS_ESTIMATE_FAILED: Arbitrum gas simulation failed (${errorDetails})`);
                  }

                  if (estimatedGas <= 0n) {
                    throw new Error('GAS_ESTIMATE_FAILED: Estimated gas is zero or invalid');
                  }

                  // 2. Gas Limit with 20% safety margin + 1,000 buffer
                  const gasLimit = (estimatedGas * 120n) / 100n + 1_000n;
                  const maxAllowedGasLimit = BigInt(MAX_TRANSACTION_GAS_LIMIT);

                  if (gasLimit > maxAllowedGasLimit) {
                    throw new Error(
                      `GAS_LIMIT_EXCEEDED: Estimated gas limit (${gasLimit.toString()}) exceeds configured maximum safety limit (${maxAllowedGasLimit.toString()})`
                    );
                  }

                  // 3. Fee Quote from Arbitrum RPC
                  let feeQuote: any;
                  try {
                    feeQuote = await publicClient.estimateFeesPerGas();
                  } catch {
                    try {
                      const gasPrice = await publicClient.getGasPrice();
                      feeQuote = { gasPrice, maxFeePerGas: gasPrice, maxPriorityFeePerGas: 0n };
                    } catch (feeErr: any) {
                      throw new Error(`GAS_QUOTE_UNAVAILABLE: Could not retrieve current Arbitrum gas quote (${feeErr?.message || feeErr})`);
                    }
                  }

                  const quotedMaxFeePerGas: bigint | undefined = feeQuote?.maxFeePerGas ?? feeQuote?.gasPrice;
                  if (quotedMaxFeePerGas === undefined || quotedMaxFeePerGas <= 0n) {
                    throw new Error('GAS_QUOTE_UNAVAILABLE: Arbitrum RPC returned an empty or invalid gas fee quote');
                  }

                  // 4. Worst-case gas cost verification against MAX_TRANSACTION_GAS_ETH
                  const worstCaseGasCostWei = gasLimit * quotedMaxFeePerGas;

                  if (worstCaseGasCostWei > maxGasBudgetWei) {
                    const worstCaseEth = formatEther(worstCaseGasCostWei);
                    const feeGwei = (Number(quotedMaxFeePerGas) / 1e9).toFixed(3);
                    throw new Error(
                      `GAS_FEE_CEILING_EXCEEDED: Maximum estimated gas cost (${worstCaseEth} ETH at ${feeGwei} Gwei) exceeds the configured transaction safety ceiling of ${MAX_TRANSACTION_GAS_ETH} ETH`
                    );
                  }

                  // Verify wallet has enough for value + estimated worst-case gas
                  const totalEstimatedRequiredWei = transactionValueWei + worstCaseGasCostWei;
                  if (currentBalance < totalEstimatedRequiredWei) {
                    replyText = `⚠️ Insufficient ETH balance on @arbitrum!\nRequired: ~${Number(formatEther(totalEstimatedRequiredWei)).toFixed(5)} ETH (including gas)\nYour balance: ${Number(formatEther(currentBalance)).toFixed(5)} ETH`;
                    if (sb) {
                      const { error: releaseError } = await sb.rpc('finalize_daily_budget', { p_tweet_id: tweet.id, p_actual_spent: 0, p_success: false });
                      if (releaseError) throw releaseError;
                      budgetReserved = false;
                      await sb.rpc('record_tweet_failure', { p_tweet_id: tweet.id, p_error_msg: 'Insufficient balance for transaction and gas', p_error_code: 'INSUFFICIENT_BALANCE', p_is_permanent: true });
                    }
                    actionResults.push({ tweetId: tweet.id, skipped: true, reason: 'insufficient_balance' });
                    continue;
                  }

                  const basicAuth = Buffer.from(`${privyAppId}:${privyAppSecret}`).toString('base64');
                  // Persist an ambiguous submission intent BEFORE invoking Privy.
                  // If this process dies after Privy accepts the request, the
                  // next cron cannot treat the tweet as a fresh command.
                  const { data: intentRows, error: intentError } = await sb
                    .from('processed_tweets')
                    .update({
                      tx_status: 'unknown',
                      spent_amount_eth: requiredValueEth,
                      last_error_code: 'TX_SUBMISSION_IN_PROGRESS',
                      updated_at: new Date().toISOString(),
                    })
                    .eq('tweet_id', tweet.id)
                    .eq('tx_status', 'none')
                    .select('tweet_id');
                  if (intentError) throw intentError;
                  if (!intentRows?.length) {
                    throw new Error('Transaction intent could not be reserved');
                  }
                  broadcastAttempted = true;
                  const transactionPayload: any = {
                    to: txTo,
                    value: txValue,
                  };
                  if (txData && txData !== '0x') {
                    transactionPayload.data = txData;
                  }

                  let txHash: string | undefined;
                  let detailedError = 'Unknown error';

                  const privyAuthKey = process.env.PRIVY_AUTHORIZATION_KEY;
                  const privyNodeClient = new PrivyClient({
                    appId: privyAppId,
                    appSecret: privyAppSecret,
                  });

                  try {
                    const formattedValue = (typeof txValue === 'string' && txValue.startsWith('0x')
                      ? txValue
                      : `0x${BigInt(txValue || 0).toString(16)}`) as `0x${string}`;

                    const txResult = await privyNodeClient.wallets().ethereum().sendTransaction(privyInfo.walletId, {
                      caip2: 'eip155:42161',
                      params: {
                        transaction: {
                          to: txTo as `0x${string}`,
                          value: formattedValue,
                          ...(txData && txData !== '0x' ? { data: txData as `0x${string}` } : {}),
                        },
                      },
                      authorization_context: privyAuthKey
                        ? { authorization_private_keys: [privyAuthKey] }
                        : undefined,
                    });
                    txHash = txResult.hash;
                  } catch (sdkErr: any) {
                    detailedError = sdkErr?.message || sdkErr?.response?.data?.message || String(sdkErr);
                    console.error(`[DotiBot] Privy SDK Error for wallet ${privyInfo.walletId}:`, detailedError);
                  }

                  if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
                    console.error(`[DotiBot] Privy Execution Failed for wallet ${privyInfo.walletId}:`, detailedError);

                    broadcastAttempted = false;
                    await sb.from('processed_tweets')
                      .update({
                        tx_status: 'none',
                        last_error_code: 'PRIVY_REJECTED',
                        error_message: String(detailedError).slice(0, 500),
                        updated_at: new Date().toISOString(),
                      })
                      .eq('tweet_id', tweet.id)
                      .eq('tx_status', 'unknown');

                    throw new Error(`Privy rejected the transaction request: ${detailedError}`);
                  }
                  broadcastTxHash = txHash;

                  // Persist the transaction hash before returning. A later cron
                  // invocation confirms the receipt; don't consume the entire
                  // Vercel function timeout waiting for chain finality.
                  const { error: pendingError } = await sb.from('processed_tweets').update({
                    tx_hash: txHash,
                    tx_status: 'pending',
                    spent_amount_eth: requiredValueEth,
                    execution_status: 'retryable_failed',
                    locked_until: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  }).eq('tweet_id', tweet.id).eq('tx_status', 'unknown');
                  if (pendingError) throw pendingError;
                  hasRetryableFailure = true;
                  actionResults.push({ tweetId: tweet.id, command: cmd.type, pending: true, txHash });
                  continue;
                }
              }
            }
          }
        }
      }
    }
  }

        // Send Reply on Twitter
        if (replyText && twitterUserClient) {
          const replyRes = await twitterUserClient.v2.tweet({
            text: replyText,
            reply: { in_reply_to_tweet_id: tweet.id },
          });

          const { error: replyUpdateError } = await sb.from('processed_tweets').update({
            reply_status: 'sent',
            reply_text: replyText,
            reply_tweet_id: replyRes.data.id,
            execution_status: 'reply_sent',
            updated_at: new Date().toISOString(),
          }).eq('tweet_id', tweet.id);
          if (replyUpdateError) throw replyUpdateError;

          actionResults.push({
            tweetId: tweet.id,
            command: cmd.type,
            author: tweet.username,
            replySent: true,
            replyText,
          });
        }
      } catch (execErr: any) {
        console.error(`Error executing tweet ${tweet.id}:`, execErr);
        hasRetryableFailure = true;
        if (broadcastAttempted) {
          // Once a wallet submission was attempted, ordinary retries are unsafe:
          // Privy may have accepted it even if this worker timed out before
          // receiving/persisting its hash. Preserve the reservation and block
          // automatic rebroadcast until the outcome is reconciled.
          const recoveryUpdate = broadcastTxHash
            ? {
                tx_hash: broadcastTxHash,
                tx_status: 'pending',
                execution_status: 'retryable_failed',
                locked_until: new Date().toISOString(),
                error_message: 'Transaction submitted; receipt or persistence requires reconciliation',
                last_error_code: 'TX_SUBMISSION_RECONCILIATION',
                updated_at: new Date().toISOString(),
              }
            : {
                tx_status: 'unknown',
                execution_status: 'permanent_failed',
                error_message: 'Wallet submission outcome is unknown; automatic retry blocked',
                last_error_code: 'TX_SUBMISSION_UNKNOWN',
                locked_until: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
          const { error: recoveryError } = await sb.from('processed_tweets')
            .update(recoveryUpdate)
            .eq('tweet_id', tweet.id)
            .eq('tx_status', 'unknown');
          if (recoveryError) {
            console.error('Transaction reconciliation state could not be persisted:', recoveryError);
          }
        } else {
          if (budgetReserved) {
            const { error: releaseError } = await sb.rpc('finalize_daily_budget', {
              p_tweet_id: tweet.id,
              p_actual_spent: 0,
              p_success: false,
            });
            if (releaseError) {
              console.error('Could not release pre-broadcast spending reservation:', releaseError);
            } else {
              budgetReserved = false;
            }
          }
          const errMessage = execErr?.message || String(execErr);
          let errorCode = 'EXEC_ERROR';
          let isPermanent = false;
          if (errMessage.startsWith('GAS_LIMIT_EXCEEDED')) {
            errorCode = 'GAS_LIMIT_EXCEEDED';
          } else if (errMessage.startsWith('GAS_QUOTE_UNAVAILABLE')) {
            errorCode = 'GAS_QUOTE_UNAVAILABLE';
          } else if (errMessage.startsWith('GAS_ESTIMATE_FAILED')) {
            errorCode = 'GAS_ESTIMATE_FAILED';
          } else if (errMessage.startsWith('GAS_FEE_CEILING_EXCEEDED')) {
            errorCode = 'GAS_FEE_CEILING_EXCEEDED';
          }

          await sb.rpc('record_tweet_failure', {
            p_tweet_id: tweet.id,
            p_error_msg: errMessage,
            p_error_code: errorCode,
            p_is_permanent: isPermanent,
          });
        }
        actionResults.push({
          tweetId: tweet.id,
          command: cmd.type,
          error: broadcastAttempted
            ? 'Submission outcome needs reconciliation; automatic rebroadcast is blocked.'
            : 'Execution failed; it will be retried without broadcasting a duplicate transaction.',
        });
      }
    }

    // Advance pagination only after the entire fetched page has been handled.
    // If a transaction is pending or a lock is busy, replaying this page is
    // safe because tweet IDs are idempotency keys.
    if (!hasRetryableFailure) {
      const pageComplete = !nextPaginationToken;
      const nextPollState = pageComplete
        ? { since_id: highestTweetId || pollState.since_id, pagination_token: null, highest_seen_id: null }
        : {
            since_id: pollState.since_id,
            pagination_token: nextPaginationToken,
            highest_seen_id: highestTweetId || pollState.highest_seen_id || pollState.since_id,
          };
      const { error: cursorError } = await sb.from('bot_state').upsert({
        key: 'twitter_poll_state',
        value: JSON.stringify(nextPollState),
        updated_at: new Date().toISOString(),
      });
      if (cursorError) {
        console.error('Could not persist Twitter pagination state:', cursorError);
        return res.status(503).json({
          status: 'error',
          errorCode: 'TWITTER_CURSOR_PERSIST_FAILED',
          message: 'Mentions were processed but the cursor was not advanced; the page will be retried safely',
        });
      }

      if (pageComplete && nextPollState.since_id !== pollState.since_id) {
        const { error: legacyCursorError } = await sb.from('bot_state').upsert({
          key: 'twitter_last_since_id',
          value: nextPollState.since_id,
          updated_at: new Date().toISOString(),
        });
        if (legacyCursorError) console.error('Could not update legacy Twitter cursor:', legacyCursorError);
      }
    }

    return res.status(200).json({
      status: 'ok',
      botHandle: `@${botUsername}`,
      network: 'Arbitrum One',
      tweetsFound: tweetsToProcess.length,
      morePagesPending: Boolean(nextPaginationToken),
      actions: actionResults,
      timestamp: new Date().toISOString(),
    });
  } catch (globalErr: any) {
    console.error('Global bot handler error:', globalErr);
    return res.status(500).json({
      status: 'error',
      message: 'Bot execution failed before completion',
      timestamp: new Date().toISOString(),
    });
  }
}
