use crate::crypto::{CryptoManager, PUBKEY_PREFIX, SECURE_PREFIX};
use crate::db::{DbManager, VaultItem};
use arboard::Clipboard;
use serde::Serialize;
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;

#[derive(Clone, Serialize)]
pub struct PubKeyDetectedPayload {
    pub public_key: String,
    pub armored_pubkey: String,
}

pub fn start_clipboard_monitor(
    app_handle: AppHandle,
    crypto: Arc<CryptoManager>,
    db: Arc<DbManager>,
) {
    thread::spawn(move || {
        log::info!("Starting background clipboard listener daemon...");
        let mut last_clipboard_text = String::new();

        // Safe loop with error recovery for clipboard
        loop {
            thread::sleep(Duration::from_millis(600));

            let mut clipboard = match Clipboard::new() {
                Ok(cb) => cb,
                Err(_) => continue,
            };

            let current_text = match clipboard.get_text() {
                Ok(t) => t.trim().to_string(),
                Err(_) => continue,
            };

            if current_text.is_empty() || current_text == last_clipboard_text {
                continue;
            }

            // Update seen text
            last_clipboard_text = current_text.clone();

            // 1. Check for [SECURE]:: encrypted message
            if current_text.starts_with(SECURE_PREFIX) {
                log::info!("Detected [SECURE]:: in clipboard. Attempting decryption...");
                match crypto.decrypt_text(&current_text) {
                    Ok(decrypted_text) => {
                        let preview = if decrypted_text.chars().count() > 40 {
                            format!("{}...", decrypted_text.chars().take(40).collect::<String>())
                        } else {
                            decrypted_text.clone()
                        };

                        let item = VaultItem {
                            id: uuid::Uuid::new_v4().to_string(),
                            r#type: "text".to_string(),
                            title: Some(preview),
                            content: Some(decrypted_text.clone()),
                            file_path: None,
                            tags: Some("received, auto".to_string()),
                            created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                        };

                        if let Err(e) = db.insert_vault_item(&item) {
                            log::error!("Failed to save decrypted item to DB: {}", e);
                        }

                        // Emit to frontend
                        let _ = app_handle.emit("vault-item-received", &item);

                        // Trigger desktop OS notification
                        let _ = app_handle
                            .notification()
                            .builder()
                            .title("🔐 E2E Decrypted Message")
                            .body(&format!("Decrypted: {}", item.title.unwrap_or_default()))
                            .show();
                    }
                    Err(e) => {
                        log::warn!("Could not decrypt clipboard message: {}", e);
                    }
                }
            }
            // 2. Check for PUBKEY:: public key exchange
            else if current_text.starts_with(PUBKEY_PREFIX) {
                log::info!("Detected PUBKEY:: in clipboard");
                let clean_key = current_text
                    .trim_start_matches(PUBKEY_PREFIX)
                    .trim()
                    .to_string();

                let my_pub = crypto.get_identity().public_key;
                // Avoid notifying if it's our own public key
                if clean_key != my_pub {
                    let payload = PubKeyDetectedPayload {
                        public_key: clean_key,
                        armored_pubkey: current_text.clone(),
                    };

                    let _ = app_handle.emit("pubkey-detected", &payload);

                    let _ = app_handle
                        .notification()
                        .builder()
                        .title("🔑 New Public Key Detected")
                        .body("A partner's public key was copied. Click to save contact.")
                        .show();
                }
            }
        }
    });
}
