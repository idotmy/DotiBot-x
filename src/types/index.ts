export interface User {
  id: string;
  twitterHandle: string;
  name: string;
  profileImageUrl: string;
  walletAddress: string;
  createdAt: number;
}

export interface Wallet {
  address: string;
  chainId: number;
  balanceEth: number;
  isEmbedded: boolean;
}

export interface DelegationPolicy {
  isGranted: boolean;
  dailyLimitEth: number;
  spentTodayEth: number;
  lastResetTimestamp: number;
  contractWhitelist: string[];
  expiresAt: number;
  agentAddress: string;
  signature?: string;
}

export interface DomainItem {
  name: string; // e.g. "alex" (without .i or with .i)
  fullName: string; // e.g. "alex.i"
  ownerAddress: string;
  ownerTwitter?: string;
  tokenId: string;
  registeredAt: number;
  expiresAt: number;
  priceEth: number;
  txHash: string;
  records?: {
    avatar?: string;
    twitter?: string;
    github?: string;
    url?: string;
    contentHash?: string;
  };
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  text: string;
  timestamp: number;
  txHash?: string;
  actionType?: 'register' | 'transfer' | 'check' | 'error' | 'delegation' | 'info';
  domainName?: string;
  status?: 'pending' | 'success' | 'failed';
  details?: {
    domain?: string;
    recipient?: string;
    costEth?: number;
    gasEth?: number;
    totalEth?: number;
    available?: boolean;
    errorReason?: string;
  };
}

export interface TweetSimulation {
  id: string;
  authorHandle: string;
  authorName: string;
  authorAvatar: string;
  content: string;
  createdAt: string;
  replyTo?: string;
  replyTweet?: {
    authorHandle: string;
    authorName: string;
    authorAvatar: string;
    content: string;
    txHash?: string;
    createdAt: string;
    status: 'success' | 'failed';
  };
}

export interface TransactionRecord {
  id: string;
  txHash: string;
  type: 'register' | 'transfer';
  domain: string;
  fromAddress: string;
  toAddress: string;
  amountEth: number;
  gasEth: number;
  timestamp: number;
  status: 'confirmed' | 'pending' | 'failed';
  chain: 'Arbitrum One' | 'Arbitrum Sepolia';
}
