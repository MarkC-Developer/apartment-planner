use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
#[cfg(target_os = "macos")]
use tauri::Emitter;

// ─── App Config ────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RecentFile {
    pub path: String,
    pub name: String,
    pub last_opened: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppConfig {
    pub recent_files: Vec<RecentFile>,
    pub last_dir: String,
    pub last_file: String,
    pub theme: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            recent_files: vec![],
            last_dir: dirs::document_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .to_string_lossy()
                .to_string(),
            last_file: String::new(),
            theme: "dark".to_string(),
        }
    }
}

fn config_path() -> PathBuf {
    let mut p = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    p.push("apartment-planner");
    fs::create_dir_all(&p).ok();
    p.push("config.json");
    p
}

fn load_config() -> AppConfig {
    let p = config_path();
    if p.exists() {
        match fs::read_to_string(&p) {
            Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
            Err(_) => AppConfig::default(),
        }
    } else {
        AppConfig::default()
    }
}

fn save_config(cfg: &AppConfig) -> Result<(), String> {
    let p = config_path();
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(p, json).map_err(|e| e.to_string())
}

// ─── Tauri Commands ────────────────────────────────────────────────────────

#[tauri::command]
fn read_plan(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
fn write_plan(path: String, content: String) -> Result<(), String> {
    // Ensure parent directory exists
    if let Some(parent) = PathBuf::from(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, &content).map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[tauri::command]
fn get_app_config() -> AppConfig {
    load_config()
}

#[tauri::command]
fn update_app_config(config: AppConfig) -> Result<(), String> {
    save_config(&config)
}

/// Add or update a file in the recent files list, capped at 20 entries
#[tauri::command]
fn touch_recent(path: String, name: String) -> Result<AppConfig, String> {
    let mut cfg = load_config();
    let now = chrono::Utc::now().to_rfc3339();

    // Remove existing entry for this path
    cfg.recent_files.retain(|f| f.path != path);

    // Insert at the front
    cfg.recent_files.insert(
        0,
        RecentFile {
            path: path.clone(),
            name,
            last_opened: now,
        },
    );

    // Cap at 20 recent files
    cfg.recent_files.truncate(20);

    // Update last_file and last_dir
    cfg.last_file = path.clone();
    if let Some(parent) = PathBuf::from(&path).parent() {
        cfg.last_dir = parent.to_string_lossy().to_string();
    }

    save_config(&cfg)?;
    Ok(cfg)
}

#[tauri::command]
fn set_theme(theme: String) -> Result<(), String> {
    let mut cfg = load_config();
    cfg.theme = theme;
    save_config(&cfg)
}

#[tauri::command]
fn remove_recent(path: String) -> Result<AppConfig, String> {
    let mut cfg = load_config();
    cfg.recent_files.retain(|f| f.path != path);
    save_config(&cfg)?;
    Ok(cfg)
}

#[tauri::command]
fn clear_last_file() -> Result<(), String> {
    let mut cfg = load_config();
    cfg.last_file = String::new();
    save_config(&cfg)
}

#[tauri::command]
fn file_exists(path: String) -> bool {
    PathBuf::from(&path).exists()
}

#[tauri::command]
fn write_binary(path: String, bytes: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = PathBuf::from(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, &bytes).map_err(|e| format!("Failed to write {}: {}", path, e))
}

// ─── App Setup ─────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
                let new_item = MenuItemBuilder::with_id("menu_new", "New").accelerator("CmdOrCtrl+N").build(app)?;
                let open_file = MenuItemBuilder::with_id("menu_open_file", "Open File…").accelerator("CmdOrCtrl+O").build(app)?;
                let see_sample = MenuItemBuilder::with_id("menu_see_sample", "See Sample").build(app)?;
                let open_submenu = SubmenuBuilder::new(app, "Open").items(&[&open_file, &see_sample]).build()?;
                let save_item = MenuItemBuilder::with_id("menu_save", "Save").accelerator("CmdOrCtrl+S").build(app)?;
                let file_menu = SubmenuBuilder::new(app, "File").items(&[&new_item, &open_submenu, &save_item]).build()?;
                let app_menu = SubmenuBuilder::new(app, "Apartment Planner").about(Some(Default::default())).separator().services().separator().hide().hide_others().show_all().separator().quit().build()?;
                let menu = MenuBuilder::new(app).items(&[&app_menu, &file_menu]).build()?;
                app.set_menu(menu)?;
                app.on_menu_event(move |app_handle, event| {
                    let _ = app_handle.emit("menu-action", event.id().0.clone());
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_plan,
            write_plan,
            write_binary,
            get_app_config,
            update_app_config,
            touch_recent,
            set_theme,
            remove_recent,
            clear_last_file,
            file_exists,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
