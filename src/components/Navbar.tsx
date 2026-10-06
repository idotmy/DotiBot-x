import React, { useState } from 'react';
import { usePrivyTwitter } from '../context/PrivyTwitterContext';
import { useTheme } from '../context/ThemeContext';
import {
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
  Copy,
  Check,
  LogOut,
  RefreshCw,
  Sun,
  Moon,
  ArrowUpRight,
  BookOpen,
  MessageSquare
} from 'lucide-react';
import { ARBITRUM_CHAIN_CONFIG } from '../config/web3Config';

interface NavbarProps {
  openDelegationModal: () => void;
  openLoginModal: () => void;
  openWithdrawModal: () => void;
  currentView: 'chat' | 'docs';
  onToggleDocs: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  openDelegationModal,
  openLoginModal,
  openWithdrawModal,
  currentView,
  onToggleDocs,
}) => {
  const { user, wallet, isAuthenticated, isLoading, logout, delegation, refreshBalance, login } = usePrivyTwitter();
  const { toggleTheme, isDark } = useTheme();
  const [copied, setCopied] = useState(false);
  const [showWalletDropdown, setShowWalletDropdown] = useState(false);
  const [isRefreshingBal, setIsRefreshingBal] = useState(false);

  const copyAddress = () => {
    if (wallet?.address) {
      navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRefreshBalance = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRefreshingBal(true);
    await refreshBalance();
    setTimeout(() => setIsRefreshingBal(false), 600);
  };

  const handleConnectClick = () => {
    login();
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur-xl transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2">
        {/* Brand */}
        <div className="flex items-center gap-2 sm:gap-3 select-none shrink-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-white/90 dark:bg-slate-950/90 flex items-center justify-center shadow-md shadow-cyan-500/20">
            <span className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-sm bg-black dark:bg-white text-white dark:text-black font-bold text-xs sm:text-sm shadow-sm transition-opacity hover:opacity-90">.i</span>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-sm sm:text-base tracking-tight text-slate-900 dark:text-white">
                DotiBot
              </span>
              <span className="hidden sm:inline-block text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-500/30">
                Arbitrum
              </span>
            </div>
            <p className="hidden sm:block text-[10px] text-slate-500 dark:text-slate-400 font-medium">
              Autonomous .i Domain Registrar
            </p>
          </div>
        </div>

        {/* Right Actions: Docs Button + Theme Toggle + Connect Button */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Docs Navigation Button */}
          <button
            type="button"
            onClick={onToggleDocs}
            className={`h-8 sm:h-9 px-2.5 sm:px-3 rounded-lg sm:rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95 ${
              currentView === 'docs'
                ? 'bg-cyan-500 text-white border-cyan-500 shadow-cyan-500/20'
                : 'border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-900/80 hover:bg-slate-200/80 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300'
            }`}
            title={currentView === 'docs' ? 'Return to Agent Terminal' : 'View Documentation'}
            aria-label="Toggle Documentation"
          >
            {currentView === 'docs' ? (
              <>
                <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Bot</span>
              </>
            ) : (
              <>
                <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-600 dark:text-cyan-400" />
                <span className="hidden xs:inline sm:inline">Docs</span>
              </>
            )}
          </button>

          {/* Theme Switcher Button */}
          <button
            type="button"
            onClick={toggleTheme}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-900/80 hover:bg-slate-200/80 dark:hover:bg-slate-800/80 text-slate-600 dark:text-slate-400 flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95"
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle Theme"
          >
            {isDark ? (
              <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
            ) : (
              <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-700" />
            )}
          </button>

          {/* Authentication Section */}
          {isAuthenticated && user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowWalletDropdown(!showWalletDropdown)}
                className="flex items-center gap-1.5 sm:gap-2.5 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800/90 border border-slate-300 dark:border-slate-600 py-1 px-2 sm:py-1.5 sm:px-3 rounded-lg sm:rounded-xl transition-all cursor-pointer select-none text-left h-8 sm:h-9"
              >
                {/* Twitter Avatar */}
                <div className="relative shrink-0">
                  {user.profileImageUrl ? (
                    <img
                      src={user.profileImageUrl}
                      alt={user.twitterHandle}
                      className="w-6 h-6 sm:w-7 sm:h-7 rounded-full ring-2 ring-cyan-500/40 object-cover bg-slate-800"
                    />
                  ) : (
                    <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-cyan-600 text-white font-bold text-xs flex items-center justify-center ring-2 ring-cyan-500/40">
                      {user.twitterHandle?.charAt(0)?.toUpperCase() || 'U'}
                    </div>
                  )}
                  <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 sm:w-2.5 sm:h-2.5 bg-emerald-500 rounded-full ring-2 ring-white dark:ring-slate-950" />
                </div>

                {/* Twitter Handle & Balance */}
                <div className="hidden sm:flex flex-col gap-0.5">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-tight truncate max-w-[90px]">
                    @{user.twitterHandle}
                  </span>
                  <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-mono leading-tight flex items-center gap-1">
                    <span>
                      {(wallet?.balanceEth ?? 0) === 0
                        ? '0.0000 ETH'
                        : (wallet?.balanceEth ?? 0) < 0.001
                          ? `${(wallet?.balanceEth ?? 0).toFixed(6)} ETH`
                          : `${(wallet?.balanceEth ?? 0).toFixed(4)} ETH`}
                    </span>
                  </span>
                </div>
              </button>

              {/* Dropdown Menu */}
              {showWalletDropdown && (
                <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-4 z-50 text-slate-900 dark:text-slate-100 animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <img
                        src={user.profileImageUrl}
                        alt=""
                        className="w-8 h-8 rounded-full ring-1 ring-cyan-500/30 object-cover bg-slate-800"
                      />
                      <div>
                        <p className="text-xs font-bold leading-tight">@{user.twitterHandle}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                          Privy Authenticated
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold px-2 py-0.5 rounded-full border border-emerald-500/20">
                      Connected
                    </span>
                  </div>

                  {/* Wallet Info */}
                  <div className="py-3 border-b border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>Arbitrum Wallet</span>
                      <button
                        type="button"
                        onClick={copyAddress}
                        className="flex items-center gap-1 text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
                      >
                        {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        <span className="font-mono text-[10px]">
                          {wallet?.address
                            ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
                            : ''}
                        </span>
                      </button>
                    </div>

                    <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-950/60 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800/60">
                      <div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">
                          Balance (Arbitrum)
                        </span>
                        <span className="text-sm font-black font-mono text-slate-900 dark:text-white">
                          {(wallet?.balanceEth ?? 0) === 0
                            ? '0.0000'
                            : (wallet?.balanceEth ?? 0) < 0.001
                              ? (wallet?.balanceEth ?? 0).toFixed(6)
                              : (wallet?.balanceEth ?? 0).toFixed(4)}{' '}
                          ETH
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleRefreshBalance}
                        className={`p-1.5 rounded-lg bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-cyan-500 dark:hover:text-cyan-400 transition-all cursor-pointer ${isRefreshingBal ? 'animate-spin' : ''
                          }`}
                        title="Refresh Balance"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Withdraw / Send Funds Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowWalletDropdown(false);
                        openWithdrawModal();
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20 text-xs font-bold transition-all cursor-pointer"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>Withdraw / Send ETH</span>
                    </button>
                  </div>

                  {/* Delegation Status */}
                  <div className="py-2.5 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {delegation.isGranted ? (
                          <ShieldCheck className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <ShieldAlert className="w-4 h-4 text-amber-500" />
                        )}
                        <span className="text-xs font-semibold">Browser Safety Guard</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowWalletDropdown(false);
                          openDelegationModal();
                        }}
                        className="text-[11px] text-cyan-600 dark:text-cyan-400 hover:underline font-medium cursor-pointer"
                      >
                        Config
                      </button>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                      <span>Daily Spend Limit:</span>
                      <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                        {delegation.dailyLimitEth} ETH
                      </span>
                    </div>
                  </div>

                  {/* Explorer Link */}
                  <div className="pt-2 pb-1">
                    <a
                      href={`${ARBITRUM_CHAIN_CONFIG.blockExplorerUrl}/address/${wallet?.address}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors py-1"
                    >
                      <span>View on Arbiscan</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  <div className="pt-2 mt-1 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setShowWalletDropdown(false);
                        logout();
                      }}
                      className="flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 font-medium cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Disconnect
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Single Official Privy Twitter Log In Button */
            <button
              onClick={handleConnectClick}
              type="button"
              className="flex items-center gap-2 bg-black hover:bg-slate-800 text-white font-semibold px-4 py-2 rounded-xl text-xs shadow-md transition-all transform active:scale-95 cursor-pointer"
            >
              <div className="w-4 h-4 rounded bg-white text-black flex items-center justify-center text-[10px] font-bold">
                𝕏
              </div>
              <span>Sign in</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
