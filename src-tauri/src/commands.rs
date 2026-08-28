use crate::crypto::{CryptoManager, Identity};
use crate::db::{Contact, DbManager, VaultItem};
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

    // Store a record in the vault as an encrypted/sent item
    let preview = if text.chars().count() > 40 {
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
        tags: tags.or(Some("sent".to_string())),
        created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };

    state.db.insert_vault_item(&item)?;

    // Copy encrypted text to clipboard for convenient paste to WeChat
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
    let decrypted = state.crypto.decrypt_text(&armored_text)?;

    let preview = if decrypted.chars().count() > 40 {
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
        tags: Some("received, manual".to_string()),
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

    let item = VaultItem {
        id: uuid::Uuid::new_v4().to_string(),
        r#type: "file".to_string(),
        title: Some(format!("{} (Encrypted)", filename)),
        content: None,
        file_path: Some(out_path.to_string_lossy().to_string()),
        tags: tags.or(Some("file, sent".to_string())),
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

    let item = VaultItem {
        id: uuid::Uuid::new_v4().to_string(),
        r#type: "file".to_string(),
        title: Some(payload.filename),
        content: None,
        file_path: Some(target_path.to_string_lossy().to_string()),
        tags: Some("file, received".to_string()),
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
) -> Result<Vec<VaultItem>, String> {
    state
        .db
        .get_vault_items(search.as_deref(), tag.as_deref())
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
pub fn exit_app(app: tauri::AppHandle) {
    use tauri::Manager;
    for (_, win) in app.webview_windows() {
        let _ = win.destroy();
    }
    app.exit(0);
}
