import React, { useState } from 'react';
import { ShieldCheck, Copy, Check, Users, KeyRound, Radio, Power } from 'lucide-react';
import type { Contact, Identity } from '../types';
import { api } from '../services/api';

interface HeaderProps {
  identity: Identity | null;
  contacts: Contact[];
  selectedContact: Contact | null;
  onSelectContact: (contact: Contact | null) => void;
  onOpenContactsModal: () => void;
  onCopyText: (text: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  identity,
  contacts,
  selectedContact,
  onSelectContact,
  onOpenContactsModal,
  onCopyText,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyMyKey = () => {
    if (!identity) return;
    onCopyText(identity.armored_pubkey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleQuit = async () => {
    await api.exitApp();
  };

  return (
    <header className="bg-vault-900/90 backdrop-blur border-b border-vault-800 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30">
      {/* Brand & Daemon Status */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-950/40 ring-1 ring-emerald-400/20">
          <ShieldCheck className="w-6 h-6 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-lg text-slate-100 tracking-tight">E2E-Vault</h1>
            <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/60">
              Desktop Guard
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-vault-400">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span>Clipboard Daemon Active</span>
          </div>
        </div>
      </div>

      {/* Action Badges & Partner Selector */}
      <div className="flex items-center flex-wrap gap-3">
        {/* Recipient Selector */}
        <div className="flex items-center gap-2 bg-vault-950/80 border border-vault-800 rounded-lg px-3 py-1.5">
          <span className="text-xs text-vault-400 font-medium">Partner:</span>
          <select
            value={selectedContact ? selectedContact.id : ''}
            onChange={(e) => {
              const c = contacts.find((item) => item.id === e.target.value) || null;
              onSelectContact(c);
            }}
            className="bg-transparent text-sm text-emerald-300 font-medium focus:outline-none cursor-pointer"
          >
            <option value="" className="bg-vault-900 text-slate-300">
              -- Select Partner --
            </option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id} className="bg-vault-900 text-slate-200">
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Contacts Modal Button */}
        <button
          onClick={onOpenContactsModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-vault-800/80 hover:bg-vault-700/80 text-slate-200 hover:text-white text-xs font-medium border border-vault-700 transition"
          title="Manage Contacts"
        >
          <Users className="w-3.5 h-3.5 text-emerald-400" />
          <span>Contacts</span>
          <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-vault-900 text-[10px] text-vault-300">
            {contacts.length}
          </span>
        </button>

        {/* Copy My Pubkey */}
        <button
          onClick={handleCopyMyKey}
          disabled={!identity}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/80 text-xs font-semibold shadow-sm transition active:scale-95 disabled:opacity-50"
          title="Click to copy your public key (PUBKEY::...) for WeChat"
        >
          <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
          <span>Export My Public Key</span>
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-400 animate-in zoom-in" />
          ) : (
            <Copy className="w-3.5 h-3.5 opacity-70" />
          )}
        </button>

        {/* Quit Button */}
        <button
          onClick={handleQuit}
          className="p-2 rounded-lg bg-rose-950/40 hover:bg-rose-950/80 text-rose-400 border border-rose-900/50 hover:border-rose-700 transition"
          title="Exit E2E-Vault Completely"
        >
          <Power className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
