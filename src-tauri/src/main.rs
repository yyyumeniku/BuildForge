#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod server;
mod commands;

use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{Manager, SystemTray, SystemTrayEvent, CustomMenuItem, SystemTrayMenu};

pub struct AppState {
    servers: Arc<Mutex<Vec<server::ServerConnection>>>,
}

fn main() {
    let quit = CustomMenuItem::new("quit".to_string(), "Quit BuildForge");
    let show = CustomMenuItem::new("show".to_string(), "Show BuildForge");
    let tray_menu = SystemTrayMenu::new()
        .add_item(show)
        .add_native_item(tauri::SystemTrayMenuItem::Separator)
        .add_item(quit);

    let tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .system_tray(tray)
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::LeftClick { .. } => {
                if let Some(window) = app.get_window("main") {
                    window.show().unwrap();
                    window.set_focus().unwrap();
                }
            }
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "quit" => {
                    std::process::exit(0);
                }
                "show" => {
                    if let Some(window) = app.get_window("main") {
                        window.show().unwrap();
                        window.set_focus().unwrap();
                    }
                }
                _ => {}
            },
            _ => {}
        })
        .manage(AppState {
            servers: Arc::new(Mutex::new(Vec::new())),
        })
        .invoke_handler(tauri::generate_handler![
            commands::connect_server,
            commands::disconnect_server,
            commands::start_build,
            commands::cancel_build,
            commands::get_server_status,
            commands::send_notification,
            commands::validate_github_token,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
