export interface Identity {
  public_key: string;
  armored_pubkey: string;
}

export interface VaultItem {
  id: string;
  type: 'text' | 'file';
  title: string | null;
  content: string | null;
  file_path: string | null;
  tags: string | null;
  sender_pubkey?: string | null;
  contact_name?: string | null;
  key_type?: string | null;
  brand?: string | null;
  created_at: string;
}

export interface Contact {
  id: string;
  name: string;
  public_key: string;
  created_at: string;
}

export interface EncryptTextResult {
  armored_ciphertext: string;
  item: VaultItem;
}

export interface EncryptFileResult {
  e2e_path: string;
  filename: string;
}

export interface PubKeyDetectedPayload {
  public_key: string;
  armored_pubkey: string;
}
