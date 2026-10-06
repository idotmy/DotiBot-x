export default async function handler(req: any, res: any) {
  try {
    if (res?.setHeader) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }

    if (req?.method === 'OPTIONS') {
      return res.status(200).end();
    }

    const url = new URL(req?.url || '/', 'https://dotibot.invalid');

    // Handle health check
    if (url.pathname.startsWith('/api/health') || url.pathname === '/health') {
      return res.status(200).json({
        status: 'ok',
        bot: '@dotibot',
        network: 'Arbitrum One',
        chainId: 42161,
        domainPriceEth: 0.001,
        timestamp: Date.now(),
      });
    }

    // Default JSON API info fallback
    return res.status(200).json({
      message: 'DotiBot API Running',
      endpoint: url.pathname,
      network: 'Arbitrum One',
      priceEth: 0.001,
      timestamp: Date.now()
    });
  } catch (err: any) {
    return res.status(200).json({
      message: 'DotiBot API Running',
      status: 'ok',
      timestamp: Date.now()
    });
  }
}
