use crate::crypto::{CryptoManager, Identity};
use crate::db::{Contact, DbManager, VaultItem};
use crate::sniffer;
use arboard::Clipboard;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;
use tauri::State;

pub struct AppState {
    pub crypto: Arc<CryptoManager>,
    pub db: Arc<DbManager>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EncryptTextResult {
    pub armored_ciphertext: String,
    pub item: VaultItem,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EncryptFileResult {
    pub e2e_path: String,
    pub filename: String,
}

#[tauri::command]
pub fn get_my_identity(state: State<'_, AppState>) -> Result<Identity, String> {
    Ok(state.crypto.get_identity())
}

#[tauri::command]
pub fn encrypt_text(
    state: State<'_, AppState>,
    text: String,
    recipient_pubkey: String,
    tags: Option<String>,
) -> Result<EncryptTextResult, String> {
    let armored = state.crypto.encrypt_text(&text, &recipient_pubkey)?;

    // Sniff Key pattern
    let sniffed_list = sniffer::sniff_content(&text, None);
    let primary_sniff = sniffed_list.first();
    let brand = primary_sniff.map(|s| s.brand.clone());
    let key_type = primary_sniff.map(|s| s.label.clone());

    let mut tags_vec = vec!["sent".to_string()];
    if let Some(t) = tags {
        for part in t.split(',') {
            let tr = part.trim();
            if !tr.is_empty() {
                tags_vec.push(tr.to_string());
            }
        }
    }
    for s in &sniffed_list {
        if !tags_vec.contains(&s.brand) {
            tags_vec.push(s.brand.clone());
        }
    }
    let full_tags = tags_vec.join(", ");

    let recipient_name = state.db.resolve_contact_name(&recipient_pubkey);

    let preview = if let Some(ref s) = primary_sniff {
        format!("{}: {}", s.label, s.snippet.as_deref().unwrap_or("••••"))
    } else if text.chars().count() > 40 {
        format!("{}...", text.chars().take(40).collect::<String>())
    } else {
        text.clone()
    };

    let item = VaultItem {
        id: uuid::Uuid::new_v4().to_string(),
        r#type: "text".to_string(),
        title: Some(preview),
        content: Some(text),
        file_path: None,
        tags: Some(full_tags),
        sender_pubkey: Some(state.crypto.get_identity().public_key),
        contact_name: recipient_name,
        key_type,
        brand,
        created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };

    state.db.insert_vault_item(&item)?;

    if let Ok(mut cb) = Clipboard::new() {
        let _ = cb.set_text(&armored);
    }

    Ok(EncryptTextResult {
        armored_ciphertext: armored,
        item,
    })
}

#[tauri::command]
pub fn decrypt_text_manual(
    state: State<'_, AppState>,
    armored_text: String,
) -> Result<VaultItem, String> {
    let (decrypted, sender_pubkey) = state.crypto.decrypt_text(&armored_text)?;

    let sniffed_list = sniffer::sniff_content(&decrypted, None);
    let primary_sniff = sniffed_list.first();
    let brand = primary_sniff.map(|s| s.brand.clone());
    let key_type = primary_sniff.map(|s| s.label.clone());

    let mut tags_vec = vec!["received".to_string(), "manual".to_string()];
    for s in &sniffed_list {
        tags_vec.push(s.brand.clone());
    }
    let tags = tags_vec.join(", ");

    let contact_name = sender_pubkey
        .as_deref()
        .and_then(|pk| state.db.resolve_contact_name(pk));

    let preview = if let Some(ref s) = primary_sniff {
        format!("{}: {}", s.label, s.snippet.as_deref().unwrap_or("••••"))
    } else if decrypted.chars().count() > 40 {
        format!("{}...", decrypted.chars().take(40).collect::<String>())
    } else {
        decrypted.clone()
    };

    let item = VaultItem {
        id: uuid::Uuid::new_v4().to_string(),
        r#type: "text".to_string(),
        title: Some(preview),
        content: Some(decrypted),
        file_path: None,
        tags: Some(tags),
        sender_pubkey,
        contact_name,
        key_type,
        brand,
        created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };

    state.db.insert_vault_item(&item)?;
    Ok(item)
}

#[tauri::command]
pub fn encrypt_file(
    state: State<'_, AppState>,
    source_path: String,
    recipient_pubkey: String,
    tags: Option<String>,
) -> Result<EncryptFileResult, String> {
    let path = Path::new(&source_path);
    let out_path = state.crypto.encrypt_file(path, &recipient_pubkey)?;

    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file")
        .to_string();

    let sample_text = std::fs::read_to_string(path).unwrap_or_default();
    let sniffed_list = sniffer::sniff_content(&sample_text, Some(&filename));
    let primary_sniff = sniffed_list.first();
    let brand = primary_sniff.map(|s| s.brand.clone());
    let key_type = primary_sniff.map(|s| s.label.clone());

    let mut tags_vec = vec!["file".to_string(), "sent".to_string()];
    if let Some(t) = tags {
        for part in t.split(',') {
            let tr = part.trim();
            if !tr.is_empty() {
                tags_vec.push(tr.to_string());
            }
        }
    }
    for s in &sniffed_list {
        if !tags_vec.contains(&s.brand) {
            tags_vec.push(s.brand.clone());
        }
    }
    let full_tags = tags_vec.join(", ");

    let recipient_name = state.db.resolve_contact_name(&recipient_pubkey);

    let item = VaultItem {
        id: uuid::Uuid::new_v4().to_string(),
        r#type: "file".to_string(),
        title: Some(format!("{} (Encrypted)", filename)),
        content: None,
        file_path: Some(out_path.to_string_lossy().to_string()),
        tags: Some(full_tags),
        sender_pubkey: Some(state.crypto.get_identity().public_key),
        contact_name: recipient_name,
        key_type,
        brand,
        created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };

    state.db.insert_vault_item(&item)?;

    Ok(EncryptFileResult {
        e2e_path: out_path.to_string_lossy().to_string(),
        filename,
    })
}

#[tauri::command]
pub fn decrypt_file_manual(
    state: State<'_, AppState>,
    e2e_path: String,
) -> Result<VaultItem, String> {
    let path = Path::new(&e2e_path);
    let (payload, target_path) = state.crypto.decrypt_file(path)?;

    let sample_text = String::from_utf8(payload.data.clone()).unwrap_or_default();
    let sniffed_list = sniffer::sniff_content(&sample_text, Some(&payload.filename));
    let primary_sniff = sniffed_list.first();
    let brand = primary_sniff.map(|s| s.brand.clone());
    let key_type = primary_sniff.map(|s| s.label.clone());

    let mut tags_vec = vec!["file".to_string(), "received".to_string()];
    for s in &sniffed_list {
        tags_vec.push(s.brand.clone());
    }
    let tags = tags_vec.join(", ");

    let contact_name = payload
        .sender_pubkey
        .as_deref()
        .and_then(|pk| state.db.resolve_contact_name(pk));

    let item = VaultItem {
        id: uuid::Uuid::new_v4().to_string(),
        r#type: "file".to_string(),
        title: Some(payload.filename),
        content: None,
        file_path: Some(target_path.to_string_lossy().to_string()),
        tags: Some(tags),
        sender_pubkey: payload.sender_pubkey,
        contact_name,
        key_type,
        brand,
        created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };

    state.db.insert_vault_item(&item)?;
    Ok(item)
}

#[tauri::command]
pub fn get_vault_items(
    state: State<'_, AppState>,
    search: Option<String>,
    tag: Option<String>,
    sender_pubkey: Option<String>,
    brand: Option<String>,
) -> Result<Vec<VaultItem>, String> {
    state
        .db
        .get_vault_items(search.as_deref(), tag.as_deref(), sender_pubkey.as_deref(), brand.as_deref())
}

#[tauri::command]
pub fn delete_vault_item(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.db.delete_vault_item(&id)
}

#[tauri::command]
pub fn update_vault_item_tags(
    state: State<'_, AppState>,
    id: String,
    tags: String,
) -> Result<(), String> {
    state.db.update_vault_item_tags(&id, &tags)
}

#[tauri::command]
pub fn save_contact(
    state: State<'_, AppState>,
    name: String,
    public_key: String,
) -> Result<Contact, String> {
    state.db.save_contact(&name, &public_key)
}

#[tauri::command]
pub fn list_contacts(state: State<'_, AppState>) -> Result<Vec<Contact>, String> {
    state.db.get_contacts()
}

#[tauri::command]
pub fn delete_contact(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.db.delete_contact(&id)
}

#[tauri::command]
pub fn copy_to_clipboard(text: String) -> Result<(), String> {
    let mut cb = Clipboard::new().map_err(|e| e.to_string())?;
    cb.set_text(&text).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn show_in_folder(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if let Some(parent) = target.parent() {
        open::that(parent).map_err(|e| format!("Failed to open folder: {}", e))?;
    } else {
        open::that(&path).map_err(|e| format!("Failed to open path: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    open::that(&path).map_err(|e| format!("Failed to open file: {}", e))
}

#[tauri::command]
pub fn open_vault_folder(state: State<'_, AppState>) -> Result<(), String> {
    let dir = state.crypto.get_files_dir();
    open::that(dir).map_err(|e| format!("Failed to open vault folder: {}", e))
}

#[tauri::command]
pub fn exit_app(app: tauri::AppHandle) {
    use tauri::Manager;
    for (_, win) in app.webview_windows() {
        let _ = win.destroy();
    }
    app.exit(0);
}
