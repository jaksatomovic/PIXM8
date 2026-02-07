use std::fs;

use tauri::AppHandle;

use crate::paths::get_voices_dir;

const MAX_VOICE_SIZE: usize = 10 * 1024 * 1024; // 10MB

fn is_valid_wav_header(data: &[u8]) -> bool {
    // WAV files start with "RIFF" (4 bytes) followed by file size, then "WAVE"
    data.len() >= 12
        && &data[0..4] == b"RIFF"
        && &data[8..12] == b"WAVE"
}

fn sanitize_voice_id(voice_id: &str) -> Result<String, String> {
    // Allow only alphanumeric, underscore, and hyphen
    if voice_id.is_empty() {
        return Err("Voice ID cannot be empty".to_string());
    }
    
    if voice_id.len() > 255 {
        return Err("Voice ID too long (max 255 characters)".to_string());
    }
    
    for ch in voice_id.chars() {
        if !ch.is_alphanumeric() && ch != '_' && ch != '-' {
            return Err(format!(
                "Voice ID contains invalid character: '{}'. Only alphanumeric, underscore, and hyphen are allowed.",
                ch
            ));
        }
    }
    
    Ok(voice_id.to_string())
}

#[tauri::command]
pub async fn save_voice_wav_base64(
    app: AppHandle,
    voice_id: String,
    base64_wav: String,
) -> Result<(), String> {
    // Sanitize voice ID
    let sanitized_id = sanitize_voice_id(&voice_id)?;
    
    // Decode base64 (handle data URL prefix if present)
    let base64_data = if base64_wav.starts_with("data:") {
        // Extract base64 part after comma
        base64_wav
            .split(',')
            .nth(1)
            .ok_or_else(|| "Invalid data URL format".to_string())?
    } else {
        &base64_wav
    };
    
    // Decode base64
    use base64::Engine;
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(base64_data.trim())
        .map_err(|e| format!("Failed to decode base64: {}", e))?;
    
    // Validate size
    if decoded.len() > MAX_VOICE_SIZE {
        return Err(format!(
            "Voice file too large: {} bytes (max {} bytes)",
            decoded.len(), MAX_VOICE_SIZE
        ));
    }
    
    // Validate WAV header
    if !is_valid_wav_header(&decoded) {
        return Err("Invalid WAV file: missing RIFF/WAVE header".to_string());
    }
    
    // Get voices directory
    let voices_dir = get_voices_dir(&app);
    
    // Ensure directory exists
    fs::create_dir_all(&voices_dir)
        .map_err(|e| format!("Failed to create voices directory: {}", e))?;
    
    // Write file
    let file_path = voices_dir.join(format!("{}.wav", sanitized_id));
    fs::write(&file_path, &decoded)
        .map_err(|e| format!("Failed to write voice file: {}", e))?;
    
    Ok(())
}
