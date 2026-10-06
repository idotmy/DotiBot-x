import type { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default async function handler(req: Request, res: Response) {
  // CORS & Security Headers
  if (res?.setHeader) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, privy-app-id');
  }

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const authKeyId = process.env.PRIVY_AUTHORIZATION_KEY_ID ||
                      process.env.VITE_PRIVY_AUTHORIZATION_KEY_ID ||
                      process.env.PRIVY_KEY_QUORUM_ID ||
                      '';
    const defaultPolicyId = 'sux53y8l8ycow3j9eulcpoxh';

    // 1. Config endpoint: GET /api/delegation?action=config
    const url = new URL(req.url || '/', 'https://dotibot.invalid');
    const action = req.query?.action || url.searchParams.get('action');

    if (req.method === 'GET' && action === 'config') {
      return res.status(200).json({
        status: 'ok',
        authKeyId: authKeyId || null,
        policyId: defaultPolicyId,
      });
    }

    // 2. Fetch User Registered Domains: GET /api/delegation?action=domains
    if (req.method === 'GET' && action === 'domains') {
      const twitterHandle = ((req.query?.twitterHandle as string) || url.searchParams.get('twitterHandle') || '').replace(/^@/, '').toLowerCase().trim();
      const walletAddress = ((req.query?.walletAddress as string) || url.searchParams.get('walletAddress') || '').toLowerCase().trim();
      const twitterId = (req.query?.twitterUserId as string) || url.searchParams.get('twitterUserId') || '';

      const sb = getSupabaseClient();
      const domainItems: any[] = [];
      const seenNames = new Set<string>();

      if (sb) {
        try {
          let tweetQuery = sb.from('processed_tweets')
            .select('*')
            .eq('command_type', 'register');

          if (twitterHandle && twitterId) {
            tweetQuery = tweetQuery.or(`author_handle.ilike.${twitterHandle},author_twitter_id.eq.${twitterId}`);
          } else if (twitterHandle) {
            tweetQuery = tweetQuery.ilike('author_handle', twitterHandle);
          } else if (twitterId) {
            tweetQuery = tweetQuery.eq('author_twitter_id', twitterId);
          }

          const { data: tweets } = await tweetQuery;

          if (tweets && Array.isArray(tweets)) {
            for (const t of tweets) {
              if (t.tx_status === 'confirmed' || t.tx_hash || t.reply_status === 'sent') {
                const cleanText = (t.raw_text || '').replace(/https?:\/\/\S+/g, ' ');
                const match = cleanText.match(/(?:register|mint|claim|buy)\s+([a-zA-Z0-9_\-]+)(?:\.i)?/i);
                if (match) {
                  const rawName = match[1].toLowerCase().trim();
                  const fullName = `${rawName}.i`;
                  if (!seenNames.has(fullName)) {
                    seenNames.add(fullName);
                    domainItems.push({
                      name: rawName,
                      fullName,
                      ownerAddress: walletAddress || t.wallet_address || '',
                      ownerTwitter: t.author_handle ? `@${t.author_handle}` : undefined,
                      txHash: t.tx_hash || undefined,
                      registeredAt: t.created_at ? new Date(t.created_at).getTime() : Date.now(),
                      expiresAt: (t.created_at ? new Date(t.created_at).getTime() : Date.now()) + 365 * 24 * 60 * 60 * 1000,
                      priceEth: Number(t.spent_amount_eth || 0.001),
                    });
                  }
                }
              }
            }
          }
        } catch (dbErr) {
          console.warn('[Delegation API] Failed to fetch domains from processed_tweets:', dbErr);
        }
      }

      return res.status(200).json({
        status: 'ok',
        domains: domainItems,
      });
    }

    // 3. Query endpoint: GET /api/delegation?twitterUserId=... OR ?twitterHandle=...
    if (req.method === 'GET') {
      const twitterId = (req.query?.twitterUserId as string) || url.searchParams.get('twitterUserId') || '';
      const twitterHandle = (req.query?.twitterHandle as string) || url.searchParams.get('twitterHandle') || '';

      if (!twitterId && !twitterHandle) {
        return res.status(200).json({
          status: 'ok',
          authKeyId: authKeyId || null,
          policyId: defaultPolicyId,
        });
      }

      const sb = getSupabaseClient();
      if (sb) {
        let query = sb.from('user_delegations').select('*');
        if (twitterId) {
          query = query.eq('twitter_user_id', twitterId);
        } else if (twitterHandle) {
          query = query.eq('twitter_handle', twitterHandle.replace(/^@/, '').toLowerCase().trim());
        }

        const { data } = await query.maybeSingle();

        return res.status(200).json({
          status: 'ok',
          record: data || null,
        });
      }

      return res.status(200).json({ status: 'ok', record: null });
    }

    // 3. Save / Sync endpoint: POST /api/delegation
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          body = {};
        }
      } else if (!body) {
        body = {};
      }

      const {
        privyUserId,
        twitterUserId,
        twitterHandle,
        walletAddress,
        walletId,
        isDelegated,
      } = body;

      if (!privyUserId || !walletAddress || !walletId) {
        return res.status(400).json({
          status: 'error',
          message: 'Missing required delegation fields: privyUserId, walletAddress, walletId',
        });
      }

      let cleanHandle = twitterHandle;
      if (cleanHandle && typeof cleanHandle === 'string') {
        cleanHandle = cleanHandle.replace(/^@/, '').toLowerCase();
      }

      const sb = getSupabaseClient();
      let dbSynced = false;

      if (sb) {
        try {
          const payload: any = {
            privy_user_id: privyUserId,
            wallet_address: String(walletAddress).toLowerCase(),
            wallet_id: String(walletId),
            is_delegated: Boolean(isDelegated),
            updated_at: new Date().toISOString(),
          };

          if (twitterUserId) payload.twitter_user_id = String(twitterUserId);
          if (cleanHandle) payload.twitter_handle = cleanHandle;

          if (isDelegated) {
            payload.delegated_at = new Date().toISOString();
            payload.revoked_at = null;
          } else {
            payload.revoked_at = new Date().toISOString();
          }

          const { error } = await sb
            .from('user_delegations')
            .upsert(payload, { onConflict: 'privy_user_id' });

          if (!error) {
            dbSynced = true;
          } else {
            console.error('[Delegation API] Supabase upsert note:', error.message);
          }
        } catch (dbErr: any) {
          console.error('[Delegation API] Supabase exception:', dbErr?.message);
        }
      }

      return res.status(200).json({
        status: 'ok',
        synced: dbSynced,
        privyUserId,
        walletAddress,
        walletId,
        isDelegated: Boolean(isDelegated),
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(405).json({ status: 'error', message: 'Method not allowed' });
  } catch (err: any) {
    console.error('[Delegation API] Unhandled handler error:', err);
    return res.status(200).json({
      status: 'ok',
      synced: false,
      message: 'Delegation handled with fallback',
      error: err?.message,
    });
  }
}