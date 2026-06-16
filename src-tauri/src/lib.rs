use std::fs;
use serde_json::json;

fn get_resend_api_key() -> Option<String> {
  // 1. Check process environment variables
  if let Ok(key) = std::env::var("RESEND_API_KEY") {
    return Some(key);
  }
  // 2. Read from .env.local file in parent directory
  if let Ok(content) = fs::read_to_string("../.env.local") {
    for line in content.lines() {
      if line.starts_with("RESEND_API_KEY=") {
        let key = line.trim_start_matches("RESEND_API_KEY=").trim_matches('"');
        return Some(key.to_string());
      }
    }
  }
  None
}

#[tauri::command]
async fn send_reset_email(email: String, code: String) -> Result<String, String> {
  let api_key = get_resend_api_key().ok_or_else(|| "RESEND_API_KEY not found".to_string())?;

  let client = reqwest::Client::new();
  let body = json!({
    "from": "Madni Pass <noreply@lazynote.website>",
    "to": [email],
    "subject": "Reset your Madni Pass PIN",
    "html": format!(
      r#"
      <div style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 5px;">
        <h2 style="color: #4cc9d0; margin-bottom: 20px;">Madni Pass Recovery</h2>
        <p>You requested a PIN reset for your Madni Pass account.</p>
        <p>Your 6-digit verification code is:</p>
        <div style="background-color: #f6f6f6; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; border-radius: 5px; color: #333; margin: 20px 0;">
          {}
        </div>
        <p style="font-size: 12px; color: #666; margin-top: 30px;">This code will expire in 5 minutes. If you did not request this, please ignore this email.</p>
      </div>
      "#,
      code
    )
  });

  let res = client.post("https://api.resend.com/emails")
    .header("Authorization", format!("Bearer {}", api_key))
    .header("Content-Type", "application/json")
    .json(&body)
    .send()
    .await
    .map_err(|e| e.to_string())?;

  if res.status().is_success() {
    Ok("Email sent successfully".to_string())
  } else {
    let err_text = res.text().await.unwrap_or_else(|_| "Unknown error".to_string());
    Err(err_text)
  }
}

#[tauri::command]
fn exit_app() {
  std::process::exit(0);
}

#[tauri::command]
fn log_message(message: String) {
  println!("[WebView Log] {}", message);
}

use std::sync::{Mutex, OnceLock};
use tokio::sync::oneshot;

static APPLE_SIGN_IN_SENDER: OnceLock<Mutex<Option<oneshot::Sender<Result<String, String>>>>> = OnceLock::new();

fn get_apple_sender() -> &'static Mutex<Option<oneshot::Sender<Result<String, String>>>> {
  APPLE_SIGN_IN_SENDER.get_or_init(|| Mutex::new(None))
}

#[cfg(target_os = "ios")]
extern "C" {
  fn ios_sign_in_with_apple(hashed_nonce: *const std::os::raw::c_char);
}

#[no_mangle]
pub unsafe extern "C" fn rust_apple_sign_in_callback(
  result_json: *const std::os::raw::c_char,
  error_str: *const std::os::raw::c_char,
) {
  use std::ffi::CStr;

  let result: Result<String, String> = if !result_json.is_null() {
    let c_str = CStr::from_ptr(result_json);
    match c_str.to_str() {
      Ok(s) => Ok(s.to_string()),
      Err(e) => Err(e.to_string()),
    }
  } else if !error_str.is_null() {
    let c_str = CStr::from_ptr(error_str);
    match c_str.to_str() {
      Ok(s) => Err(s.to_string()),
      Err(e) => Err(e.to_string()),
    }
  } else {
    Err("Unknown error during Sign in with Apple".to_string())
  };

  let mut sender_lock = get_apple_sender().lock().unwrap();
  if let Some(sender) = sender_lock.take() {
    let _ = sender.send(result);
  }
}

#[tauri::command]
async fn apple_sign_in(hashed_nonce: String) -> Result<String, String> {
  #[cfg(target_os = "ios")]
  {
    use std::ffi::CString;

    let (tx, rx) = oneshot::channel::<Result<String, String>>();
    {
      let mut sender = get_apple_sender().lock().unwrap();
      *sender = Some(tx);
    }

    let c_nonce = CString::new(hashed_nonce).map_err(|e| e.to_string())?;
    unsafe {
      ios_sign_in_with_apple(c_nonce.as_ptr());
    }

    rx.await.map_err(|e| e.to_string())?
  }

  #[cfg(not(target_os = "ios"))]
  {
    let _ = hashed_nonce;
    Err("Sign in with Apple is only supported on iOS devices.".to_string())
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_google_auth::init())
    .invoke_handler(tauri::generate_handler![send_reset_email, exit_app, log_message, apple_sign_in])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
