import React, { useState, useRef, useEffect } from 'react';
import { usePrivyTwitter } from '../context/PrivyTwitterContext';
import { ChatMessage } from '../types';
import { DotiDomainService } from '../services/dotiDomainService';
import {
  Bot,
  Send,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  ShieldAlert,
  Layers,
  RefreshCw,
  Zap,
  Twitter,
  Copy,
  Check
} from 'lucide-react';
import {
  ARBITRUM_CHAIN_CONFIG,
  calculateDomainPrice,
  ESTIMATED_ARBITRUM_GAS_ETH,
  DEFAULT_DOTI_REGISTRY_ADDRESS,
  DOTI_DOMAIN_PRICE_ETH
} from '../config/web3Config';
import confetti from 'canvas-confetti';

interface AgentChatProps {
  openDelegationModal: () => void;
  openLoginModal: () => void;
}

export const AgentChat: React.FC<AgentChatProps> = ({
  openDelegationModal,
  openLoginModal,
}) => {
  const { user, wallet, isAuthenticated, delegation, refreshDomains, refreshBalance, recordLocalSpend, getEthereumProvider } = usePrivyTwitter();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    return [
      {
        id: 'msg_welcome',
        sender: 'agent',
        text: `👋 Hello! I am **@dotibot**, your autonomous Web3 Domain Agent on **Arbitrum One**.\n\nYou can command me to register or transfer \`.i\` Web3 domains on-chain seamlessly.\n\nCommands you can send:\n• \`Hi @dotibot, register name.i\`\n• \`Hi @dotibot, send name.i to 0x..\`\n• \`Hi @dotibot, send 0.001 ETH to 0x..\`\n• \`Check alpha.i\`\n• \`My domains\``,
        timestamp: Date.now(),
        actionType: 'info'
      }
    ];
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isProcessing, processingStatus]);

  const copyTx = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const copyMessageText = (msgId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const triggerConfetti = () => {
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch { }
  };

  const handleQuickPrompt = (promptText: string) => {
    setInput(promptText);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanInput = input.trim();
    if (!cleanInput || isProcessing) return;

    // Append user message
    const userMsg: ChatMessage = {
      id: `msg_user_${Date.now()}`,
      sender: 'user',
      text: cleanInput,
      timestamp: Date.now()
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsProcessing(true);
    setProcessingStatus('Analyzing command...');

    // If not authenticated, prompt Twitter login
    if (!isAuthenticated || !wallet || !user) {
      setTimeout(() => {
        setIsProcessing(false);
        setMessages((prev) => [
          ...prev,
          {
            id: `msg_agent_${Date.now()}`,
            sender: 'agent',
            text: `🔒 **Sign In with Twitter Required**\n\nTo interact with **@dotibot** on Arbitrum One, please sign in with your Twitter account above to provision your Privy Smart wallet.`,
            timestamp: Date.now(),
            actionType: 'info'
          }
        ]);
        openLoginModal();
      }, 500);
      return;
    }

    // 1. GREETING CHECK
    if (/^(hi|hello|hey|yo|gm|help)$/i.test(cleanInput)) {
      setTimeout(() => {
        setIsProcessing(false);
        setMessages((prev) => [
          ...prev,
          {
            id: `msg_agent_${Date.now()}`,
            sender: 'agent',
            text: `👋 Hey @${user.twitterHandle}! Ready to execute Web3 operations for you on **Arbitrum One**.\n\nTry sending:\n• \`Hi @dotibot, register satoshi.i\`\n• \`Hi @dotibot, send satoshi.i to 0x1234...\`\n• \`Check alpha.i\`\n• \`My domains\``,
            timestamp: Date.now(),
            actionType: 'info'
          }
        ]);
      }, 500);
      return;
    }

    // 2. CHECK DOMAIN AVAILABILITY
    const checkMatch = cleanInput.match(/(?:check|is available|lookup)\s+([a-zA-Z0-9_\-\.]+)/i);
    if (checkMatch) {
      const targetDomain = checkMatch[1].replace(/\.i$/i, '');
      const availability = await DotiDomainService.isAvailable(targetDomain);
      const priceEth = calculateDomainPrice(targetDomain);
      setIsProcessing(false);

      if (availability.available) {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg_agent_${Date.now()}`,
            sender: 'agent',
            text: `✨ **\`${targetDomain}.i\` is AVAILABLE!**\n\n• **Price:** \`${priceEth} ETH\` (Arbitrum One)\n• **Estimated Gas:** \`~${ESTIMATED_ARBITRUM_GAS_ETH} ETH\`\n\nTo register, simply reply:\n\`Hi @dotibot, register ${targetDomain}.i\``,
            timestamp: Date.now(),
            actionType: 'info',
            domainName: `${targetDomain}.i`
          }
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg_agent_${Date.now()}`,
            sender: 'agent',
            text: availability.reason?.toLowerCase().includes('could not be verified')
              ? `⚠️ **Could not verify \`${targetDomain}.i\` on Arbitrum One.**\n\n• **Reason:** \`${availability.reason}\`\n\nPlease try again before registering.`
              : `❌ **\`${targetDomain}.i\` is already taken.**\n\n• **Reason:** \`${availability.reason || 'Registered on Arbitrum One'}\`\n\nPlease try another domain name.`,
            timestamp: Date.now(),
            actionType: 'info',
            domainName: `${targetDomain}.i`
          }
        ]);
      }
      return;
    }

    // 3. SHOW MY DOMAINS
    if (/my domains|portfolio|list domains/i.test(cleanInput)) {
      const userDomains = DotiDomainService.getUserDomains(wallet.address);
      setIsProcessing(false);

      if (userDomains.length === 0) {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg_agent_${Date.now()}`,
            sender: 'agent',
            text: `📂 You don't have any \`.i\` domains registered in wallet \`${wallet.address}\` yet.\n\nRegister your first one by saying:\n\`Hi @dotibot, register ${user.twitterHandle || 'myname'}.i\``,
            timestamp: Date.now(),
            actionType: 'info'
          }
        ]);
      } else {
        const domainList = userDomains.map((d, i) => `${i + 1}. **\`${d.fullName}\`**${d.tokenId ? ` (Token ID: \`#${d.tokenId}\`)` : ''}`).join('\n');
        setMessages((prev) => [
          ...prev,
          {
            id: `msg_agent_${Date.now()}`,
            sender: 'agent',
            text: `📂 **Your Registered .i Domains (${userDomains.length}):**\n\n${domainList}`,
            timestamp: Date.now(),
            actionType: 'info'
          }
        ]);
      }
      return;
    }

    // 4. CHECK BALANCE COMMAND
    if (/balance|wallet balance|eth balance/i.test(cleanInput)) {
      await refreshBalance();
      setIsProcessing(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_agent_${Date.now()}`,
          sender: 'agent',
          text: `💳 **Privy Embedded Wallet Balance:**\n\n• **Address:** \`${wallet.address}\`\n• **Network:** Arbitrum One (Chain ID 42161)\n• **ETH Balance:** \`${wallet.balanceEth.toFixed(4)} ETH\`\n• **Browser Safety Guard:** ${delegation.isGranted ? `✅ Enabled (${delegation.dailyLimitEth} ETH/24h)` : '⚠️ Disabled'}`,
          timestamp: Date.now(),
          actionType: 'info'
        }
      ]);
      return;
    }

    // 5. REGISTER DOMAIN COMMAND
    const registerMatch = cleanInput.match(/(?:(?:hi\s+)?@?dotibot[,\s]+)?(?:register|mint|buy|claim)\s+([a-zA-Z0-9_\-\.]+)/i);

    if (registerMatch) {
      const requestedDomain = registerMatch[1];

      // Check delegation cap
      if (!delegation.isGranted) {
        setIsProcessing(false);
        setMessages((prev) => [
          ...prev,
          {
            id: `msg_agent_${Date.now()}`,
            sender: 'agent',
            text: `⚠️ **Local Safety Guard Required**\n\nEnable the browser-only daily limit before registering from this page. Your wallet will still request approval for each transaction.\n\n*(This setting is local to this browser. It does not authorize @dotibot or limit the server-side Twitter bot.)*`,
            timestamp: Date.now(),
            actionType: 'delegation'
          }
        ]);
        openDelegationModal();
        return;
      }

      await refreshBalance();
      const provider = await getEthereumProvider() || undefined;

      const result = await DotiDomainService.executeRegistration({
        domainInput: requestedDomain,
        userAddress: wallet.address,
        userTwitterHandle: user.twitterHandle,
        userBalanceEth: wallet.balanceEth,
        delegation,
        provider,
        onProgress: (status) => setProcessingStatus(status)
      });

      setIsProcessing(false);

      if (result.success && result.domain && result.txHash) {
        recordLocalSpend(result.totalEth || 0);
        refreshDomains();
        await refreshBalance();
        triggerConfetti();

        setMessages((prev) => [
          ...prev,
          {
            id: `msg_agent_${Date.now()}`,
            sender: 'agent',
            text: `🎉 **Domain Registered Successfully!**\n\n• **Domain:** \`${result.domain?.fullName}\`\n• **Owner:** \`${wallet.address}\` (@${user.twitterHandle})\n• **Total Cost:** \`${result.totalEth?.toFixed(4)} ETH\` (registration + estimated Arbitrum gas)\n• **Transaction Hash:** \`${result.txHash}\``,
            timestamp: Date.now(),
            txHash: result.txHash,
            actionType: 'register',
            domainName: result.domain?.fullName,
            status: 'success',
            details: {
              domain: result.domain?.fullName,
              costEth: result.costEth,
              gasEth: result.gasEth,
              totalEth: result.totalEth
            }
          }
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg_agent_${Date.now()}`,
            sender: 'agent',
            text: `❌ **Registration Failed:**\n${result.errorMessage}`,
            timestamp: Date.now(),
            actionType: 'error',
            status: 'failed',
            details: {
              errorReason: result.errorMessage,
              costEth: result.costEth,
              gasEth: result.gasEth,
              totalEth: result.totalEth
            }
          }
        ]);
      }
      return;
    }

    // 6. WITHDRAW / SEND ETH COMMAND
    const withdrawMatch = cleanInput.match(/(?:(?:hi\s+)?@?dotibot[,\s]+)?(?:withdraw|send|transfer|اسحب|ارسل|تحويل)\s+([0-9\.]+)\s*(?:eth|ETH)?\s+(?:to|إلى|الي)\s+(0x[a-fA-F0-9]{40})/i);
    if (withdrawMatch) {
      const amountStr = withdrawMatch[1];
      const targetRecipient = withdrawMatch[2];
      const amountEth = parseFloat(amountStr);

      await refreshBalance();
      const provider = await getEthereumProvider() || undefined;

      const result = await DotiDomainService.executeWithdrawal({
        recipientAddress: targetRecipient,
        amountEth,
        amountStr,
        userAddress: wallet.address,
        userBalanceEth: wallet.balanceEth,
        provider,
        onProgress: (status) => setProcessingStatus(status)
      });

      setIsProcessing(false);

      if (result.success && result.txHash) {
        await refreshBalance();
        triggerConfetti();

        setMessages((prev) => [
          ...prev,
          {
            id: `msg_agent_${Date.now()}`,
            sender: 'agent',
            text: `💸 **ETH Transfer / Withdrawal Successful!**\n\n• **Amount:** \`${amountEth} ETH\`\n• **Recipient:** \`${targetRecipient}\`\n• **Network:** Arbitrum One\n• **Transaction Hash:** \`${result.txHash}\``,
            timestamp: Date.now(),
            txHash: result.txHash,
            actionType: 'transfer',
            status: 'success'
          }
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg_agent_${Date.now()}`,
            sender: 'agent',
            text: `❌ **Withdrawal Failed**\n\n• **Amount:** \`${amountEth} ETH\`\n• **Recipient:** \`${targetRecipient}\`\n• **Network:** Arbitrum One\n\n${result.error || 'Failed to complete transaction.'}`,
            timestamp: Date.now(),
            actionType: 'error',
            status: 'failed'
          }
        ]);
      }
      return;
    }

    // 7. TRANSFER DOMAIN COMMAND
    const transferMatch = cleanInput.match(/(?:(?:hi\s+)?@?dotibot[,\s]+)?(?:send|transfer)\s+([a-zA-Z0-9_\-\.]+)\s+to\s+(0x[a-fA-F0-9]{40})/i);

    if (transferMatch) {
      const targetDomain = transferMatch[1];
      const targetRecipient = transferMatch[2];

      const provider = await getEthereumProvider() || undefined;

      const result = await DotiDomainService.executeTransfer({
        domainInput: targetDomain,
        recipientAddress: targetRecipient,
        currentUserAddress: wallet.address,
        provider,
        onProgress: (status) => setProcessingStatus(status)
      });

      setIsProcessing(false);

      if (result.success && result.txHash) {
        refreshDomains();
        triggerConfetti();

        setMessages((prev) => [
          ...prev,
          {
            id: `msg_agent_${Date.now()}`,
            sender: 'agent',
            text: `🚀 **Domain Transferred Successfully!**\n\n• **Domain:** \`${targetDomain.endsWith('.i') ? targetDomain : targetDomain + '.i'}\`\n• **Transferred to:** \`${targetRecipient}\`\n• **Network:** Arbitrum One\n• **Transaction Hash:** \`${result.txHash}\``,
            timestamp: Date.now(),
            txHash: result.txHash,
            actionType: 'transfer',
            status: 'success'
          }
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg_agent_${Date.now()}`,
            sender: 'agent',
            text: `❌ **Transfer Failed:**\n${result.errorMessage}`,
            timestamp: Date.now(),
            actionType: 'error',
            status: 'failed'
          }
        ]);
      }
      return;
    }

    // 7. DEFAULT FALLBACK
    setIsProcessing(false);
    setMessages((prev) => [
      ...prev,
      {
        id: `msg_agent_${Date.now()}`,
        sender: 'agent',
        text: `🤖 I didn't recognize that command format.\n\nPlease use one of the supported syntax patterns:\n• \`Hi @dotibot, register domain.i\`\n• \`Hi @dotibot, send domain.i to 0xRecipientAddress\`\n• \`Check domain.i\`\n• \`My domains\``,
        timestamp: Date.now(),
        actionType: 'info'
      }
    ]);
  };

  return (
    <div className="flex flex-col h-full min-h-0 max-w-7xl mx-auto w-full p-1.5 sm:p-3 overflow-hidden">
      {/* Delegation Banner */}
      {isAuthenticated && !delegation.isGranted && (
        <div className="mb-1.5 sm:mb-2 p-2 sm:p-2.5 bg-amber-50 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-500/40 rounded-xl sm:rounded-2xl flex items-center justify-between gap-2 shadow-sm text-xs transition-colors shrink-0">
          <div className="flex items-center gap-2 sm:gap-2.5 overflow-hidden">
            <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 dark:text-amber-400 shrink-0 animate-pulse" />
            <div className="truncate sm:overflow-visible">
              <p className="font-bold text-amber-900 dark:text-amber-200 text-xs truncate sm:overflow-visible">Browser Safety Guard Required</p>
              <p className="hidden sm:block text-amber-700 dark:text-slate-400 text-[11px]">
                This browser-only limit helps avoid accidental direct registrations. Your wallet still approves each transaction; it does not authorize @dotibot.
              </p>
            </div>
          </div>
          <button
            onClick={openDelegationModal}
            className="px-2.5 py-1 sm:px-3 sm:py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg sm:rounded-xl text-[11px] sm:text-xs flex items-center gap-1 sm:gap-1.5 transition-all shrink-0 cursor-pointer"
          >
            <Zap className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-current" />
            Enable Guard
          </button>
        </div>
      )}

      {/* Chat Container */}
      <div className="flex-1 min-h-0 flex flex-col bg-white dark:bg-slate-900/70 border border-slate-300 dark:border-slate-600 rounded-2xl sm:rounded-3xl overflow-hidden shadow-xl dark:shadow-2xl backdrop-blur-xl relative transition-colors">
        {/* On-Chain Execution Disclaimer Banner */}
        <div className="px-3 py-1.5 sm:px-4 sm:py-2.5 bg-slate-100/90 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-2 text-[10px] sm:text-[11px] text-slate-600 dark:text-slate-300 select-none">
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-hidden">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="truncate sm:overflow-visible">
              <strong className="text-slate-900 dark:text-slate-100 font-semibold">Wallet Approval:</strong> Review and approve each direct transaction in your connected wallet.
            </span>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 font-mono text-[10px] bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 px-2 py-0.5 rounded border border-cyan-300 dark:border-cyan-800 shrink-0">
            Arbitrum One
          </span>
        </div>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4">
          {messages.map((msg) => {
            const isAgent = msg.sender === 'agent';

            return (
              <div
                key={msg.id}
                className={`flex gap-2 sm:gap-3 ${isAgent ? 'justify-start' : 'justify-end'} animate-in fade-in duration-200`}
              >
                {isAgent && (
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-slate-900 dark:bg-slate-800 border border-cyan-500/40 flex items-center justify-center shrink-0 shadow-md shadow-cyan-500/20 overflow-hidden relative">
                    <img
                      src="/bot.jpg"
                      alt="@dotibot"
                      className="w-full h-full object-cover rounded-lg sm:rounded-xl"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                )}

                <div
                  className={`max-w-[90%] sm:max-w-[75%] rounded-2xl p-3 sm:p-4 shadow-sm text-xs sm:text-sm ${isAgent
                    ? 'bg-slate-100 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800/90 text-slate-900 dark:text-slate-200'
                    : 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-medium shadow-md shadow-cyan-600/20'
                    }`}
                >
                  <div className="whitespace-pre-wrap leading-relaxed">
                    {msg.text.split('\n').map((line, idx) => (
                      <p key={idx} className={idx > 0 ? 'mt-1.5' : ''}>
                        {line.split('`').map((part, pIdx) => {
                          if (pIdx % 2 === 1) {
                            return (
                              <code
                                key={pIdx}
                                className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900/90 border border-slate-300 dark:border-cyan-500/30 text-cyan-800 dark:text-cyan-300 font-mono text-[11px] sm:text-xs font-semibold break-all"
                              >
                                {part}
                              </code>
                            );
                          }
                          if (part.includes('**')) {
                            const boldParts = part.split('**');
                            return boldParts.map((bp, bIdx) =>
                              bIdx % 2 === 1 ? (
                                <strong key={bIdx} className="text-slate-900 dark:text-white font-bold">
                                  {bp}
                                </strong>
                              ) : (
                                bp
                              )
                            );
                          }
                          return part;
                        })}
                      </p>
                    ))}
                  </div>

                  {msg.txHash && (
                    <div className="mt-2.5 pt-2.5 sm:mt-3 sm:pt-3 border-t border-slate-200 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-slate-900/60 p-2 sm:p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-mono text-cyan-700 dark:text-cyan-400">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span className="truncate max-w-[140px] sm:max-w-[280px]">
                          Tx: {msg.txHash}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => copyTx(msg.txHash!)}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          {copiedHash === msg.txHash ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>Copy</span>
                        </button>
                        <a
                          href={`${ARBITRUM_CHAIN_CONFIG.blockExplorerUrl}/tx/${msg.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2 py-1 bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-950 dark:hover:bg-cyan-900 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/80 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors"
                        >
                          <span>Arbiscan</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  )}

                  {msg.actionType === 'delegation' && !delegation.isGranted && (
                    <div className="mt-2.5 sm:mt-3">
                      <button
                        onClick={openDelegationModal}
                        className="w-full py-2 px-3 bg-gradient-to-r from-amber-500 to-cyan-500 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md transition-all active:scale-95 cursor-pointer"
                      >
                        <Zap className="w-3.5 h-3.5 fill-current" />
                        Enable Browser Safety Guard
                      </button>
                    </div>
                  )}

                  <div className="mt-1.5 pt-1 flex items-center justify-between gap-2 text-[9px] sm:text-[10px] border-t border-black/5 dark:border-white/5">
                    <button
                      type="button"
                      onClick={() => copyMessageText(msg.id, msg.text)}
                      className={`py-0.5 px-1.5 rounded-md transition-all flex items-center gap-1 cursor-pointer select-none ${
                        isAgent
                          ? 'hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400'
                          : 'hover:bg-white/20 text-white/90'
                      }`}
                      title="Copy message"
                      aria-label="Copy message text"
                    >
                      {copiedMsgId === msg.id ? (
                        <>
                          <Check className="w-2.5 h-2.5 text-emerald-400" />
                          <span className="text-[9px] font-medium">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-2.5 h-2.5 opacity-70" />
                          <span className="text-[9px]">Copy</span>
                        </>
                      )}
                    </button>
                    <span className={isAgent ? 'text-slate-400 dark:text-slate-500' : 'text-white/70'}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                {!isAgent && (
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-slate-200 dark:bg-slate-800 border border-cyan-500/40 flex items-center justify-center shrink-0 overflow-hidden">
                    <img
                      src={user?.profileImageUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=user'}
                      alt="avatar"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
              </div>
            );
          })}

          {isProcessing && (
            <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-cyan-50 dark:bg-slate-950/80 border border-cyan-300 dark:border-cyan-500/30 text-xs text-cyan-800 dark:text-cyan-300 shadow-sm animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin text-cyan-600 dark:text-cyan-400 shrink-0" />
              <div className="flex-1 font-mono text-[11px] sm:text-xs truncate">
                <span>{processingStatus || 'Processing on Arbitrum One...'}</span>
              </div>
              <span className="hidden xs:inline text-[10px] bg-cyan-100 dark:bg-cyan-950 px-2 py-0.5 rounded border border-cyan-300 dark:border-cyan-800 text-cyan-800 dark:text-cyan-300 font-mono shrink-0">
                L2 Sub-second
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Prompts */}
        <div className="px-2 sm:px-4 py-2 bg-slate-50/90 dark:bg-slate-950/50 border-t border-slate-200 dark:border-slate-800/80">
          {/* Desktop View: Single continuous line with all buttons in one row */}
          <div className="hidden sm:flex items-center gap-2 overflow-x-auto">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold shrink-0 flex items-center gap-1 mr-0.5">
              <Sparkles className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
              <span>Prompts:</span>
            </span>
            <button
              type="button"
              onClick={() => handleQuickPrompt('Hi @dotibot, register satoshi.i')}
              className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-mono bg-white dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/80 transition-colors whitespace-nowrap hover:text-cyan-600 dark:hover:text-cyan-300 shadow-sm cursor-pointer active:scale-95"
            >
              register satoshi.i
            </button>
            <button
              type="button"
              onClick={() => handleQuickPrompt('Check alpha.i')}
              className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-mono bg-white dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/80 transition-colors whitespace-nowrap hover:text-cyan-600 dark:hover:text-cyan-300 shadow-sm cursor-pointer active:scale-95"
            >
              Check alpha.i
            </button>
            <button
              type="button"
              onClick={() => handleQuickPrompt('Balance')}
              className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-mono bg-white dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/80 transition-colors whitespace-nowrap hover:text-cyan-600 dark:hover:text-cyan-300 shadow-sm cursor-pointer active:scale-95"
            >
              Balance
            </button>
            <button
              type="button"
              onClick={() => handleQuickPrompt('Hi @dotibot, send domain.i to 0x..')}
              className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-mono bg-white dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/80 transition-colors whitespace-nowrap hover:text-cyan-600 dark:hover:text-cyan-300 shadow-sm cursor-pointer active:scale-95"
            >
              send domain.i
            </button>
            <button
              type="button"
              onClick={() => handleQuickPrompt('Hi @dotibot, send 0.001 ETH to 0x..')}
              className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-mono bg-white dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/80 transition-colors whitespace-nowrap hover:text-cyan-600 dark:hover:text-cyan-300 shadow-sm cursor-pointer active:scale-95"
            >
              send 0.001 ETH
            </button>
            <button
              type="button"
              onClick={() => handleQuickPrompt('My domains')}
              className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-mono bg-white dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/80 transition-colors whitespace-nowrap hover:text-cyan-600 dark:hover:text-cyan-300 shadow-sm cursor-pointer active:scale-95"
            >
              My domains
            </button>
          </div>

          {/* Mobile View: 2 symmetrical rows of 3 buttons each */}
          <div className="flex sm:hidden flex-col gap-1.5 w-full">
            <div className="flex items-center gap-1.5 w-full">
              <button
                type="button"
                onClick={() => handleQuickPrompt('Hi @dotibot, register satoshi.i')}
                className="flex-1 px-2 py-1 rounded-lg text-[10px] font-mono bg-white dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/80 transition-colors whitespace-nowrap text-center hover:text-cyan-600 dark:hover:text-cyan-300 shadow-sm cursor-pointer active:scale-95"
              >
                register satoshi.i
              </button>
              <button
                type="button"
                onClick={() => handleQuickPrompt('Check alpha.i')}
                className="flex-1 px-2 py-1 rounded-lg text-[10px] font-mono bg-white dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/80 transition-colors whitespace-nowrap text-center hover:text-cyan-600 dark:hover:text-cyan-300 shadow-sm cursor-pointer active:scale-95"
              >
                Check alpha.i
              </button>
              <button
                type="button"
                onClick={() => handleQuickPrompt('Balance')}
                className="flex-1 px-2 py-1 rounded-lg text-[10px] font-mono bg-white dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/80 transition-colors whitespace-nowrap text-center hover:text-cyan-600 dark:hover:text-cyan-300 shadow-sm cursor-pointer active:scale-95"
              >
                Balance
              </button>
            </div>
            <div className="flex items-center gap-1.5 w-full">
              <button
                type="button"
                onClick={() => handleQuickPrompt('Hi @dotibot, send domain.i to 0x..')}
                className="flex-1 px-2 py-1 rounded-lg text-[10px] font-mono bg-white dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/80 transition-colors whitespace-nowrap text-center hover:text-cyan-600 dark:hover:text-cyan-300 shadow-sm cursor-pointer active:scale-95"
              >
                send domain.i
              </button>
              <button
                type="button"
                onClick={() => handleQuickPrompt('Hi @dotibot, send 0.001 ETH to 0x..')}
                className="flex-1 px-2 py-1 rounded-lg text-[10px] font-mono bg-white dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/80 transition-colors whitespace-nowrap text-center hover:text-cyan-600 dark:hover:text-cyan-300 shadow-sm cursor-pointer active:scale-95"
              >
                send 0.001 ETH
              </button>
              <button
                type="button"
                onClick={() => handleQuickPrompt('My domains')}
                className="flex-1 px-2 py-1 rounded-lg text-[10px] font-mono bg-white dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/80 transition-colors whitespace-nowrap text-center hover:text-cyan-600 dark:hover:text-cyan-300 shadow-sm cursor-pointer active:scale-95"
              >
                My domains
              </button>
            </div>
          </div>
        </div>

        {/* Input Form */}
        <form
          onSubmit={handleSendMessage}
          className="p-2 sm:p-4 bg-white/90 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800 flex items-center gap-1.5 sm:gap-2"
        >
          <div className="relative flex-1">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='Ask @dotibot (e.g. "register name.i" or "check name.i")...'
              disabled={isProcessing}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700/80 focus:border-cyan-500 rounded-xl sm:rounded-2xl pl-3 sm:pl-4 pr-3 py-2.5 sm:py-3 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={!input.trim() || isProcessing}
            className="p-2.5 sm:p-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90 disabled:opacity-40 text-white font-bold rounded-xl sm:rounded-2xl transition-all shadow-md shadow-cyan-500/20 active:scale-95 shrink-0 cursor-pointer"
          >
            <Send className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </button>
        </form>
      </div>
    </div>
  );
};
