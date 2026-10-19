// Prevents an extra console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::{json, Map, Value};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{
    AppHandle, LogicalPosition, Manager, State, TitleBarStyle, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

// Injected before the page loads. Provides window.electronAPI, the same surface Electron's preload exposes.
const SHIM: &str = include_str!("../shim/electron-shim.js");

// Serializes read-modify-write cycles on the JSON store files.
struct StoreLock(Mutex<()>);

// ---- window ----

#[tauri::command]
fn window_action(window: WebviewWindow, action: String) -> Result<(), String> {
    let result = match action.as_str() {
        "close" => window.close(),
        "hide" => window.hide(),
        "minimize" => window.minimize(),
        "toggle-maximize" => {
            if window.is_maximized().unwrap_or(false) {
                window.unmaximize()
            } else {
                window.maximize()
            }
        }
        _ => return Err(format!("unknown window action: {action}")),
    };
    result.map_err(|e| e.to_string())
}

#[tauri::command]
fn start_dragging(window: WebviewWindow) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
fn os_type() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    }
}

// ---- Apple Music (replaces Electron's GET_APPLE_MUSIC; the shim parses the output) ----

const MUSIC_SCRIPT: &str = r#"if application "Music" is running then
tell application "Music"
set pState to (player state as string)
if pState is not "stopped" then
set trk to name of current track
set art to artist of current track
set alb to album of current track
set pos to (player position as integer)
set dur to (duration of current track as integer)
return pState & "||" & trk & "||" & art & "||" & alb & "||" & pos & "||" & dur
else
return "STOPPED"
end if
end tell
else
return "NOT_RUNNING"
end if"#;

#[tauri::command]
async fn apple_music() -> String {
    tauri::async_runtime::spawn_blocking(|| {
        use std::io::Read;
        use std::process::{Command, Stdio};
        let Ok(mut child) = Command::new("osascript")
            .args(["-e", MUSIC_SCRIPT])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
        else {
            return String::new();
        };
        // Bound the call to 3s, like Electron, so a hung Music/osascript can't pile up.
        for _ in 0..30 {
            if let Ok(Some(_)) = child.try_wait() {
                let mut out = String::new();
                if let Some(mut s) = child.stdout.take() {
                    let _ = s.read_to_string(&mut out);
                }
                return out.trim().to_string();
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        let _ = child.kill();
        let _ = child.wait();
        String::new()
    })
    .await
    .unwrap_or_default()
}

// ---- server restart (the top bar's red button) ----

// The checkout the server is run from: the jar there is the only one that matches the user's
// config (a jar built elsewhere rewrites vrconfig.yml without the fields it doesn't know).
const SERVER_DIR: &str = "/Users/sirjame/Documents/Project/SJ SlimeVR Sever Claude";
const SERVER_MATCH: &str = "slimevr.jar run";

#[tauri::command]
async fn restart_server(app: AppHandle) -> Result<(), String> {
    let log = app.path().app_log_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        use std::os::unix::process::CommandExt;
        use std::process::{Command, Stdio};
        let jar = Path::new(SERVER_DIR).join("server/desktop/build/libs/slimevr.jar");
        if !jar.is_file() {
            return Err(format!("No server jar at {}", jar.display()));
        }

        // Stop the running server and wait for it to exit, so the new one can take its ports.
        let _ = Command::new("pkill").args(["-f", SERVER_MATCH]).status();
        for _ in 0..50 {
            let running = Command::new("pgrep").args(["-f", SERVER_MATCH]).stdout(Stdio::null()).status();
            if !matches!(running, Ok(s) if s.success()) {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }

        fs::create_dir_all(&log).map_err(|e| e.to_string())?;
        let out = fs::File::create(log.join("server.log")).map_err(|e| e.to_string())?;
        let err = out.try_clone().map_err(|e| e.to_string())?;
        Command::new("java")
            .args(["-Xmx128M", "-jar"])
            .arg(&jar)
            .arg("run")
            .current_dir(SERVER_DIR)
            .stdin(Stdio::null())
            .stdout(out)
            .stderr(err)
            // Own process group, so quitting the Spike (or Ctrl+C on tauri dev) leaves the server running.
            .process_group(0)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Couldn't start the server: {e}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---- storage (replaces Electron's settings and cache stores) ----

fn store_path(app: &AppHandle, kind: &str) -> Result<PathBuf, String> {
    if kind != "settings" && kind != "cache" {
        return Err(format!("unknown store: {kind}"));
    }
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(format!("{kind}.json")))
}

fn read_store(path: &Path) -> Map<String, Value> {
    fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn write_store(path: &Path, map: &Map<String, Value>) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // Write to a temp file and rename, so a crash mid-write can't corrupt the store.
    let tmp = path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(map).map_err(|e| e.to_string())?;
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

#[tauri::command]
fn storage_get(
    app: AppHandle,
    lock: State<'_, StoreLock>,
    kind: String,
    key: String,
) -> Result<Option<Value>, String> {
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    let path = store_path(&app, &kind)?;
    Ok(read_store(&path).get(&key).cloned())
}

#[tauri::command]
fn storage_set(
    app: AppHandle,
    lock: State<'_, StoreLock>,
    kind: String,
    key: String,
    value: Value,
) -> Result<(), String> {
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    let path = store_path(&app, &kind)?;
    let mut map = read_store(&path);
    map.insert(key, value);
    write_store(&path, &map)
}

#[tauri::command]
fn storage_delete(
    app: AppHandle,
    lock: State<'_, StoreLock>,
    kind: String,
    key: String,
) -> Result<bool, String> {
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    let path = store_path(&app, &kind)?;
    let mut map = read_store(&path);
    let removed = map.remove(&key).is_some();
    write_store(&path, &map)?;
    Ok(removed)
}

// ---- folders, files, and URLs ----

fn folder_for(app: &AppHandle, kind: &str) -> Result<PathBuf, String> {
    match kind {
        "config" => app.path().app_config_dir().map_err(|e| e.to_string()),
        "logs" => app.path().app_log_dir().map_err(|e| e.to_string()),
        "exe" => {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            exe.parent()
                .map(Path::to_path_buf)
                .ok_or_else(|| "executable has no parent folder".to_string())
        }
        _ => Err(format!("unknown folder: {kind}")),
    }
}

#[tauri::command]
fn get_folder(app: AppHandle, kind: String) -> Result<String, String> {
    folder_for(&app, &kind).map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
fn open_folder(app: AppHandle, kind: String) -> Result<(), String> {
    if kind != "config" && kind != "logs" {
        return Err(format!("folder not allowed: {kind}"));
    }
    let dir = folder_for(&app, &kind)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

// Same rule as the Electron OPEN_FILE handler: only paths inside the config or logs folders.
#[tauri::command]
fn open_path(app: AppHandle, path: String) -> Result<(), String> {
    let requested = PathBuf::from(&path);
    let has_parent_dir = requested.components().any(|c| matches!(c, Component::ParentDir));
    let allowed_roots = [folder_for(&app, "config")?, folder_for(&app, "logs")?];
    let allowed = !has_parent_dir && allowed_roots.iter().any(|root| requested.starts_with(root));
    if !allowed {
        return Err(format!("path not allowed: {path}"));
    }
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| e.to_string())
}

// Same allowlist as the Electron OPEN_URL handler.
fn is_allowed_url(url: &str) -> bool {
    if url.starts_with("steam://") || url == "ms-settings:network" || url == "https://discord.gg/slimevr" {
        return true;
    }
    if let Some(rest) = url.strip_prefix("https://") {
        let host = rest.split('/').next().unwrap_or("");
        if host == "slimevr.dev" || host.ends_with(".slimevr.dev") {
            return true;
        }
    }
    url == "https://github.com/SlimeVR" || url.starts_with("https://github.com/SlimeVR/")
}

#[tauri::command]
fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    if !is_allowed_url(&url) {
        return Err(format!("URL not allowed: {url}"));
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn i18n_override(app: AppHandle) -> Result<Option<String>, String> {
    let file = folder_for(&app, "config")?.join("override.ftl");
    if !file.exists() {
        return Ok(None);
    }
    fs::read_to_string(file).map(Some).map_err(|e| e.to_string())
}

// ---- native dialogs (Electron's dialog.showOpenDialog / showSaveDialog) ----

fn filters_from(options: &Value) -> Vec<(String, Vec<String>)> {
    options["filters"]
        .as_array()
        .map(|filters| {
            filters
                .iter()
                .map(|f| {
                    let name = f["name"].as_str().unwrap_or("Files").to_string();
                    let exts = f["extensions"]
                        .as_array()
                        .map(|list| list.iter().filter_map(|e| e.as_str().map(String::from)).collect())
                        .unwrap_or_default();
                    (name, exts)
                })
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
async fn open_dialog(app: AppHandle, options: Value) -> Result<Value, String> {
    let properties: Vec<&str> = options["properties"]
        .as_array()
        .map(|list| list.iter().filter_map(|p| p.as_str()).collect())
        .unwrap_or_default();
    let want_folder = properties.contains(&"openDirectory");
    let want_many = properties.contains(&"multiSelections");

    let mut dialog = app.dialog().file();
    for (name, exts) in filters_from(&options) {
        let exts: Vec<&str> = exts.iter().map(String::as_str).collect();
        dialog = dialog.add_filter(name, &exts);
    }
    if let Some(default) = options["defaultPath"].as_str() {
        dialog = dialog.set_directory(default);
    }

    let to_path = |p: tauri_plugin_dialog::FilePath| p.into_path().ok().map(|pb| pb.to_string_lossy().into_owned());

    if want_folder {
        let picked = dialog.blocking_pick_folder().and_then(to_path);
        return Ok(match picked {
            Some(path) => json!({ "canceled": false, "filePaths": [path] }),
            None => json!({ "canceled": true, "filePaths": [] }),
        });
    }
    if want_many {
        let picked: Vec<String> = dialog
            .blocking_pick_files()
            .unwrap_or_default()
            .into_iter()
            .filter_map(to_path)
            .collect();
        return Ok(json!({ "canceled": picked.is_empty(), "filePaths": picked }));
    }
    let picked = dialog.blocking_pick_file().and_then(to_path);
    Ok(match picked {
        Some(path) => json!({ "canceled": false, "filePaths": [path] }),
        None => json!({ "canceled": true, "filePaths": [] }),
    })
}

#[tauri::command]
async fn save_dialog(app: AppHandle, options: Value) -> Result<Value, String> {
    let mut dialog = app.dialog().file();
    for (name, exts) in filters_from(&options) {
        let exts: Vec<&str> = exts.iter().map(String::as_str).collect();
        dialog = dialog.add_filter(name, &exts);
    }
    if let Some(default) = options["defaultPath"].as_str() {
        let default = PathBuf::from(default);
        if let Some(parent) = default.parent() {
            dialog = dialog.set_directory(parent);
        }
        if let Some(name) = default.file_name() {
            dialog = dialog.set_file_name(name.to_string_lossy());
        }
    }
    let picked = dialog
        .blocking_save_file()
        .and_then(|p| p.into_path().ok())
        .map(|pb| pb.to_string_lossy().into_owned());
    Ok(match picked {
        Some(path) => json!({ "canceled": false, "filePath": path }),
        None => json!({ "canceled": true, "filePath": null }),
    })
}

// ---- zoom ----

// Chromium's zoom steps, the same ones Electron uses. ZOOM_DEFAULT is 100%.
const ZOOM_STEPS: [f64; 12] = [0.5, 0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 3.0];
const ZOOM_DEFAULT: usize = 5;

struct ZoomIndex(Mutex<usize>);

fn saved_zoom(app: &AppHandle) -> usize {
    store_path(app, "cache")
        .map(|path| read_store(&path))
        .ok()
        .and_then(|map| map.get("uiZoom").and_then(Value::as_u64))
        .map_or(ZOOM_DEFAULT, |index| (index as usize).min(ZOOM_STEPS.len() - 1))
}

fn save_zoom(app: &AppHandle, index: usize) -> Result<(), String> {
    let lock = app.state::<StoreLock>();
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    let path = store_path(app, "cache")?;
    let mut map = read_store(&path);
    map.insert("uiZoom".into(), json!(index));
    write_store(&path, &map)
}

fn apply_zoom(app: &AppHandle, index: usize) -> tauri::Result<()> {
    *app.state::<ZoomIndex>().0.lock().unwrap() = index;
    if let Some(window) = app.get_webview_window("main") {
        window.set_zoom(ZOOM_STEPS[index])?;
    }
    // Saving is best effort. The zoom still applies for this run if the write fails.
    let _ = save_zoom(app, index);
    Ok(())
}

// ---- window size and spot ----

#[derive(Clone, Copy)]
struct SavedWindow {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

// The latest size and spot, kept while the app runs. Saved when the window closes or the app quits.
struct WindowGeometry(Mutex<Option<SavedWindow>>);

fn saved_window(app: &AppHandle) -> Option<SavedWindow> {
    let path = store_path(app, "cache").ok()?;
    let map = read_store(&path);
    let saved = map.get("uiWindow")?;
    Some(SavedWindow {
        x: saved.get("x")?.as_f64()?,
        y: saved.get("y")?.as_f64()?,
        width: saved.get("width")?.as_f64()?,
        height: saved.get("height")?.as_f64()?,
    })
}

fn save_window(app: &AppHandle, g: SavedWindow) -> Result<(), String> {
    let lock = app.state::<StoreLock>();
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    let path = store_path(app, "cache")?;
    let mut map = read_store(&path);
    map.insert(
        "uiWindow".into(),
        json!({ "x": g.x, "y": g.y, "width": g.width, "height": g.height }),
    );
    write_store(&path, &map)
}

// Size and spot in logical pixels, so they still fit after a change of display scale.
// None while the window is minimised or full screen, since those positions aren't a spot to return to.
fn current_geometry(window: &WebviewWindow) -> Option<SavedWindow> {
    if window.is_minimized().ok()? || window.is_fullscreen().ok()? {
        return None;
    }
    let scale = window.scale_factor().ok()?;
    let pos = window.outer_position().ok()?.to_logical::<f64>(scale);
    let size = window.inner_size().ok()?.to_logical::<f64>(scale);
    Some(SavedWindow {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
    })
}

// True when the window's top-left corner and part of its width sit on a screen. A monitor may have been unplugged.
fn on_a_screen(window: &WebviewWindow, g: SavedWindow) -> bool {
    let Ok(monitors) = window.available_monitors() else {
        return false;
    };
    monitors.iter().any(|m| {
        let scale = m.scale_factor();
        let at = m.position().to_logical::<f64>(scale);
        let size = m.size().to_logical::<f64>(scale);
        g.x + 100.0 > at.x
            && g.x < at.x + size.width
            && g.y + 40.0 > at.y
            && g.y < at.y + size.height
    })
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(StoreLock(Mutex::new(())))
        .setup(|app| {
            let index = saved_zoom(app.handle());
            app.manage(ZoomIndex(Mutex::new(index)));

            // Mac: a transparent title bar with the native traffic lights, drawn over the top strip that AppShell
            // reserves. macOS also rounds the corners. Windows and Linux: no frame, like the Electron window. The React
            // TopBar draws its own minimize, maximize, and close buttons there, when window.electronAPI exists.
            // Start where the window was last closed or quit, at the same size.
            let saved = saved_window(app.handle());
            let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("SlimeVR")
                .inner_size(1280.0, 800.0)
                // 640 px is half of a 1280 px display, so macOS split view fits. Below that the top bar clips.
                .min_inner_size(640.0, 480.0)
                .decorations(cfg!(target_os = "macos"))
                .initialization_script(SHIM);
            if let Some(g) = saved {
                builder = builder.inner_size(g.width, g.height).position(g.x, g.y);
            }
            #[cfg(target_os = "macos")]
            let builder = builder
                .title_bar_style(TitleBarStyle::Overlay)
                .hidden_title(true)
                // Centres the lights in the 28 px strip. Electron's hiddenInset uses y 7, but Tauri places them about 2 px higher.
                .traffic_light_position(LogicalPosition::new(20.0, 15.0));
            let window = builder.build()?;
            window.set_zoom(ZOOM_STEPS[index])?;
            if saved.is_some_and(|g| !on_a_screen(&window, g)) {
                window.center()?;
            }

            // Track the size and spot as the user moves or resizes, and save them when the window closes.
            app.manage(WindowGeometry(Mutex::new(current_geometry(&window))));
            let tracked = window.clone();
            let geometry_handle = app.handle().clone();
            window.on_window_event(move |event| match event {
                tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => {
                    if let Some(g) = current_geometry(&tracked) {
                        *geometry_handle.state::<WindowGeometry>().0.lock().unwrap() = Some(g);
                    }
                }
                tauri::WindowEvent::CloseRequested { .. } => {
                    if let Some(g) = *geometry_handle.state::<WindowGeometry>().0.lock().unwrap() {
                        let _ = save_window(&geometry_handle, g);
                    }
                }
                _ => {}
            });

            // View menu with the zoom keys, like Electron's default menu. Edit is kept so copy and paste still work.
            let handle = app.handle();
            let zoom_in = MenuItem::with_id(handle, "zoom-in", "Zoom In", true, Some("CmdOrCtrl+="))?;
            let zoom_out = MenuItem::with_id(handle, "zoom-out", "Zoom Out", true, Some("CmdOrCtrl+-"))?;
            let zoom_reset = MenuItem::with_id(handle, "zoom-reset", "Actual Size", true, Some("CmdOrCtrl+0"))?;
            let menu = Menu::with_items(
                handle,
                &[
                    &Submenu::with_items(
                        handle,
                        "SlimeVR Spike",
                        true,
                        &[
                            &PredefinedMenuItem::hide(handle, None)?,
                            &PredefinedMenuItem::hide_others(handle, None)?,
                            &PredefinedMenuItem::separator(handle)?,
                            &PredefinedMenuItem::quit(handle, None)?,
                        ],
                    )?,
                    &Submenu::with_items(
                        handle,
                        "Edit",
                        true,
                        &[
                            &PredefinedMenuItem::undo(handle, None)?,
                            &PredefinedMenuItem::redo(handle, None)?,
                            &PredefinedMenuItem::separator(handle)?,
                            &PredefinedMenuItem::cut(handle, None)?,
                            &PredefinedMenuItem::copy(handle, None)?,
                            &PredefinedMenuItem::paste(handle, None)?,
                            &PredefinedMenuItem::select_all(handle, None)?,
                        ],
                    )?,
                    &Submenu::with_items(handle, "View", true, &[&zoom_in, &zoom_out, &zoom_reset])?,
                    &Submenu::with_items(
                        handle,
                        "Window",
                        true,
                        &[
                            &PredefinedMenuItem::minimize(handle, None)?,
                            &PredefinedMenuItem::close_window(handle, None)?,
                        ],
                    )?,
                ],
            )?;
            handle.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let index = *app.state::<ZoomIndex>().0.lock().unwrap();
            let next = match event.id().as_ref() {
                "zoom-in" => (index + 1).min(ZOOM_STEPS.len() - 1),
                "zoom-out" => index.saturating_sub(1),
                "zoom-reset" => ZOOM_DEFAULT,
                _ => return,
            };
            if next != index {
                let _ = apply_zoom(app, next);
            }
        })
        .invoke_handler(tauri::generate_handler![
            window_action,
            start_dragging,
            os_type,
            storage_get,
            storage_set,
            storage_delete,
            get_folder,
            open_folder,
            open_path,
            open_url,
            i18n_override,
            open_dialog,
            save_dialog,
            apple_music,
            restart_server,
        ])
        .build(tauri::generate_context!())
        .expect("error while building the SlimeVR Tauri spike")
        .run(|app, event| {
            // Quitting (Cmd+Q) saves the last size and spot too, not only closing the window.
            if let tauri::RunEvent::Exit = event {
                if let Some(g) = *app.state::<WindowGeometry>().0.lock().unwrap() {
                    let _ = save_window(app, g);
                }
            }
        });
}
