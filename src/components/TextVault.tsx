import React, { useState } from 'react';
import { Lock, Unlock, Copy, Check, Send, AlertCircle, Link as LinkIcon, Sparkles } from 'lucide-react';
import type { Contact, VaultItem } from '../types';
import { api } from '../services/api';
import { createZeroKnowledgeShareLink } from '../services/shareLink';

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
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [lastEncrypted, setLastEncrypted] = useState<string | null>(null);
  const [lastShareLink, setLastShareLink] = useState<string | null>(null);
  const [copiedEncrypted, setCopiedEncrypted] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

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
      setLastShareLink(null);
      onItemAdded(res.item);
      onToast('Encrypted & copied [SECURE]:: to clipboard!', 'success');
      setPlainText('');
    } catch (err: any) {
      onToast(typeof err === 'string' ? err : err.message || 'Encryption failed', 'error');
    } finally {
      setIsEncrypting(false);
    }
  };

  const handleGenerateShareLink = async () => {
    if (!plainText.trim()) {
      onToast('Please enter text to generate secret link', 'error');
      return;
    }

    try {
      setIsGeneratingLink(true);
      const { shareUrl } = await createZeroKnowledgeShareLink(plainText, true, 3600);
      setLastShareLink(shareUrl);
      setLastEncrypted(null);
      await api.copyToClipboard(shareUrl);
      onToast('Zero-knowledge link copied! Paste into WeChat directly.', 'success');
    } catch (err: any) {
      onToast(typeof err === 'string' ? err : err.message || 'Failed to generate link', 'error');
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const handleCopyEncrypted = async () => {
    if (!lastEncrypted) return;
    await api.copyToClipboard(lastEncrypted);
    setCopiedEncrypted(true);
    onToast('Copied to clipboard! Ready to paste into WeChat', 'success');
    setTimeout(() => setCopiedEncrypted(false), 2000);
  };

  const handleCopyShareLink = async () => {
    if (!lastShareLink) return;
    await api.copyToClipboard(lastShareLink);
    setCopiedLink(true);
    onToast('Link copied to clipboard!', 'success');
    setTimeout(() => setCopiedLink(false), 2000);
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
                <h2 className="font-semibold text-slate-100 text-base">Encrypt &amp; Send Text</h2>
                <p className="text-xs text-vault-400">Direct [SECURE]:: token or Zero-Knowledge Link</p>
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
              placeholder="Type or paste sensitive text here (e.g. ChatGPT tokens, database credentials, SSH keys)..."
              rows={5}
              className="w-full bg-vault-950 border border-vault-800 focus:border-emerald-500 rounded-xl p-3.5 text-sm text-slate-200 placeholder-vault-500 focus:outline-none resize-none transition"
            />

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 bg-vault-950 border border-vault-800 rounded-lg px-3 py-1.5 flex-1">
                <span className="text-xs text-vault-400">Tags:</span>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="e.g. prod, server, config"
                  className="bg-transparent text-xs text-slate-200 focus:outline-none w-full"
                />
              </div>

              <div className="flex items-center gap-2">
                {/* 1-Click Zero-Knowledge Link Generator (Cloudflare) */}
                <button
                  onClick={handleGenerateShareLink}
                  disabled={isGeneratingLink || !plainText.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-950/80 hover:bg-blue-900 text-blue-300 border border-blue-800/80 font-medium text-xs transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                  title="Generate Zero-Knowledge Link (trans.themitta.com) - Opens directly in WeChat"
                >
                  <LinkIcon className="w-3.5 h-3.5 text-blue-400" />
                  <span>{isGeneratingLink ? 'Creating...' : '🔗 Zero-Knowledge Link'}</span>
                </button>

                {/* Direct Encrypt */}
                <button
                  onClick={handleEncrypt}
                  disabled={isEncrypting || !plainText.trim() || !selectedContact}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition shadow-lg shadow-emerald-950/50 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isEncrypting ? 'Encrypting...' : 'Encrypt &amp; Copy'}</span>
                </button>
              </div>
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

        {/* Zero-Knowledge Link Output Card */}
        {lastShareLink && (
          <div className="mt-4 p-3.5 rounded-xl bg-vault-950 border border-blue-800/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-400 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                <span>Zero-Knowledge Secret Link (Copied!)</span>
              </span>
              <button
                onClick={handleCopyShareLink}
                className="flex items-center gap-1 text-xs text-blue-200 hover:text-white px-2 py-1 rounded bg-blue-900/80 transition"
              >
                {copiedLink ? (
                  <Check className="w-3.5 h-3.5 text-blue-300" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>Copy Link</span>
              </button>
            </div>
            <p className="text-[11px] font-mono text-blue-300 truncate bg-blue-950/60 p-2 rounded border border-blue-800/60 select-all">
              {lastShareLink}
            </p>
            <p className="text-[10px] text-slate-400">
              🔥 阅后即焚：朋友在微信中点击此链接即可直接在浏览器完成本地解密，服务器已物理销毁密件。
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
              rows={5}
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
