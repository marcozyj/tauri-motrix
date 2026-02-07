use std::{path::PathBuf, process::Command, sync::Arc};

use anyhow::Result;
use once_cell::sync::OnceCell;
use parking_lot::Mutex;
use tauri_plugin_autostart::ManagerExt;

use crate::{config::Config, logging, logging_error, utils::logging::Type};

use super::handle::Handle;

pub struct SysOpt {
    /// helps to auto launch the app
    auto_launch: Arc<Mutex<bool>>,
}

impl SysOpt {
    pub fn global() -> &'static SysOpt {
        static SYSOPT: OnceCell<SysOpt> = OnceCell::new();
        SYSOPT.get_or_init(|| SysOpt {
            auto_launch: Arc::new(Mutex::new(false)),
        })
    }

    pub fn get_auto_launch(&self) -> Result<bool> {
        let app_handle = Handle::global().app_handle().unwrap();
        let autostart_manager = app_handle.autolaunch();

        match autostart_manager.is_enabled() {
            Ok(status) => {
                logging!(info, Type::Core, "Auto launch status: {}", status);
                Ok(status)
            }
            Err(e) => {
                logging!(error, Type::Core, "Failed to get auto launch status: {}", e);
                Err(anyhow::anyhow!("Failed to get auto launch status: {}", e))
            }
        }
    }

    pub fn update_launch(&self) -> Result<()> {
        let _lock = self.auto_launch.lock();
        let enable = { Config::motrix().latest().enable_auto_launch };
        let enable = enable.unwrap_or(false);
        let app_handle = Handle::global().app_handle().unwrap();
        let autostart_manager = app_handle.autolaunch();

        log::info!(target: "app", "Setting auto launch to: {}", enable);

        match enable {
            true => {
                let result = autostart_manager.enable();
                if let Err(ref e) = result {
                    log::error!(target: "app", "Failed to enable auto launch: {}", e);
                } else {
                    log::info!(target: "app", "Auto launch enabled successfully");
                }
                logging_error!(Type::Core, true, result);
                #[cfg(target_os = "macos")]
                {
                    if let Err(err) = sync_macos_launch_agent(true) {
                        log::error!(target: "app", "Failed to cleanup legacy launch agent: {}", err);
                    }
                }
            }
            false => {
                let result = autostart_manager.disable();
                if let Err(ref e) = result {
                    log::error!(target: "app", "Failed to disable auto launch: {}", e);
                } else {
                    log::info!(target: "app", "Auto launch disabled successfully");
                }
                logging_error!(Type::Core, true, result);
                #[cfg(target_os = "macos")]
                {
                    if let Err(err) = sync_macos_launch_agent(false) {
                        log::error!(target: "app", "Failed to cleanup legacy launch agent: {}", err);
                    }
                }
            }
        };

        Ok(())
    }
}

#[cfg(target_os = "macos")]
fn sync_macos_launch_agent(_enable: bool) -> Result<()> {
    // Legacy cleanup for LaunchAgent entries created in older builds.
    cleanup_legacy_launch_agent()
}

#[cfg(target_os = "macos")]
fn cleanup_legacy_launch_agent() -> Result<()> {
    let app_handle = Handle::global().app_handle().unwrap();
    let label = app_handle.package_info().name.clone();
    let plist_path = launch_agent_plist_path(&label)?;

    if !plist_path.exists() {
        return Ok(());
    }

    let uid = current_uid()?;
    let domain = format!("gui/{}", uid);
    let plist = plist_path.to_string_lossy().to_string();

    let _ = Command::new("launchctl")
        .args(["bootout", &domain, &plist])
        .output();
    let _ = std::fs::remove_file(&plist_path);

    Ok(())
}

#[cfg(target_os = "macos")]
fn launch_agent_plist_path(label: &str) -> Result<PathBuf> {
    let home = std::env::var("HOME")
        .map_err(|e| anyhow::anyhow!("Failed to get HOME: {}", e))?;
    Ok(PathBuf::from(home)
        .join("Library")
        .join("LaunchAgents")
        .join(format!("{}.plist", label)))
}

#[cfg(target_os = "macos")]
fn current_uid() -> Result<String> {
    let output = Command::new("id").arg("-u").output()?;
    if !output.status.success() {
        return Err(anyhow::anyhow!("Failed to get uid"));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
