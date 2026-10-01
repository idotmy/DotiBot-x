import { createPublicClient, http, formatEther, parseEther, encodeFunctionData, keccak256, stringToBytes } from 'viem';
import { arbitrum } from 'viem/chains';
import {
  calculateDomainPrice,
  DEFAULT_DOTI_REGISTRY_ADDRESS,
  ESTIMATED_ARBITRUM_GAS_ETH,
  DOTI_REGISTRY_ABI,
  ARBITRUM_CHAIN_CONFIG,
  DOTI_DOMAIN_PRICE_ETH,
  DOTI_MCP_ENDPOINT
} from '../config/web3Config';
import { DelegationPolicy, DomainItem, TransactionRecord } from '../types';

const STORAGE_KEY_DOMAINS = 'doti_user_domains_live';
const STORAGE_KEY_TXS = 'doti_tx_history_live';

// Public client connected directly to Arbitrum One
export const arbitrumPublicClient = createPublicClient({
  chain: arbitrum,
  transport: http(ARBITRUM_CHAIN_CONFIG.rpcUrl),
});

export interface EIP1193Provider {
  request(args: { method: string; params?: any[] | Record<string, any> }): Promise<any>;
}

export function toSafeDecimal(val: number | string): string {
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed.includes('e') && !trimmed.includes('E') && /^[0-9]+(\.[0-9]+)?$/.test(trimmed)) {
      return trimmed;
    }
  }
  const num = typeof val === 'number' ? val : Number(val);
  if (isNaN(num) || num <= 0) return '0';
  return num.toFixed(18).replace(/\.?0+$/, '');
}

export class DotiDomainService {
  public static async getOnChainBalance(address: string): Promise<number> {
    try {
      if (!address || !address.startsWith('0x')) return 0;
      const balanceBigInt = await arbitrumPublicClient.getBalance({ address: address as `0x${string}` });
      return parseFloat(formatEther(balanceBigInt));
    } catch (e) {
      console.warn('Could not fetch on-chain Arbitrum balance:', e);
      return 0;
    }
  }

  public static getUserDomains(walletAddress: string): DomainItem[] {
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY_DOMAINS}_${walletAddress.toLowerCase()}`);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to load user domains', e);
    }
    return [];
  }

  public static saveUserDomains(walletAddress: string, domains: DomainItem[]) {
    try {
      localStorage.setItem(`${STORAGE_KEY_DOMAINS}_${walletAddress.toLowerCase()}`, JSON.stringify(domains));
    } catch (e) {
      console.error('Failed to save user domains', e);
    }
  }

  public static getTxHistory(): TransactionRecord[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_TXS);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {}
    return [];
  }

  public static saveTxHistory(tx: TransactionRecord) {
    try {
      const current = this.getTxHistory();
      const updated = [tx, ...current.filter((existing) => existing.id !== tx.id)].slice(0, 50);
      localStorage.setItem(STORAGE_KEY_TXS, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save tx history', e);
    }
  }

  private static async reconcilePendingTransaction(criteria: {
    type: TransactionRecord['type'];
    fromAddress: string;
    toAddress: string;
    domain: string;
  }): Promise<TransactionRecord | null> {
    const pending = this.getTxHistory().find((tx) =>
      tx.status === 'pending' &&
      tx.type === criteria.type &&
      tx.fromAddress.toLowerCase() === criteria.fromAddress.toLowerCase() &&
      tx.toAddress.toLowerCase() === criteria.toAddress.toLowerCase() &&
      tx.domain.toLowerCase() === criteria.domain.toLowerCase()
    );
    if (!pending) return null;

    try {
      const receipt = await arbitrumPublicClient.getTransactionReceipt({
        hash: pending.txHash as `0x${string}`,
      });
      const reconciled = { ...pending, status: receipt.status === 'success' ? 'confirmed' as const : 'failed' as const };
      this.saveTxHistory(reconciled);
      return receipt.status === 'success' ? reconciled : null;
    } catch {
      // A timeout or RPC failure is not proof that the transaction failed.
      return pending;
    }
  }

  public static normalizeDomain(rawName: string): { cleanName: string; fullName: string; isValid: boolean; error?: string } {
    let clean = rawName.trim().toLowerCase();
    clean = clean.replace(/^@/, '');
    
    if (clean.endsWith('.i')) {
      clean = clean.slice(0, -2);
    }

    if (!clean) {
      return { cleanName: '', fullName: '', isValid: false, error: 'Domain name cannot be empty.' };
    }

    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(clean)) {
      return {
        cleanName: clean,
        fullName: `${clean}.i`,
        isValid: false,
        error: 'Invalid format: Only letters (a-z), numbers (0-9), and hyphens (-) are allowed.'
      };
    }

    if (clean.length > 32) {
      return { cleanName: clean, fullName: `${clean}.i`, isValid: false, error: 'Domain name is too long (maximum 32 characters).' };
    }

    return {
      cleanName: clean,
      fullName: `${clean}.i`,
      isValid: true
    };
  }

  /**
   * Check real availability against on-chain Arbitrum contract and Doti Protocol MCP
   */
  public static async isAvailable(domainName: string): Promise<{ available: boolean; owner?: string; reason?: string; priceEth?: number }> {
    const { cleanName, fullName, isValid, error } = this.normalizeDomain(domainName);
    if (!isValid) {
      return { available: false, reason: error };
    }

    // 1. Direct on-chain Arbitrum contract registry check
    try {
      const domainHash = keccak256(stringToBytes(cleanName));
      const regData: any = await arbitrumPublicClient.readContract({
        address: DEFAULT_DOTI_REGISTRY_ADDRESS as `0x${string}`,
        abi: DOTI_REGISTRY_ABI,
        functionName: 'registry',
        args: [domainHash],
      });

      if (regData) {
        const owner = Array.isArray(regData) ? regData[2] : regData?.owner;
        const regTimestamp = Array.isArray(regData) ? regData[6] : regData?.registrationTimestamp;

        if (
          owner &&
          owner !== '0x0000000000000000000000000000000000000000' &&
          (regTimestamp > 0n || regTimestamp > 0)
        ) {
          return {
            available: false,
            owner: String(owner),
            reason: `Domain '${fullName}' is already registered on Arbitrum One (Owner: ${String(owner).slice(0, 6)}...${String(owner).slice(-4)})`,
          };
        }
      }
    } catch (contractErr) {
      console.warn('Direct on-chain check note:', contractErr);
    }

    // 2. Secondary check via Doti MCP Protocol
    try {
      const mcpRes = await fetch(DOTI_MCP_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: 'check_domain_availability',
            arguments: { domainName: fullName }
          }
        }),
        signal: AbortSignal.timeout(8000)
      });

      if (mcpRes.ok) {
        const data = await mcpRes.json();
        const textContent = data?.result?.content?.[0]?.text;
        if (textContent) {
          const parsed = JSON.parse(textContent);
          if (parsed.available === true) {
            return {
              available: true,
              priceEth: parsed.priceEth ? parseFloat(parsed.priceEth) : DOTI_DOMAIN_PRICE_ETH
            };
          } else {
            return {
              available: false,
              reason: parsed.message || `Domain '${fullName}' is already registered on Arbitrum One.`
            };
          }
        }
      }
    } catch (mcpErr) {
      console.warn('MCP availability check warning:', mcpErr);
    }

    // Direct fallback: valid domain format is ready for registration
    return {
      available: true,
      priceEth: DOTI_DOMAIN_PRICE_ETH
    };
  }

  /**
   * Execute real on-chain domain registration using the user's Privy wallet provider
   */
  public static async executeRegistration(params: {
    domainInput: string;
    userAddress: string;
    userTwitterHandle?: string;
    userBalanceEth: number;
    delegation: DelegationPolicy;
    provider?: EIP1193Provider;
    onProgress?: (step: string) => void;
  }): Promise<{
    success: boolean;
    txHash?: string;
    domain?: DomainItem;
    errorMessage?: string;
    costEth?: number;
    gasEth?: number;
    totalEth?: number;
    calldata?: string;
  }> {
    const { domainInput, userAddress, userTwitterHandle, userBalanceEth, delegation, provider, onProgress } = params;

    onProgress?.('Validating domain name format...');
    const { cleanName, fullName, isValid, error } = this.normalizeDomain(domainInput);
    if (!isValid) {
      return { success: false, errorMessage: error || 'Invalid domain name' };
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      return { success: false, errorMessage: 'A valid connected Arbitrum wallet is required.' };
    }

    const existingPending = await this.reconcilePendingTransaction({
      type: 'register',
      fromAddress: userAddress,
      toAddress: DEFAULT_DOTI_REGISTRY_ADDRESS,
      domain: fullName,
    });
    if (existingPending) {
      const isStillPending = existingPending.status === 'pending';
      return {
        success: false,
        txHash: existingPending.txHash,
        errorMessage: isStillPending
          ? 'A registration for this domain is still pending. Do not submit it again; check Arbiscan.'
          : 'A previous registration for this domain is already confirmed.',
      };
    }

    onProgress?.(`Querying Doti Arbitrum registry for ${fullName}...`);
    const avail = await this.isAvailable(cleanName);
    if (!avail.available) {
      return {
        success: false,
        errorMessage: avail.reason || `Domain "${fullName}" is unavailable or could not be verified.`
      };
    }

    const priceEth = avail.priceEth || DOTI_DOMAIN_PRICE_ETH;
    const gasEth = ESTIMATED_ARBITRUM_GAS_ETH;
    const totalRequiredEth = priceEth + gasEth;

    const localPolicyValid =
      delegation.isGranted &&
      Date.now() < delegation.expiresAt &&
      delegation.contractWhitelist.some((address) => address.toLowerCase() === DEFAULT_DOTI_REGISTRY_ADDRESS.toLowerCase()) &&
      delegation.dailyLimitEth > 0 &&
      delegation.dailyLimitEth <= 0.003 &&
      delegation.spentTodayEth + totalRequiredEth <= delegation.dailyLimitEth;
    if (!localPolicyValid) {
      return {
        success: false,
        errorMessage: 'The local spending guard is disabled, expired, or its daily limit has been reached.',
        costEth: priceEth,
        gasEth,
        totalEth: totalRequiredEth,
      };
    }

    onProgress?.(`Validating Arbitrum balance...`);
    let currentBalance = 0n;
    try {
      currentBalance = await arbitrumPublicClient.getBalance({ address: userAddress as `0x${string}` });
    } catch {
      return { success: false, errorMessage: 'Could not verify the current Arbitrum balance. Please try again.' };
    }
    if (currentBalance < parseEther(totalRequiredEth.toString())) {
      return {
        success: false,
        errorMessage: `Insufficient balance: Requires ${priceEth.toFixed(4)} ETH + ~${gasEth.toFixed(5)} ETH gas on Arbitrum (${totalRequiredEth.toFixed(4)} ETH total). Your wallet balance is ${Number(formatEther(currentBalance)).toFixed(4)} ETH.`,
        costEth: priceEth,
        gasEth,
        totalEth: totalRequiredEth
      };
    }

    onProgress?.(`Preparing on-chain registration payload for ${fullName}...`);

    let preparedCalldata: `0x${string}` | undefined;
    let targetContract: `0x${string}` = DEFAULT_DOTI_REGISTRY_ADDRESS as `0x${string}`;
    let valueHex: `0x${string}` = `0x${parseEther(priceEth.toString()).toString(16)}`;

    try {
      const mcpPayloadRes = await fetch(DOTI_MCP_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: 'register_domain',
            arguments: {
              domainName: fullName,
              recipientAddress: userAddress,
              targetChainId: 42161
            }
          }
        }),
        signal: AbortSignal.timeout(8000)
      });

      if (mcpPayloadRes.ok) {
        const payloadData = await mcpPayloadRes.json();
        const textContent = payloadData?.result?.content?.[0]?.text;
        if (textContent) {
          const parsed = JSON.parse(textContent);
          if (parsed?.transactionPayload?.data && parsed?.transactionPayload?.to) {
            preparedCalldata = parsed.transactionPayload.data as `0x${string}`;
            targetContract = parsed.transactionPayload.to as `0x${string}`;
            if (parsed.transactionPayload.valueWei) {
              valueHex = `0x${BigInt(parsed.transactionPayload.valueWei).toString(16)}`;
            }
          }
        }
      }
    } catch (payloadErr) {
      console.warn('Could not fetch MCP registration payload, preparing standard calldata:', payloadErr);
    }

    if (!preparedCalldata) {
      preparedCalldata = encodeFunctionData({
        abi: DOTI_REGISTRY_ABI,
        functionName: 'register',
        args: [cleanName, 0n],
      });
    }

    let realTxHash = '';
    if (provider) {
      onProgress?.('Broadcasting transaction on Arbitrum One...');
      try {
        const tx = await provider.request({
          method: 'eth_sendTransaction',
          params: [
            {
              from: userAddress,
              to: targetContract,
              value: valueHex,
              data: preparedCalldata,
              chainId: '0xa4b1', // 42161 in hex
            },
          ],
        });
        realTxHash = typeof tx === 'string' ? tx : tx?.hash || '';
      } catch (sendErr: any) {
        return {
          success: false,
          errorMessage: this.parseRpcError(sendErr, { to: targetContract, amountEth: priceEth, action: 'Registration' }),
        };
      }
    } else {
      return {
        success: false,
        errorMessage: 'Privy Ethereum Provider not initialized. Please connect your wallet.',
      };
    }

    if (!realTxHash || !realTxHash.startsWith('0x')) {
      return {
        success: false,
        errorMessage: 'Did not receive valid transaction hash from on-chain broadcast.',
      };
    }

    this.saveTxHistory({
      id: realTxHash,
      txHash: realTxHash,
      type: 'register',
      domain: fullName,
      fromAddress: userAddress,
      toAddress: DEFAULT_DOTI_REGISTRY_ADDRESS,
      amountEth: priceEth,
      gasEth: 0,
      timestamp: Date.now(),
      status: 'pending',
      chain: 'Arbitrum One',
    });

    onProgress?.('Verifying confirmation on Arbitrum...');
    let receipt;
    try {
      receipt = await arbitrumPublicClient.waitForTransactionReceipt({
        hash: realTxHash as `0x${string}`,
        timeout: 60_000,
      });
    } catch {
      return {
        success: false,
        txHash: realTxHash,
        errorMessage: 'Transaction was submitted but confirmation is still pending. Check the transaction on Arbiscan before retrying.',
      };
    }
    if (receipt.status !== 'success') {
      this.saveTxHistory({
        id: realTxHash,
        txHash: realTxHash,
        type: 'register',
        domain: fullName,
        fromAddress: userAddress,
        toAddress: DEFAULT_DOTI_REGISTRY_ADDRESS,
        amountEth: priceEth,
        gasEth: 0,
        timestamp: Date.now(),
        status: 'failed',
        chain: 'Arbitrum One',
      });
      return { success: false, txHash: realTxHash, errorMessage: 'The registration transaction reverted on Arbitrum.' };
    }
    const now = Date.now();
    const tokenId = '';

    const newDomain: DomainItem = {
      name: cleanName,
      fullName,
      ownerAddress: userAddress,
      ownerTwitter: userTwitterHandle,
      tokenId,
      registeredAt: now,
      expiresAt: now + 365 * 24 * 60 * 60 * 1000,
      priceEth,
      txHash: realTxHash,
      records: {
        twitter: userTwitterHandle ? `@${userTwitterHandle}` : undefined,
      }
    };

    // Update user domain portfolio
    const userDomains = this.getUserDomains(userAddress);
    this.saveUserDomains(userAddress, [newDomain, ...userDomains]);

    // Save Tx History
    this.saveTxHistory({
      id: realTxHash,
      txHash: realTxHash,
      type: 'register',
      domain: fullName,
      fromAddress: userAddress,
      toAddress: DEFAULT_DOTI_REGISTRY_ADDRESS,
      amountEth: priceEth,
      gasEth,
      timestamp: now,
      status: 'confirmed',
      chain: 'Arbitrum One'
    });

    return {
      success: true,
      txHash: realTxHash,
      domain: newDomain,
      costEth: priceEth,
      gasEth,
      totalEth: totalRequiredEth,
      calldata: preparedCalldata
    };
  }

  /**
   * Helper to format on-chain and RPC error messages into clear, friendly, and concise English explanations
   */
  public static parseRpcError(err: any, context?: { to?: string; amountEth?: number | string; action?: string }): string {
    const rawMsg = (err?.details || err?.shortMessage || err?.message || err?.toString() || '').toString();
    const lower = rawMsg.toLowerCase();
    
    // Check for gas / balance issues (e.g., insufficient funds, gas allowance exceeded)
    if (
      lower.includes('gas required exceeds allowance') || 
      lower.includes('insufficient funds') || 
      (lower.includes('have') && lower.includes('want')) ||
      lower.includes('exceeds balance')
    ) {
      return 'Insufficient funds to cover amount and Arbitrum gas fees.';
    }

    if (lower.includes('user rejected') || lower.includes('user denied')) {
      return 'Transaction was cancelled by user.';
    }

    if (lower.includes('nonce too low') || lower.includes('replacement transaction underpriced')) {
      return 'A transaction is currently pending. Please wait a few seconds and try again.';
    }

    // Default clean single-line error without URLs, JSON blobs, or viem stack dumps
    const firstLine = err?.shortMessage || rawMsg.split('\n')[0] || 'Transaction failed on Arbitrum One.';
    return firstLine
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\{.*?\}/gi, '')
      .replace(/Version:\s*viem@\S+/gi, '')
      .replace(/^Execution reverted with reason:\s*/i, '')
      .trim();
  }

  /**
   * Execute real on-chain domain transfer
   */
  public static async executeTransfer(params: {
    domainInput: string;
    recipientAddress: string;
    currentUserAddress: string;
    provider?: EIP1193Provider;
    onProgress?: (step: string) => void;
  }): Promise<{
    success: boolean;
    txHash?: string;
    errorMessage?: string;
  }> {
    const { domainInput, recipientAddress, currentUserAddress, provider, onProgress } = params;

    const { cleanName, fullName, isValid, error } = this.normalizeDomain(domainInput);
    if (!isValid) {
      return { success: false, errorMessage: error || 'Invalid domain name' };
    }

    if (!recipientAddress || !/^0x[a-fA-F0-9]{40}$/.test(recipientAddress.trim())) {
      return { success: false, errorMessage: 'Invalid recipient address. Must be a valid 42-character Arbitrum address (0x...).' };
    }

    const cleanRecipient = recipientAddress.trim().toLowerCase();
    if (cleanRecipient === currentUserAddress.toLowerCase()) {
      return { success: false, errorMessage: 'Recipient address cannot be your own address.' };
    }

    const existingPending = await this.reconcilePendingTransaction({
      type: 'transfer',
      fromAddress: currentUserAddress,
      toAddress: cleanRecipient,
      domain: fullName,
    });
    if (existingPending) {
      return {
        success: false,
        txHash: existingPending.txHash,
        errorMessage: existingPending.status === 'pending'
          ? 'This domain transfer is still pending. Do not submit it again; check Arbiscan.'
          : 'This domain transfer is already confirmed.',
      };
    }

    onProgress?.(`Verifying ownership of ${fullName}...`);
    const userDomains = this.getUserDomains(currentUserAddress);
    const domainIndex = userDomains.findIndex(d => d.name.toLowerCase() === cleanName || d.fullName.toLowerCase() === fullName);

    const domainHash = keccak256(stringToBytes(cleanName));
    let activeTokenId = 0n;
    let onChainOwner = '';
    try {
      const regData: any = await arbitrumPublicClient.readContract({
        address: DEFAULT_DOTI_REGISTRY_ADDRESS as `0x${string}`,
        abi: DOTI_REGISTRY_ABI,
        functionName: 'registry',
        args: [domainHash],
      });
      if (regData) {
        onChainOwner = String(Array.isArray(regData) ? regData[2] : regData?.owner || '');
        activeTokenId = BigInt(Array.isArray(regData) ? regData[4] : regData?.activeTokenId || 0n);
      }
    } catch (err) {
      console.warn('Ownership check note:', err);
    }

    if (!onChainOwner || onChainOwner.toLowerCase() !== currentUserAddress.toLowerCase() || activeTokenId === 0n) {
      return { success: false, errorMessage: `Ownership of "${fullName}" could not be verified on Arbitrum.` };
    }

    const transferCalldata = encodeFunctionData({
      abi: DOTI_REGISTRY_ABI,
      functionName: 'transferFrom',
      args: [currentUserAddress as `0x${string}`, cleanRecipient as `0x${string}`, activeTokenId],
    });

    let realTxHash = '';
    if (provider) {
      onProgress?.(`Broadcasting transfer transaction on Arbitrum One...`);
      try {
        const tx = await provider.request({
          method: 'eth_sendTransaction',
          params: [
            {
              from: currentUserAddress,
              to: DEFAULT_DOTI_REGISTRY_ADDRESS,
              value: '0x0',
              data: transferCalldata,
              chainId: '0xa4b1',
            },
          ],
        });
        realTxHash = typeof tx === 'string' ? tx : tx?.hash || '';
      } catch (err: any) {
        return { success: false, errorMessage: this.parseRpcError(err, { to: DEFAULT_DOTI_REGISTRY_ADDRESS, amountEth: 0, action: 'Domain Transfer' }) };
      }
    } else {
      return { success: false, errorMessage: 'Privy Ethereum Provider is not connected.' };
    }

    if (!realTxHash || !/^0x[a-fA-F0-9]{64}$/.test(realTxHash)) {
      return { success: false, errorMessage: 'Did not receive a valid transaction hash from the network.' };
    }

    this.saveTxHistory({
      id: realTxHash,
      txHash: realTxHash,
      type: 'transfer',
      domain: fullName,
      fromAddress: currentUserAddress,
      toAddress: cleanRecipient,
      amountEth: 0,
      gasEth: ESTIMATED_ARBITRUM_GAS_ETH,
      timestamp: Date.now(),
      status: 'pending',
      chain: 'Arbitrum One',
    });

    try {
      const receipt = await arbitrumPublicClient.waitForTransactionReceipt({
        hash: realTxHash as `0x${string}`,
        timeout: 60_000,
      });
      if (receipt.status !== 'success') {
        this.saveTxHistory({
          id: realTxHash,
          txHash: realTxHash,
          type: 'transfer',
          domain: fullName,
          fromAddress: currentUserAddress,
          toAddress: cleanRecipient,
          amountEth: 0,
          gasEth: ESTIMATED_ARBITRUM_GAS_ETH,
          timestamp: Date.now(),
          status: 'failed',
          chain: 'Arbitrum One',
        });
        return { success: false, txHash: realTxHash, errorMessage: 'The transfer transaction reverted on Arbitrum.' };
      }
    } catch {
      return {
        success: false,
        txHash: realTxHash,
        errorMessage: 'Transfer was submitted but confirmation is still pending. Check Arbiscan before retrying.',
      };
    }

    if (domainIndex >= 0) {
      const transferredDomain = { ...userDomains[domainIndex], ownerAddress: cleanRecipient };
      const updatedUserDomains = userDomains.filter((_, idx) => idx !== domainIndex);
      this.saveUserDomains(currentUserAddress, updatedUserDomains);
      const recipientDomains = this.getUserDomains(cleanRecipient);
      this.saveUserDomains(cleanRecipient, [transferredDomain, ...recipientDomains]);
    }

    this.saveTxHistory({
      id: realTxHash,
      txHash: realTxHash,
      type: 'transfer',
      domain: fullName,
      fromAddress: currentUserAddress,
      toAddress: cleanRecipient,
      amountEth: 0,
      gasEth: ESTIMATED_ARBITRUM_GAS_ETH,
      timestamp: Date.now(),
      status: 'confirmed',
      chain: 'Arbitrum One'
    });

    return {
      success: true,
      txHash: realTxHash
    };
  }

  /**
   * Execute real on-chain withdrawal / ETH transfer
   */
  public static async executeWithdrawal({
    recipientAddress,
    amountEth,
    amountStr,
    userAddress,
    userBalanceEth,
    provider,
    onProgress
  }: {
    recipientAddress: string;
    amountEth: number;
    amountStr?: string;
    userAddress: string;
    userBalanceEth: number;
    provider?: EIP1193Provider;
    onProgress?: (status: string) => void;
  }): Promise<{ success: boolean; txHash?: string; error?: string }> {
    if (!recipientAddress || !/^0x[a-fA-F0-9]{40}$/.test(recipientAddress.trim())) {
      return { success: false, error: 'Invalid recipient address. Must be a valid 42-character Arbitrum address (0x...).' };
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      return { success: false, error: 'A valid connected Arbitrum wallet is required.' };
    }

    let realTxHash = '';
    const rawAmount = toSafeDecimal(amountStr || amountEth);
    let maximumFeePerGas = 0n;
    let estimatedGas = 0n;
    if (provider) {
      let valueWei: bigint;
      try {
        valueWei = parseEther(rawAmount);
      } catch {
        return { success: false, error: 'Enter a valid ETH amount with at most 18 decimal places.' };
      }
      if (valueWei <= 0n) {
        return { success: false, error: 'Withdrawal amount must be greater than 0.' };
      }
      const cleanRecipient = recipientAddress.trim().toLowerCase();
      const existingPending = await this.reconcilePendingTransaction({
        type: 'transfer',
        fromAddress: userAddress,
        toAddress: cleanRecipient,
        domain: `${rawAmount} ETH Transfer`,
      });
      if (existingPending) {
        return {
          success: false,
          txHash: existingPending.txHash,
          error: existingPending.status === 'pending'
            ? 'This ETH transfer is still pending. Do not submit it again; check Arbiscan.'
            : 'This ETH transfer is already confirmed.',
        };
      }

      let currentBalance = 0n;
      try {
        [currentBalance, estimatedGas] = await Promise.all([
          arbitrumPublicClient.getBalance({ address: userAddress as `0x${string}` }),
          arbitrumPublicClient.estimateGas({
            account: userAddress as `0x${string}`,
            to: cleanRecipient as `0x${string}`,
            value: valueWei,
          }),
        ]);
        const feeQuote = await arbitrumPublicClient.estimateFeesPerGas();
        maximumFeePerGas = feeQuote.maxFeePerGas ?? feeQuote.gasPrice ?? 0n;
      } catch {
        return { success: false, error: 'Could not verify the current Arbitrum balance and gas estimate. Please try again.' };
      }
      const requiredBalance = valueWei + estimatedGas * maximumFeePerGas;
      if (currentBalance < requiredBalance) {
        return {
          success: false,
          error: `Insufficient funds. Required amount plus estimated gas is ${formatEther(requiredBalance)} ETH; current balance is ${formatEther(currentBalance)} ETH.`,
        };
      }

      onProgress?.(`Broadcasting transfer of ${rawAmount} ETH on Arbitrum One...`);
      try {
        const valueHex = `0x${valueWei.toString(16)}`;
        const tx = await provider.request({
          method: 'eth_sendTransaction',
          params: [
            {
              from: userAddress,
              to: cleanRecipient,
              value: valueHex,
              chainId: '0xa4b1', // 42161 in hex
            },
          ],
        });
        realTxHash = typeof tx === 'string' ? tx : tx?.hash || '';
      } catch (err: any) {
        return { success: false, error: this.parseRpcError(err, { to: cleanRecipient, amountEth: rawAmount, action: 'ETH Transfer' }) };
      }
    } else {
      return { success: false, error: 'Privy Ethereum Provider is not connected. Please reconnect your wallet.' };
    }

    if (!realTxHash || !/^0x[a-fA-F0-9]{64}$/.test(realTxHash)) {
      return { success: false, error: 'Did not receive a valid transaction hash from the network.' };
    }

    this.saveTxHistory({
      id: realTxHash,
      txHash: realTxHash,
      type: 'transfer',
      domain: `${rawAmount} ETH Transfer`,
      fromAddress: userAddress,
      toAddress: recipientAddress.trim().toLowerCase(),
      amountEth: Number(rawAmount),
      gasEth: Number(formatEther(estimatedGas * maximumFeePerGas)),
      timestamp: Date.now(),
      status: 'pending',
      chain: 'Arbitrum One',
    });

    try {
      const receipt = await arbitrumPublicClient.waitForTransactionReceipt({
        hash: realTxHash as `0x${string}`,
        timeout: 60_000,
      });
      if (receipt.status !== 'success') {
        this.saveTxHistory({
          id: realTxHash,
          txHash: realTxHash,
          type: 'transfer',
          domain: `${rawAmount} ETH Transfer`,
          fromAddress: userAddress,
          toAddress: recipientAddress.trim().toLowerCase(),
          amountEth: Number(rawAmount),
          gasEth: Number(formatEther(receipt.gasUsed * receipt.effectiveGasPrice)),
          timestamp: Date.now(),
          status: 'failed',
          chain: 'Arbitrum One',
        });
        return { success: false, txHash: realTxHash, error: 'The ETH transfer reverted on Arbitrum.' };
      }
    } catch {
      return {
        success: false,
        txHash: realTxHash,
        error: 'Transfer was submitted but confirmation is still pending. Check Arbiscan before retrying.',
      };
    }

    this.saveTxHistory({
      id: realTxHash,
      txHash: realTxHash,
      type: 'transfer',
      domain: `${rawAmount} ETH Transfer`,
      fromAddress: userAddress,
      toAddress: recipientAddress.trim().toLowerCase(),
      amountEth: Number(rawAmount),
      gasEth: 0.000005,
      timestamp: Date.now(),
      status: 'confirmed',
      chain: 'Arbitrum One'
    });

    return {
      success: true,
      txHash: realTxHash
    };
  }
}
