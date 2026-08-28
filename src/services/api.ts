import { invoke } from '@tauri-apps/api/core';
import type { Contact, EncryptFileResult, EncryptTextResult, Identity, VaultItem } from '../types';

export const isTauri = () => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

export const api = {
  getMyIdentity: async (): Promise<Identity> => {
    if (!isTauri()) {
      return {
        public_key: 'mock-pubkey-base64-example1234567890=',
        armored_pubkey: 'PUBKEY::mock-pubkey-base64-example1234567890=',
      };
    }
    return invoke<Identity>('get_my_identity');
  },

  encryptText: async (
    text: string,
    recipientPubkey: string,
    tags?: string
  ): Promise<EncryptTextResult> => {
    return invoke<EncryptTextResult>('encrypt_text', {
      text,
      recipientPubkey,
      tags: tags || null,
    });
  },

  decryptTextManual: async (armoredText: string): Promise<VaultItem> => {
    return invoke<VaultItem>('decrypt_text_manual', { armoredText });
  },

  encryptFile: async (
    sourcePath: string,
    recipientPubkey: string,
    tags?: string
  ): Promise<EncryptFileResult> => {
    return invoke<EncryptFileResult>('encrypt_file', {
      sourcePath,
      recipientPubkey,
      tags: tags || null,
    });
  },

  decryptFileManual: async (e2ePath: string): Promise<VaultItem> => {
    return invoke<VaultItem>('decrypt_file_manual', { e2ePath });
  },

  getVaultItems: async (
    search?: string,
    tag?: string,
    senderPubkey?: string,
    brand?: string
  ): Promise<VaultItem[]> => {
    if (!isTauri()) {
      return [];
    }
    return invoke<VaultItem[]>('get_vault_items', {
      search: search || null,
      tag: tag || null,
      senderPubkey: senderPubkey || null,
      brand: brand || null,
    });
  },

  deleteVaultItem: async (id: string): Promise<void> => {
    return invoke<void>('delete_vault_item', { id });
  },

  updateVaultItemTags: async (id: string, tags: string): Promise<void> => {
    return invoke<void>('update_vault_item_tags', { id, tags });
  },

  saveContact: async (name: string, publicKey: string): Promise<Contact> => {
    return invoke<Contact>('save_contact', { name, publicKey });
  },

  listContacts: async (): Promise<Contact[]> => {
    if (!isTauri()) {
      return [];
    }
    return invoke<Contact[]>('list_contacts');
  },

  deleteContact: async (id: string): Promise<void> => {
    return invoke<void>('delete_contact', { id });
  },

  copyToClipboard: async (text: string): Promise<void> => {
    if (isTauri()) {
      return invoke<void>('copy_to_clipboard', { text });
    } else {
      return navigator.clipboard.writeText(text);
    }
  },

  showInFolder: async (path: string): Promise<void> => {
    return invoke<void>('show_in_folder', { path });
  },

  openFile: async (path: string): Promise<void> => {
    return invoke<void>('open_file', { path });
  },

  exitApp: async (): Promise<void> => {
    if (isTauri()) {
      return invoke<void>('exit_app');
    } else {
      window.close();
    }
  },
};
