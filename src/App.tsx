import React, { useState } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { SmartWalletsProvider } from '@privy-io/react-auth/smart-wallets';
import { arbitrum } from 'viem/chains';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { PrivyTwitterProvider, usePrivyTwitter } from './context/PrivyTwitterContext';
import { Navbar } from './components/Navbar';
import { AgentChat } from './components/AgentChat';
import { DocsPage } from './components/DocsPage';
import { DelegationModal } from './components/DelegationModal';
import { WithdrawModal } from './components/WithdrawModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Github, Linkedin, Twitter, Globe } from 'lucide-react';
import {
  ARBITRUM_CHAIN_CONFIG,
  DEFAULT_DOTI_REGISTRY_ADDRESS,
  PRIVY_APP_ID
} from './config/web3Config';

const DEFAULT_APP_ID = 'your_privy_app_ID';

function getValidAppId(): string {
  const envId = (import.meta.env.VITE_PRIVY_APP_ID as string)?.trim();
  if (envId && envId.length === 25) {
    return envId;
  }
  if (PRIVY_APP_ID && PRIVY_APP_ID.trim().length === 25) {
    return PRIVY_APP_ID.trim();
  }
  return DEFAULT_APP_ID;
}

function MainApp() {
  const [isDelegationModalOpen, setIsDelegationModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [currentView, setCurrentView] = useState<'chat' | 'docs'>('chat');
  const { login } = usePrivyTwitter();

  return (
    <div className="h-screen h-[100dvh] overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col selection:bg-cyan-500 selection:text-white font-sans transition-colors duration-200">
      {/* Top Navigation Bar: Brand on left, Docs, Theme toggle & Twitter Connect on right */}
      <div className="shrink-0">
        <Navbar
          openDelegationModal={() => setIsDelegationModalOpen(true)}
          openLoginModal={login}
          openWithdrawModal={() => setIsWithdrawModalOpen(true)}
          currentView={currentView}
          onToggleDocs={() => setCurrentView((prev) => (prev === 'docs' ? 'chat' : 'docs'))}
        />
      </div>

      {/* Main Content Area: Pure Clean Chat Terminal or Docs Page */}
      <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {currentView === 'docs' ? (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <DocsPage />
          </div>
        ) : (
          <AgentChat
            openDelegationModal={() => setIsDelegationModalOpen(true)}
            openLoginModal={login}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="shrink-0 border-t border-slate-200 dark:border-slate-800/80 bg-white/95 dark:bg-slate-950/95 py-2 px-3 sm:px-6 lg:px-8 text-xs text-slate-600 dark:text-neutral-400 transition-colors z-10">
        <div className="max-w-7xl mx-auto space-y-5">

          {/* Top Row: Navigation Links & Social Icons */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* 1. Social Icons: Top on mobile (order-1), Right on desktop (sm:order-3) */}
            <div className="order-1 sm:order-3 flex items-center gap-2">
              <a
                href="https://doti.my"
                target="_blank"
                rel="noreferrer"
                aria-label="Web"
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/[0.08] hover:border-slate-300 dark:hover:border-white/20 transition-all cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5" />
              </a>
              <a
                href="https://x.com/dotibot"
                target="_blank"
                rel="noreferrer"
                aria-label="Twitter / X"
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/[0.08] hover:border-slate-300 dark:hover:border-white/20 transition-all cursor-pointer"
              >
                <Twitter className="w-3.5 h-3.5" />
              </a>
              <a
                href="https://www.linkedin.com/company/idotmy/"
                target="_blank"
                rel="noreferrer"
                aria-label="LinkedIn"
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/[0.08] hover:border-slate-300 dark:hover:border-white/20 transition-all cursor-pointer"
              >
                <Linkedin className="w-3.5 h-3.5" />
              </a>
              <a
                href="https://github.com/idotmy/DotiBot-x"
                target="_blank"
                rel="noreferrer"
                aria-label="Github"
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/[0.08] hover:border-slate-300 dark:hover:border-white/20 transition-all cursor-pointer"
              >
                <Github className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* 3. Brand & Copyright: Bottom on mobile (order-3), Left on desktop (sm:order-1) */}
            <div className="order-3 sm:order-1 flex items-center gap-2 text-slate-500 dark:text-neutral-400">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-black dark:bg-white text-white dark:text-black shadow-sm transition-opacity hover:opacity-90">.i</span>
              <span className="text-slate-500 dark:text-neutral-500">
                <span className="text-[15px] font-semibold tracking-tight text-slate-800 dark:text-white/80 mr-1.5">Dotibot</span>
                © {new Date().getFullYear()}
              </span>
              <a
                href="https://doti.my/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-neutral-400 hover:text-emerald-600 dark:hover:text-[#CCFF00] transition-colors border-l border-slate-200 dark:border-white/20 pl-2 ml-1"
              >
                <span className="text-slate-400 dark:text-white/40">Powered by</span>
                <span className="text-[13px] font-bold tracking-tight text-slate-700 dark:text-white/70">Doti</span>
              </a>
            </div>
          </div>
        </div>
      </footer>

      <DelegationModal
        isOpen={isDelegationModalOpen}
        onClose={() => setIsDelegationModalOpen(false)}
      />

      <WithdrawModal
        isOpen={isWithdrawModalOpen}
        onClose={() => setIsWithdrawModalOpen(false)}
      />
    </div>
  );
}

function ThemedPrivyApp() {
  const appId = getValidAppId();
  const { isDark } = useTheme();

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ['twitter'],
        appearance: {
          theme: isDark ? 'dark' : 'light',
          accentColor: '#0891b2',
          logo: 'https://x.doti.my/bot.jpg',
          showWalletLoginFirst: false,
        },
        embeddedWallets: {
          showWalletUIs: false,
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
        defaultChain: arbitrum,
        supportedChains: [arbitrum],
      }}
    >
      <SmartWalletsProvider>
        <PrivyTwitterProvider>
          <MainApp />
        </PrivyTwitterProvider>
      </SmartWalletsProvider>
    </PrivyProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ThemedPrivyApp />
      </ThemeProvider>
    </ErrorBoundary>
  );
}
