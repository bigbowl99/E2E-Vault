import React from 'react';
import { KeyRound, ShieldCheck, X, UserPlus, Copy, Check } from 'lucide-react';
import type { PubKeyDetectedPayload, VaultItem } from '../types';
import { api } from '../services/api';

interface NotificationBannerProps {
  detectedPubKey: PubKeyDetectedPayload | null;
  onClearDetectedPubKey: () => void;
  onOpenAddContact: (pubKey: string) => void;

  receivedItem: VaultItem | null;
  onClearReceivedItem: () => void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

export const NotificationBanner: React.FC<NotificationBannerProps> = ({
  detectedPubKey,
  onClearDetectedPubKey,
  onOpenAddContact,
  receivedItem,
  onClearReceivedItem,
  onToast,
}) => {
  const [copiedText, setCopiedText] = React.useState(false);

  if (!detectedPubKey && !receivedItem) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-3 max-w-md w-full animate-in slide-in-from-bottom-5">
      {/* 1. Public Key Detected Alert */}
      {detectedPubKey && (
        <div className="bg-vault-900 border-2 border-emerald-500/80 rounded-2xl p-4 shadow-2xl shadow-emerald-950/60 flex items-start justify-between gap-3 backdrop-blur">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shrink-0">
              <KeyRound className="w-5 h-5 animate-bounce" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-emerald-300 uppercase tracking-wide">
                Partner Public Key Detected!
              </h4>
              <p className="text-xs text-slate-200 mt-0.5">
                Copied <code className="font-mono text-emerald-400">PUBKEY::...</code> from WeChat.
              </p>
              <p className="text-[11px] font-mono text-vault-400 truncate mt-1 bg-vault-950 px-2 py-1 rounded border border-vault-800">
                {detectedPubKey.public_key}
              </p>
              <div className="flex items-center gap-2 mt-2.5">
                <button
                  onClick={() => {
                    onOpenAddContact(detectedPubKey.public_key);
                    onClearDetectedPubKey();
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow transition"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Save as Contact</span>
                </button>
              </div>
            </div>
          </div>
          <button
            onClick={onClearDetectedPubKey}
            className="text-vault-400 hover:text-slate-200 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. Received Decrypted Message / File Alert */}
      {receivedItem && (
        <div className="bg-vault-900 border-2 border-blue-500/80 rounded-2xl p-4 shadow-2xl shadow-blue-950/60 flex items-start justify-between gap-3 backdrop-blur">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/40 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-blue-300 uppercase tracking-wide">
                Auto-Decrypted Incoming {receivedItem.type === 'file' ? 'File' : 'Secret'}!
              </h4>
              <p className="text-xs text-slate-200 font-medium truncate mt-0.5">
                {receivedItem.title || 'Encrypted Payload'}
              </p>
              {receivedItem.content && (
                <p className="text-[11px] font-mono text-vault-300 bg-vault-950 px-2.5 py-1.5 rounded border border-vault-800 mt-1 max-h-16 overflow-y-auto whitespace-pre-wrap">
                  {receivedItem.content}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2.5">
                {receivedItem.content && (
                  <button
                    onClick={async () => {
                      await api.copyToClipboard(receivedItem.content!);
                      setCopiedText(true);
                      onToast('Copied decrypted text!', 'success');
                      setTimeout(() => setCopiedText(false), 2000);
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow transition"
                  >
                    {copiedText ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>Copy Text</span>
                  </button>
                )}
                {receivedItem.file_path && (
                  <button
                    onClick={() => {
                      api.openFile(receivedItem.file_path!);
                      onClearReceivedItem();
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs shadow transition"
                  >
                    <span>Open File</span>
                  </button>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClearReceivedItem}
            className="text-vault-400 hover:text-slate-200 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
