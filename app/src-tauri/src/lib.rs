mod backend;
mod models;
mod paths;
mod python_setup;
mod setup;
mod voices;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            backend::setup_backend(app)?;
            let min_size = Some(tauri::LogicalSize::<f64> { width: 800.0, height: 600.0 });
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_min_size(min_size);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            setup::check_setup_status,
            setup::create_python_venv,
            setup::install_python_deps,
            models::check_models_status,
            models::scan_local_models,
            models::download_model,
            models::download_all_models,
            setup::mark_setup_complete,
            setup::is_first_launch,
            setup::tesseract_status,
            setup::tesseract_install,
            backend::start_backend,
            voices::save_voice_wav_base64
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| match event {
        tauri::RunEvent::ExitRequested { .. } => {
            backend::stop_api_server(app_handle);
        }
        tauri::RunEvent::WindowEvent { event, .. } => {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                backend::stop_api_server(app_handle);
            }
        }
        _ => {}
    });
}
