import React, { useState } from 'react';
import { usePrivyTwitter } from '../context/PrivyTwitterContext';
import {
  ShieldCheck,
  X,
  Zap,
  Check,
  Info
} from 'lucide-react';
import { DEFAULT_DOTI_REGISTRY_ADDRESS, DOTI_BOT_AGENT_ADDRESS } from '../config/web3Config';

interface DelegationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DelegationModal: React.FC<DelegationModalProps> = ({ isOpen, onClose }) => {
  const { delegation, grantDelegation, revokeDelegation } = usePrivyTwitter();
  const [dailyLimit, setDailyLimit] = useState<string>(delegation.dailyLimitEth.toString());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGrant = async () => {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const limit = parseFloat(dailyLimit) || 0.003;
      await grantDelegation(limit);
      setFeedback('Browser safety guard enabled. This is not an on-chain delegation.');
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevoke = () => {
    revokeDelegation();
    setFeedback('Browser safety guard disabled.');
    setTimeout(() => {
      onClose();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100 transition-colors">
        {/* Glow */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-52 h-52 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-500/40 flex items-center justify-center text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              Local Transaction Safety Guard
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Browser-only safety limit for direct registrations
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs space-y-2 font-mono">
            <div className="flex justify-between">
              <span className="text-slate-500">Allowed contract:</span>
              <span className="text-slate-700 dark:text-slate-300 truncate max-w-[200px]">{DEFAULT_DOTI_REGISTRY_ADDRESS}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Chain:</span>
              <span className="text-emerald-700 dark:text-emerald-400 font-bold">Arbitrum One (42161)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Spent Today:</span>
              <span className="text-slate-700 dark:text-slate-200">{delegation.spentTodayEth.toFixed(6)} ETH</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Daily Spending Cap (ETH)
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.001"
                min="0.001"
                max="0.003"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 focus:border-cyan-500 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-mono">
                ETH / 24h
              </span>
            </div>
            <div className="flex gap-2 mt-2">
              {[0.001, 0.002, 0.003].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setDailyLimit(amt.toString())}
                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-mono transition-colors"
                >
                  {amt} ETH
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-900/60 rounded-xl text-xs text-cyan-900 dark:text-cyan-300 flex items-start gap-2">
            <Info className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
            <div className="space-y-1 leading-relaxed">
              <p>
                This local guard limits direct registrations made from this browser. It is not an on-chain permission and it does not control the Twitter bot.
              </p>
              <p className="text-[11px] text-cyan-700 dark:text-cyan-400 font-medium">
                🔒 The Twitter bot has a separate server-side cap of <strong>0.003 ETH/day per wallet</strong>. Changing this browser value cannot raise that cap.
              </p>
            </div>
          </div>

          {feedback && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{feedback}</span>
            </div>
          )}

          <div className="pt-3 flex gap-3">
            {delegation.isGranted ? (
              <>
                <button
                  type="button"
                  onClick={handleRevoke}
                  className="flex-1 py-2.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800/80 rounded-xl text-xs font-bold transition-all"
                >
                  Disable Local Guard
                </button>
                <button
                  type="button"
                  onClick={handleGrant}
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:opacity-90 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-lg"
                >
                  {isSubmitting ? 'Updating...' : 'Update Local Cap'}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleGrant}
                disabled={isSubmitting}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-500 hover:opacity-90 text-slate-950 font-extrabold rounded-2xl text-sm flex items-center justify-center gap-2 shadow-xl shadow-cyan-500/20 active:scale-95 transition-all"
              >
                <Zap className="w-4 h-4 fill-current" />
                <span>{isSubmitting ? 'Enabling...' : 'Enable Local Guard'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
