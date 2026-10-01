export default async function handler(req: any, res: any) {
  try {
    if (res?.setHeader) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }

    if (req?.method === 'OPTIONS') {
      return res.status(200).end();
    }

    return res.status(200).json({
      status: 'ok',
      bot: '@dotibot',
      network: 'Arbitrum One',
      chainId: 42161,
      domainPriceEth: '0.001',
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Health check error:', err);
    return res.status(200).json({
      status: 'ok',
      bot: '@dotibot',
      fallback: true,
      timestamp: new Date().toISOString(),
    });
  }
}
