import React, { useState } from 'react';
import { Lock, Unlock, Copy, Check, Send, AlertCircle } from 'lucide-react';
import type { Contact, VaultItem } from '../types';
import { api } from '../services/api';

interface TextVaultProps {
  contacts: Contact[];
  selectedContact: Contact | null;
  onSelectContact: (contact: Contact | null) => void;
  onItemAdded: (item: VaultItem) => void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

export const TextVault: React.FC<TextVaultProps> = ({
  contacts,
  selectedContact,
  onSelectContact,
  onItemAdded,
  onToast,
}) => {
  const [plainText, setPlainText] = useState('');
  const [tags, setTags] = useState('notes');
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [lastEncrypted, setLastEncrypted] = useState<string | null>(null);
  const [copiedEncrypted, setCopiedEncrypted] = useState(false);

  // Manual Decrypt state
  const [armoredInput, setArmoredInput] = useState('');
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptedResult, setDecryptedResult] = useState<VaultItem | null>(null);

  const handleEncrypt = async () => {
    if (!plainText.trim()) {
      onToast('Please enter text to encrypt', 'error');
      return;
    }
    if (!selectedContact) {
      onToast('Please select a partner contact first', 'error');
      return;
    }

    try {
      setIsEncrypting(true);
      const res = await api.encryptText(plainText, selectedContact.public_key, tags);
      setLastEncrypted(res.armored_ciphertext);
      onItemAdded(res.item);
      onToast('Encrypted & copied [SECURE]:: to clipboard!', 'success');
      setPlainText('');
    } catch (err: any) {
      onToast(typeof err === 'string' ? err : err.message || 'Encryption failed', 'error');
    } finally {
      setIsEncrypting(false);
    }
  };

  const handleCopyEncrypted = async () => {
    if (!lastEncrypted) return;
    await api.copyToClipboard(lastEncrypted);
    setCopiedEncrypted(true);
    onToast('Copied to clipboard! Ready to paste into WeChat', 'success');
    setTimeout(() => setCopiedEncrypted(false), 2000);
  };

  const handleManualDecrypt = async () => {
    if (!armoredInput.trim()) {
      onToast('Please paste a [SECURE]:: text snippet', 'error');
      return;
    }

    try {
      setIsDecrypting(true);
      const item = await api.decryptTextManual(armoredInput);
      setDecryptedResult(item);
      onItemAdded(item);
      onToast('Message decrypted and saved to vault!', 'success');
      setArmoredInput('');
    } catch (err: any) {
      onToast(typeof err === 'string' ? err : err.message || 'Decryption failed', 'error');
    } finally {
      setIsDecrypting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Text Encryptor */}
      <div className="bg-vault-900/80 border border-vault-800 rounded-2xl p-5 flex flex-col justify-between shadow-xl">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-100 text-base">Encrypt & Send Text</h2>
                <p className="text-xs text-vault-400">Generate secure [SECURE]:: token for WeChat</p>
              </div>
            </div>

            {/* Quick Partner select */}
            <select
              value={selectedContact?.id || ''}
              onChange={(e) => {
                const c = contacts.find((item) => item.id === e.target.value) || null;
                onSelectContact(c);
              }}
              className="text-xs bg-vault-950 border border-vault-700 rounded-lg px-2.5 py-1.5 text-emerald-400 focus:outline-none focus:border-emerald-500 max-w-[160px] truncate"
            >
              <option value="">Choose Partner...</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Text Input */}
          <div className="space-y-3">
            <textarea
              value={plainText}
              onChange={(e) => setPlainText(e.target.value)}
              placeholder="Type or paste sensitive text here (e.g. database credentials, SSH passwords, API tokens)..."
              rows={6}
              className="w-full bg-vault-950 border border-vault-800 focus:border-emerald-500 rounded-xl p-3.5 text-sm text-slate-200 placeholder-vault-500 focus:outline-none resize-none transition"
            />

            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center gap-2 bg-vault-950 border border-vault-800 rounded-lg px-3 py-1.5">
                <span className="text-xs text-vault-400">Tags:</span>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="e.g. prod, server, config"
                  className="bg-transparent text-xs text-slate-200 focus:outline-none w-full"
                />
              </div>

              <button
                onClick={handleEncrypt}
                disabled={isEncrypting || !plainText.trim() || !selectedContact}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition shadow-lg shadow-emerald-950/50 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
              >
                <Send className="w-4 h-4" />
                <span>{isEncrypting ? 'Encrypting...' : 'Encrypt & Copy'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Encrypted Output Card */}
        {lastEncrypted && (
          <div className="mt-4 p-3.5 rounded-xl bg-vault-950 border border-emerald-800/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-400">
                Latest Ciphertext (Auto-Copied to Clipboard)
              </span>
              <button
                onClick={handleCopyEncrypted}
                className="flex items-center gap-1 text-xs text-vault-300 hover:text-white px-2 py-1 rounded bg-vault-800 transition"
              >
                {copiedEncrypted ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>Copy Again</span>
              </button>
            </div>
            <p className="text-[11px] font-mono text-vault-400 truncate bg-vault-900/90 p-2 rounded border border-vault-800">
              {lastEncrypted}
            </p>
          </div>
        )}
      </div>

      {/* Right: Manual Decryptor & Clipboard Demo */}
      <div className="bg-vault-900/80 border border-vault-800 rounded-2xl p-5 flex flex-col justify-between shadow-xl">
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Unlock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-100 text-base">Manual Decrypt</h2>
              <p className="text-xs text-vault-400">
                Clipboard auto-decrypts automatically, or paste [SECURE]:: manually
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <textarea
              value={armoredInput}
              onChange={(e) => setArmoredInput(e.target.value)}
              placeholder="Paste [SECURE]::... ciphertext received from partner..."
              rows={6}
              className="w-full bg-vault-950 border border-vault-800 focus:border-blue-500 rounded-xl p-3.5 text-sm font-mono text-slate-200 placeholder-vault-500 focus:outline-none resize-none transition"
            />

            <div className="flex justify-end">
              <button
                onClick={handleManualDecrypt}
                disabled={isDecrypting || !armoredInput.trim()}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition shadow-lg shadow-blue-950/50 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
              >
                <Unlock className="w-4 h-4" />
                <span>{isDecrypting ? 'Decrypting...' : 'Decrypt to Vault'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Decrypted Item Preview */}
        {decryptedResult ? (
          <div className="mt-4 p-3.5 rounded-xl bg-vault-950 border border-blue-800/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-400">Decrypted Content:</span>
              <button
                onClick={async () => {
                  if (decryptedResult.content) {
                    await api.copyToClipboard(decryptedResult.content);
                    onToast('Decrypted text copied!', 'success');
                  }
                }}
                className="flex items-center gap-1 text-xs text-vault-300 hover:text-white px-2 py-1 rounded bg-vault-800 transition"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Plaintext</span>
              </button>
            </div>
            <div className="bg-vault-900 p-2.5 rounded border border-vault-800 text-xs font-mono text-slate-200 whitespace-pre-wrap max-h-24 overflow-y-auto">
              {decryptedResult.content}
            </div>
          </div>
        ) : (
          <div className="mt-4 p-3 rounded-xl bg-vault-950/50 border border-vault-800/50 flex items-center gap-2.5 text-xs text-vault-400">
            <AlertCircle className="w-4 h-4 text-vault-500 shrink-0" />
            <span>
              Tip: When someone sends you <code className="text-emerald-400 font-mono">[SECURE]::...</code> in WeChat, copying it triggers instant background decryption.
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
