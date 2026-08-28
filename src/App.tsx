import React, { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Shield, FileUp, Database, AlertTriangle, CheckCircle2, FolderTree } from 'lucide-react';
import type { Contact, Identity, PubKeyDetectedPayload, VaultItem } from './types';
import { api, isTauri } from './services/api';
import { Header } from './components/Header';
import { TextVault } from './components/TextVault';
import { FileVault } from './components/FileVault';
import { FileOrganizer } from './components/FileOrganizer';
import { VaultList } from './components/VaultList';
import { ContactsModal } from './components/ContactsModal';
import { NotificationBanner } from './components/NotificationBanner';

export const App: React.FC = () => {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [activeTab, setActiveTab] = useState<'text' | 'file' | 'organizer' | 'vault'>('organizer');
  const [selectedContactFilter, setSelectedContactFilter] = useState<string | null>(null);

  // Modal & Notifications
  const [isContactsModalOpen, setIsContactsModalOpen] = useState(false);
  const [initialModalPubKey, setInitialModalPubKey] = useState('');
  const [detectedPubKey, setDetectedPubKey] = useState<PubKeyDetectedPayload | null>(null);
  const [receivedItem, setReceivedItem] = useState<VaultItem | null>(null);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  const loadData = async () => {
    try {
      const [ident, contactList, items] = await Promise.all([
        api.getMyIdentity(),
        api.listContacts(),
        api.getVaultItems(),
      ]);
      setIdentity(ident);
      setContacts(contactList);
      setVaultItems(items);
      if (contactList.length > 0 && !selectedContact) {
        setSelectedContact(contactList[0]);
      }
    } catch (err: any) {
      console.error('Failed to load initial data:', err);
    }
  };

  useEffect(() => {
    loadData();

    if (isTauri()) {
      const unlistenItemPromise = listen<VaultItem>('vault-item-received', (event) => {
        const item = event.payload;
        setVaultItems((prev) => [item, ...prev.filter((i) => i.id !== item.id)]);
        setReceivedItem(item);
      });

      const unlistenPubKeyPromise = listen<PubKeyDetectedPayload>('pubkey-detected', (event) => {
        const payload = event.payload;
        setDetectedPubKey(payload);
      });

      return () => {
        unlistenItemPromise.then((fn) => fn());
        unlistenPubKeyPromise.then((fn) => fn());
      };
    }
  }, []);

  const handleItemAdded = (item: VaultItem) => {
    setVaultItems((prev) => [item, ...prev.filter((i) => i.id !== item.id)]);
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await api.deleteVaultItem(id);
      setVaultItems((prev) => prev.filter((i) => i.id !== id));
      showToast('Item deleted from vault', 'success');
    } catch (err: any) {
      showToast('Failed to delete item', 'error');
    }
  };

  const handleUpdateTags = async (id: string, newTags: string) => {
    try {
      await api.updateVaultItemTags(id, newTags);
      setVaultItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, tags: newTags } : i))
      );
      showToast('Tags updated!', 'success');
    } catch (err: any) {
      showToast('Failed to update tags', 'error');
    }
  };

  const handleAddContact = (contact: Contact) => {
    setContacts((prev) => {
      const exists = prev.some((c) => c.public_key === contact.public_key);
      if (exists) {
        return prev.map((c) => (c.public_key === contact.public_key ? contact : c));
      }
      return [...prev, contact];
    });
    api.getVaultItems().then(setVaultItems);
  };

  const handleDeleteContact = async (id: string) => {
    try {
      await api.deleteContact(id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
      if (selectedContact?.id === id) {
        setSelectedContact(null);
      }
      showToast('Contact removed', 'success');
    } catch (err: any) {
      showToast('Failed to delete contact', 'error');
    }
  };

  const fileItemsCount = vaultItems.filter((i) => i.type === 'file').length;

  return (
    <div className="min-h-screen bg-vault-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Header */}
      <Header
        identity={identity}
        contacts={contacts}
        selectedContact={selectedContact}
        onSelectContact={setSelectedContact}
        onOpenContactsModal={() => {
          setInitialModalPubKey('');
          setIsContactsModalOpen(true);
        }}
        onCopyText={(text) => {
          api.copyToClipboard(text);
          showToast('Copied public key to clipboard! Ready to send to WeChat', 'success');
        }}
      />

      {/* Main Content & Tabs */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-5 md:p-6 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-vault-800 pb-3 overflow-x-auto">
          <button
            onClick={() => setActiveTab('organizer')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition shrink-0 ${
              activeTab === 'organizer'
                ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                : 'text-vault-400 hover:text-slate-200 hover:bg-vault-900'
            }`}
          >
            <FolderTree className="w-4 h-4" />
            <span>File Organizer & Archive ({fileItemsCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('text')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition shrink-0 ${
              activeTab === 'text'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'text-vault-400 hover:text-slate-200 hover:bg-vault-900'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Text Encryptor & Decryptor</span>
          </button>

          <button
            onClick={() => setActiveTab('file')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition shrink-0 ${
              activeTab === 'file'
                ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                : 'text-vault-400 hover:text-slate-200 hover:bg-vault-900'
            }`}
          >
            <FileUp className="w-4 h-4" />
            <span>Package .e2e File</span>
          </button>

          <button
            onClick={() => setActiveTab('vault')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition shrink-0 ${
              activeTab === 'vault'
                ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30'
                : 'text-vault-400 hover:text-slate-200 hover:bg-vault-900'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>All Vault History ({vaultItems.length})</span>
          </button>
        </div>

        {/* Tab Views */}
        {activeTab === 'organizer' && (
          <FileOrganizer
            items={vaultItems}
            contacts={contacts}
            onDeleteItem={handleDeleteItem}
            onToast={showToast}
          />
        )}

        {activeTab === 'text' && (
          <div className="space-y-6">
            <TextVault
              contacts={contacts}
              selectedContact={selectedContact}
              onSelectContact={setSelectedContact}
              onItemAdded={handleItemAdded}
              onToast={showToast}
            />
            <div className="pt-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-vault-400 mb-3">
                Recent Decrypted & Encrypted Keys
              </h3>
              <VaultList
                items={vaultItems}
                contacts={contacts}
                selectedContactFilter={selectedContactFilter}
                onSelectContactFilter={setSelectedContactFilter}
                onDeleteItem={handleDeleteItem}
                onUpdateTags={handleUpdateTags}
                onToast={showToast}
              />
            </div>
          </div>
        )}

        {activeTab === 'file' && (
          <div className="space-y-6">
            <FileVault
              contacts={contacts}
              selectedContact={selectedContact}
              onSelectContact={setSelectedContact}
              onItemAdded={handleItemAdded}
              onToast={showToast}
            />
            <div className="pt-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-vault-400 mb-3">
                Quick File Timeline
              </h3>
              <VaultList
                items={vaultItems.filter((i) => i.type === 'file')}
                contacts={contacts}
                selectedContactFilter={selectedContactFilter}
                onSelectContactFilter={setSelectedContactFilter}
                onDeleteItem={handleDeleteItem}
                onUpdateTags={handleUpdateTags}
                onToast={showToast}
              />
            </div>
          </div>
        )}

        {activeTab === 'vault' && (
          <VaultList
            items={vaultItems}
            contacts={contacts}
            selectedContactFilter={selectedContactFilter}
            onSelectContactFilter={setSelectedContactFilter}
            onDeleteItem={handleDeleteItem}
            onUpdateTags={handleUpdateTags}
            onToast={showToast}
          />
        )}
      </main>

      {/* Floating Toast Notification */}
      {toast && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-2xl backdrop-blur bg-vault-900/95 border border-vault-700 animate-in fade-in slide-in-from-top-2">
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span className="text-xs font-medium text-slate-200">{toast.message}</span>
        </div>
      )}

      {/* Realtime Event Notification Banner */}
      <NotificationBanner
        detectedPubKey={detectedPubKey}
        onClearDetectedPubKey={() => setDetectedPubKey(null)}
        onOpenAddContact={(key) => {
          setInitialModalPubKey(key);
          setIsContactsModalOpen(true);
        }}
        receivedItem={receivedItem}
        onClearReceivedItem={() => setReceivedItem(null)}
        onToast={showToast}
      />

      {/* Contacts Modal */}
      <ContactsModal
        isOpen={isContactsModalOpen}
        onClose={() => setIsContactsModalOpen(false)}
        contacts={contacts}
        selectedContact={selectedContact}
        onSelectContact={setSelectedContact}
        onAddContact={handleAddContact}
        onDeleteContact={handleDeleteContact}
        onToast={showToast}
        initialPubKey={initialModalPubKey}
      />
    </div>
  );
};
export default App;
