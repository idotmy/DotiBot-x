import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
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

export interface LockResult {
  acquired: boolean;
  action_mode?: 'full_execute' | 'reply_only' | 'verify_receipt_only';
  reason?: string;
  tx_hash?: string;
  spent_amount_eth?: number;
}

export interface BudgetResult {
  allowed: boolean;
  reason?: string;
  reserved?: number;
  status?: string;
}

export async function dbAcquireTweetLock(
  tweetId: string,
  author: string,
  command: string,
  rawText: string,
  ttlSeconds: number = 120
): Promise<LockResult> {
  const sb = getSupabaseClient();
  if (!sb) {
    // If Supabase is not configured, fallback to in-memory non-distributed mode
    return { acquired: true, action_mode: 'full_execute' };
  }

  try {
    const { data, error } = await sb.rpc('acquire_tweet_lock', {
      p_tweet_id: tweetId,
      p_author: author,
      p_command: command,
      p_raw_text: rawText,
      p_ttl_seconds: ttlSeconds,
    });

    if (error) {
      console.error('[Supabase] acquire_tweet_lock error:', error);
      return { acquired: false, reason: `DB error: ${error.message}` };
    }

    return (data as LockResult) || { acquired: false, reason: 'unknown' };
  } catch (err: any) {
    console.error('[Supabase] acquire_tweet_lock exception:', err);
    return { acquired: false, reason: err?.message || 'DB exception' };
  }
}

export async function dbReserveDailyBudget(
  tweetId: string,
  wallet: string,
  amountEth: number
): Promise<BudgetResult> {
  const sb = getSupabaseClient();
  if (!sb) {
    // If no DB configured, allow standard spend limit check
    return { allowed: true };
  }

  try {
    const { data, error } = await sb.rpc('reserve_daily_budget', {
      p_tweet_id: tweetId,
      p_wallet: wallet,
      p_amount_eth: amountEth,
    });

    if (error) {
      console.error('[Supabase] reserve_daily_budget error:', error);
      return { allowed: false, reason: error.message };
    }

    return (data as BudgetResult) || { allowed: false, reason: 'unknown' };
  } catch (err: any) {
    console.error('[Supabase] reserve_daily_budget exception:', err);
    return { allowed: false, reason: err?.message };
  }
}

export async function dbFinalizeDailyBudget(
  tweetId: string,
  actualSpentEth: number,
  success: boolean
): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb) return;

  try {
    const { error } = await sb.rpc('finalize_daily_budget', {
      p_tweet_id: tweetId,
      p_actual_spent: actualSpentEth,
      p_success: success,
    });
    if (error) console.error('[Supabase] finalize_daily_budget error:', error);
  } catch (err: any) {
    console.error('[Supabase] finalize_daily_budget exception:', err);
  }
}

export async function dbRecordTweetFailure(
  tweetId: string,
  errorMsg: string,
  errorCode: string,
  isPermanent: boolean = false
): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb) return;

  try {
    const { error } = await sb.rpc('record_tweet_failure', {
      p_tweet_id: tweetId,
      p_error_msg: errorMsg,
      p_error_code: errorCode,
      p_is_permanent: isPermanent,
    });
    if (error) console.error('[Supabase] record_tweet_failure error:', error);
  } catch (err: any) {
    console.error('[Supabase] record_tweet_failure exception:', err);
  }
}

export async function dbUpdateTxStatus(
  tweetId: string,
  txHash: string,
  txStatus: 'pending' | 'confirmed' | 'reverted',
  spentAmountEth: number = 0,
  gasSpentEth: number = 0
): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb) return;

  try {
    const { error } = await sb
      .from('processed_tweets')
      .update({
        tx_hash: txHash,
        tx_status: txStatus,
        spent_amount_eth: spentAmountEth,
        gas_spent_eth: gasSpentEth,
        updated_at: new Date().toISOString(),
      })
      .eq('tweet_id', tweetId);

    if (error) console.error('[Supabase] updateTxStatus error:', error);
  } catch (err: any) {
    console.error('[Supabase] updateTxStatus exception:', err);
  }
}

export async function dbUpdateReplyStatus(
  tweetId: string,
  replyStatus: 'sent' | 'failed',
  replyText: string,
  replyTweetId?: string
): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb) return;

  try {
    const updates: any = {
      reply_status: replyStatus,
      reply_text: replyText,
      updated_at: new Date().toISOString(),
    };

    if (replyTweetId) {
      updates.reply_tweet_id = replyTweetId;
    }

    if (replyStatus === 'sent') {
      updates.execution_status = 'reply_sent';
    }

    const { error } = await sb
      .from('processed_tweets')
      .update(updates)
      .eq('tweet_id', tweetId);

    if (error) console.error('[Supabase] updateReplyStatus error:', error);
  } catch (err: any) {
    console.error('[Supabase] updateReplyStatus exception:', err);
  }
}

export async function dbGetLastSinceId(): Promise<string> {
  const sb = getSupabaseClient();
  if (!sb) return '0';

  try {
    const { data, error } = await sb
      .from('bot_state')
      .select('value')
      .eq('key', 'twitter_last_since_id')
      .single();

    if (error || !data) return '0';
    return data.value || '0';
  } catch {
    return '0';
  }
}

export async function dbSetLastSinceId(sinceId: string): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb) return;

  try {
    await sb
      .from('bot_state')
      .upsert({
        key: 'twitter_last_since_id',
        value: sinceId,
        updated_at: new Date().toISOString(),
      });
  } catch (err) {
    console.error('[Supabase] setLastSinceId error:', err);
  }
}
