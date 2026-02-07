use std::time::Duration;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri_plugin_autostart::MacosLauncher;
use tokio::time::timeout;
use utils::resolve;

use crate::{process::AsyncHandler, utils::logging::Type};

use crate::utils::window::create_window;

mod cmd;
mod config;
mod core;
mod feat;
mod process;
mod service;
mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .menu(|app| {
            let show_window =
                MenuItem::with_id(app, "show_window", "显示窗口", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit = PredefinedMenuItem::quit(app, None)?;

            let app_menu = Submenu::with_items(
                app,
                "Tauri Motrix",
                true,
                &[&show_window, &separator, &quit],
            )?;

            Ok(Menu::with_items(app, &[&app_menu])?)
        })
        .on_menu_event(|_app, event| {
            if event.id().as_ref() == "show_window" {
                create_window(true);
            }
        })
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {
            create_window(true);
        }))
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::AppleScript,
            None,
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            AsyncHandler::spawn(move || async move {
                logging!(
                    info,
                    Type::Setup,
                    true,
                    "Asynchronously executing app setup..."
                );
                match timeout(Duration::from_secs(30), resolve::resolve_setup(&app_handle)).await {
                    Ok(_) => {
                        logging!(info, Type::Setup, true, "App setup completed successfully");
                    }
                    Err(_) => {
                        logging!(
                            error,
                            Type::Setup,
                            true,
                            "App setup timed out (30 seconds), continuing with subsequent processes"
                        );
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cmd::get_aria2_info,
            cmd::get_aria2_config,
            cmd::get_motrix_config,
            cmd::open_logs_dir,
            cmd::open_app_dir,
            cmd::open_core_dir,
            cmd::patch_motrix_config,
            cmd::exit_app,
            cmd::patch_aria2_config,
            cmd::get_auto_launch_status,
            cmd::app_log,
            cmd::stop_engine
        ]);

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|_app_handle, e| match e {
        tauri::RunEvent::ExitRequested { api, code, .. } => {
            if code.is_none() {
                api.prevent_exit();
            }
        }
        tauri::RunEvent::Exit => {
            // avoid duplicate cleanup
            if core::handle::Handle::global().is_exiting() {
                return;
            }
            feat::clean();
        }
        tauri::RunEvent::WindowEvent { label, event, .. } => {
            if label == "main" {
                match event {
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        let window = core::handle::Handle::global().get_window().unwrap();
                        let _ = window.hide();
                    }
                    _ => {}
                }
            }
        }

        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen { .. } => {
            create_window(true);
        }

        _ => {}
    });
}
