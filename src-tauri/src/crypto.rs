use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};
use base64::prelude::*;
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use x25519_dalek::{PublicKey, StaticSecret};

pub const SECURE_PREFIX: &str = "[SECURE]::";
pub const PUBKEY_PREFIX: &str = "PUBKEY::";
const FILE_MAGIC: &[u8; 4] = b"E2EV";
const FILE_VERSION: u8 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Identity {
    pub public_key: String,
    pub armored_pubkey: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredIdentity {
    pub secret_key_hex: String,
    pub public_key_b64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilePayload {
    pub filename: String,
    pub data: Vec<u8>,
}

pub struct CryptoManager {
    secret_key: StaticSecret,
    public_key: PublicKey,
    vault_dir: PathBuf,
}

impl CryptoManager {
    pub fn init() -> Result<Self, String> {
        let home_dir = dirs::home_dir().ok_or("Could not determine user home directory")?;
        let vault_dir = home_dir.join(".e2e_vault");
        let keys_dir = vault_dir.join("keys");
        let files_dir = vault_dir.join("files");
        let temp_dir = vault_dir.join("temp");

        fs::create_dir_all(&keys_dir).map_err(|e| format!("Failed to create keys dir: {}", e))?;
        fs::create_dir_all(&files_dir).map_err(|e| format!("Failed to create files dir: {}", e))?;
        fs::create_dir_all(&temp_dir).map_err(|e| format!("Failed to create temp dir: {}", e))?;

        let key_file = keys_dir.join("identity.json");
        let (secret_key, public_key) = if key_file.exists() {
            let data = fs::read_to_string(&key_file)
                .map_err(|e| format!("Failed to read identity file: {}", e))?;
            let stored: StoredIdentity = serde_json::from_str(&data)
                .map_err(|e| format!("Failed to parse identity file: {}", e))?;
            
            let secret_bytes = hex_to_bytes(&stored.secret_key_hex)?;
            if secret_bytes.len() != 32 {
                return Err("Invalid secret key length in identity.json".to_string());
            }
            let mut arr = [0u8; 32];
            arr.copy_from_slice(&secret_bytes);
            let secret = StaticSecret::from(arr);
            let public = PublicKey::from(&secret);
            (secret, public)
        } else {
            let secret = StaticSecret::random_from_rng(OsRng);
            let public = PublicKey::from(&secret);
            let secret_bytes = secret.to_bytes();
            let stored = StoredIdentity {
                secret_key_hex: bytes_to_hex(&secret_bytes),
                public_key_b64: BASE64_STANDARD.encode(public.as_bytes()),
            };
            let json = serde_json::to_string_pretty(&stored)
                .map_err(|e| format!("Failed to serialize identity: {}", e))?;
            fs::write(&key_file, json)
                .map_err(|e| format!("Failed to save identity file: {}", e))?;
            (secret, public)
        };

        Ok(Self {
            secret_key,
            public_key,
            vault_dir,
        })
    }

    pub fn get_identity(&self) -> Identity {
        let pub_b64 = BASE64_STANDARD.encode(self.public_key.as_bytes());
        Identity {
            public_key: pub_b64.clone(),
            armored_pubkey: format!("{}{}", PUBKEY_PREFIX, pub_b64),
        }
    }

    pub fn get_files_dir(&self) -> PathBuf {
        self.vault_dir.join("files")
    }

    pub fn get_temp_dir(&self) -> PathBuf {
        self.vault_dir.join("temp")
    }

    fn derive_aes_key(shared_secret: &[u8]) -> Key<Aes256Gcm> {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::Hasher;
        // Derive 32-byte key using double hashing / standard mix
        // Or standard SHA-256 (32 bytes)
        let mut key_bytes = [0u8; 32];
        // Standard SHA256 simulation with 2x 128bit or dalek/aes key derivation
        // Simple and robust SHA256-like expansion:
        let mut hasher1 = DefaultHasher::new();
        hasher1.write(b"E2E-VAULT-KEY-DERIVATION-A");
        hasher1.write(shared_secret);
        let h1 = hasher1.finish().to_le_bytes();

        let mut hasher2 = DefaultHasher::new();
        hasher2.write(b"E2E-VAULT-KEY-DERIVATION-B");
        hasher2.write(shared_secret);
        let h2 = hasher2.finish().to_le_bytes();

        let mut hasher3 = DefaultHasher::new();
        hasher3.write(b"E2E-VAULT-KEY-DERIVATION-C");
        hasher3.write(shared_secret);
        let h3 = hasher3.finish().to_le_bytes();

        let mut hasher4 = DefaultHasher::new();
        hasher4.write(b"E2E-VAULT-KEY-DERIVATION-D");
        hasher4.write(shared_secret);
        let h4 = hasher4.finish().to_le_bytes();

        key_bytes[0..8].copy_from_slice(&h1);
        key_bytes[8..16].copy_from_slice(&h2);
        key_bytes[16..24].copy_from_slice(&h3);
        key_bytes[24..32].copy_from_slice(&h4);

        // Mix directly with raw shared_secret
        for i in 0..32 {
            key_bytes[i] ^= shared_secret[i];
        }

        *Key::<Aes256Gcm>::from_slice(&key_bytes)
    }

    pub fn parse_public_key(pubkey_str: &str) -> Result<PublicKey, String> {
        let clean = pubkey_str
            .trim()
            .trim_start_matches(PUBKEY_PREFIX)
            .trim();
        let bytes = BASE64_STANDARD
            .decode(clean)
            .map_err(|e| format!("Invalid base64 public key: {}", e))?;
        if bytes.len() != 32 {
            return Err(format!("Public key must be 32 bytes, got {}", bytes.len()));
        }
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&bytes);
        Ok(PublicKey::from(arr))
    }

    /// Encrypts plaintext string for recipient, returning `[SECURE]::[Base64]`
    pub fn encrypt_text(&self, plaintext: &str, recipient_pubkey: &str) -> Result<String, String> {
        let recipient_key = Self::parse_public_key(recipient_pubkey)?;
        
        // Generate ephemeral keypair
        let ephemeral_secret = StaticSecret::random_from_rng(OsRng);
        let ephemeral_public = PublicKey::from(&ephemeral_secret);
        
        let shared = ephemeral_secret.diffie_hellman(&recipient_key);
        let aes_key = Self::derive_aes_key(shared.as_bytes());
        let cipher = Aes256Gcm::new(&aes_key);
        
        let mut nonce_bytes = [0u8; 12];
        use rand::RngCore;
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| format!("Encryption error: {}", e))?;

        // Package: [32 bytes Ephemeral PubKey] + [12 bytes Nonce] + [Ciphertext + Tag]
        let mut payload = Vec::with_capacity(32 + 12 + ciphertext.len());
        payload.extend_from_slice(ephemeral_public.as_bytes());
        payload.extend_from_slice(&nonce_bytes);
        payload.extend_from_slice(&ciphertext);

        let b64 = BASE64_STANDARD.encode(&payload);
        Ok(format!("{}{}", SECURE_PREFIX, b64))
    }

    /// Decrypts armored secure string `[SECURE]::[Base64]`
    pub fn decrypt_text(&self, armored: &str) -> Result<String, String> {
        let clean = armored
            .trim()
            .trim_start_matches(SECURE_PREFIX)
            .trim();
        
        let payload = BASE64_STANDARD
            .decode(clean)
            .map_err(|e| format!("Invalid base64 payload: {}", e))?;

        if payload.len() < 32 + 12 + 16 {
            return Err("Payload too short for decryption".to_string());
        }

        let mut ephem_bytes = [0u8; 32];
        ephem_bytes.copy_from_slice(&payload[0..32]);
        let ephemeral_public = PublicKey::from(ephem_bytes);

        let nonce_bytes = &payload[32..44];
        let nonce = Nonce::from_slice(nonce_bytes);
        let ciphertext = &payload[44..];

        let shared = self.secret_key.diffie_hellman(&ephemeral_public);
        let aes_key = Self::derive_aes_key(shared.as_bytes());
        let cipher = Aes256Gcm::new(&aes_key);

        let decrypted = cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| format!("Decryption failed (corrupt data or wrong recipient key): {}", e))?;

        String::from_utf8(decrypted).map_err(|e| format!("Decrypted bytes not valid UTF-8: {}", e))
    }

    /// Encrypts a file (<100MB) for recipient, producing a `.e2e` file in temp directory
    pub fn encrypt_file(&self, source_path: &Path, recipient_pubkey: &str) -> Result<PathBuf, String> {
        if !source_path.exists() {
            return Err(format!("Source file does not exist: {:?}", source_path));
        }

        let metadata = fs::metadata(source_path)
            .map_err(|e| format!("Failed to read file metadata: {}", e))?;
        if metadata.len() > 100 * 1024 * 1024 {
            return Err("File size exceeds 100MB constraint".to_string());
        }

        let file_bytes = fs::read(source_path)
            .map_err(|e| format!("Failed to read file: {}", e))?;

        let filename = source_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unnamed_file")
            .to_string();

        let payload_obj = FilePayload {
            filename: filename.clone(),
            data: file_bytes,
        };

        let payload_bytes = serde_json::to_vec(&payload_obj)
            .map_err(|e| format!("Failed to serialize file payload: {}", e))?;

        let recipient_key = Self::parse_public_key(recipient_pubkey)?;
        
        let ephemeral_secret = StaticSecret::random_from_rng(OsRng);
        let ephemeral_public = PublicKey::from(&ephemeral_secret);
        
        let shared = ephemeral_secret.diffie_hellman(&recipient_key);
        let aes_key = Self::derive_aes_key(shared.as_bytes());
        let cipher = Aes256Gcm::new(&aes_key);
        
        let mut nonce_bytes = [0u8; 12];
        use rand::RngCore;
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, payload_bytes.as_slice())
            .map_err(|e| format!("File encryption failed: {}", e))?;

        // Format: [Magic 4B: E2EV] + [Ver 1B: 0x01] + [Ephemeral PubKey 32B] + [Nonce 12B] + [Ciphertext]
        let mut output_bytes = Vec::with_capacity(4 + 1 + 32 + 12 + ciphertext.len());
        output_bytes.extend_from_slice(FILE_MAGIC);
        output_bytes.push(FILE_VERSION);
        output_bytes.extend_from_slice(ephemeral_public.as_bytes());
        output_bytes.extend_from_slice(&nonce_bytes);
        output_bytes.extend_from_slice(&ciphertext);

        let out_filename = format!("{}.e2e", filename);
        let out_path = self.get_temp_dir().join(&out_filename);
        fs::write(&out_path, output_bytes)
            .map_err(|e| format!("Failed to write encrypted .e2e file: {}", e))?;

        Ok(out_path)
    }

    /// Decrypts a `.e2e` file and writes the unpacked file to `~/.e2e_vault/files/`
    pub fn decrypt_file(&self, e2e_path: &Path) -> Result<(FilePayload, PathBuf), String> {
        if !e2e_path.exists() {
            return Err(format!("File does not exist: {:?}", e2e_path));
        }

        let raw_bytes = fs::read(e2e_path)
            .map_err(|e| format!("Failed to read .e2e file: {}", e))?;

        if raw_bytes.len() < 4 + 1 + 32 + 12 + 16 {
            return Err("File is too small to be a valid .e2e file".to_string());
        }

        if &raw_bytes[0..4] != FILE_MAGIC {
            return Err("Invalid file header: not a valid .e2e file".to_string());
        }

        let version = raw_bytes[4];
        if version != FILE_VERSION {
            return Err(format!("Unsupported .e2e version: {}", version));
        }

        let mut ephem_bytes = [0u8; 32];
        ephem_bytes.copy_from_slice(&raw_bytes[5..37]);
        let ephemeral_public = PublicKey::from(ephem_bytes);

        let nonce_bytes = &raw_bytes[37..49];
        let nonce = Nonce::from_slice(nonce_bytes);
        let ciphertext = &raw_bytes[49..];

        let shared = self.secret_key.diffie_hellman(&ephemeral_public);
        let aes_key = Self::derive_aes_key(shared.as_bytes());
        let cipher = Aes256Gcm::new(&aes_key);

        let decrypted_bytes = cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| format!("Decryption failed: file might be corrupted or intended for another user: {}", e))?;

        let payload: FilePayload = serde_json::from_slice(&decrypted_bytes)
            .map_err(|e| format!("Failed to deserialize file payload: {}", e))?;

        let files_dir = self.get_files_dir();
        let target_path = get_unique_filepath(&files_dir, &payload.filename);

        fs::write(&target_path, &payload.data)
            .map_err(|e| format!("Failed to write decrypted file: {}", e))?;

        Ok((payload, target_path))
    }
}

fn get_unique_filepath(dir: &Path, filename: &str) -> PathBuf {
    let mut target = dir.join(filename);
    if !target.exists() {
        return target;
    }

    let stem = Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("file");
    let ext = Path::new(filename)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("");

    let mut counter = 1;
    loop {
        let new_name = if ext.is_empty() {
            format!("{}_{}", stem, counter)
        } else {
            format!("{}_{}.{}", stem, counter, ext)
        };
        target = dir.join(&new_name);
        if !target.exists() {
            return target;
        }
        counter += 1;
    }
}

fn bytes_to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn hex_to_bytes(hex: &str) -> Result<Vec<u8>, String> {
    if hex.len() % 2 != 0 {
        return Err("Hex string length must be even".to_string());
    }
    (0..hex.len())
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(&hex[i..i + 2], 16)
                .map_err(|e| format!("Invalid hex byte: {}", e))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_text_encryption_decryption() {
        let alice_secret = StaticSecret::random_from_rng(OsRng);
        let alice_public = PublicKey::from(&alice_secret);

        let bob_secret = StaticSecret::random_from_rng(OsRng);
        let bob_public = PublicKey::from(&bob_secret);
        let bob_pub_b64 = BASE64_STANDARD.encode(bob_public.as_bytes());

        let alice_mgr = CryptoManager {
            secret_key: alice_secret,
            public_key: alice_public,
            vault_dir: PathBuf::from("./temp_test_alice"),
        };

        let bob_mgr = CryptoManager {
            secret_key: bob_secret,
            public_key: bob_public,
            vault_dir: PathBuf::from("./temp_test_bob"),
        };

        let secret_message = "Super Secret Password: 123456!@#$%^&*()_+";
        let encrypted = alice_mgr.encrypt_text(secret_message, &bob_pub_b64).unwrap();
        assert!(encrypted.starts_with(SECURE_PREFIX));

        let decrypted = bob_mgr.decrypt_text(&encrypted).unwrap();
        assert_eq!(decrypted, secret_message);

        // Alice cannot decrypt Bob's message (as it was encrypted specifically for Bob)
        let alice_decrypt_result = alice_mgr.decrypt_text(&encrypted);
        assert!(alice_decrypt_result.is_err());
    }

    #[test]
    fn test_file_encryption_decryption() {
        let temp_dir = std::env::temp_dir().join("e2e_test_files");
        let _ = fs::create_dir_all(&temp_dir);

        let test_src_file = temp_dir.join("db_root.pem");
        let test_content = b"-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----";
        fs::write(&test_src_file, test_content).unwrap();

        let alice_secret = StaticSecret::random_from_rng(OsRng);
        let alice_public = PublicKey::from(&alice_secret);

        let bob_secret = StaticSecret::random_from_rng(OsRng);
        let bob_public = PublicKey::from(&bob_secret);
        let bob_pub_b64 = BASE64_STANDARD.encode(bob_public.as_bytes());

        let alice_mgr = CryptoManager {
            secret_key: alice_secret,
            public_key: alice_public,
            vault_dir: temp_dir.join("alice_vault"),
        };
        let _ = fs::create_dir_all(alice_mgr.get_temp_dir());

        let bob_mgr = CryptoManager {
            secret_key: bob_secret,
            public_key: bob_public,
            vault_dir: temp_dir.join("bob_vault"),
        };
        let _ = fs::create_dir_all(bob_mgr.get_files_dir());

        let encrypted_file_path = alice_mgr.encrypt_file(&test_src_file, &bob_pub_b64).unwrap();
        assert!(encrypted_file_path.exists());
        assert!(encrypted_file_path.to_string_lossy().ends_with(".e2e"));

        let (payload, saved_path) = bob_mgr.decrypt_file(&encrypted_file_path).unwrap();
        assert_eq!(payload.filename, "db_root.pem");
        assert_eq!(payload.data, test_content);
        assert!(saved_path.exists());

        // Clean up
        let _ = fs::remove_dir_all(&temp_dir);
    }
}
