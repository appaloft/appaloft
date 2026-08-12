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
use serde_json::Value;

use super::TerminalRestore;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
enum OperateAction {
    Retry {
        resource_id: String,
        deployment_id: String,
    },
    Redeploy {
        resource_id: String,
        deployment_id: String,
    },
    Rollback {
        resource_id: String,
        deployment_id: String,
        candidate_deployment_id: String,
    },
    BackupCreate {
        resource_id: String,
        storage_volume_id: String,
        policy_id: String,
    },
    RestoreIndependent {
        resource_id: String,
        backup_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        restored_volume_name: Option<String>,
    },
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct OperateConfirmation {
    token: String,
    action: OperateAction,
    readiness_generated_at: String,
    consequence: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(
    tag = "type",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
enum OperateMessage {
    OperateResources {
        protocol: String,
        resources: Vec<Value>,
        #[serde(default)]
        selected_resource_id: Option<String>,
    },
    OperateSnapshot {
        snapshot: Value,
    },
    OperateConfirmation {
        confirmation: OperateConfirmation,
    },
    OperateActionResult {
        action: OperateAction,
        result: Value,
    },
    OperateError {
        error: Value,
    },
    Shutdown,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(
    tag = "type",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
enum OperateEvent {
    OperateSelect {
        resource_id: String,
    },
    OperateRefresh,
    OperatePreviewAction {
        action: OperateAction,
    },
    OperateConfirmAction {
        token: String,
        action: OperateAction,
    },
    OperateQuit,
}

#[derive(Default)]
struct OperateState {
    resources: Vec<Value>,
    selected: usize,
    snapshot: Option<Value>,
    confirmation: Option<OperateConfirmation>,
    status_line: String,
}

impl OperateState {
    fn apply(&mut self, message: OperateMessage) -> bool {
        match message {
            OperateMessage::OperateResources {
                protocol,
                resources,
                selected_resource_id,
            } => {
                if protocol != "operate/v1" {
                    self.status_line = format!("Unsupported protocol {protocol}");
                    return true;
                }
                self.resources = resources;
                self.selected = selected_resource_id
                    .as_deref()
                    .and_then(|selected| {
                        self.resources
                            .iter()
                            .position(|resource| string_at(resource, "/id") == Some(selected))
                    })
                    .unwrap_or(0);
                self.status_line = if self.resources.is_empty() {
                    "No Resources are visible".to_owned()
                } else {
                    "Select a Resource or inspect current evidence".to_owned()
                };
            }
            OperateMessage::OperateSnapshot { snapshot } => {
                if let Some(resource_id) = string_at(&snapshot, "/target/resourceId")
                    && let Some(index) = self
                        .resources
                        .iter()
                        .position(|resource| string_at(resource, "/id") == Some(resource_id))
                {
                    self.selected = index;
                }
                self.snapshot = Some(snapshot);
                self.confirmation = None;
                self.status_line = "Evidence refreshed".to_owned();
            }
            OperateMessage::OperateConfirmation { confirmation } => {
                self.status_line = format!(
                    "Confirm once more: {} (readiness {})",
                    confirmation.consequence, confirmation.readiness_generated_at
                );
                self.confirmation = Some(confirmation);
            }
            OperateMessage::OperateActionResult { action, result } => {
                self.confirmation = None;
                self.status_line = format!(
                    "{} accepted: {}",
                    action.label(),
                    compact_json(&result, 180)
                );
            }
            OperateMessage::OperateError { error } => {
                self.confirmation = None;
                self.status_line = compact_json(&error, 240);
            }
            OperateMessage::Shutdown => return false,
        }
        true
    }

    fn selected_resource_id(&self) -> Option<&str> {
        self.resources
            .get(self.selected)
            .and_then(|resource| string_at(resource, "/id"))
    }

    fn select_next(&mut self) {
        if !self.resources.is_empty() {
            self.selected = (self.selected + 1) % self.resources.len();
        }
    }

    fn select_previous(&mut self) {
        if !self.resources.is_empty() {
            self.selected = self
                .selected
                .checked_sub(1)
                .unwrap_or(self.resources.len() - 1);
        }
    }

    fn confirm_event(&mut self) -> Option<OperateEvent> {
        self.confirmation
            .take()
            .map(|confirmation| OperateEvent::OperateConfirmAction {
                token: confirmation.token,
                action: confirmation.action,
            })
    }

    fn cancel_confirmation(&mut self) {
        if self.confirmation.take().is_some() {
            self.status_line = "Confirmation cancelled".to_owned();
        }
    }

    fn action(&self, kind: ActionKey) -> Option<OperateAction> {
        let snapshot = self.snapshot.as_ref()?;
        let resource_id = string_at(snapshot, "/target/resourceId")?.to_owned();
        match kind {
            ActionKey::Retry | ActionKey::Redeploy => {
                let deployment_id = string_at(snapshot, "/target/deploymentId")?.to_owned();
                Some(if kind == ActionKey::Retry {
                    OperateAction::Retry {
                        resource_id,
                        deployment_id,
                    }
                } else {
                    OperateAction::Redeploy {
                        resource_id,
                        deployment_id,
                    }
                })
            }
            ActionKey::Rollback => Some(OperateAction::Rollback {
                resource_id,
                deployment_id: string_at(snapshot, "/target/deploymentId")?.to_owned(),
                candidate_deployment_id: find_string_key(snapshot, "recommendedCandidateId")
                    .or_else(|| find_string_key(snapshot, "candidateDeploymentId"))?
                    .to_owned(),
            }),
            ActionKey::Backup => {
                let storage = snapshot.pointer("/sections/storage/value")?;
                let volume = storage.pointer("/volumes/0")?;
                let storage_volume_id = string_at(volume, "/id")?.to_owned();
                let policy_id = storage
                    .get("policies")?
                    .get(&storage_volume_id)?
                    .get(0)
                    .and_then(|policy| string_at(policy, "/id"))?
                    .to_owned();
                Some(OperateAction::BackupCreate {
                    resource_id,
                    storage_volume_id,
                    policy_id,
                })
            }
            ActionKey::Restore => {
                let storage = snapshot.pointer("/sections/storage/value")?;
                let backup_id = storage
                    .get("backups")?
                    .as_object()?
                    .values()
                    .find_map(|backups| backups.get(0))
                    .and_then(|backup| string_at(backup, "/id"))?
                    .to_owned();
                Some(OperateAction::RestoreIndependent {
                    resource_id,
                    backup_id,
                    restored_volume_name: None,
                })
            }
        }
    }
}

impl OperateAction {
    fn label(&self) -> &'static str {
        match self {
            Self::Retry { .. } => "retry",
            Self::Redeploy { .. } => "redeploy",
            Self::Rollback { .. } => "rollback",
            Self::BackupCreate { .. } => "backup-create",
            Self::RestoreIndependent { .. } => "restore-independent",
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ActionKey {
    Retry,
    Redeploy,
    Rollback,
    Backup,
    Restore,
}

fn string_at<'a>(value: &'a Value, pointer: &str) -> Option<&'a str> {
    value.pointer(pointer)?.as_str()
}

fn find_string_key<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    match value {
        Value::Object(object) => object.get(key).and_then(Value::as_str).or_else(|| {
            object
                .values()
                .find_map(|value| find_string_key(value, key))
        }),
        Value::Array(array) => array.iter().find_map(|value| find_string_key(value, key)),
        _ => None,
    }
}

fn compact_json(value: &Value, max_chars: usize) -> String {
    let mut output = serde_json::to_string(value).unwrap_or_else(|_| "unavailable".to_owned());
    if output.chars().count() > max_chars {
        output = output.chars().take(max_chars.saturating_sub(1)).collect();
        output.push('…');
    }
    output
}

fn string_signals(value: &Value, signals: &mut Vec<String>) {
    match value {
        Value::String(value) if !signals.contains(value) => signals.push(value.clone()),
        Value::Object(object) => {
            for value in object.values() {
                string_signals(value, signals);
            }
        }
        Value::Array(array) => {
            for value in array {
                string_signals(value, signals);
            }
        }
        _ => {}
    }
}

fn evidence_line(name: &str, section: &Value) -> String {
    let mut signals = Vec::new();
    string_signals(section, &mut signals);
    let signals = signals.into_iter().take(3).collect::<Vec<_>>().join(" | ");
    format!("{name:13} {signals}  {}", compact_json(section, 240))
}

fn resource_label(resource: &Value) -> String {
    let id = string_at(resource, "/id").unwrap_or("unknown");
    let name = string_at(resource, "/name").unwrap_or("unnamed");
    format!("{name}  {id}")
}

fn render(frame: &mut ratatui::Frame<'_>, state: &OperateState) {
    let vertical = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(4),
            Constraint::Min(8),
            Constraint::Length(2),
        ])
        .split(frame.area());

    let target = state
        .snapshot
        .as_ref()
        .and_then(|snapshot| snapshot.get("target"))
        .map(|target| compact_json(target, 260))
        .unwrap_or_else(|| "Choose a Resource to begin".to_owned());
    frame.render_widget(
        Paragraph::new(format!("{target}\nRead-only evidence by default; mutations require preview + exact confirmation"))
            .block(Block::default().title(" Appaloft Operate ").borders(Borders::ALL))
            .wrap(Wrap { trim: false }),
        vertical[0],
    );

    let columns = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(28), Constraint::Percentage(72)])
        .split(vertical[1]);
    let resources = state
        .resources
        .iter()
        .enumerate()
        .map(|(index, resource)| {
            let marker = if index == state.selected {
                "› "
            } else {
                "  "
            };
            let style = if index == state.selected {
                Style::default()
                    .fg(Color::Cyan)
                    .add_modifier(Modifier::BOLD)
            } else {
                Style::default()
            };
            ListItem::new(Line::from(vec![
                Span::styled(marker, style),
                Span::styled(resource_label(resource), style),
            ]))
        })
        .collect::<Vec<_>>();
    frame.render_widget(
        List::new(resources).block(Block::default().title(" Resources ").borders(Borders::ALL)),
        columns[0],
    );

    let evidence = state
        .snapshot
        .as_ref()
        .map(|snapshot| {
            let resource = snapshot.get("resource").cloned().unwrap_or(Value::Null);
            let sections = snapshot.get("sections").cloned().unwrap_or(Value::Null);
            let mut lines = vec![format!("RESOURCE  {}", compact_json(&resource, 220))];
            if let Some(sections) = sections.as_object() {
                lines.extend(
                    sections
                        .iter()
                        .map(|(name, section)| evidence_line(name, section)),
                );
            }
            lines.join("\n")
        })
        .unwrap_or_else(|| "Waiting for an Operate snapshot…".to_owned());
    frame.render_widget(
        Paragraph::new(evidence)
            .block(
                Block::default()
                    .title(" Evidence & Recovery ")
                    .borders(Borders::ALL),
            )
            .wrap(Wrap { trim: false }),
        columns[1],
    );

    let confirmation = if state.confirmation.is_some() {
        " ENTER confirm  ESC cancel "
    } else {
        ""
    };
    frame.render_widget(
        Paragraph::new(format!(
            " ↑↓ target  Enter select  R refresh  t retry  d redeploy  b rollback  B backup  x restore  q quit │{confirmation}│ {}",
            state.status_line
        ))
        .style(Style::default().fg(Color::DarkGray))
        .wrap(Wrap { trim: false }),
        vertical[2],
    );
}

fn send(stream: &mut TcpStream, event: OperateEvent) -> Result<()> {
    serde_json::to_writer(&mut *stream, &event).context("encode Operate renderer event")?;
    stream
        .write_all(b"\n")
        .context("write Operate renderer event")?;
    stream.flush().context("flush Operate renderer event")
}

pub fn run(mut writer: TcpStream, reader: BufReader<TcpStream>) -> Result<()> {
    let _restore = TerminalRestore::enter()?;
    let backend = CrosstermBackend::new(std::io::stdout());
    let mut terminal = Terminal::new(backend).context("create Operate Ratatui terminal")?;
    terminal.clear().context("clear Operate TUI surface")?;

    let (message_tx, message_rx) = mpsc::channel::<OperateMessage>();
    std::thread::spawn(move || {
        for line in reader.lines() {
            let Ok(line) = line else { break };
            let Ok(message) = serde_json::from_str::<OperateMessage>(&line) else {
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
            .context("register Operate terminal restore signal")?;
    }

    let mut state = OperateState {
        status_line: "Connected".to_owned(),
        ..OperateState::default()
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
            .context("render Operate TUI")?;
        if !poll(Duration::from_millis(50)).context("poll Operate terminal input")? {
            continue;
        }
        if let Event::Key(key) = read().context("read Operate terminal input")?
            && key.kind == KeyEventKind::Press
        {
            let event = match key.code {
                KeyCode::Char('q') => {
                    running = false;
                    Some(OperateEvent::OperateQuit)
                }
                KeyCode::Up => {
                    state.select_previous();
                    None
                }
                KeyCode::Down => {
                    state.select_next();
                    None
                }
                KeyCode::Enter => state.confirm_event().or_else(|| {
                    state
                        .selected_resource_id()
                        .map(|resource_id| OperateEvent::OperateSelect {
                            resource_id: resource_id.to_owned(),
                        })
                }),
                KeyCode::Esc => {
                    state.cancel_confirmation();
                    None
                }
                KeyCode::Char('R') => Some(OperateEvent::OperateRefresh),
                KeyCode::Char('t') => state
                    .action(ActionKey::Retry)
                    .map(|action| OperateEvent::OperatePreviewAction { action }),
                KeyCode::Char('d') => state
                    .action(ActionKey::Redeploy)
                    .map(|action| OperateEvent::OperatePreviewAction { action }),
                KeyCode::Char('b') => state
                    .action(ActionKey::Rollback)
                    .map(|action| OperateEvent::OperatePreviewAction { action }),
                KeyCode::Char('B') => state
                    .action(ActionKey::Backup)
                    .map(|action| OperateEvent::OperatePreviewAction { action }),
                KeyCode::Char('x') => state
                    .action(ActionKey::Restore)
                    .map(|action| OperateEvent::OperatePreviewAction { action }),
                _ => None,
            };
            if let Some(event) = event {
                send(&mut writer, event)?;
            }
        }
    }
    if stop.load(Ordering::Relaxed) {
        let _ = send(&mut writer, OperateEvent::OperateQuit);
    }
    terminal.show_cursor().ok();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn operate_state_selects_targets_and_requires_second_exact_confirmation() {
        let mut state = OperateState::default();
        state.apply(OperateMessage::OperateResources {
            protocol: "operate/v1".to_owned(),
            resources: vec![
                serde_json::json!({"id":"res_api","name":"api"}),
                serde_json::json!({"id":"res_web","name":"web"}),
            ],
            selected_resource_id: None,
        });
        assert_eq!(state.selected_resource_id(), Some("res_api"));
        state.select_next();
        assert_eq!(state.selected_resource_id(), Some("res_web"));

        let action = OperateAction::Rollback {
            resource_id: "res_web".to_owned(),
            deployment_id: "dep_bad".to_owned(),
            candidate_deployment_id: "dep_good".to_owned(),
        };
        state.apply(OperateMessage::OperateConfirmation {
            confirmation: OperateConfirmation {
                token: "confirm_1".to_owned(),
                action: action.clone(),
                readiness_generated_at: "2026-08-13T00:00:00.000Z".to_owned(),
                consequence: "Create rollback attempt; data is not restored".to_owned(),
            },
        });
        assert_eq!(
            state.confirm_event(),
            Some(OperateEvent::OperateConfirmAction {
                token: "confirm_1".to_owned(),
                action,
            })
        );
        assert!(state.confirm_event().is_none());
    }

    #[test]
    fn operate_render_is_bounded_and_exposes_recovery_sections() {
        let mut state = OperateState::default();
        state.apply(OperateMessage::OperateSnapshot {
            snapshot: serde_json::json!({
                "protocol":"operate/v1",
                "observedAt":"2026-08-13T00:00:00.000Z",
                "target":{"resourceId":"res_api","deploymentId":"dep_bad"},
                "resource":{"resource":{"name":"api","lastDeploymentStatus":"failed"}},
                "sections":{
                    "health":{"availability":"unavailable","error":{"code":"resource_health_unavailable"}},
                    "logs":{"availability":"available","value":{"lines":[{"message":"boot failed"}]}},
                    "recovery":{"availability":"available","value":{"rollbackReady":true}}
                }
            }),
        });
        let backend = ratatui::backend::TestBackend::new(120, 32);
        let mut terminal = ratatui::Terminal::new(backend).expect("test terminal");
        terminal
            .draw(|frame| render(frame, &state))
            .expect("draw Operate TUI");
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
        assert!(rendered.contains("Appaloft Operate"));
        assert!(rendered.contains("res_api"));
        assert!(rendered.contains("resource_health_unavailable"));
        assert!(rendered.contains("boot failed"));
        assert!(rendered.contains("rollbackReady"));
    }
}
