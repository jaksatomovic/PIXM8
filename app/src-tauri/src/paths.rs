use std::path::PathBuf;

use tauri::{AppHandle, Manager};

pub(crate) fn get_keero_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("Failed to resolve app data directory")
}

pub(crate) fn get_voices_dir(app: &AppHandle) -> PathBuf {
    get_keero_dir(app).join("voices")
}

pub(crate) fn get_images_dir(app: &AppHandle) -> PathBuf {
    get_keero_dir(app).join("images")
}

pub(crate) fn get_docs_dir(app: &AppHandle) -> PathBuf {
    get_keero_dir(app).join("Docs")
}

pub(crate) fn get_venv_path(app: &AppHandle) -> PathBuf {
    get_keero_dir(app).join("python_env")
}

pub(crate) fn get_bootstrap_python_root(app: &AppHandle) -> PathBuf {
    // Dev fallback: same as backend.rs / python_setup.rs — repo_root/resources/python_runtime
    if let Some(root) = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(std::path::Path::parent)
    {
        let dev_runtime = root.join("resources").join("python_runtime");
        if dev_runtime.exists() {
            return dev_runtime;
        }
    }

    let resource_dir = app
        .path()
        .resource_dir()
        .expect("Failed to resolve resource directory");

    let direct = resource_dir.join("python_runtime");
    if direct.exists() {
        return direct;
    }

    let dev_resources = resource_dir
        .join("_up_")
        .join("_up_")
        .join("resources")
        .join("python_runtime");
    if dev_resources.exists() {
        return dev_resources;
    }

    direct
}

pub(crate) fn get_bootstrap_python(app: &AppHandle) -> PathBuf {
    let root = get_bootstrap_python_root(app);
    let bin = root.join("python").join("bin");
    let python = bin.join("python");
    if python.exists() {
        return python;
    }

    let python3 = bin.join("python3");
    if python3.exists() {
        return python3;
    }

    bin.join("python3.11")
}

pub(crate) fn bootstrap_python_if_needed(app: &AppHandle) -> Result<PathBuf, String> {
    if cfg!(target_arch = "aarch64") == false {
        return Err("This build supports Apple Silicon only".to_string());
    }

    let python_path = get_bootstrap_python(app);
    if python_path.exists() {
        return Ok(python_path);
    }

    Err(format!(
        "Bundled Python runtime not found at {}. Ensure resources/python_runtime is included in the Tauri bundle.",
        python_path.display()
    ))
}

pub(crate) fn get_venv_python(app: &AppHandle) -> PathBuf {
    let venv = get_venv_path(app);
    if cfg!(target_os = "windows") {
        venv.join("Scripts").join("python.exe")
    } else {
        let bin = venv.join("bin");
        let candidates = ["python", "python3", "python3.12", "python3.11"];
        for name in candidates {
            let p = bin.join(name);
            if p.exists() {
                return p;
            }
        }
        bin.join("python3")
    }
}

pub(crate) fn get_venv_pip(app: &AppHandle) -> PathBuf {
    let venv = get_venv_path(app);
    if cfg!(target_os = "windows") {
        venv.join("Scripts").join("pip.exe")
    } else {
        let bin = venv.join("bin");
        let pip = bin.join("pip");
        if pip.exists() {
            return pip;
        }
        bin.join("pip3")
    }
}

/// Directory where Tesseract can be installed (app data, not bundled).
pub(crate) fn get_tesseract_dir(app: &AppHandle) -> PathBuf {
    get_keero_dir(app).join("tesseract")
}

/// Path to tesseract binary if available: first app_data/tesseract, then common system paths.
pub(crate) fn get_tesseract_cmd(app: &AppHandle) -> Option<PathBuf> {
    let base = get_tesseract_dir(app);
    #[cfg(target_os = "windows")]
    {
        let sub = base.join("win");
        let exe = sub.join("tesseract.exe");
        if exe.exists() {
            return Some(exe);
        }
        // Common system install
        let pf = std::env::var("ProgramFiles").ok().unwrap_or_else(|| "C:\\Program Files".to_string());
        let sys = std::path::PathBuf::from(pf).join("Tesseract-OCR").join("tesseract.exe");
        if sys.exists() {
            return Some(sys);
        }
    }
    #[cfg(target_os = "macos")]
    {
        let sub = base.join("mac");
        let bin = sub.join("bin").join("tesseract");
        if bin.exists() {
            return Some(bin);
        }
        let sys = PathBuf::from("/usr/local/bin/tesseract");
        if sys.exists() {
            return Some(sys);
        }
        let sys2 = PathBuf::from("/opt/homebrew/bin/tesseract");
        if sys2.exists() {
            return Some(sys2);
        }
    }
    #[cfg(target_os = "linux")]
    {
        let sub = base.join("linux");
        let bin = sub.join("bin").join("tesseract");
        if bin.exists() {
            return Some(bin);
        }
        let sys = PathBuf::from("/usr/bin/tesseract");
        if sys.exists() {
            return Some(sys);
        }
    }
    None
}
