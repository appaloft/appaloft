use std::io::{BufRead, BufReader, Write};
use std::net::TcpStream;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::time::Duration;

use anyhow::{Context, Result};
use crossterm::event::{Event, KeyCode, KeyEventKind, poll, read};
use ratatui::Terminal;
use ratatui::backend::CrosstermBackend;
use ratatui::layout::{Constraint, Direction, Layout};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, List, ListItem, Paragraph, Wrap};
use serde::{Deserialize, Serialize};

use super::TerminalRestore;

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DevelopmentService {
    pub key: String,
    pub state: String,
    #[serde(default)]
    pub pid: Option<u32>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub readiness: Option<String>,
    #[serde(default)]
    pub watch: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DevelopmentSession {
    pub state: String,
    #[serde(default)]
    pub session_id: Option<String>,
    pub source_root: String,
    #[serde(default)]
    pub gateway_url: Option<String>,
    #[serde(default)]
    pub services: Vec<DevelopmentService>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "kebab-case")]
enum DevelopmentMessage {
    Development {
        protocol: String,
        session: DevelopmentSession,
    },
    DevelopmentLogs {
        lines: Vec<String>,
    },
    Error {
        code: String,
        phase: String,
        retryable: bool,
    },
    Shutdown,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "kebab-case")]
enum DevelopmentEvent {
    DevelopmentRefresh,
    DevelopmentRestart,
    DevelopmentStop,
    DevelopmentDetach,
}

#[derive(Default)]
struct DevelopmentState {
    session: Option<DevelopmentSession>,
    logs: Vec<String>,
    status_line: String,
}

impl DevelopmentState {
    fn apply(&mut self, message: DevelopmentMessage) -> bool {
        match message {
            DevelopmentMessage::Development { protocol, session } => {
                if protocol != "development/v1" {
                    self.status_line = format!("Unsupported protocol {protocol}");
                } else {
                    self.status_line = format!("Development Session {}", session.state);
                    self.session = Some(session);
                }
                true
            }
            DevelopmentMessage::DevelopmentLogs { lines } => {
                self.logs = lines.into_iter().rev().take(2_000).collect::<Vec<_>>();
                self.logs.reverse();
                true
            }
            DevelopmentMessage::Error {
                code,
                phase,
                retryable,
            } => {
                self.status_line = format!(
                    "{code} at {phase}{}",
                    if retryable {
                        " — retry available"
                    } else {
                        ""
                    }
                );
                true
            }
            DevelopmentMessage::Shutdown => false,
        }
    }
}

fn send(stream: &mut TcpStream, event: DevelopmentEvent) -> Result<()> {
    serde_json::to_writer(&mut *stream, &event).context("encode Development renderer event")?;
    stream
        .write_all(b"\n")
        .context("write Development renderer event")?;
    stream.flush().context("flush Development renderer event")
}

fn render(frame: &mut ratatui::Frame<'_>, state: &DevelopmentState) {
    let area = frame.area();
    let vertical = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(4),
            Constraint::Min(6),
            Constraint::Length(1),
        ])
        .split(area);
    let session = state.session.as_ref();
    let header = session
        .map(|session| {
            format!(
                "{}\n{}\n{}",
                session.source_root,
                session.session_id.as_deref().unwrap_or("session pending"),
                session.gateway_url.as_deref().unwrap_or("no gateway")
            )
        })
        .unwrap_or_else(|| "Waiting for Development Session…".to_owned());
    frame.render_widget(
        Paragraph::new(header)
            .block(
                Block::default()
                    .title(" Appaloft Development ")
                    .borders(Borders::ALL),
            )
            .wrap(Wrap { trim: false }),
        vertical[0],
    );

    let columns = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(38), Constraint::Percentage(62)])
        .split(vertical[1]);
    let services = session
        .map(|session| {
            session
                .services
                .iter()
                .map(|service| {
                    ListItem::new(Line::from(vec![
                        Span::styled(
                            service.key.clone(),
                            Style::default()
                                .fg(Color::Cyan)
                                .add_modifier(Modifier::BOLD),
                        ),
                        Span::raw(format!(
                            "  {}  {}  watch:{}\n{}",
                            service.state,
                            service.readiness.as_deref().unwrap_or("unknown"),
                            service.watch.as_deref().unwrap_or("unknown"),
                            service.url.as_deref().unwrap_or("no route")
                        )),
                    ]))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    frame.render_widget(
        List::new(services).block(Block::default().title(" Services ").borders(Borders::ALL)),
        columns[0],
    );
    let visible_log_count = columns[1].height.saturating_sub(2) as usize;
    let start = state.logs.len().saturating_sub(visible_log_count);
    frame.render_widget(
        Paragraph::new(state.logs[start..].join("\n"))
            .block(Block::default().title(" Logs ").borders(Borders::ALL))
            .wrap(Wrap { trim: false }),
        columns[1],
    );
    frame.render_widget(
        Paragraph::new(format!(
            " q detach  │  s stop  │  r restart  │  R refresh  │  {} ",
            state.status_line
        ))
        .style(Style::default().fg(Color::DarkGray)),
        vertical[2],
    );
}

pub fn run(mut writer: TcpStream, reader: BufReader<TcpStream>) -> Result<()> {
    let _restore = TerminalRestore::enter()?;
    let backend = CrosstermBackend::new(std::io::stdout());
    let mut terminal = Terminal::new(backend).context("create Development Ratatui terminal")?;
    terminal.clear().context("clear Development TUI surface")?;

    let (message_tx, message_rx) = mpsc::channel::<DevelopmentMessage>();
    std::thread::spawn(move || {
        for line in reader.lines() {
            let Ok(line) = line else { break };
            let Ok(message) = serde_json::from_str::<DevelopmentMessage>(&line) else {
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
            .context("register Development terminal restore signal")?;
    }

    let mut state = DevelopmentState {
        status_line: "Connected".to_owned(),
        ..DevelopmentState::default()
    };
    let mut running = true;
    while running && !stop.load(Ordering::Relaxed) {
        for message in message_rx.try_iter() {
            if !state.apply(message) {
                running = false;
                break;
            }
        }
        terminal
            .draw(|frame| render(frame, &state))
            .context("render Development TUI")?;
        if !poll(Duration::from_millis(50)).context("poll Development terminal input")? {
            continue;
        }
        if let Event::Key(key) = read().context("read Development terminal input")?
            && key.kind == KeyEventKind::Press
        {
            match key.code {
                KeyCode::Char('q') => {
                    send(&mut writer, DevelopmentEvent::DevelopmentDetach)?;
                    running = false;
                }
                KeyCode::Char('s') => send(&mut writer, DevelopmentEvent::DevelopmentStop)?,
                KeyCode::Char('r') => send(&mut writer, DevelopmentEvent::DevelopmentRestart)?,
                KeyCode::Char('R') => send(&mut writer, DevelopmentEvent::DevelopmentRefresh)?,
                _ => {}
            }
        }
    }
    if stop.load(Ordering::Relaxed) {
        let _ = send(&mut writer, DevelopmentEvent::DevelopmentStop);
    }
    terminal.show_cursor().ok();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dev_tui_protocol_and_render_are_additive_and_bounded() {
        let mut state = DevelopmentState::default();
        assert!(state.apply(DevelopmentMessage::Development {
            protocol: "development/v1".to_owned(),
            session: DevelopmentSession {
                state: "running".to_owned(),
                session_id: Some("dev_1".to_owned()),
                source_root: "/workspace".to_owned(),
                gateway_url: Some("http://127.0.0.1:4310".to_owned()),
                services: vec![DevelopmentService {
                    key: "api".to_owned(),
                    state: "running".to_owned(),
                    pid: Some(123),
                    url: Some("http://api.localhost:4310".to_owned()),
                    readiness: Some("ready".to_owned()),
                    watch: Some("native".to_owned()),
                }],
            },
        }));
        assert!(state.apply(DevelopmentMessage::DevelopmentLogs {
            lines: (0..2_500).map(|index| format!("line-{index}")).collect(),
        }));
        assert_eq!(state.logs.len(), 2_000);

        let backend = ratatui::backend::TestBackend::new(110, 28);
        let mut terminal = ratatui::Terminal::new(backend).expect("test terminal");
        terminal
            .draw(|frame| render(frame, &state))
            .expect("draw Development TUI");
        let rendered =
            terminal
                .backend()
                .buffer()
                .content()
                .iter()
                .fold(String::new(), |mut output, cell| {
                    output.push_str(cell.symbol());
                    output
                });
        assert!(rendered.contains("Appaloft Development"));
        assert!(rendered.contains("api"));
        assert!(rendered.contains("ready"));
        assert!(rendered.contains("q detach"));
    }

    #[test]
    fn dev_tui_events_are_explicit() {
        assert_eq!(
            serde_json::to_string(&DevelopmentEvent::DevelopmentStop).unwrap(),
            r#"{"type":"development-stop"}"#
        );
    }
}
