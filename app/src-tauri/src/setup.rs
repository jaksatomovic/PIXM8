use std::fs;
use std::path::PathBuf;
use std::process::Command;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::paths::{
    bootstrap_python_if_needed, get_bootstrap_python, get_keero_dir, get_venv_path, get_venv_pip,
    get_venv_python, get_tesseract_cmd,
};
use crate::python_setup;

fn pip_has_package(python: &PathBuf, name: &str) -> bool {
    Command::new(python.to_str().unwrap())
        .arg("-m")
        .arg("pip")
        .arg("show")
        .arg(name)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn deps_installed_from_pyproject(app: &AppHandle, python: &PathBuf) -> bool {
    let deps = python_setup::pyproject_dependency_names(app).unwrap_or_default();
    if deps.is_empty() {
        return false;
    }
    deps.iter().all(|dep| pip_has_package(python, dep))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetupStatus {
    pub python_installed: bool,
    pub python_version: Option<String>,
    pub python_path: Option<String>,
    pub venv_exists: bool,
    pub venv_path: Option<String>,
    pub deps_installed: bool,
}

#[tauri::command]
pub async fn check_setup_status(app: AppHandle) -> Result<SetupStatus, String> {
    let venv_path = get_venv_path(&app);
    let venv_python = get_venv_python(&app);
    let venv_exists = venv_python.exists();

    let bootstrap_python = get_bootstrap_python(&app);

    let (python_installed, python_version, python_path) = if venv_exists {
        let output = Command::new(venv_python.to_str().unwrap())
            .arg("--version")
            .output()
            .ok();
        let v = output.as_ref().and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                None
            }
        });
        (true, v, Some(venv_python.to_string_lossy().to_string()))
    } else if bootstrap_python.exists() {
        let output = Command::new(bootstrap_python.to_str().unwrap())
            .arg("--version")
            .output()
            .ok();
        let v = output.as_ref().and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                None
            }
        });
        (true, v, Some(bootstrap_python.to_string_lossy().to_string()))
    } else {
        (false, None, None)
    };

    let deps_installed = if venv_exists {
        deps_installed_from_pyproject(&app, &venv_python)
    } else {
        false
    };

    Ok(SetupStatus {
        python_installed,
        python_version,
        python_path,
        venv_exists,
        venv_path: if venv_exists {
            Some(venv_path.to_string_lossy().to_string())
        } else {
            None
        },
        deps_installed,
    })
}

#[tauri::command]
pub async fn create_python_venv(app: AppHandle) -> Result<String, String> {
    let venv_path = get_venv_path(&app);
    let venv_python = get_venv_python(&app);

    app.emit("setup-progress", "Using bundled Python runtime...")
        .ok();
    let python_for_venv = bootstrap_python_if_needed(&app)?;

    if venv_python.exists() {
        app.emit("setup-progress", "Virtual environment already exists...")
            .ok();
        return Ok(venv_path.to_string_lossy().to_string());
    }

    if venv_path.exists() || fs::symlink_metadata(&venv_path).is_ok() {
        app.emit("setup-progress", "Cleaning up existing invalid environment...")
            .ok();
        if venv_path.is_dir() {
            fs::remove_dir_all(&venv_path).map_err(|e| e.to_string())?;
        } else {
            fs::remove_file(&venv_path).map_err(|e| e.to_string())?;
        }
    }

    if let Some(parent) = venv_path.parent() {
        fs::create_dir_all(parent).map_err(|e: std::io::Error| e.to_string())?;
    }

    app.emit("setup-progress", "Creating Python virtual environment...")
        .ok();

    let output = Command::new(python_for_venv.to_str().unwrap())
        .arg("-m")
        .arg("venv")
        .arg("--clear")
        .arg(&venv_path)
        .output()
        .map_err(|e| format!("Failed to create venv: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Failed to create venv: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(venv_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn install_python_deps(app: AppHandle) -> Result<String, String> {
    let pip = get_venv_pip(&app);

    app.emit(
        "setup-progress",
        "Installing Python dependencies (this may take a few minutes)...",
    )
    .ok();

    let result = python_setup::install_python_deps(&app, pip)?;
    app.emit("setup-progress", "Dependencies installed successfully!")
        .ok();
    Ok(result)
}

#[tauri::command]
pub async fn mark_setup_complete(app: AppHandle) -> Result<(), String> {
    let keero_dir = get_keero_dir(&app);
    let marker_file = keero_dir.join(".setup_complete");
    fs::create_dir_all(&keero_dir).map_err(|e: std::io::Error| e.to_string())?;
    fs::write(&marker_file, "1").map_err(|e: std::io::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn is_first_launch(app: AppHandle) -> Result<bool, String> {
    let keero_dir = get_keero_dir(&app);
    let marker_file = keero_dir.join(".setup_complete");
    let venv_python = get_venv_python(&app);

    Ok(!marker_file.exists() || !venv_python.exists())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TesseractStatus {
    pub installed: bool,
    pub path: Option<String>,
    pub manual_download_url: String,
    /// True on macOS (can run `brew install tesseract`).
    pub can_auto_install: bool,
}

#[tauri::command]
pub async fn tesseract_status(app: AppHandle) -> Result<TesseractStatus, String> {
    let path = get_tesseract_cmd(&app);
    let installed = path.is_some();
    let path_str = path.as_ref().map(|p| p.to_string_lossy().to_string());
    let manual_download_url = match std::env::consts::OS {
        "windows" => "https://github.com/UB-Mannheim/tesseract/wiki".to_string(),
        "macos" => "https://tesseract-ocr.github.io/tessdoc/Installation.html#macos".to_string(),
        _ => "https://tesseract-ocr.github.io/tessdoc/Installation.html".to_string(),
    };
    let can_auto_install = cfg!(target_os = "macos");
    Ok(TesseractStatus {
        installed,
        path: path_str,
        manual_download_url,
        can_auto_install,
    })
}

/// Install Tesseract. On macOS tries `brew install tesseract` if Homebrew is available.
/// On Windows/Linux returns an error; user should install manually.
#[tauri::command]
pub async fn tesseract_install(_app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let brew = which_brew();
        let brew = match brew {
            Some(p) => p,
            None => {
                return Err("Homebrew not found. Install it from https://brew.sh or install Tesseract manually.".to_string());
            }
        };
        let output = Command::new(brew)
            .args(["install", "tesseract"])
            .output()
            .map_err(|e| format!("Failed to run Homebrew: {}", e))?;
        if output.status.success() {
            return Ok(());
        }
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        Err(format!(
            "Homebrew install failed: {} {}",
            stdout.trim(),
            stderr.trim()
        ))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = _app;
        Err("Automatic install is only available on macOS (via Homebrew). Please use the install instructions link below.".to_string())
    }
}

#[cfg(target_os = "macos")]
fn which_brew() -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let brew = dir.join("brew");
        if brew.is_file() {
            return Some(brew);
        }
    }
    None
}
