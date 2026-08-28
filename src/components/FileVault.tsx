import React, { useState } from 'react';
import { FileUp, FileCheck, FolderOpen, ExternalLink, Copy, Check, ShieldAlert, Sparkles } from 'lucide-react';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import type { Contact, EncryptFileResult, VaultItem } from '../types';
import { api, isTauri } from '../services/api';

interface FileVaultProps {
  contacts: Contact[];
  selectedContact: Contact | null;
  onSelectContact: (contact: Contact | null) => void;
  onItemAdded: (item: VaultItem) => void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

export const FileVault: React.FC<FileVaultProps> = ({
  contacts,
  selectedContact,
  onSelectContact,
  onItemAdded,
  onToast,
}) => {
  // Encrypt state
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [encryptTags, setEncryptTags] = useState('config, secure-file');
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [encryptResult, setEncryptResult] = useState<EncryptFileResult | null>(null);
  const [copiedEncryptedPath, setCopiedEncryptedPath] = useState(false);

  // Decrypt state
  const [e2eFilePath, setE2eFilePath] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptResult, setDecryptResult] = useState<VaultItem | null>(null);

  const handlePickFileToEncrypt = async () => {
    if (!isTauri()) {
      const mock = 'C:\\secrets\\database_credentials.pem';
      setSelectedFilePath(mock);
      return;
    }
    try {
      const selected = await openFileDialog({
        multiple: false,
        title: 'Select File to Encrypt (< 100MB)',
      });
      if (selected && typeof selected === 'string') {
        setSelectedFilePath(selected);
      }
    } catch (err: any) {
      onToast('Failed to open file picker', 'error');
    }
  };

  const handleEncryptFile = async () => {
    if (!selectedFilePath) {
      onToast('Please choose a file to encrypt', 'error');
      return;
    }
    if (!selectedContact) {
      onToast('Please select a partner contact', 'error');
      return;
    }

    try {
      setIsEncrypting(true);
      const res = await api.encryptFile(selectedFilePath, selectedContact.public_key, encryptTags);
      setEncryptResult(res);
      onToast(`Encrypted into ${res.filename}.e2e!`, 'success');
      setSelectedFilePath(null);
    } catch (err: any) {
      onToast(typeof err === 'string' ? err : err.message || 'File encryption failed', 'error');
    } finally {
      setIsEncrypting(false);
    }
  };

  const handlePickE2eToDecrypt = async () => {
    if (!isTauri()) {
      setE2eFilePath('C:\\Users\\Desktop\\database_credentials.pem.e2e');
      return;
    }
    try {
      const selected = await openFileDialog({
        multiple: false,
        filters: [{ name: 'E2E Encrypted Files', extensions: ['e2e'] }],
        title: 'Select .e2e Encrypted File',
      });
      if (selected && typeof selected === 'string') {
        setE2eFilePath(selected);
      }
    } catch (err: any) {
      onToast('Failed to select file', 'error');
    }
  };

  const handleDecryptFile = async () => {
    if (!e2eFilePath) {
      onToast('Please select a .e2e file', 'error');
      return;
    }

    try {
      setIsDecrypting(true);
      const item = await api.decryptFileManual(e2eFilePath);
      setDecryptResult(item);
      onItemAdded(item);
      onToast(`Decrypted '${item.title}' successfully!`, 'success');
      setE2eFilePath(null);
    } catch (err: any) {
      onToast(typeof err === 'string' ? err : err.message || 'File decryption failed', 'error');
    } finally {
      setIsDecrypting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* File Encryptor */}
      <div className="bg-vault-900/80 border border-vault-800 rounded-2xl p-5 flex flex-col justify-between shadow-xl">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <FileUp className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-100 text-base">Encrypt File (.e2e)</h2>
                <p className="text-xs text-vault-400">Package keys & configs for safe IM transfer</p>
              </div>
            </div>

            <select
              value={selectedContact?.id || ''}
              onChange={(e) => {
                const c = contacts.find((item) => item.id === e.target.value) || null;
                onSelectContact(c);
              }}
              className="text-xs bg-vault-950 border border-vault-700 rounded-lg px-2.5 py-1.5 text-purple-300 focus:outline-none max-w-[150px] truncate"
            >
              <option value="">Recipient...</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Select Area */}
          <div
            onClick={handlePickFileToEncrypt}
            className="border-2 border-dashed border-vault-700 hover:border-purple-500/70 bg-vault-950/70 hover:bg-vault-950 rounded-xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2"
          >
            <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400">
              <FileUp className="w-6 h-6" />
            </div>
            {selectedFilePath ? (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-purple-300 font-mono break-all px-3">
                  {selectedFilePath}
                </p>
                <p className="text-[11px] text-vault-400">Click to change file</p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-slate-200">Click to browse file</p>
                <p className="text-xs text-vault-500 mt-0.5">Supports keys, certs, yaml, configs (&lt; 100MB)</p>
              </div>
            )}
          </div>

          {/* Tags & Action */}
          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2 bg-vault-950 border border-vault-800 rounded-lg px-3 py-1.5">
              <span className="text-xs text-vault-400">Tags:</span>
              <input
                type="text"
                value={encryptTags}
                onChange={(e) => setEncryptTags(e.target.value)}
                placeholder="e.g. prod, certificate"
                className="bg-transparent text-xs text-slate-200 focus:outline-none w-full"
              />
            </div>

            <button
              onClick={handleEncryptFile}
              disabled={isEncrypting || !selectedFilePath || !selectedContact}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-sm transition shadow-lg shadow-purple-950/50 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isEncrypting ? 'Packaging...' : 'Encrypt to .e2e'}</span>
            </button>
          </div>
        </div>

        {/* Encrypted Output Info */}
        {encryptResult && (
          <div className="mt-4 p-4 rounded-xl bg-vault-950 border border-purple-800/40 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                <span className="text-xs font-semibold text-purple-300">
                  Ready to send via WeChat:
                </span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800/60 font-mono">
                {encryptResult.filename}.e2e
              </span>
            </div>

            <p className="text-xs font-mono text-vault-300 break-all bg-vault-900 p-2.5 rounded border border-vault-800">
              {encryptResult.e2e_path}
            </p>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => api.showInFolder(encryptResult.e2e_path)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-vault-800 hover:bg-vault-700 text-xs font-medium text-slate-200 transition"
              >
                <FolderOpen className="w-3.5 h-3.5 text-purple-400" />
                <span>Show in Explorer</span>
              </button>

              <button
                onClick={async () => {
                  await api.copyToClipboard(encryptResult.e2e_path);
                  setCopiedEncryptedPath(true);
                  onToast('File path copied to clipboard', 'success');
                  setTimeout(() => setCopiedEncryptedPath(false), 2000);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-vault-800 hover:bg-vault-700 text-xs font-medium text-slate-200 transition"
              >
                {copiedEncryptedPath ? (
                  <Check className="w-3.5 h-3.5 text-purple-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>Copy Path</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* File Decryptor */}
      <div className="bg-vault-900/80 border border-vault-800 rounded-2xl p-5 flex flex-col justify-between shadow-xl">
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-100 text-base">Decrypt .e2e File</h2>
              <p className="text-xs text-vault-400">
                Or double-click any .e2e file in WeChat to decrypt automatically
              </p>
            </div>
          </div>

          {/* Select Area */}
          <div
            onClick={handlePickE2eToDecrypt}
            className="border-2 border-dashed border-vault-700 hover:border-teal-500/70 bg-vault-950/70 hover:bg-vault-950 rounded-xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2"
          >
            <div className="w-12 h-12 rounded-full bg-teal-500/10 flex items-center justify-center text-teal-400">
              <FileCheck className="w-6 h-6" />
            </div>
            {e2eFilePath ? (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-teal-300 font-mono break-all px-3">
                  {e2eFilePath}
                </p>
                <p className="text-[11px] text-vault-400">Click to choose another .e2e file</p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-slate-200">Select .e2e file to decrypt</p>
                <p className="text-xs text-vault-500 mt-0.5">
                  Restores original filename and contents to vault
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={handleDecryptFile}
              disabled={isDecrypting || !e2eFilePath}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-medium text-sm transition shadow-lg shadow-teal-950/50 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              <FileCheck className="w-4 h-4" />
              <span>{isDecrypting ? 'Decrypting...' : 'Decrypt File'}</span>
            </button>
          </div>
        </div>

        {/* Decrypted File Info */}
        {decryptResult ? (
          <div className="mt-4 p-4 rounded-xl bg-vault-950 border border-teal-800/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-teal-400">
                Decrypted & Stored in Vault:
              </span>
              <span className="text-xs font-mono text-slate-200 font-bold">
                {decryptResult.title}
              </span>
            </div>

            <p className="text-xs font-mono text-vault-300 break-all bg-vault-900 p-2.5 rounded border border-vault-800">
              {decryptResult.file_path}
            </p>

            <div className="flex items-center gap-2 pt-1">
              {decryptResult.file_path && (
                <>
                  <button
                    onClick={() => api.openFile(decryptResult.file_path!)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-950 hover:bg-teal-900 text-teal-300 border border-teal-800/80 text-xs font-medium transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open File</span>
                  </button>

                  <button
                    onClick={() => api.showInFolder(decryptResult.file_path!)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-vault-800 hover:bg-vault-700 text-xs font-medium text-slate-200 transition"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-teal-400" />
                    <span>Show in Folder</span>
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-4 p-3 rounded-xl bg-vault-950/50 border border-vault-800/50 flex items-center gap-2.5 text-xs text-vault-400">
            <ShieldAlert className="w-4 h-4 text-vault-500 shrink-0" />
            <span>
              All decrypted files are safely kept in <code className="text-teal-400 font-mono">~/.e2e_vault/files/</code>.
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
