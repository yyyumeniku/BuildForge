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
    // Set up panic handler to prevent crashes
    std::panic::set_hook(Box::new(|panic_info| {
        eprintln!("==== PANIC DETECTED ====");
        eprintln!("{}", panic_info);
        if let Some(location) = panic_info.location() {
            eprintln!("Panic occurred in file '{}' at line {}", location.file(), location.line());
        }
        if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
            eprintln!("Panic payload: {}", s);
        }
        eprintln!("========================");
    }));
    
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
                    // Stop local server before quitting
                    let _ = std::process::Command::new("pkill")
                        .args(["-f", "buildforge-server"])
                        .output();
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
            commands::get_git_remote,
            commands::detect_build_system,
            commands::get_branches,
            commands::start_local_server,
            commands::stop_local_server,
            commands::start_oauth_server,
            commands::stop_oauth_server,
            commands::check_oauth_result,
            commands::exchange_oauth_code,
            commands::run_command,
            commands::is_directory,
            commands::start_device_flow,
            commands::poll_device_flow,
            commands::list_files,
            commands::read_file_bytes,
            commands::get_app_data_dir,
            commands::save_app_data,
            commands::load_app_data,
            commands::delete_app_data,
            commands::list_app_data_files,
            commands::ensure_directory,
            commands::select_folder,
            commands::get_system_info,
            commands::install_package,
        ])
        .on_window_event(|event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event.event() {
                // Stop local server when window closes
                let _ = std::process::Command::new("pkill")
                    .args(["-f", "buildforge-server"])
                    .output();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
