use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::Mutex,
    time::{Duration, Instant},
};

use tauri::{
    webview::NewWindowResponse, AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

struct BackendProcess(Mutex<Option<CommandChild>>);

const SELECT_DIRECTORY_BRIDGE: &str = r#"
(() => {
  window.yunduDesktop = {
    ...(window.yunduDesktop ?? {}),
    selectDirectory: () => window.__TAURI__.core.invoke("select_directory"),
  };
})();
"#;

type DesktopResult<T> = Result<T, Box<dyn std::error::Error>>;

fn boxed_error(message: impl Into<String>) -> Box<dyn std::error::Error> {
    Box::new(std::io::Error::new(std::io::ErrorKind::Other, message.into()))
}

#[tauri::command]
async fn select_directory(app: AppHandle) -> Result<Option<String>, String> {
    Ok(app
        .dialog()
        .file()
        .blocking_pick_folder()
        .map(|path| path.to_string()))
}

fn reserve_port() -> DesktopResult<u16> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
}

fn wait_for_backend(base_url: &str) -> DesktopResult<()> {
    let deadline = Instant::now() + Duration::from_secs(30);
    let host = base_url.strip_prefix("http://").unwrap_or(base_url);

    while Instant::now() < deadline {
        match TcpStream::connect_timeout(&host.parse()?, Duration::from_millis(250)) {
            Ok(mut stream) => {
                let request = format!("GET /api/health HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n");
                stream.write_all(request.as_bytes())?;

                let mut response = String::new();
                stream.read_to_string(&mut response)?;
                if response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200") {
                    return Ok(());
                }
            }
            Err(error) => {
                eprintln!("waiting for Yundu backend: {error}");
            }
        }

        std::thread::sleep(Duration::from_millis(250));
    }

    Err(boxed_error("Yundu backend did not become ready before the startup timeout"))
}

fn env_or_default(key: &str, default_value: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default_value.to_owned())
}

fn start_backend(app: &tauri::App) -> DesktopResult<String> {
    let port = reserve_port()?;
    let base_url = format!("http://127.0.0.1:{port}");
    let data_dir = app.path().app_data_dir()?.join("data");
    let pglite_data_dir = data_dir.join("pglite");

    let (mut rx, child) = app
        .shell()
        .sidecar("yundu")?
        .args(["serve"])
        .env("YUNDU_DATABASE_DRIVER", env_or_default("YUNDU_DATABASE_DRIVER", "pglite"))
        .env(
            "YUNDU_DATA_DIR",
            env_or_default("YUNDU_DATA_DIR", &data_dir.to_string_lossy()),
        )
        .env(
            "YUNDU_PGLITE_DATA_DIR",
            env_or_default("YUNDU_PGLITE_DATA_DIR", &pglite_data_dir.to_string_lossy()),
        )
        .env("YUNDU_HTTP_HOST", "127.0.0.1")
        .env("YUNDU_HTTP_PORT", port.to_string())
        .env("YUNDU_WEB_ORIGIN", &base_url)
        .env(
            "YUNDU_BETTER_AUTH_URL",
            env_or_default("YUNDU_BETTER_AUTH_URL", &base_url),
        )
        .spawn()?;

    app.manage(BackendProcess(Mutex::new(Some(child))));

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    println!("[yundu] {}", String::from_utf8_lossy(&line).trim_end());
                }
                CommandEvent::Stderr(line) => {
                    eprintln!("[yundu] {}", String::from_utf8_lossy(&line).trim_end());
                }
                _ => {}
            }
        }
    });

    wait_for_backend(&base_url)?;
    Ok(base_url)
}

#[allow(deprecated)]
fn open_external_http_url(app: &AppHandle, url: &tauri::Url) -> DesktopResult<()> {
    if !matches!(url.scheme(), "http" | "https") {
        return Err(boxed_error(format!(
            "Refusing to open unsupported external URL: {url}"
        )));
    }

    app.shell().open(url.as_str(), None)?;
    Ok(())
}

fn create_main_window(app: &tauri::App, base_url: &str) -> DesktopResult<()> {
    let url = base_url
        .parse()
        .map_err(|error| boxed_error(format!("Invalid backend URL {base_url}: {error}")))?;
    let app_handle = app.handle().clone();

    WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
        .title("Yundu")
        .inner_size(1280.0, 840.0)
        .min_inner_size(960.0, 640.0)
        .initialization_script(SELECT_DIRECTORY_BRIDGE)
        .on_new_window(move |url, _features| {
            if let Err(error) = open_external_http_url(&app_handle, &url) {
                eprintln!("failed to open external URL {url}: {error}");
            }

            NewWindowResponse::Deny
        })
        .build()?;

    Ok(())
}

fn stop_backend(app: &AppHandle) {
    let Some(state) = app.try_state::<BackendProcess>() else {
        return;
    };

    let Ok(mut process) = state.0.lock() else {
        return;
    };

    if let Some(child) = process.take() {
        let _ = child.kill();
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![select_directory])
        .setup(|app| {
            let base_url = start_backend(app)?;
            create_main_window(app, &base_url)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Yundu Tauri app")
        .run(|app, event| {
            if matches!(event, RunEvent::ExitRequested { .. }) {
                stop_backend(app);
            }
        });
}
