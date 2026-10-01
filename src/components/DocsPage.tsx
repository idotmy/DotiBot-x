import React, { useState } from 'react';
import {
  Shield,
  Zap,
  Terminal,
  Cpu,
  Layers,
  AlertTriangle,
  Copy,
  Check,
  ExternalLink,
  BookOpen,
  KeyRound,
  FileCode2,
  Sparkles
} from 'lucide-react';
import {
  ARBITRUM_CHAIN_CONFIG,
  DEFAULT_DOTI_REGISTRY_ADDRESS
} from '../config/web3Config';

export const DocsPage: React.FC = () => {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(text);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const commandList = [
    {
      command: 'Hi @dotibot, register myname.i',
      desc: 'Registers a new permanent .i Web3 domain NFT to your Privy wallet on Arbitrum One.',
      category: 'Registration'
    },
    {
      command: 'Check satoshi.i',
      desc: 'Checks if a specific .i domain is available, along with pricing and estimated L2 gas fees.',
      category: 'Lookup'
    },
    {
      command: 'Hi @dotibot, send myname.i to 0x1234...abcd',
      desc: 'Transfers ownership of your .i domain NFT to another Ethereum / Arbitrum address.',
      category: 'Transfer'
    },
    {
      command: 'Hi @dotibot, send 0.005 ETH to 0x1234...abcd',
      desc: 'Transfers or withdraws native ETH from your Privy embedded smart wallet to an external address.',
      category: 'Withdrawal'
    },
    {
      command: 'My domains',
      desc: 'Lists all .i domains currently registered and held by your connected wallet.',
      category: 'Portfolio'
    },
    {
      command: 'Balance',
      desc: 'Displays your real-time Arbitrum One ETH balance and active agent delegation policy status.',
      category: 'Account'
    }
  ];

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* Top Title Banner */}
      <div className="flex items-center gap-3 pb-4 sm:pb-6 border-b border-slate-200 dark:border-slate-800">
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-cyan-500/10 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center border border-cyan-500/30 shrink-0 shadow-sm">
          <BookOpen className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            DotiBot Documentation
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Autonomous Web3 Domain Agent & Smart Contract Architecture
          </p>
        </div>
      </div>

      {/* Critical On-Chain Execution & Delegation Warning */}
      <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-500/30 text-amber-900 dark:text-amber-200 shadow-sm space-y-2">
        <div className="flex items-center gap-2.5 font-bold text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>Autonomous Execution & Local Delegation Notice</span>
        </div>
        <p className="text-xs leading-relaxed text-amber-800/90 dark:text-amber-200/90">
          <strong>1. Direct Blockchain Execution:</strong> Transactions initiated through DotiBot are broadcasted directly to <strong>Arbitrum One</strong> via your delegated Privy smart wallet session without popping up manual signature dialogs for every action.
        </p>
        <p className="text-xs leading-relaxed text-amber-800/90 dark:text-amber-200/90">
          <strong>2. Client-Side Delegation:</strong> Your spending authorization (e.g., 0.003 ETH/day) is a <strong>local browser session policy</strong> that regulates automated agent signing. Setting or updating this daily limit is <strong>NOT an on-chain transaction</strong> and incurs zero gas fees.
        </p>
      </div>

      {/* Section 1: Overview */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
          <Cpu className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          <h2>What is DotiBot?</h2>
        </div>
        <div className="bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 rounded-2xl shadow-sm space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          <p>
            <strong>DotiBot</strong> is an autonomous Web3 Domain Agent designed specifically for the <strong>.i Top-Level Domain (TLD)</strong> registry on <strong>Arbitrum One</strong>.
          </p>
          <p>
            By combining social authentication (Twitter / X) with self-custodial smart wallets (Privy) and autonomous session delegation, DotiBot allows users to effortlessly look up, register, transfer, and manage decentralized domain names using simple natural language chat commands.
          </p>
        </div>
      </section>

      {/* Section 2: Technology Stack */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
          <Cpu className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          <h2>Technology Stack & Architecture</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm space-y-2.5">
            <div className="flex items-center gap-2.5 text-cyan-600 dark:text-cyan-400 font-bold text-sm">
              <Layers className="w-4 h-4" />
              <span>Arbitrum One (L2 Blockchain)</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Provides sub-second transaction finality with minimal transaction costs (~$0.01 to $0.03), making decentralized domain registration and NFT transfers instant and cost-effective.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm space-y-2.5">
            <div className="flex items-center gap-2.5 text-cyan-600 dark:text-cyan-400 font-bold text-sm">
              <KeyRound className="w-4 h-4" />
              <span>Privy Smart Wallets (ERC-4337)</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              1-click Twitter (X) login with self-custodial Arbitrum smart wallets, leveraging ERC-4337 Account Abstraction powered by Alchemy.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm space-y-2.5">
            <div className="flex items-center gap-2.5 text-cyan-600 dark:text-cyan-400 font-bold text-sm">
              <Zap className="w-4 h-4" />
              <span>Autonomous Spending Delegation</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              A client-side security policy allowing the bot to sign and broadcast contract calls within a user-defined daily cap (e.g., 0.003 ETH/day) without popup fatigue.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm space-y-2.5">
            <div className="flex items-center gap-2.5 text-cyan-600 dark:text-cyan-400 font-bold text-sm">
              <FileCode2 className="w-4 h-4" />
              <span>Doti Registry Smart Contract</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              The official ERC-721 registrar for <code>.i</code> domains on Arbitrum (<code>{DEFAULT_DOTI_REGISTRY_ADDRESS.slice(0, 8)}...{DEFAULT_DOTI_REGISTRY_ADDRESS.slice(-6)}</code>), handling token IDs, metadata, and ownership records.
            </p>
          </div>
        </div>
      </section>

      {/* Section 3: How It Works */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
          <Zap className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          <h2>How DotiBot Works: Step-by-Step</h2>
        </div>

        <div className="bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 rounded-2xl shadow-sm space-y-5">
          <div className="flex gap-4">
            <div className="w-7 h-7 rounded-full bg-cyan-500 text-white font-bold text-xs flex items-center justify-center shrink-0">
              1
            </div>
            <div className="space-y-1">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">Connect Twitter / X</h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Click <strong>Sign in</strong> in the header. Privy authenticates your Twitter account and provisions your embedded self-custodial smart wallet on Arbitrum One.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="w-7 h-7 rounded-full bg-cyan-500 text-white font-bold text-xs flex items-center justify-center shrink-0">
              2
            </div>
            <div className="space-y-1">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">Authorize Spending Delegation (Local Policy)</h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Set a daily cap (e.g. 0.003 ETH). This is stored locally in your browser and gives @dotibot permission to submit registrations on Arbitrum without prompting manual signature popups every time.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="w-7 h-7 rounded-full bg-cyan-500 text-white font-bold text-xs flex items-center justify-center shrink-0">
              3
            </div>
            <div className="space-y-1">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">Send Prompt Commands</h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Type commands like <code>Hi @dotibot, register myhandle.i</code> or <code>Check alpha.i</code>. The agent parses your intent, verifies parameters, and checks availability.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="w-7 h-7 rounded-full bg-cyan-500 text-white font-bold text-xs flex items-center justify-center shrink-0">
              4
            </div>
            <div className="space-y-1">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">Direct On-Chain Settlement</h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                The smart wallet signs and broadcasts the registration or transfer transaction directly to the Doti contract on Arbitrum One, returning a verified Arbiscan receipt.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: Available Commands & Syntax */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
          <Terminal className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          <h2>Command Reference & Syntax Guide</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {commandList.map((item, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm space-y-2 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800">
                    {item.category}
                  </span>
                  <button
                    onClick={() => copyToClipboard(item.command)}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs flex items-center gap-1 transition-colors cursor-pointer"
                    title="Copy command"
                  >
                    {copiedCmd === item.command ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
                <code className="block p-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs text-cyan-800 dark:text-cyan-300 font-semibold break-all">
                  {item.command}
                </code>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 5: Coming Soon / Under Development */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
          <Sparkles className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          <h2>Under Development: Native 𝕏 (Twitter) Integration</h2>
        </div>

        <div className="bg-gradient-to-br from-cyan-500/5 via-blue-500/5 to-purple-500/5 dark:from-cyan-950/30 dark:via-slate-900 dark:to-blue-950/30 border border-cyan-500/30 dark:border-cyan-500/20 p-5 sm:p-6 rounded-2xl shadow-sm space-y-4 relative overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-md bg-black dark:bg-white text-white dark:text-black flex items-center justify-center font-bold text-xs">
                𝕏
              </span>
              <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                Direct On-Timeline & Reply Execution
              </h3>
            </div>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-500/40 animate-pulse">
              Coming Soon • Final Testing
            </span>
          </div>

          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            <strong>DotiBot</strong> is fully engineered to operate natively on <strong>𝕏 (Twitter)</strong>. Following the completion of final security tests, API rate-limit tuning, and stress tests, users will be able to tag <code>@dotibot</code> in any tweet or reply using the exact same commands supported in this web app:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs font-mono">
              <span className="text-slate-400 dark:text-slate-500 block text-[10px]">Mint on 𝕏:</span>
              <span className="text-cyan-700 dark:text-cyan-300 font-semibold">@dotibot register name.i</span>
            </div>
            <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs font-mono">
              <span className="text-slate-400 dark:text-slate-500 block text-[10px]">Check Availability:</span>
              <span className="text-cyan-700 dark:text-cyan-300 font-semibold">@dotibot check name.i</span>
            </div>
            <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs font-mono">
              <span className="text-slate-400 dark:text-slate-500 block text-[10px]">Transfer NFT:</span>
              <span className="text-cyan-700 dark:text-cyan-300 font-semibold">@dotibot send name.i to 0x...</span>
            </div>
            <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs font-mono">
              <span className="text-slate-400 dark:text-slate-500 block text-[10px]">Check Portfolio:</span>
              <span className="text-cyan-700 dark:text-cyan-300 font-semibold">@dotibot my domains</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
            * Once mentioned, @dotibot will verify your connected Twitter handle's delegated Privy smart wallet, execute the transaction on Arbitrum One, and reply with the verified Arbiscan receipt in the thread.
          </p>
        </div>
      </section>

      {/* Section 6: Smart Contract & Network Details */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
          <Shield className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          <h2>Smart Contract & Network Parameters</h2>
        </div>

        <div className="bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm text-xs font-mono space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2 border-b border-slate-100 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400">Network Name:</span>
            <span className="font-bold text-slate-900 dark:text-white">Arbitrum One</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2 border-b border-slate-100 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400">Chain ID:</span>
            <span className="font-bold text-slate-900 dark:text-white">42161 (0xa4b1)</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2 border-b border-slate-100 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400">Doti Registry Contract:</span>
            <a
              href={`${ARBITRUM_CHAIN_CONFIG.blockExplorerUrl}/address/${DEFAULT_DOTI_REGISTRY_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 break-all"
            >
              <span>{DEFAULT_DOTI_REGISTRY_ADDRESS}</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <span className="text-slate-500 dark:text-slate-400">Block Explorer:</span>
            <a
              href={ARBITRUM_CHAIN_CONFIG.blockExplorerUrl}
              target="_blank"
              rel="noreferrer"
              className="text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
            >
              <span>https://arbiscan.io</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};
