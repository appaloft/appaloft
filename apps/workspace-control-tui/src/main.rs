use std::env;
use std::io::{BufRead, BufReader, Write};
use std::net::{Ipv4Addr, SocketAddrV4, TcpStream};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::time::Duration;

use anyhow::{Context, Result, bail};
use appaloft_workspace_control_tui::{
    ActionDecision, AppState, DeliveryDecision, DeliverySubmission, ParentMessage, RendererEvent,
    agent_area, render, terminal_key_bytes, terminal_mouse_bytes,
};
use crossterm::event::{
    DisableBracketedPaste, DisableMouseCapture, EnableBracketedPaste, EnableMouseCapture, Event,
    KeyCode, KeyEventKind, KeyModifiers, poll, read,
};
use crossterm::execute;
use crossterm::terminal::{
    EnterAlternateScreen, LeaveAlternateScreen, disable_raw_mode, enable_raw_mode,
};
use ratatui::Terminal;
use ratatui::backend::CrosstermBackend;

struct TerminalRestore;

impl TerminalRestore {
    fn enter() -> Result<Self> {
        enable_raw_mode().context("enable raw terminal mode")?;
        execute!(
            std::io::stdout(),
            EnterAlternateScreen,
            EnableMouseCapture,
            EnableBracketedPaste
        )
        .context("enter alternate terminal screen")?;
        Ok(Self)
    }
}

impl Drop for TerminalRestore {
    fn drop(&mut self) {
        let _ = disable_raw_mode();
        let _ = execute!(
            std::io::stdout(),
            DisableBracketedPaste,
            DisableMouseCapture,
            LeaveAlternateScreen
        );
    }
}

fn send(stream: &mut TcpStream, event: &RendererEvent) -> Result<()> {
    serde_json::to_writer(&mut *stream, event).context("encode renderer event")?;
    stream.write_all(b"\n").context("write renderer event")?;
    stream.flush().context("flush renderer event")
}

fn send_delivery(
    stream: &mut TcpStream,
    state: &AppState,
    submission: DeliverySubmission,
) -> Result<()> {
    let workspace_id = state
        .selected_workspace_id()
        .context("delivery action requires a selected Workspace")?
        .to_owned();
    send(stream, &RendererEvent::delivery(workspace_id, submission))
}

fn read_handshake(reader: &mut BufReader<TcpStream>) -> Result<()> {
    let mut line = String::new();
    reader
        .read_line(&mut line)
        .context("read renderer handshake")?;
    if !matches!(
        serde_json::from_str::<ParentMessage>(line.trim()).context("decode renderer handshake")?,
        ParentMessage::HelloOk
    ) {
        bail!("renderer handshake was rejected");
    }
    Ok(())
}

fn main() -> Result<()> {
    if env::args().any(|argument| argument == "--version") {
        println!("appaloft-workspace-tui {}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }

    let port = env::var("APPALOFT_WORKSPACE_TUI_PORT")
        .context("APPALOFT_WORKSPACE_TUI_PORT is required")?
        .parse::<u16>()
        .context("APPALOFT_WORKSPACE_TUI_PORT must be a valid port")?;
    let token = env::var("APPALOFT_WORKSPACE_TUI_TOKEN")
        .context("APPALOFT_WORKSPACE_TUI_TOKEN is required")?;
    let mut writer = TcpStream::connect(SocketAddrV4::new(Ipv4Addr::LOCALHOST, port))
        .context("connect to Appaloft presentation channel")?;
    writer
        .set_nodelay(true)
        .context("configure presentation channel")?;
    let mut reader = BufReader::new(writer.try_clone().context("clone presentation channel")?);
    send(&mut writer, &RendererEvent::Hello { token })?;
    read_handshake(&mut reader)?;

    let _restore = TerminalRestore::enter()?;
    let backend = CrosstermBackend::new(std::io::stdout());
    let mut terminal = Terminal::new(backend).context("create Ratatui terminal")?;
    terminal.clear().context("clear TUI surface")?;

    let (message_tx, message_rx) = mpsc::channel::<ParentMessage>();
    std::thread::spawn(move || {
        for line in reader.lines() {
            let Ok(line) = line else { break };
            let Ok(message) = serde_json::from_str::<ParentMessage>(&line) else {
                continue;
            };
            if message_tx.send(message).is_err() {
                break;
            }
        }
    });

    let stop = Arc::new(AtomicBool::new(false));
    for signal in [
        signal_hook::consts::SIGINT,
        signal_hook::consts::SIGTERM,
        signal_hook::consts::SIGHUP,
        signal_hook::consts::SIGQUIT,
    ] {
        signal_hook::flag::register(signal, Arc::clone(&stop))
            .context("register terminal restore signal")?;
    }

    let mut state = AppState::default();
    let mut last_selected: Option<String> = None;
    let mut last_terminal_size = (0, 0);
    let mut reconnect_attempts = 0_u8;
    let mut running = true;
    while running && !stop.load(Ordering::Relaxed) {
        for message in message_rx.try_iter() {
            if matches!(message, ParentMessage::Shutdown) {
                running = false;
                break;
            }
            let before = state.selected_workspace_id().map(str::to_owned);
            let terminal_healthy = matches!(message, ParentMessage::TerminalOutput { .. });
            let should_reconnect = matches!(
                &message,
                ParentMessage::Error {
                    phase,
                    retryable: true,
                    ..
                } if phase == "workspace-control-terminal"
            ) && state.session_id.is_some()
                && reconnect_attempts < 3;
            state.apply(message);
            if terminal_healthy {
                reconnect_attempts = 0;
            } else if should_reconnect {
                reconnect_attempts += 1;
                send(&mut writer, &RendererEvent::TerminalReconnect)?;
            }
            let selected = state.selected_workspace_id().map(str::to_owned);
            if let Some(workspace_id) = selected
                && (before.is_none() || Some(&workspace_id) != last_selected.as_ref())
            {
                send(
                    &mut writer,
                    &RendererEvent::Select {
                        workspace_id: workspace_id.clone(),
                    },
                )?;
                last_selected = Some(workspace_id);
            }
        }

        let size = terminal.size().context("read terminal size")?;
        let area = ratatui::layout::Rect::new(0, 0, size.width, size.height);
        let agent = agent_area(area, state.focus_mode);
        let terminal_size = (agent.width.max(2), agent.height.max(2));
        if state.resize_terminal(terminal_size.0, terminal_size.1)
            && state.session_id.is_some()
            && terminal_size != last_terminal_size
        {
            send(
                &mut writer,
                &RendererEvent::TerminalResize {
                    cols: terminal_size.0,
                    rows: terminal_size.1,
                },
            )?;
            last_terminal_size = terminal_size;
        }
        terminal
            .draw(|frame| render(frame, &state))
            .context("render Workspace control TUI")?;

        if !poll(Duration::from_millis(16)).context("poll terminal input")? {
            continue;
        }
        match read().context("read terminal input")? {
            Event::Resize(_, _) => {}
            Event::Paste(data) if state.delivery_form.is_some() => {
                for character in data.chars() {
                    state.delivery_form_insert(character);
                }
            }
            Event::Paste(data) if state.agent_focused => send(
                &mut writer,
                &RendererEvent::TerminalInput {
                    data: format!("\x1b[200~{data}\x1b[201~"),
                },
            )?,
            Event::Mouse(mut event) if state.agent_focused => {
                if event.column >= agent.x
                    && event.column < agent.x + agent.width
                    && event.row >= agent.y
                    && event.row < agent.y + agent.height
                {
                    event.column -= agent.x;
                    event.row -= agent.y;
                } else {
                    continue;
                }
                if let Some(data) = terminal_mouse_bytes(event) {
                    send(&mut writer, &RendererEvent::TerminalInput { data })?;
                }
            }
            Event::Key(key) if key.kind == KeyEventKind::Press && state.agent_focused => {
                if key.code == KeyCode::Char(']') && key.modifiers.contains(KeyModifiers::CONTROL) {
                    state.release_agent_focus();
                } else if let Some(data) = terminal_key_bytes(key) {
                    send(&mut writer, &RendererEvent::TerminalInput { data })?;
                }
            }
            Event::Key(key)
                if key.kind == KeyEventKind::Press && state.pending_confirmation.is_some() =>
            {
                match key.code {
                    KeyCode::Char('y') | KeyCode::Char('Y') => {
                        if let (Some(action), Some(workspace_id)) = (
                            state.confirm_lifecycle_action(true),
                            state.selected_workspace_id().map(str::to_owned),
                        ) {
                            send(
                                &mut writer,
                                &RendererEvent::LifecycleAction {
                                    workspace_id,
                                    action,
                                },
                            )?;
                        }
                    }
                    KeyCode::Char('n') | KeyCode::Char('N') | KeyCode::Esc => {
                        state.confirm_lifecycle_action(false);
                    }
                    _ => {}
                }
            }
            Event::Key(key)
                if key.kind == KeyEventKind::Press
                    && state.pending_delivery_confirmation.is_some() =>
            {
                match key.code {
                    KeyCode::Char('y') | KeyCode::Char('Y') => {
                        if let Some(submission) = state.confirm_delivery_action(true) {
                            send_delivery(&mut writer, &state, submission)?;
                        }
                    }
                    KeyCode::Char('n') | KeyCode::Char('N') | KeyCode::Esc => {
                        state.confirm_delivery_action(false);
                    }
                    _ => {}
                }
            }
            Event::Key(key) if key.kind == KeyEventKind::Press && state.delivery_form.is_some() => {
                match key.code {
                    KeyCode::Esc => state.close_delivery_surface(),
                    KeyCode::Tab => state.delivery_form_next_field(),
                    KeyCode::BackTab => state.delivery_form_previous_field(),
                    KeyCode::Left => state.delivery_form_cycle_choice(-1),
                    KeyCode::Right => state.delivery_form_cycle_choice(1),
                    KeyCode::Backspace => state.delivery_form_backspace(),
                    KeyCode::Enter => {
                        if let DeliveryDecision::Dispatch(submission) = state.submit_delivery_form()
                        {
                            send_delivery(&mut writer, &state, submission)?;
                        }
                    }
                    KeyCode::Char(character) => state.delivery_form_insert(character),
                    _ => {}
                }
            }
            Event::Key(key) if key.kind == KeyEventKind::Press && state.delivery_menu_open => {
                match key.code {
                    KeyCode::Esc => state.close_delivery_surface(),
                    KeyCode::Up | KeyCode::Char('k') => state.move_delivery_selection(-1),
                    KeyCode::Down | KeyCode::Char('j') => state.move_delivery_selection(1),
                    KeyCode::Enter => {
                        state.activate_selected_delivery_action();
                    }
                    _ => {}
                }
            }
            Event::Key(key) if key.kind == KeyEventKind::Press && state.action_menu_open => {
                match key.code {
                    KeyCode::Esc => state.close_action_menu(),
                    KeyCode::Up | KeyCode::Char('k') => state.move_action_selection(-1),
                    KeyCode::Down | KeyCode::Char('j') => state.move_action_selection(1),
                    KeyCode::Enter => {
                        if let ActionDecision::Dispatch(action) = state.activate_selected_action()
                            && let Some(workspace_id) =
                                state.selected_workspace_id().map(str::to_owned)
                        {
                            send(
                                &mut writer,
                                &RendererEvent::LifecycleAction {
                                    workspace_id,
                                    action,
                                },
                            )?;
                        }
                    }
                    _ => {}
                }
            }
            Event::Key(key) if key.kind == KeyEventKind::Press => match key.code {
                KeyCode::Char('q') => {
                    send(&mut writer, &RendererEvent::Quit)?;
                    running = false;
                }
                KeyCode::Char('r') => send(
                    &mut writer,
                    &RendererEvent::Refresh {
                        workspace_id: state.selected_workspace_id().map(str::to_owned),
                    },
                )?,
                KeyCode::Char('R') => send(&mut writer, &RendererEvent::TerminalReconnect)?,
                KeyCode::Char('f') => state.toggle_focus_mode(),
                KeyCode::Char('a') => {
                    state.open_action_menu();
                }
                KeyCode::Char('d') => {
                    state.open_delivery_menu();
                }
                KeyCode::Up | KeyCode::Char('k') => {
                    if let Some(workspace_id) = state.move_selection(-1) {
                        send(
                            &mut writer,
                            &RendererEvent::Select {
                                workspace_id: workspace_id.clone(),
                            },
                        )?;
                        last_selected = Some(workspace_id);
                    }
                }
                KeyCode::Down | KeyCode::Char('j') => {
                    if let Some(workspace_id) = state.move_selection(1) {
                        send(
                            &mut writer,
                            &RendererEvent::Select {
                                workspace_id: workspace_id.clone(),
                            },
                        )?;
                        last_selected = Some(workspace_id);
                    }
                }
                KeyCode::Enter => {
                    if state.session_id.is_some() {
                        state.agent_focused = true;
                    } else if let (Some(workspace_id), Some(runtime_id)) = (
                        state.selected_workspace_id().map(str::to_owned),
                        state.selected_runtime_id().map(str::to_owned),
                    ) {
                        send(
                            &mut writer,
                            &RendererEvent::Attach {
                                workspace_id,
                                runtime_id,
                            },
                        )?;
                    }
                }
                _ => {}
            },
            _ => {}
        }
    }

    let _ = send(&mut writer, &RendererEvent::Detach);
    terminal.show_cursor().ok();
    Ok(())
}
