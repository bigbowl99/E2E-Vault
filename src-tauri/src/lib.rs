pub mod clipboard;
pub mod commands;
pub mod crypto;
pub mod db;
pub mod sniffer;

use commands::AppState;
use crypto::CryptoManager;
use db::{DbManager, VaultItem};
use std::path::Path;
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};
use tauri_plugin_notification::NotificationExt;

fn handle_e2e_file_path(app: &AppHandle, file_path_str: &str) {
    if !file_path_str.ends_with(".e2e") {
        return;
    }

    let path = Path::new(file_path_str);
    if !path.exists() {
        return;
    }

    let state = app.state::<AppState>();
    match state.crypto.decrypt_file(path) {
        Ok((payload, target_path)) => {
            let sample_text = String::from_utf8(payload.data.clone()).unwrap_or_default();
            let sniffed_list = sniffer::sniff_content(&sample_text, Some(&payload.filename));
            let primary_sniff = sniffed_list.first();
            let brand = primary_sniff.map(|s| s.brand.clone());
            let key_type = primary_sniff.map(|s| s.label.clone());

            let mut tags_vec = vec!["file".to_string(), "received".to_string(), "e2e-launch".to_string()];
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
                title: Some(payload.filename.clone()),
                content: None,
                file_path: Some(target_path.to_string_lossy().to_string()),
                tags: Some(tags),
                sender_pubkey: payload.sender_pubkey,
                contact_name: contact_name.clone(),
                key_type,
                brand,
                created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            };

            let _ = state.db.insert_vault_item(&item);
            let _ = app.emit("vault-item-received", &item);

            let notif_sender = contact_name.as_deref().unwrap_or("Partner");
            let notif_body = if let Some(ref k) = item.key_type {
                format!("Saved '{}' [{}] from {}", payload.filename, k, notif_sender)
            } else {
                format!("Saved '{}' to your vault folder", payload.filename)
            };

            let _ = app
                .notification()
                .builder()
                .title("📁 Encrypted File Decrypted & Organized")
                .body(&notif_body)
                .show();
        }
        Err(e) => {
            log::error!("Failed to decrypt .e2e file from OS trigger: {}", e);
            let _ = app
                .notification()
                .builder()
                .title("❌ Failed to Decrypt File")
                .body(&e)
                .show();
        }
    }
}

pub fn run() {
    env_logger::init();

    let crypto = Arc::new(CryptoManager::init().expect("Failed to initialize CryptoManager"));
    let db = Arc::new(DbManager::init().expect("Failed to initialize DbManager"));

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            log::info!("Single instance awakened with args: {:?}", args);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }

            for arg in &args {
                if arg.ends_with(".e2e") {
                    handle_e2e_file_path(app, arg);
                }
            }
        }))
        .manage(AppState {
            crypto: crypto.clone(),
            db: db.clone(),
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_my_identity,
            commands::encrypt_text,
            commands::decrypt_text_manual,
            commands::encrypt_file,
            commands::decrypt_file_manual,
            commands::get_vault_items,
            commands::delete_vault_item,
            commands::update_vault_item_tags,
            commands::save_contact,
            commands::list_contacts,
            commands::delete_contact,
            commands::copy_to_clipboard,
            commands::show_in_folder,
            commands::open_file,
            commands::open_vault_folder,
            commands::exit_app,
        ])
        .setup(move |app| {
            let app_handle = app.handle().clone();

            // 1. Build Tray Menu
            let toggle_i = MenuItem::with_id(app, "toggle", "Show/Hide Vault", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit E2E-Vault", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&toggle_i, &quit_i])?;

            // 2. Setup System Tray
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .tooltip("E2E-Vault: Secure IM Assistant")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => {
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                    "quit" => {
                        for (_, win) in app.webview_windows() {
                            let _ = win.destroy();
                        }
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // 3. Start background clipboard daemon
            clipboard::start_clipboard_monitor(app_handle.clone(), crypto, db);

            // 4. Handle initial CLI args
            let args: Vec<String> = std::env::args().collect();
            for arg in args.into_iter().skip(1) {
                if arg.ends_with(".e2e") {
                    handle_e2e_file_path(&app_handle, &arg);
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running E2E-Vault application");
}
