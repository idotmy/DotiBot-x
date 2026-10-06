-- ==============================================================================
-- DotiBot Autonomous Agent - Enterprise Hardened Schema (Supabase PostgreSQL)
-- ==============================================================================

-- 1. State Table (For Cursor & since_id Tracking)
CREATE TABLE IF NOT EXISTS bot_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO bot_state (key, value) 
VALUES ('twitter_last_since_id', '0')
ON CONFLICT (key) DO NOTHING;

INSERT INTO bot_state (key, value)
VALUES ('twitter_poll_state', '{"since_id":"0","pagination_token":null,"highest_seen_id":null}')
ON CONFLICT (key) DO NOTHING;

-- 2. Processed Tweets Table (State Machine, Idempotency & Distributed Lock)
CREATE TABLE IF NOT EXISTS processed_tweets (
    tweet_id TEXT PRIMARY KEY,
    author_handle TEXT NOT NULL,
    author_twitter_id TEXT,
    command_type TEXT NOT NULL,
    raw_text TEXT NOT NULL,
    execution_status TEXT NOT NULL DEFAULT 'locked_processing', -- locked_processing, tx_confirmed, reply_sent, retryable_failed, permanent_failed
    tx_hash TEXT,
    tx_status TEXT DEFAULT 'none', -- none, pending, confirmed, reverted
    reply_status TEXT DEFAULT 'none', -- none, pending, sent, failed
    reply_tweet_id TEXT,
    reply_text TEXT,
    spent_amount_eth NUMERIC(38, 18) DEFAULT 0,
    gas_spent_eth NUMERIC(38, 18) DEFAULT 0,
    error_message TEXT,
    last_error_code TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at TIMESTAMPTZ DEFAULT NOW(),
    locked_until TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '120 seconds'),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processed_tweets_status ON processed_tweets(execution_status);
CREATE INDEX IF NOT EXISTS idx_processed_tweets_retry ON processed_tweets(next_retry_at);

-- 3. Daily Spending Ledger & Reservations Table
CREATE TABLE IF NOT EXISTS daily_spending (
    wallet_address TEXT NOT NULL,
    day_date DATE NOT NULL,
    total_spent_eth NUMERIC(38, 18) DEFAULT 0,
    max_daily_limit_eth NUMERIC(38, 18) DEFAULT 0.003,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (wallet_address, day_date)
);

CREATE TABLE IF NOT EXISTS spending_reservations (
    tweet_id TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    day_date DATE NOT NULL,
    reserved_amount_eth NUMERIC(38, 18) NOT NULL,
    actual_spent_eth NUMERIC(38, 18) DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active_pending', -- active_pending, finalized_spent, released_failed
    created_at TIMESTAMPTZ DEFAULT NOW(),
    finalized_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_spending_res_wallet_day ON spending_reservations(wallet_address, day_date);
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'spending_reservations_non_negative_amounts'
    ) THEN
        ALTER TABLE spending_reservations
            ADD CONSTRAINT spending_reservations_non_negative_amounts
            CHECK (reserved_amount_eth > 0 AND actual_spent_eth >= 0);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'daily_spending_non_negative_total'
    ) THEN
        ALTER TABLE daily_spending
            ADD CONSTRAINT daily_spending_non_negative_total
            CHECK (total_spent_eth >= 0 AND max_daily_limit_eth > 0);
    END IF;
END $$;

-- Widen numeric fields for existing installations; ETH gas and value can have
-- precision below eight decimal places.
ALTER TABLE processed_tweets
    ADD COLUMN IF NOT EXISTS author_twitter_id TEXT,
    ALTER COLUMN spent_amount_eth TYPE NUMERIC(38, 18),
    ALTER COLUMN gas_spent_eth TYPE NUMERIC(38, 18);
ALTER TABLE daily_spending
    ALTER COLUMN total_spent_eth TYPE NUMERIC(38, 18),
    ALTER COLUMN max_daily_limit_eth TYPE NUMERIC(38, 18);
ALTER TABLE spending_reservations
    ALTER COLUMN reserved_amount_eth TYPE NUMERIC(38, 18),
    ALTER COLUMN actual_spent_eth TYPE NUMERIC(38, 18);
ALTER TABLE processed_tweets
    ALTER COLUMN next_retry_at SET DEFAULT NOW(),
    ALTER COLUMN locked_until SET DEFAULT (NOW() + INTERVAL '120 seconds'),
    ALTER COLUMN created_at SET DEFAULT NOW(),
    ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE daily_spending
    ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE spending_reservations
    ALTER COLUMN created_at SET DEFAULT NOW();

-- 4. User Delegations Table (For Server-Side Bot Authorization Linkage)
CREATE TABLE IF NOT EXISTS user_delegations (
    privy_user_id TEXT PRIMARY KEY,
    twitter_user_id TEXT UNIQUE,
    twitter_handle TEXT,
    wallet_address TEXT NOT NULL,
    wallet_id TEXT NOT NULL,
    is_delegated BOOLEAN DEFAULT TRUE,
    delegated_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_delegations_twitter_id ON user_delegations(twitter_user_id);
CREATE INDEX IF NOT EXISTS idx_user_delegations_wallet ON user_delegations(wallet_address);
CREATE INDEX IF NOT EXISTS idx_user_delegations_handle ON user_delegations(twitter_handle);

-- ==============================================================================
-- 5. Atomic PostgreSQL Engine Functions
-- ==============================================================================

-- Function A: Atomic Tweet Lock & Idempotent Routing
CREATE OR REPLACE FUNCTION acquire_tweet_lock(
    p_tweet_id TEXT,
    p_author TEXT,
    p_command TEXT,
    p_raw_text TEXT,
    p_ttl_seconds INTEGER DEFAULT 120
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_rec RECORD;
BEGIN
    -- A newly inserted row is already owned by this invocation. Existing
    -- rows are locked below. This avoids the old time-based exception that
    -- allowed two concurrent cron invocations to acquire the same tweet.
    INSERT INTO processed_tweets (
        tweet_id, author_handle, command_type, raw_text,
        execution_status, locked_until, next_retry_at, created_at, updated_at
    ) VALUES (
        p_tweet_id, p_author, p_command, p_raw_text,
        'locked_processing', v_now + (p_ttl_seconds || ' seconds')::INTERVAL, v_now, v_now, v_now
    )
    ON CONFLICT (tweet_id) DO NOTHING
    RETURNING * INTO v_rec;

    IF FOUND THEN
        RETURN jsonb_build_object('acquired', true, 'action_mode', 'full_execute');
    END IF;

    -- Fetch and lock the existing record
    SELECT * INTO v_rec FROM processed_tweets WHERE tweet_id = p_tweet_id FOR UPDATE;

    -- Scenario 1: Already fully completed
    IF v_rec.execution_status = 'reply_sent' THEN
        RETURN jsonb_build_object('acquired', false, 'reason', 'already_completed');
    END IF;

    -- Respect an active lease before routing pending/confirmed transactions.
    -- Without this ordering, concurrent workers could both send a reply or
    -- independently finalize the same pending receipt.
    IF v_rec.execution_status = 'locked_processing' AND v_rec.locked_until > v_now THEN
        RETURN jsonb_build_object('acquired', false, 'reason', 'currently_locked_active');
    END IF;

    -- Scenario 2: On-chain transaction already confirmed! DO NOT RE-EXECUTE ON-CHAIN!
    IF v_rec.tx_status = 'confirmed' THEN
        IF v_rec.reply_status != 'sent' THEN
            -- Re-lock for reply sending only
            UPDATE processed_tweets 
            SET execution_status = 'locked_processing',
                locked_until = v_now + (p_ttl_seconds || ' seconds')::INTERVAL,
                updated_at = v_now
            WHERE tweet_id = p_tweet_id;

            RETURN jsonb_build_object(
                'acquired', true, 
                'action_mode', 'reply_only', 
                'tx_hash', v_rec.tx_hash,
                'spent_amount_eth', v_rec.spent_amount_eth,
                'gas_spent_eth', v_rec.gas_spent_eth
            );
        END IF;
    END IF;

    -- Scenario 3: Transaction pending verification (Check receipt only)
    IF v_rec.tx_status = 'pending' AND v_rec.tx_hash IS NOT NULL THEN
        UPDATE processed_tweets
        SET execution_status = 'locked_processing',
            locked_until = v_now + (p_ttl_seconds || ' seconds')::INTERVAL,
            updated_at = v_now
        WHERE tweet_id = p_tweet_id;
        RETURN jsonb_build_object(
            'acquired', true, 
            'action_mode', 'verify_receipt_only', 
            'tx_hash', v_rec.tx_hash,
            'spent_amount_eth', v_rec.spent_amount_eth,
            'gas_spent_eth', v_rec.gas_spent_eth
        );
    END IF;

    -- A reverted transaction is final for this tweet. Never rebroadcast it.
    IF v_rec.tx_status IN ('reverted', 'unknown') THEN
        RETURN jsonb_build_object('acquired', false, 'reason', 'transaction_already_submitted');
    END IF;

    -- Scenario 5: Check next retry schedule
    IF v_rec.next_retry_at > v_now THEN
        RETURN jsonb_build_object('acquired', false, 'reason', 'waiting_retry_backoff', 'next_retry_at', v_rec.next_retry_at);
    END IF;

    -- Scenario 6: Permanent failed
    IF v_rec.execution_status = 'permanent_failed' THEN
        RETURN jsonb_build_object('acquired', false, 'reason', 'permanent_failed');
    END IF;

    -- Scenario 7: Acquire lock for full fresh execution / retry
    UPDATE processed_tweets
    SET execution_status = 'locked_processing',
        locked_until = v_now + (p_ttl_seconds || ' seconds')::INTERVAL,
        updated_at = v_now
    WHERE tweet_id = p_tweet_id;

    RETURN jsonb_build_object('acquired', true, 'action_mode', 'full_execute');
END;
$$;

-- Function B: Atomic Budget Reservation
CREATE OR REPLACE FUNCTION reserve_daily_budget(
    p_tweet_id TEXT,
    p_wallet TEXT,
    p_amount_eth NUMERIC,
    p_daily_cap NUMERIC DEFAULT 0.003
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_today DATE := (NOW() AT TIME ZONE 'UTC')::DATE;
    v_wallet TEXT := LOWER(COALESCE(p_wallet, ''));
    v_spent NUMERIC := 0;
    v_pending NUMERIC := 0;
    v_daily_cap NUMERIC := LEAST(GREATEST(COALESCE(p_daily_cap, 0.003), 0), 0.003); -- Server hard ceiling
    v_existing_res RECORD;
BEGIN
    IF v_wallet !~ '^0x[a-f0-9]{40}$' OR
       p_amount_eth IS NULL OR p_amount_eth <= 0 OR p_amount_eth > v_daily_cap THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'Invalid or over-cap spending request');
    END IF;

    -- Check if reservation already exists for this tweet
    SELECT * INTO v_existing_res FROM spending_reservations WHERE tweet_id = p_tweet_id FOR UPDATE;
    IF v_existing_res IS NOT NULL THEN
        IF v_existing_res.status = 'active_pending' THEN
            IF LOWER(v_existing_res.wallet_address) = v_wallet
               AND v_existing_res.reserved_amount_eth >= p_amount_eth THEN
                RETURN jsonb_build_object('allowed', true, 'status', 'already_reserved');
            END IF;
            RETURN jsonb_build_object('allowed', false, 'reason', 'Reservation does not match this request');
        ELSIF v_existing_res.status = 'finalized_spent' THEN
            RETURN jsonb_build_object('allowed', false, 'reason', 'This transaction was already completed and spent');
        END IF;
        -- If status is 'released_failed', allow re-evaluating and re-reserving
    END IF;

    -- Ensure daily spending row exists
    INSERT INTO daily_spending (wallet_address, day_date, total_spent_eth, max_daily_limit_eth, updated_at)
    VALUES (v_wallet, v_today, 0, v_daily_cap, (NOW() AT TIME ZONE 'UTC'))
    ON CONFLICT (wallet_address, day_date) DO NOTHING;

    -- Lock daily spending row
    SELECT total_spent_eth INTO v_spent FROM daily_spending 
    WHERE wallet_address = v_wallet AND day_date = v_today FOR UPDATE;

    -- Calculate active pending reservations for this wallet today (excluding current tweet)
    SELECT COALESCE(SUM(reserved_amount_eth), 0) INTO v_pending 
    FROM spending_reservations 
    WHERE wallet_address = v_wallet AND day_date = v_today AND status = 'active_pending'
      AND tweet_id != p_tweet_id;

    IF (v_spent + v_pending + p_amount_eth) > v_daily_cap THEN
        RETURN jsonb_build_object(
            'allowed', false, 
            'reason', 'Daily spend limit of 0.003 ETH exceeded',
            'total_spent', v_spent,
            'pending_reserved', v_pending,
            'daily_limit', v_daily_cap
        );
    END IF;

    -- Record or update atomic reservation
    INSERT INTO spending_reservations (tweet_id, wallet_address, day_date, reserved_amount_eth, actual_spent_eth, status, created_at, finalized_at)
    VALUES (p_tweet_id, v_wallet, v_today, p_amount_eth, 0, 'active_pending', (NOW() AT TIME ZONE 'UTC'), NULL)
    ON CONFLICT (tweet_id) DO UPDATE 
    SET wallet_address = EXCLUDED.wallet_address,
        day_date = EXCLUDED.day_date,
        reserved_amount_eth = EXCLUDED.reserved_amount_eth,
        actual_spent_eth = 0,
        status = 'active_pending',
        finalized_at = NULL;

    RETURN jsonb_build_object('allowed', true, 'reserved', p_amount_eth);
END;
$$;

-- Function C: Idempotent Finalization of Budget
CREATE OR REPLACE FUNCTION finalize_daily_budget(
    p_tweet_id TEXT,
    p_actual_spent NUMERIC,
    p_success BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_res RECORD;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    IF p_actual_spent IS NULL OR p_actual_spent < 0 THEN
        RAISE EXCEPTION 'Actual spend must be a non-negative amount';
    END IF;

    SELECT * INTO v_res FROM spending_reservations WHERE tweet_id = p_tweet_id FOR UPDATE;

    IF v_res IS NULL OR v_res.status != 'active_pending' THEN
        RETURN; -- Idempotent safe exit
    END IF;

    -- Gas is spent even if the EVM transaction reverts. Count every positive
    -- actual charge against the daily ceiling; only zero-spend failures release.
    -- The API must bound gas/maxFeePerGas before broadcast. If a legacy record
    -- ever reports an over-reservation charge, keep the real amount for audit
    -- and prevent further reservations through the accumulated total.
    IF p_success OR p_actual_spent > 0 THEN
        UPDATE daily_spending
        SET total_spent_eth = total_spent_eth + p_actual_spent,
            updated_at = v_now
        WHERE wallet_address = v_res.wallet_address AND day_date = v_res.day_date;

        UPDATE spending_reservations
        SET status = 'finalized_spent',
            actual_spent_eth = p_actual_spent,
            finalized_at = v_now
        WHERE tweet_id = p_tweet_id;
    ELSE
        UPDATE spending_reservations
        SET status = 'released_failed',
            finalized_at = v_now
        WHERE tweet_id = p_tweet_id;
    END IF;
END;
$$;

-- Function D: Update Retry & Backoff Schedule on Failures
CREATE OR REPLACE FUNCTION record_tweet_failure(
    p_tweet_id TEXT,
    p_error_msg TEXT,
    p_error_code TEXT,
    p_is_permanent BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rec RECORD;
    v_now TIMESTAMPTZ := NOW();
    v_delay INTEGER;
BEGIN
    SELECT * INTO v_rec FROM processed_tweets WHERE tweet_id = p_tweet_id;
    IF v_rec IS NULL THEN RETURN; END IF;

    IF p_is_permanent OR (v_rec.retry_count + 1) >= v_rec.max_retries THEN
        UPDATE processed_tweets
        SET execution_status = 'permanent_failed',
            error_message = p_error_msg,
            last_error_code = p_error_code,
            retry_count = retry_count + 1,
            locked_until = v_now,
            updated_at = v_now
        WHERE tweet_id = p_tweet_id;
    ELSE
        -- Exponential backoff: retry 1 -> 60s, retry 2 -> 300s, retry 3 -> 900s
        v_delay := CASE 
            WHEN v_rec.retry_count = 0 THEN 60 
            WHEN v_rec.retry_count = 1 THEN 300 
            ELSE 900 
        END;

        UPDATE processed_tweets
        SET execution_status = 'retryable_failed',
            error_message = p_error_msg,
            last_error_code = p_error_code,
            retry_count = retry_count + 1,
            next_retry_at = v_now + (v_delay || ' seconds')::INTERVAL,
            locked_until = v_now,
            updated_at = v_now
        WHERE tweet_id = p_tweet_id;
    END IF;
END;
$$;

-- ==============================================================================
-- 5. Row Level Security (RLS) Lockdown
-- ==============================================================================
ALTER TABLE bot_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_tweets ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_spending ENABLE ROW LEVEL SECURITY;
ALTER TABLE spending_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_delegations ENABLE ROW LEVEL SECURITY;

-- Revoke all public/anon access
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- Grant exclusive access to service_role (Backend API)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;
