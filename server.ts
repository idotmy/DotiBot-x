import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import botHandler from './api/bot';
import delegationHandler from './api/delegation';
import { setConfiguredCors, setSecurityHeaders } from './server/http-security';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use((req, res, next) => {
  setSecurityHeaders(res);
  setConfiguredCors(req, res);
  next();
});
app.use(express.json({ limit: '16kb' }));

// API health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    bot: '@dotibot',
    network: 'Arbitrum One',
    chainId: 42161,
    domainPriceEth: 0.001,
    timestamp: Date.now(),
  });
});

// Bot API handler
app.all(['/api/bot', '/api/cron/bot'], (req, res) => {
  botHandler(req, res);
});

// Delegation API handler
app.all(['/api/delegation', '/api/delegation/sync'], (req, res) => {
  delegationHandler(req, res);
});

// Start Server with Vite Middlewares in Dev mode or Static Build in Production
async function startServer() {
  try {
    const isProduction = process.env.NODE_ENV === 'production';
    const distPath = path.resolve(__dirname, 'dist');
    const hasDist = fs.existsSync(distPath);

    if (!isProduction || !hasDist) {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server listening on http://0.0.0.0:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
  }
}

startServer();
