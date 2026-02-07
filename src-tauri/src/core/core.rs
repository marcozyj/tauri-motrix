use anyhow::Result;
use fs2::FileExt;
use once_cell::sync::OnceCell;
use std::{path::PathBuf, process::Command, sync::Arc, time::Duration};
use tauri_plugin_shell::{process::CommandChild, ShellExt};
use tokio::{sync::Mutex, time::sleep};

use crate::{
    config::Config,
    core::handle,
    log_err, logging,
    utils::{
        dirs::{self, aria2_path},
        logging::Type,
        sys,
    },
};

#[derive(Debug)]
pub struct CoreManager {
    running: Arc<Mutex<bool>>,
    aria2c_sidecar: Arc<Mutex<Option<CoreChild>>>,
}

#[derive(Debug)]
enum CoreChild {
    Sidecar(CommandChild),
    System(std::process::Child),
}

impl CoreChild {
    fn pid(&self) -> u32 {
        match self {
            CoreChild::Sidecar(child) => child.pid(),
            CoreChild::System(child) => child.id(),
        }
    }

    fn kill(self) -> anyhow::Result<()> {
        match self {
            CoreChild::Sidecar(child) => {
                child.kill()?;
                Ok(())
            }
            CoreChild::System(mut child) => {
                child.kill()?;
                Ok(())
            }
        }
    }
}

impl CoreManager {
    pub fn global() -> &'static CoreManager {
        static CORE_MANGER: OnceCell<CoreManager> = OnceCell::new();
        CORE_MANGER.get_or_init(|| CoreManager {
            running: Arc::new(Mutex::new(false)),
            aria2c_sidecar: Arc::new(Mutex::new(None)),
        })
    }

    pub async fn init(&self) -> Result<()> {
        log::trace!("run core start engine");
        log_err!(Self::global().start_engine().await);
        log::trace!("run core end engine");
        Ok(())
    }
    pub async fn start_engine(&self) -> Result<()> {
        let mut running = self.running.lock().await;

        if *running {
            log::info!("engine is running");
            return Ok(());
        }

        let config_path = aria2_path()?;

        self.ensure_port_available().await;
        self.run_core_by_sidecar(&config_path).await?;

        *running = true;

        Ok(())
    }

    pub async fn stop_engine(&self) {
        // TODO aria2c external control for user
        let _ = self.kill_core_by_sidecar().await;
    }

    pub async fn ensure_port_available(&self) {
        let aria2_map = Config::aria2().latest().0.clone();
        let aria2_port = aria2_map
            .get("rpc-listen-port")
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(16801);

        logging!(
            info,
            Type::Core,
            true,
            "check existing port: {}",
            aria2_port
        );

        let occupies = sys::get_occupied_port_pids(aria2_port).await;

        if !occupies.is_empty() {
            logging!(
                info,
                Type::Core,
                true,
                "port {} is already occupied",
                aria2_port
            );
        }

        for pid in occupies {
            logging!(info, Type::Core, true, "try to kill process: {}", pid);
            sys::terminate_process(pid).await;
        }

        logging!(info, Type::Core, true, "waiting for process to exit...");
        sleep(Duration::from_millis(500)).await;
    }

    /// Start core by sidecar
    async fn run_core_by_sidecar(&self, config_path: &PathBuf) -> Result<()> {
        let aria2_engine = { Config::motrix().latest().aria2_engine.clone() };
        let aria2_engine = aria2_engine.unwrap_or("aria2c".into());

        logging!(
            info,
            Type::Core,
            true,
            "starting core {} in sidecar mode",
            aria2_engine
        );

        let lock_file = dirs::app_home_dir()?.join(format!("{}.lock", aria2_engine));
        logging!(info, Type::Core, true, "lock_file path : {:?}", lock_file);
        logging!(info, Type::Core, true, "[sidecar] try to get lock file");

        let file = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .open(&lock_file)?;

        match file.try_lock_exclusive() {
            Ok(_) => {
                logging!(info, Type::Core, true, "acquired lock for core process");
                handle::Handle::global().set_core_lock(file);
            }
            // TODO
            Err(_) => todo!(),
        }

        let app_handle = handle::Handle::global()
            .app_handle()
            .ok_or(anyhow::anyhow!("failed to get app handle"))?;

        let config_path_str = dirs::path_to_str(config_path)?;

        logging!(info, Type::Core, true, "begin start run core process");
        let spawn_result = app_handle
            .shell()
            .sidecar(aria2_engine)
            .map(|cmd| cmd.args(["--conf-path", config_path_str]).spawn());

        let child = match spawn_result {
            Ok(Ok((_, child))) => CoreChild::Sidecar(child),
            Ok(Err(err)) | Err(err) => {
                #[cfg(target_os = "macos")]
                {
                    if is_bad_cpu_type_error(&err) && is_macos_x64() {
                        logging!(
                            error,
                            Type::Core,
                            true,
                            "sidecar failed (bad CPU type), trying system aria2c"
                        );
                        if let Some(system_aria2c) = find_system_aria2c() {
                            logging!(
                                info,
                                Type::Core,
                                true,
                                "using system aria2c at {:?}",
                                system_aria2c
                            );
                            let child = Command::new(system_aria2c)
                                .args(["--conf-path", config_path_str])
                                .spawn()?;
                            CoreChild::System(child)
                        } else {
                            return Err(anyhow::anyhow!(
                                "aria2c sidecar is incompatible with macOS x64. Install aria2c (e.g. `brew install aria2`)."
                            ));
                        }
                    } else {
                        return Err(err.into());
                    }
                }
                #[cfg(not(target_os = "macos"))]
                {
                    return Err(err.into());
                }
            }
        };

        // save process id
        logging!(
            info,
            Type::Core,
            true,
            "run core process success, PID: {:?}",
            child.pid()
        );
        // handle::Handle::global().set_core_process(child);
        *self.aria2c_sidecar.lock().await = Some(child);

        sleep(Duration::from_millis(300)).await;

        logging!(info, Type::Core, true, "core started in sidecar mode");

        Ok(())
    }

    async fn kill_core_by_sidecar(&self) -> Result<()> {
        logging!(trace, Type::Core, true, "Stopping core by sidecar");

        if let Some(child) = self.aria2c_sidecar.lock().await.take() {
            let pid = child.pid();
            child.kill()?;
            logging!(
                trace,
                Type::Core,
                true,
                "Stopped core by sidecar pid: {}",
                pid
            );
        }

        Ok(())
    }
}

#[cfg(target_os = "macos")]
fn is_macos_x64() -> bool {
    std::env::consts::ARCH == "x86_64"
}

#[cfg(target_os = "macos")]
fn is_bad_cpu_type_error(err: &tauri_plugin_shell::Error) -> bool {
    let msg = err.to_string();
    msg.contains("Bad CPU type") || msg.contains("os error 86")
}

#[cfg(target_os = "macos")]
fn find_system_aria2c() -> Option<PathBuf> {
    let candidates = [
        "/usr/local/bin/aria2c",
        "/opt/homebrew/bin/aria2c",
        "/opt/homebrew/opt/aria2/bin/aria2c",
        "/usr/bin/aria2c",
    ];

    for path in candidates {
        let candidate = PathBuf::from(path);
        if candidate.exists() {
            return Some(candidate);
        }
    }

    None
}
