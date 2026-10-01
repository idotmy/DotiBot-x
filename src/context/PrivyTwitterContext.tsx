import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { usePrivy, useLogin, useWallets } from '@privy-io/react-auth';
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets';
import { User, Wallet, DelegationPolicy, DomainItem } from '../types';
import { DEFAULT_DOTI_REGISTRY_ADDRESS, DOTI_BOT_AGENT_ADDRESS } from '../config/web3Config';
import { DotiDomainService, EIP1193Provider } from '../services/dotiDomainService';

interface PrivyTwitterContextType {
  user: User | null;
  wallet: Wallet | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  delegation: DelegationPolicy;
  domains: DomainItem[];
  login: () => void;
  logout: () => Promise<void>;
  grantDelegation: (dailyLimitEth?: number) => Promise<void>;
  revokeDelegation: () => void;
  updateDailyLimit: (newLimitEth: number) => void;
  recordLocalSpend: (amountEth: number) => void;
  refreshDomains: () => void;
  refreshBalance: () => Promise<void>;
  getEthereumProvider: () => Promise<EIP1193Provider | null>;
}

const STORAGE_KEY_DELEGATION = 'privy_agent_delegation_live';
const MAX_LOCAL_DAILY_LIMIT_ETH = 0.003;

const PrivyTwitterContext = createContext<PrivyTwitterContextType | undefined>(undefined);

function defaultDelegation(): DelegationPolicy {
  return {
    isGranted: false,
    dailyLimitEth: MAX_LOCAL_DAILY_LIMIT_ETH,
    spentTodayEth: 0,
    lastResetTimestamp: Date.now(),
    contractWhitelist: [DEFAULT_DOTI_REGISTRY_ADDRESS],
    expiresAt: 0,
    agentAddress: DOTI_BOT_AGENT_ADDRESS,
    signature: undefined,
  };
}

export const PrivyTwitterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { ready, authenticated, user: privyUser, logout: privyLogout, login: privyHookLogin } = usePrivy();
  const { wallets } = useWallets();
  const { client: smartWalletClient } = useSmartWallets();

  const { login: standardLogin } = useLogin({
    onComplete: ({ user }) => {
      console.log('Privy login successful:', user);
    },
    onError: (err) => {
      console.warn('Privy login error:', err);
    },
  });

  const [domains, setDomains] = useState<DomainItem[]>([]);
  const [balance, setBalance] = useState<number>(0);

  const [delegation, setDelegation] = useState<DelegationPolicy>(() => defaultDelegation());
  const delegationLoadedForUser = useRef<string | null>(null);

  // Extract smart wallet or embedded Arbitrum wallet from Privy
  const smartWalletAddress = useMemo(() => {
    const smartAccount = (privyUser?.linkedAccounts as any[])?.find((a) => a.type === 'smart_wallet');
    return (
      smartWalletClient?.account?.address ||
      smartAccount?.address ||
      (privyUser as any)?.smartWallet?.address ||
      null
    ) as `0x${string}` | null;
  }, [smartWalletClient, privyUser]);

  const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy') || wallets[0];
  
  // Prioritize ERC-4337 Smart Account address, fallback to embedded EOA signer
  const userAddress: `0x${string}` | '' = useMemo(() => {
    if (smartWalletAddress) return smartWalletAddress;
    if (embeddedWallet?.address) return embeddedWallet.address as `0x${string}`;
    if (privyUser?.wallet?.address) return privyUser.wallet.address as `0x${string}`;
    return '';
  }, [smartWalletAddress, embeddedWallet?.address, privyUser?.wallet?.address, authenticated, privyUser?.id]);

  // Extract real Twitter account details from Privy user object
  const twitterHandle = privyUser?.twitter?.username || '';
  const displayName = privyUser?.twitter?.name || (twitterHandle ? `@${twitterHandle}` : (userAddress ? `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}` : ''));
  const avatarUrl = privyUser?.twitter?.profilePictureUrl || (twitterHandle ? `https://api.dicebear.com/7.x/bottts/svg?seed=${twitterHandle}&backgroundColor=0f172a` : '');

  const user: User | null = useMemo(() => {
    if (!authenticated || !userAddress) return null;
    return {
      id: privyUser?.id || (userAddress ? `usr_${userAddress}` : 'usr_anon'),
      twitterHandle: twitterHandle || (userAddress ? `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}` : 'user'),
      name: displayName || 'Twitter User',
      profileImageUrl: avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${userAddress || 'doti'}&backgroundColor=0f172a`,
      walletAddress: userAddress,
      createdAt: Date.now(),
    };
  }, [authenticated, userAddress, twitterHandle, displayName, avatarUrl, privyUser?.id]);

  const wallet: Wallet | null = useMemo(() => {
    if (!authenticated || !userAddress) return null;
    return {
      address: userAddress,
      chainId: 42161, // Arbitrum One
      balanceEth: balance,
      isEmbedded: true,
    };
  }, [authenticated, userAddress, balance]);

  // Provide EIP-1193 Ethereum provider (supports Smart Wallet client or embedded EOA)
  const getEthereumProvider = useCallback(async (): Promise<EIP1193Provider | null> => {
    if (smartWalletClient && smartWalletAddress) {
      return {
        request: async ({ method, params }: { method: string; params?: any[] }) => {
          if (method === 'eth_sendTransaction' && params?.[0]) {
            const txReq = params[0];
            const to = txReq.to as `0x${string}`;
            const value = txReq.value
              ? typeof txReq.value === 'string' && txReq.value.startsWith('0x')
                ? BigInt(txReq.value)
                : BigInt(txReq.value)
              : BigInt(0);
            const data = (txReq.data || '0x') as `0x${string}`;
            const hash = await smartWalletClient.sendTransaction({
              to,
              value,
              data,
            });
            return hash;
          }
          if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
            return [smartWalletAddress];
          }
          if (method === 'eth_chainId') {
            return '0xa4b1'; // 42161 Arbitrum One
          }
          if (embeddedWallet && typeof embeddedWallet.getEthereumProvider === 'function') {
            const underlying = await embeddedWallet.getEthereumProvider();
            return (underlying as any).request({ method, params });
          }
          return null;
        }
      } as EIP1193Provider;
    }

    if (embeddedWallet && typeof embeddedWallet.getEthereumProvider === 'function') {
      try {
        const provider = await embeddedWallet.getEthereumProvider();
        return provider as EIP1193Provider;
      } catch (e) {
        console.warn('Failed to get embedded wallet provider:', e);
      }
    }
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      return (window as any).ethereum as EIP1193Provider;
    }
    return null;
  }, [smartWalletClient, smartWalletAddress, embeddedWallet]);

  // Fetch real on-chain balance on Arbitrum One via Viem RPC
  const refreshBalance = useCallback(async () => {
    if (userAddress && userAddress.startsWith('0x')) {
      try {
        const liveBal = await DotiDomainService.getOnChainBalance(userAddress);
        setBalance(liveBal);
      } catch (e) {
        console.error('Failed to fetch Arbitrum balance:', e);
      }
    }
  }, [userAddress]);

  const refreshDomains = useCallback(() => {
    if (userAddress) {
      const userDoms = DotiDomainService.getUserDomains(userAddress);
      setDomains(userDoms);
    }
  }, [userAddress]);

  useEffect(() => {
    if (authenticated && userAddress) {
      refreshBalance();
      refreshDomains();
      const timer = setInterval(refreshBalance, 12000);
      return () => clearInterval(timer);
    } else {
      setDomains([]);
      setBalance(0);
    }
  }, [authenticated, userAddress, refreshBalance, refreshDomains]);

  useEffect(() => {
    const userKey = privyUser?.id || 'anonymous';
    if (delegationLoadedForUser.current !== userKey) return;
    const key = `${STORAGE_KEY_DELEGATION}_${userKey}`;
    localStorage.setItem(key, JSON.stringify(delegation));
  }, [delegation, privyUser?.id]);

  useEffect(() => {
    if (!privyUser?.id) {
      setDelegation(defaultDelegation());
      delegationLoadedForUser.current = 'anonymous';
      return;
    }
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY_DELEGATION}_${privyUser.id}`);
      if (!stored) {
        setDelegation(defaultDelegation());
        delegationLoadedForUser.current = privyUser.id;
        return;
      }
      const parsed = JSON.parse(stored);
      if (
        parsed.isGranted === true &&
        Number.isFinite(parsed.dailyLimitEth) &&
        parsed.dailyLimitEth > 0 &&
        parsed.dailyLimitEth <= MAX_LOCAL_DAILY_LIMIT_ETH &&
        parsed.contractWhitelist?.includes(DEFAULT_DOTI_REGISTRY_ADDRESS)
      ) {
        setDelegation(parsed);
      } else {
        setDelegation(defaultDelegation());
      }
      delegationLoadedForUser.current = privyUser.id;
    } catch {
      setDelegation(defaultDelegation());
      delegationLoadedForUser.current = privyUser.id;
    }
  }, [privyUser?.id]);

  const grantDelegation = async (dailyLimitEth: number = 0.003) => {
    const safeLimit = Math.min(MAX_LOCAL_DAILY_LIMIT_ETH, Math.max(0.000001, Number(dailyLimitEth)));
    if (!Number.isFinite(safeLimit)) throw new Error('Invalid local spending limit');
    const updated: DelegationPolicy = {
      isGranted: true,
      dailyLimitEth: safeLimit,
      spentTodayEth: 0,
      lastResetTimestamp: Date.now(),
      contractWhitelist: [DEFAULT_DOTI_REGISTRY_ADDRESS],
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      agentAddress: DOTI_BOT_AGENT_ADDRESS,
      signature: undefined,
    };
    setDelegation(updated);
  };

  const revokeDelegation = () => {
    setDelegation((prev) => ({
      ...prev,
      isGranted: false,
      signature: undefined,
    }));
  };

  const updateDailyLimit = (newLimitEth: number) => {
    const safeLimit = Math.min(MAX_LOCAL_DAILY_LIMIT_ETH, Math.max(0.000001, Number(newLimitEth)));
    if (!Number.isFinite(safeLimit)) return;
    setDelegation((prev) => ({
      ...prev,
      dailyLimitEth: safeLimit,
    }));
  };

  const recordLocalSpend = (amountEth: number) => {
    if (!Number.isFinite(amountEth) || amountEth <= 0) return;
    setDelegation((prev) => {
      const expired = Date.now() - prev.lastResetTimestamp >= 24 * 60 * 60 * 1000 || Date.now() >= prev.expiresAt;
      return {
        ...prev,
        spentTodayEth: (expired ? 0 : prev.spentTodayEth) + amountEth,
        lastResetTimestamp: expired ? Date.now() : prev.lastResetTimestamp,
      };
    });
  };

  // Direct invoke of official Privy login
  const login = useCallback(() => {
    try {
      if (typeof standardLogin === 'function') {
        standardLogin();
        return;
      }
      if (typeof privyHookLogin === 'function') {
        privyHookLogin();
        return;
      }
    } catch (err) {
      console.warn('Privy login invocation warning:', err);
      if (typeof privyHookLogin === 'function') {
        privyHookLogin();
      }
    }
  }, [standardLogin, privyHookLogin]);

  const logout = async () => {
    try {
      await privyLogout();
    } catch (e) {
      console.warn('Logout error:', e);
    }
    setDomains([]);
    setBalance(0);
    delegationLoadedForUser.current = null;
    setDelegation(defaultDelegation());
  };

  return (
    <PrivyTwitterContext.Provider
      value={{
        user,
        wallet,
        isAuthenticated: authenticated,
        isLoading: !ready,
        delegation,
        domains,
        login,
        logout,
        grantDelegation,
        revokeDelegation,
        updateDailyLimit,
         recordLocalSpend,
        refreshDomains,
        refreshBalance,
        getEthereumProvider,
      }}
    >
      {children}
    </PrivyTwitterContext.Provider>
  );
};

export const usePrivyTwitter = () => {
  const context = useContext(PrivyTwitterContext);
  if (!context) {
    throw new Error('usePrivyTwitter must be used within a PrivyTwitterProvider');
  }
  return context;
};
