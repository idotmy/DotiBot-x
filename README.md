# DotiBot (@dotibot) — Web3 Domain Agent

[![License: MIT](https://img.shields.io/badge/License-MIT-cyan.svg)](https://opensource.org/licenses/MIT)
[![Network: Arbitrum One](https://img.shields.io/badge/Network-Arbitrum%20One%20(42161)-blue.svg)](https://arbiscan.io)
[![Auth: Privy Embedded](https://img.shields.io/badge/Auth%20%26%20Wallets-Privy%20Embedded%20(MPC)-darkgreen.svg)](https://privy.io)

**DotiBot** provides a seamless web interface for `.i` domain operations on **Arbitrum One**, plus an autonomous Twitter bot agent. Transactions are executed directly via your delegated Privy embedded wallet session without signature popup fatigue, bounded by the configured daily spending limit (0.003 ETH/day).

The spending limit guard ensures automated transactions remain strictly within safety thresholds. The Twitter bot uses server-side authorization credentials, a Supabase ledger, and an external cron schedule protected by a bearer secret.

---

## 🌟 Key Features

- **Autonomous 𝕏 (Twitter) Bot**: Mint domains, transfer NFTs, and send ETH directly via tweet mentions to `@dotibot`.
- **1-Click Twitter (𝕏) Onboarding**: Instant self-custodial embedded wallet provisioning tied securely to your social identity.
- **Privy Embedded Wallets (MPC)**: Gas-optimized self-custodial embedded wallets executing directly on Arbitrum One without seed phrases.
- **Smart Spending Delegation**: Robust daily spend guard (capped at 0.003 ETH/day) with atomic idempotency locks and gas ceiling safeguards.
- **Natural Language Command Parser**: Fast, deterministic intent processor with zero external LLM latency, zero API costs, and 100% execution precision.
- **Permanent On-Chain Settlement**: Real-time interaction with the official Doti Registry contract (`0xf853F8243F10a57CF5e43A49F156F132c05C21a6`) on Arbitrum One.
- **Self-Custodial Asset Management**: Built-in ETH withdrawal modal to easily transfer funds out of your embedded wallet to any external address anytime.

---

## 🛠️ Technology Stack

| Layer | Technology | Description |
| :--- | :--- | :--- |
| **Blockchain** | **Arbitrum One (L2)** | Ultra-low gas fees (~$0.01) with sub-second EVM finality |
| **Embedded Wallets** | **Privy (MPC Embedded)** | Multi-Party Computation (MPC) self-custodial embedded wallets on Arbitrum |
| **Blockchain Client** | **Viem & Ox** | Type-safe Ethereum & Arbitrum contract interfaces |
| **Frontend UI** | **React 19, TypeScript, Tailwind CSS** | Clean cyber-terminal interface with dark/light mode |
| **Icons & Effects** | **Lucide Icons & Canvas Confetti** | Streamlined developer aesthetic & interactive feedback |
| **Backend & Bot API** | **Node.js, Express, Twitter API v2** | Authenticated bot endpoint with distributed database locks and cron scheduling |

---

## 💬 Command Reference & Syntax

You can interact with DotiBot both in the **Web Portal** and **directly on 𝕏 (Twitter)**:

| Action | Example Command (Web & Twitter) | Description |
| :--- | :--- | :--- |
| **Register / Mint** | `Hi @dotibot, register myname.i` | Registers your permanent `.i` domain on Arbitrum One |
| **Check Availability** | `Check satoshi.i` | Queries on-chain registry for availability & price |
| **Transfer Domain** | `Hi @dotibot, transfer myname.i to @friend` *(or `0x...`)* | Transfers domain NFT ownership to target Twitter user or 0x address |
| **Send ETH / Tip** | `Hi @dotibot, send 0.001 ETH to @friend` *(or `0x...`)* | Transfers native ETH directly from your connected wallet |
| **Portfolio Summary** | `My domains` | Displays all `.i` domains owned by your connected wallet |
| **Help & Guide** | `Help` / `Commands` | Shows interactive guide and example templates |

---

## ⛓️ Smart Contract & Network Parameters

- **Network**: Arbitrum One
- **Chain ID**: `42161` (`0xa4b1`)
- **Default RPC**: `https://arb1.arbitrum.io/rpc`
- **Doti Registry Contract**: [`0xf853F8243F10a57CF5e43A49F156F132c05C21a6`](https://arbiscan.io/address/0xf853F8243F10a57CF5e43A49F156F132c05C21a6)
- **Domain Standard**: ERC-721 Sovereign Naming Registry
- **Block Explorer**: [Arbiscan Explorer](https://arbiscan.io)

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18.0.0 or higher)
- npm or yarn

### 1. Clone Repository
```bash
git clone https://github.com/idotmy/DotiBot-x.git
cd DotiBot-x
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your configuration:
```env
VITE_PRIVY_APP_ID=your_privy_app_id
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
```

### 4. Run Development Server
```bash
npm run dev
```
Open your browser at `http://localhost:3000`.

### 5. Build & Run Web Portal
```bash
npm run build
npm start
```

### 6. Production Twitter bot

The old standalone polling worker is disabled. Deploy the Vercel app and configure an external scheduler (for example, cron-job.org) to send a `GET` request to `/api/bot` with `Authorization: Bearer <CRON_SECRET>`. Never put the secret in the URL. Apply `supabase-schema.sql` before enabling the schedule. See the deployment checklist below.

### 6.1 What `twitter_poll_state` means

`twitter_poll_state` is the durable cursor for the production mention reader. It is a row in
the `bot_state` table; it is not a Twitter setting and it is not a user account.

The initial value created by `supabase-schema.sql` is:

```json
{
  "since_id": "0",
  "pagination_token": null,
  "highest_seen_id": null
}
```

The production flow uses it as follows:

1. On the first run, `since_id = "0"` means the bot asks X for the newest page of mentions.
2. The API reads at most 20 mentions per invocation. If X returns a `next_token`, that token is
   saved in `pagination_token`, so the next cron run continues the same result set instead of
   skipping older mentions.
3. `highest_seen_id` remembers the largest tweet ID seen while the pages are being drained.
4. The cursor is advanced only after the page was fetched and processed without a retryable
   database, Twitter, transaction, or reply failure.
5. When all pages are complete, `since_id` becomes the highest processed tweet ID and the
   pagination fields are cleared.
6. If fetching mentions fails, the cursor is not advanced. If a stale pagination token fails,
   the token is cleared and the next run starts again from the saved `since_id`.
7. `twitter_last_since_id` is a legacy compatibility row. `twitter_poll_state` is the primary
   state for the current Vercel route.

Do not edit this row during normal operation. To inspect it in Supabase SQL Editor:

```sql
select key, value, updated_at
from public.bot_state
where key in ('twitter_poll_state', 'twitter_last_since_id');
```

If the row is missing, rerun the state-table portion of `supabase-schema.sql` in the intended
Supabase project. Setting the cursor back to `0` is not a harmless test: it can make the bot
read old mentions again. Tweet-id idempotency prevents a second broadcast for rows already
recorded in `processed_tweets`, but old unrecorded mentions may still be processed.

### 6.2 Complete X/Twitter Developer setup for this code

X currently presents the developer configuration as **Project → App → Keys and tokens**. The
word “API” is still used in the credential names and documentation, while the console often
uses “App” and “Client”. For this project, choose the credentials by their exact names, not
by the word “client”.

#### Which X credentials this project actually uses

The production route in `api/bot.ts` uses `twitter-api-v2` with **OAuth 1.0a User Context**:

```ts
new TwitterApi({
  appKey,
  appSecret,
  accessToken,
  accessSecret,
});
```

Map the X console values to Vercel like this:

| X Developer Console value | Vercel variable | Required | Purpose |
|---|---|---:|---|
| API Key (also called Consumer Key) | `TWITTER_API_KEY` | Yes | Identifies the X App |
| API Key Secret (also called Consumer Secret) | `TWITTER_API_SECRET` | Yes | Signs the App request |
| Access Token | `TWITTER_ACCESS_TOKEN` | Yes | Identifies the X user whose mentions are read and replies are posted as |
| Access Token Secret | `TWITTER_ACCESS_SECRET` | Yes | Signs that user context |
| Bearer Token | `TWITTER_BEARER_TOKEN` | Optional for the current Vercel route | App-only/public-data credential; the current production route requires User OAuth and does not use this value to post |
| OAuth 2.0 Client ID | Do not put in the four variables above | No for this implementation | OAuth 2.0 client identifier; not interchangeable with API Key |
| OAuth 2.0 Client Secret | Do not put in the four variables above | No for this implementation | OAuth 2.0 secret; not interchangeable with API Secret |

The most important rule is: **the Access Token and Access Token Secret must belong to the
actual bot X account**. If you create the App while signed in as your personal X account and
generate tokens for that account, the bot will read your personal mentions and post as you,
not as `@dotibot`.

#### Step 1: Create or open the developer Project

1. Sign in to the X Developer Console: [console.x.com](https://console.x.com).
2. Open the Project that will own this application, or create a new Project.
3. Confirm that the Project has an active API access tier and that the App is attached to it.
   The API access tier controls availability and monthly/rate limits; it is separate from the
   permissions below.
4. Create an App inside the Project if one does not exist.
5. Use a clear App name such as `DotiBot Production`, and keep a separate App/Project for
   staging if possible.

#### Step 2: Configure the App for bot reads and replies

Open the App settings and find **User authentication settings**, **App permissions**, or the
equivalent settings section. The exact label can vary in the console.

For this code:

- Select **Read and write**.
- Do not choose read-only; read-only cannot post the bot replies.
- Direct Messages are not required.
- Set the App website to the public DotiBot website.
- If the console asks for a callback/redirect URL, use the production callback URL required by
  the selected OAuth flow. The fixed bot tokens used by this worker are generated from the
  App's Keys and tokens page; cron-job.org is not an OAuth callback.
- Save the settings before generating tokens.

Changing permissions after tokens were generated may require regenerating the bot's Access
Token and Access Token Secret. Treat regeneration as an immediate credential rotation: the old
token stops being valid.

#### Step 3: Generate the four credentials the worker needs

Open the App's **Keys and tokens** page:

1. Copy or regenerate **API Key** and save it as `TWITTER_API_KEY`.
2. Copy or regenerate **API Key Secret** and save it as `TWITTER_API_SECRET`.
3. Under **Authentication Tokens**, generate **Access Token and Secret** with the bot account's
   user context.
4. Save the Access Token as `TWITTER_ACCESS_TOKEN`.
5. Save the Access Token Secret as `TWITTER_ACCESS_SECRET`.
6. Optionally copy the Bearer Token as `TWITTER_BEARER_TOKEN`; it is not a replacement for the
   Access Token pair in this production route.

X may display a secret only once. Do not paste any of these values into source code, README,
issues, screenshots, chat, or a query string. Put them only in Vercel's encrypted environment
variables. If a value was exposed, regenerate it in X and update Vercel immediately.

#### Step 4: Set the identity variable correctly

Set the handle without `@`:

```env
BOT_USERNAME=dotibot
```

The code calls `v2.me()` and compares the authenticated account to this value. If the token
belongs to another account, `/api/bot` returns an identity-mismatch error and does not process
commands.

#### Step 5: Configure Vercel variables

In the Vercel project, add the four required X values to the same environment where the
production function runs:

```env
BOT_USERNAME=dotibot
TWITTER_API_KEY=...
TWITTER_API_SECRET=...
TWITTER_ACCESS_TOKEN=...
TWITTER_ACCESS_SECRET=...
```

Keep the values server-only. None of the Twitter secrets may start with `VITE_`. Redeploy
after changing production variables.

#### Step 6: Configure cron-job.org

Create one scheduled job:

- URL: `https://YOUR_PRODUCTION_DOMAIN/api/bot`
- Method: `GET`
- Header:

```http
Authorization: Bearer YOUR_CRON_SECRET
```

- Do not put `CRON_SECRET` in the URL.
- Start with one job and a conservative interval such as every 1–5 minutes, subject to the
  X API access tier and rate limits.
- Avoid intentionally overlapping jobs. The database lock protects tweet processing, but one
  scheduler is easier to operate and monitor.
- Keep all Twitter money flags `false` until read-only tests pass.

#### Step 7: Test the X connection before enabling money actions

Use the deployed URL and check these in order:

1. `GET /api/health` returns the public health response.
2. `GET /api/bot` without an `Authorization` header returns `401`.
3. `GET /api/bot` with a wrong Bearer value returns `401`.
4. `GET /api/bot?mode=diagnostics` with the correct Bearer value confirms:
   - the authenticated account matches `BOT_USERNAME`;
   - the database is connected;
   - the Privy secret is configured.
5. From a second X account, mention the bot with `help`.
6. Confirm the bot replies from the bot account.
7. Mention `check name.i` and confirm the reply comes from the deployed route.
8. Confirm `twitter_poll_state` changes in Supabase and that the same tweet does not receive
   a second reply when the cron runs again.

Do not use a successful `/api/health` response as proof that X authentication works. Health is
public and does not call X.

### Production deployment checklist

1. Deploy the Vite app and `api/bot.ts` as a Vercel project; configure `npm run build` and `dist`.
2. Add the environment variables from `.env.example` in Vercel. Required server secrets are `PRIVY_APP_SECRET`, Twitter API/access credentials, `SUPABASE_SERVICE_ROLE_KEY`, and a long random `CRON_SECRET`. `VITE_PRIVY_APP_ID` is a public client identifier; do not put secrets in `VITE_*`. Keep `MAX_TRANSACTION_GAS_ETH` and `MAX_TRANSACTION_GAS_LIMIT` set to conservative values; these are part of the real-money safety policy.
3. Set `SUPABASE_URL`, `PRIVY_APP_ID`, `BOT_USERNAME`, and the Arbitrum settings. Set `ALLOWED_ORIGINS` to the exact production app origin(s), comma-separated.
4. Run `supabase-schema.sql` in the intended Supabase project before enabling the worker. The SQL is a schema/migration script; it is not applied by the app or deployment.
5. Configure cron-job.org to call `GET https://<your-production-domain>/api/bot` on the desired schedule and set the HTTP header `Authorization: Bearer <the-same-CRON_SECRET>`. Do not pass the secret in query parameters.
6. Keep `TWITTER_ENABLE_DOMAIN_REGISTRATION`, `TWITTER_ENABLE_ETH_SEND`, and `TWITTER_ENABLE_DOMAIN_TRANSFER` unset or `false` until wallet policies, transaction fees, and recovery have been verified. All three money-moving actions are disabled by default. The cron route returns 503 until `CRON_SECRET` is set and 401 without a valid bearer header.
7. Test `/api/health`, then call `/api/bot` without a header (expect 401) and with a wrong header (expect 401) before configuring the scheduler. Do not treat these checks as a production transaction test.
8. Before enabling any Twitter money action, run the staging checklist in `SECURITY_AUDIT.md`. A daily reservation is not enough by itself: the worker must be able to estimate gas and submit `gas` plus `maxFeePerGas` within the configured gas ceiling.

---

## 🔒 Security & Delegation Model

1. **Wallet custody and signing**: Wallet keys are self-custodial and managed securely through Privy MPC embedded wallets. Transactions are executed seamlessly using your authorized session delegation, bounded by your safety limit.
2. **Separate spending controls**: The browser guard provides client-side protection. Twitter bot reservations are tracked in Supabase, and the server applies a configured gas limit and `maxFeePerGas` ceiling before broadcast. Keep the gas policy conservative and verify it with a staging transaction.
3. **Restricted contract interaction**: Twitter bot domain actions target the configured Doti Registry. Domain registrations, ETH sends, and domain transfers through Twitter are disabled unless explicitly enabled in server configuration.
4. **Ambiguous transaction handling**: When a broadcast may have succeeded but its result cannot be confirmed, automatic rebroadcast is blocked. An operator must reconcile the tweet and reservation manually.

---

## ⚠️ Disclaimer

This software is provided for experimental, decentralized naming utility on the Arbitrum blockchain. 
- Cryptocurrency and smart contract interactions carry inherent on-chain risks. Always verify addresses and transaction details before confirming transfers.
- Ensure you manage your Twitter/X account credentials securely, as your social login controls your embedded smart wallet.
- The developers and contributors are not liable for lost funds, user misconfiguration, or network congestion issues on the underlying blockchain.

---

## 📄 License & Public Domain

This project is open-source software licensed under the **MIT License**.

© 2026 **DotiBot** • Powered by [Doti Protocol](https://doti.my) • Built on [Arbitrum](https://arbitrum.io).
