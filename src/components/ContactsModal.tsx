import React, { useState } from 'react';
import { X, UserPlus, Copy, Check, Trash2, CheckCircle2 } from 'lucide-react';
import type { Contact } from '../types';
import { api } from '../services/api';

interface ContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: Contact[];
  selectedContact: Contact | null;
  onSelectContact: (contact: Contact | null) => void;
  onAddContact: (contact: Contact) => void;
  onDeleteContact: (id: string) => void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
  initialPubKey?: string;
}

export const ContactsModal: React.FC<ContactsModalProps> = ({
  isOpen,
  onClose,
  contacts,
  selectedContact,
  onSelectContact,
  onAddContact,
  onDeleteContact,
  onToast,
  initialPubKey = '',
}) => {
  const [name, setName] = useState('');
  const [publicKey, setPublicKey] = useState(initialPubKey);
  const [isAdding, setIsAdding] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  React.useEffect(() => {
    if (initialPubKey) {
      setPublicKey(initialPubKey);
    }
  }, [initialPubKey]);

  if (!isOpen) return null;

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !publicKey.trim()) {
      onToast('Please provide both a contact name and public key', 'error');
      return;
    }

    try {
      setIsAdding(true);
      const contact = await api.saveContact(name.trim(), publicKey.trim());
      onAddContact(contact);
      onSelectContact(contact);
      setName('');
      setPublicKey('');
      onToast(`Saved contact '${contact.name}'!`, 'success');
    } catch (err: any) {
      onToast(typeof err === 'string' ? err : err.message || 'Failed to save contact', 'error');
    } finally {
      setIsAdding(false);
    }
  };

  const handleCopyKey = async (id: string, key: string) => {
    const formatted = key.startsWith('PUBKEY::') ? key : `PUBKEY::${key}`;
    await api.copyToClipboard(formatted);
    setCopiedId(id);
    onToast('Public key copied to clipboard', 'success');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-vault-900 border border-vault-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-vault-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-100 text-base">Partner Contacts</h2>
              <p className="text-xs text-vault-400">Manage partners' X25519 public keys</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-vault-400 hover:text-slate-200 hover:bg-vault-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Add Contact Form */}
          <form onSubmit={handleSaveContact} className="bg-vault-950 p-4 rounded-xl border border-vault-800 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Add / Update Partner Key
            </h3>

            <div>
              <label className="text-xs text-vault-400 block mb-1">Partner Name / Alias</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alice (Lead Dev), Bob (Ops)"
                className="w-full bg-vault-900 border border-vault-700 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs text-vault-400 block mb-1">Partner Public Key</label>
              <input
                type="text"
                value={publicKey}
                onChange={(e) => setPublicKey(e.target.value)}
                placeholder="Paste PUBKEY::... string received from WeChat"
                className="w-full bg-vault-900 border border-vault-700 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isAdding || !name.trim() || !publicKey.trim()}
              className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAdding ? 'Saving...' : 'Save Partner Key'}
            </button>
          </form>

          {/* Contacts List */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-vault-400">
              Saved Contacts ({contacts.length})
            </h3>

            {contacts.length === 0 ? (
              <p className="text-xs text-vault-500 text-center py-4">
                No contacts saved yet. Ask your partner to export their public key and send it via WeChat!
              </p>
            ) : (
              contacts.map((c) => {
                const isSelected = selectedContact?.id === c.id;
                return (
                  <div
                    key={c.id}
                    className={`p-3 rounded-xl border transition flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-emerald-950/40 border-emerald-700/60'
                        : 'bg-vault-950 border-vault-800'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-200 truncate">
                          {c.name}
                        </span>
                        {isSelected && (
                          <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                            <CheckCircle2 className="w-3 h-3" />
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-mono text-vault-400 truncate mt-0.5 max-w-[280px]">
                        {c.public_key}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {!isSelected && (
                        <button
                          onClick={() => onSelectContact(c)}
                          className="px-2 py-1 rounded-md bg-vault-800 hover:bg-emerald-900 text-emerald-300 text-xs font-medium transition"
                        >
                          Select
                        </button>
                      )}

                      <button
                        onClick={() => handleCopyKey(c.id, c.public_key)}
                        className="p-1.5 rounded-md bg-vault-800 hover:bg-vault-700 text-vault-300 hover:text-white transition"
                        title="Copy Public Key"
                      >
                        {copiedId === c.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        onClick={() => onDeleteContact(c.id)}
                        className="p-1.5 rounded-md bg-vault-800 hover:bg-rose-950 text-vault-400 hover:text-rose-400 transition"
                        title="Delete Contact"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
