import React, { useState } from 'react';
import { usePrivyTwitter } from '../context/PrivyTwitterContext';
import {
  X,
  ArrowUpRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Wallet as WalletIcon
} from 'lucide-react';
import { ARBITRUM_CHAIN_CONFIG } from '../config/web3Config';
import { DotiDomainService } from '../services/dotiDomainService';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WithdrawModal: React.FC<WithdrawModalProps> = ({ isOpen, onClose }) => {
  const { wallet, refreshBalance, getEthereumProvider } = usePrivyTwitter();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentBal = wallet?.balanceEth ?? 0;

  // Format balance string without cutting small numbers (e.g. 0.000015)
  const formattedBalance = currentBal === 0
    ? '0.000000'
    : currentBal < 0.00001
      ? currentBal.toFixed(5).replace(/\.?0+$/, '')
      : currentBal.toFixed(5);

  const handleSetMax = () => {
    if (currentBal <= 0) {
      setAmount('0');
      return;
    }
    // Arbitrum L2 gas for a simple ETH send is ~0.000003 - 0.000005 ETH ($0.001 - $0.005)
    // If balance is very small, we allow setting the amount directly or with minimal buffer
    const gasBuffer = Math.min(0.00001, currentBal * 0.05);
    const maxVal = Math.max(0, currentBal - gasBuffer);
    // Format to 8 decimal places and remove trailing zeros
    const maxStr = maxVal.toFixed(5).replace(/\.?0+$/, '');
    setAmount(maxStr || currentBal.toString());
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setTxHash(null);

    const cleanRecipient = recipient.trim();
    const cleanAmountStr = amount.trim();
    const numAmount = parseFloat(cleanAmountStr);

    if (!cleanRecipient.startsWith('0x') || cleanRecipient.length !== 42) {
      setErrorMsg('Please enter a valid Arbitrum wallet address (0x...)');
      return;
    }

    if (isNaN(numAmount) || numAmount <= 0) {
      setErrorMsg('Please enter a valid ETH amount greater than 0.');
      return;
    }

    if (numAmount > currentBal) {
      setErrorMsg(`Insufficient balance. Current balance is ${formattedBalance} ETH.`);
      return;
    }

    setIsSubmitting(true);

    try {
      const provider = await getEthereumProvider();
      if (!provider) {
        setErrorMsg('Wallet provider not initialized. Please ensure your Privy wallet is connected.');
        setIsSubmitting(false);
        return;
      }

      const res = await DotiDomainService.executeWithdrawal({
        recipientAddress: cleanRecipient,
        amountEth: numAmount,
        amountStr: cleanAmountStr,
        userAddress: wallet?.address || '',
        userBalanceEth: currentBal,
        provider: provider,
      });

      if (res.success && res.txHash) {
        setTxHash(res.txHash);
        await refreshBalance();
      } else {
        setErrorMsg(res.error || 'Withdrawal failed. Please check your balance and try again.');
      }
    } catch (err: any) {
      setErrorMsg(DotiDomainService.parseRpcError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    setRecipient('');
    setAmount('');
    setTxHash(null);
    setErrorMsg(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden transition-all text-slate-900 dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
              <ArrowUpRight className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base leading-tight">Withdraw / Send ETH</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Transfer ETH from your Arbitrum wallet to any address
              </p>
            </div>
          </div>
          <button
            onClick={handleResetAndClose}
            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success View */}
        {txHash ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <h4 className="font-bold text-base text-slate-900 dark:text-white">Withdrawal Sent!</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Your transaction has been submitted to the Arbitrum One network.
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 font-mono text-xs break-all text-slate-700 dark:text-slate-300">
              <span className="text-slate-400 block text-[10px] uppercase font-bold mb-1">Transaction Hash</span>
              {txHash}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <a
                href={`${ARBITRUM_CHAIN_CONFIG.blockExplorerUrl}/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold transition-all text-cyan-600 dark:text-cyan-400"
              >
                <span>View on Arbiscan</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                onClick={handleResetAndClose}
                className="flex-1 py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Form View */
          <form onSubmit={handleWithdraw} className="p-6 space-y-4" noValidate>
            {/* Balance Badge */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <WalletIcon className="w-4 h-4 text-cyan-500" />
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Available Balance</span>
              </div>
              <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                {formattedBalance} ETH
              </span>
            </div>

            {/* Recipient Input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Recipient Address (Arbitrum One)
              </label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="0x..."
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all text-slate-900 dark:text-white"
              />
            </div>

            {/* Amount Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Amount (ETH)
                </label>
                <button
                  type="button"
                  onClick={handleSetMax}
                  className="text-[11px] font-bold text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
                >
                  Send Max
                </button>
              </div>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.000001"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all text-slate-900 dark:text-white"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-bold text-xs text-slate-400">
                  ETH
                </span>
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Network Gas Note */}
            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>Network:</span>
              <span className="font-medium text-slate-700 dark:text-slate-300">Arbitrum One (~0.000001 ETH Gas)</span>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || currentBal <= 0}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-sm shadow-lg shadow-cyan-500/25 transition-all transform active:scale-98 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Submitting Transfer...</span>
                </>
              ) : (
                <>
                  <ArrowUpRight className="w-4 h-4" />
                  <span>Confirm & Send ETH</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
