export const PRIVY_APP_ID = 'your_privy_app_ID';

export const ARBITRUM_CHAIN_CONFIG = {
  chainId: 42161, // Arbitrum One
  chainIdHex: '0xa4b1',
  chainName: 'Arbitrum One',
  rpcUrl: 'https://arb1.arbitrum.io/rpc',
  blockExplorerUrl: 'https://arbiscan.io',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
};

// Real deployed Doti .i Sovereign Domain Registry on Arbitrum One
export const REAL_DOTI_REGISTRY_ADDRESS = '0xf853F8243F10a57CF5e43A49F156F132c05C21a6';
export const DEFAULT_DOTI_REGISTRY_ADDRESS = REAL_DOTI_REGISTRY_ADDRESS;
export const DOTI_ESCROW_ADDRESS = '0xBf342bDf2dcB6dcD21c8b104Bc8Ce950dc9EB632';
export const DOTI_ARBITRUM_ROUTER = '0x141fa059441E0ca23ce184B6A78bafD2A517DdE8';

export const DOTI_BOT_AGENT_ADDRESS = '0x';
export const DOTI_BOT_TWITTER_HANDLE = 'dotibot';
export const DOTI_MCP_ENDPOINT = 'https://doti.my/api/ai/mcp';
export const DOTI_OFFICIAL_WEBSITE = 'https://doti.my';

// Standard Doti sovereign domain price on Arbitrum One
export const DOTI_DOMAIN_PRICE_ETH = 0.001;

export function calculateDomainPrice(name: string): number {
  return DOTI_DOMAIN_PRICE_ETH;
}

export const ESTIMATED_ARBITRUM_GAS_ETH = 0.000001; // ~0.0000005 - 0.000001 ETH on Arbitrum One

// ABI for the Doti .i Domain Registry contract
export const DOTI_REGISTRY_ABI = [
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
