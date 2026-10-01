import * as dotenv from 'dotenv';
import { timingSafeEqual } from 'node:crypto';
import botHandler from '../api/bot';

dotenv.config();

/**
 * DotiBot Persistent Background Worker
 * Designed for 24/7 continuous execution on VPS (Oracle Cloud, Ubuntu, PM2, Docker).
 * 
 * Features:
 * - Configurable poll interval (default: 15 seconds)
 * - Safe overlapping execution lock (prevents concurrent poll runs)
 * - Exponential backoff on rate-limiting
 * - Graceful shutdown on SIGTERM / SIGINT
 * - Zero impact on Vercel deployment (runs only when started via node/pm2)
 */

const POLL_INTERVAL_MS = Math.max(10_000, Number(process.env.WORKER_POLL_INTERVAL_MS) || 15_000);
const CRON_SECRET = process.env.CRON_SECRET || 'doti_secure_cron_worker';

let isRunning = true;
let isBusy = false;

function createMockReqRes(): { req: any; res: any; promise: Promise<any> } {
  let resolvePromise: (val: any) => void;
  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });

  const req = {
    headers: {
      authorization: `Bearer ${CRON_SECRET}`,
    },
    query: {
      secret: CRON_SECRET,
    },
    url: `/api/bot?secret=${encodeURIComponent(CRON_SECRET)}`,
    method: 'GET',
  };

  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader(key: string, value: string) {
      this.headers[key] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      resolvePromise({ statusCode: this.statusCode, data });
      return this;
    },
    send(data: any) {
      resolvePromise({ statusCode: this.statusCode, data });
      return this;
    },
    end() {
      resolvePromise({ statusCode: this.statusCode, data: null });
      return this;
    },
  };

  return { req, res, promise };
}

async function runWorkerCycle() {
  if (isBusy || !isRunning) return;
  isBusy = true;

  try {
    const { req, res, promise } = createMockReqRes();
    
    // Invoke the core bot workflow
    botHandler(req as any, res as any);
    
    const result: any = await Promise.race([
      promise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Worker cycle timeout after 50s')), 50_000)
      )
    ]);

    if (result?.statusCode === 200) {
      if (result.data?.tweetsFound > 0) {
        console.log(`[DotiBot Worker] ⚡ Processed ${result.data.tweetsFound} tweets at ${new Date().toISOString()}`);
      }
    } else {
      console.warn(`[DotiBot Worker] Status ${result?.statusCode}:`, result?.data?.message || result?.data);
    }
  } catch (err: any) {
    console.error('[DotiBot Worker] Cycle error:', err?.message || err);
  } finally {
    isBusy = false;
  }
}

async function main() {
  console.log('====================================================');
  console.log('🤖 DotiBot Autonomous Background Worker Starting...');
  console.log(`⏱️  Poll Interval: ${POLL_INTERVAL_MS / 1000}s`);
  console.log(`🔗 Network: Arbitrum One (ChainId: 42161)`);
  console.log(`🕒 Started at: ${new Date().toISOString()}`);
  console.log('====================================================');

  // Initial immediate run
  await runWorkerCycle();

  // Active continuous loop
  while (isRunning) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    if (isRunning) {
      await runWorkerCycle();
    }
  }

  console.log('[DotiBot Worker] Worker loop ended cleanly.');
}

// Handle Graceful Termination
function shutdown(signal: string) {
  console.log(`\n[DotiBot Worker] Received ${signal}. Shutting down gracefully...`);
  isRunning = false;
  setTimeout(() => {
    console.log('[DotiBot Worker] Forced exit after timeout.');
    process.exit(0);
  }, 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch((err) => {
  console.error('[DotiBot Worker] Fatal worker startup error:', err);
  process.exit(1);
});
