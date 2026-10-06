# Threat Model

## Project Overview

DotiBot is a React/Vite web application with a Node/Express API that lets authenticated users inspect
and submit Doti domain transactions on Arbitrum One. Privy supplies the wallet and Twitter-linked
identity. The server-side Twitter bot polls mentions, looks up the linked Privy wallet, and can submit
registry transactions through Privy's wallet API. Supabase PostgreSQL stores bot state, idempotency
records, distributed locks, and daily spending reservations. The web app can be hosted on Vercel;
the bot poll is intended to be triggered by an authenticated external cron service.

## Assets

- **User wallets and on-chain assets** -- unauthorized registration, ETH transfer, or domain transfer
  can cause irreversible financial loss.
- **Privy, Twitter, Supabase, RPC, and cron credentials** -- compromise can impersonate users, submit
  transactions, read or modify bot state, or repeatedly invoke the worker.
- **Twitter identity links** -- a username-only match can route a command to the wrong wallet; stable
  Twitter IDs must be preferred and ambiguous links must fail closed.
- **Transaction and budget state** -- duplicate broadcasts, lost pending transactions, or incorrect
  reservations can exceed the intended daily limit.
- **User account and domain metadata** -- wallet addresses, Twitter handles, transaction history, and
  domain ownership data must not be exposed or mixed between users.

## Trust Boundaries

- **Browser to API and wallet provider** -- the browser is untrusted. Local storage and UI limits are
  convenience controls only; the wallet provider and server/database must enforce authorization.
- **Cron caller to bot endpoint** -- only a caller presenting the configured Authorization Bearer
  secret may invoke money-moving bot processing. Query-string secrets are not accepted.
- **API to Supabase** -- the server uses the service role for bot state and must keep it server-side.
  Database functions provide atomic tweet locks and budget reservations.
- **API to Privy** -- the server sends wallet RPC requests using server-only Privy credentials.
  Responses and transaction hashes must be validated before state changes.
- **API to Twitter** -- Twitter read and write credentials are privileged. The worker must not run
  commands if write authentication or the bot identity check fails.
- **API/client to Arbitrum and the registry contract** -- public reads are advisory; the contract is
  the final authority for availability and ownership, and receipts are required before claiming
  success.
- **Public vs authenticated surfaces** -- health is intentionally public; bot execution is protected
  by cron authentication; wallet actions require the connected wallet provider and local safety guard.

## Scan Anchors

- Production entry points: `api/bot.ts`, `api/index.ts`, `api/health.ts`, `server.ts`, `vercel.json`.
- Highest-risk areas: `api/bot.ts`, `src/services/dotiDomainService.ts`, `src/context/PrivyTwitterContext.tsx`,
  `server/http-security.ts`, and `supabase-schema.sql`.
- Public surfaces: health endpoints and static web assets. Protected surface: bot/cron routes.
- Browser local storage is cache/UI state, not an authorization source. `server/twitter-bot.ts` is
  legacy/dev-only unless explicitly wired into a deployment.

## Threat Categories

### Spoofing

An attacker who obtains the cron secret, Twitter write credentials, Privy app secret, or a valid
Twitter-linked identity could invoke or redirect money-moving actions. The bot MUST require the
header-only cron secret, verify Twitter user OAuth by calling the bot account, and match a Twitter
stable ID to the linked Privy account whenever available. A username-only fallback must not override
an available stable ID.

### Tampering

Tweet text, query parameters, local storage, wallet addresses, and requested amounts are attacker
controlled. Commands MUST be parsed strictly, recipient and amount formats MUST be validated, and
server-side budget reservations MUST bound requested value plus an explicit fee reserve independently
of the browser. The worker now also estimates gas, applies a gas-limit headroom policy, and sends
`gas`/`maxFeePerGas` bounded by `MAX_TRANSACTION_GAS_ETH`; it must reject a transaction when the
current fee quote cannot fit that ceiling. Domain availability checks are advisory; the contract call
and receipt determine the result.

### Repudiation

Sensitive actions need an auditable tweet ID, author ID/handle, command, transaction hash, status,
error code, timestamps, and reply status. Idempotency records MUST prevent one tweet from causing
multiple broadcasts, including when the first transaction is pending and its receipt is unavailable.

### Information Disclosure

Secrets and raw Privy/Twitter responses MUST NOT be returned in API errors or logs. Public responses
should expose only operational status. Wallet and domain data MUST be scoped to the verified wallet;
client-generated local storage data MUST never be treated as proof of ownership.

### Denial of Service

The API MUST bound JSON request size, use external-call timeouts where practical, and avoid open
proxy routes. Twitter polling errors, missing database state, missing credentials, and failed locks
must fail closed without broadcasting. Rate limiting and monitoring remain required before broad
public operation.

### Elevation of Privilege

The client cannot authorize the Twitter bot and changing a local daily cap cannot raise its server-side
reservation limit. Supabase tables and functions MUST remain inaccessible to anonymous/authenticated
client roles. Only verified on-chain owners may transfer domains, and every wallet transaction MUST use
the intended Arbitrum chain and registry contract. The daily ceiling is UTC-based and is enforced per
wallet by atomic reservations; it must not be presented as a user-editable Twitter setting. Domain
registration, ETH sends, and domain transfers from Twitter remain disabled by default and require
explicit operator configuration plus a staged live-money test.
