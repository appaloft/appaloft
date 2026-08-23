use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use ratatui::Frame;
use ratatui::layout::{Alignment, Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, Paragraph};
use serde::{Deserialize, Serialize};

use crate::RendererEvent;

pub const OCCUPANCY_HOME_WORDMARK: &str = "APPALOFT";
pub const OCCUPANCY_HOME_TITLE: &str = "CLOUD AGENTS";
pub const OCCUPANCY_HOME_QUESTION: &str = "What should we build today?";
pub const OCCUPANCY_HOME_DEFAULT_VENDORS: &[&str] = &["grok", "codex", "claude", "opencode", "pi"];

const ACTIONS: [(&str, &str); 3] = [
    (
        "New Session",
        "Create a new session on a Cloud Agent in your default project",
    ),
    (
        "New Cloud Agent",
        "Create a new Cloud Agent in your default project",
    ),
    (
        "Manage Cloud Agents",
        "Manage Cloud Agents and Sessions across multiple projects",
    ),
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HomeFocus {
    Prompt,
    NewSession,
    NewAgent,
    Manage,
}

impl HomeFocus {
    fn index(self) -> usize {
        match self {
            Self::Prompt => 0,
            Self::NewSession => 1,
            Self::NewAgent => 2,
            Self::Manage => 3,
        }
    }

    fn from_index(index: usize) -> Self {
        match index % 4 {
            1 => Self::NewSession,
            2 => Self::NewAgent,
            3 => Self::Manage,
            _ => Self::Prompt,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeTarget {
    pub project_id: String,
    pub name: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HomeState {
    pub visible: bool,
    pub prompt: String,
    pub focus: HomeFocus,
    pub vendors: Vec<String>,
    pub vendor_index: usize,
    pub targets: Vec<HomeTarget>,
    pub target_index: usize,
    pub error: Option<String>,
}

impl Default for HomeState {
    fn default() -> Self {
        Self {
            visible: false,
            prompt: String::new(),
            focus: HomeFocus::Prompt,
            vendors: OCCUPANCY_HOME_DEFAULT_VENDORS
                .iter()
                .map(|vendor| (*vendor).to_owned())
                .collect(),
            vendor_index: 0,
            targets: Vec::new(),
            target_index: 0,
            error: None,
        }
    }
}

impl HomeState {
    pub fn selected_vendor(&self) -> String {
        self.vendors
            .get(self.vendor_index)
            .cloned()
            .unwrap_or_else(|| "grok".to_owned())
    }

    pub fn selected_target(&self) -> Option<&HomeTarget> {
        self.targets.get(self.target_index)
    }

    pub fn target_label(&self) -> String {
        self.selected_target()
            .map(|target| target.name.clone())
            .filter(|name| !name.trim().is_empty())
            .unwrap_or_else(|| "this folder".to_owned())
    }

    pub fn insert(&mut self, character: char) {
        if !character.is_control() {
            self.prompt.push(character);
            self.focus = HomeFocus::Prompt;
            self.error = None;
        }
    }

    pub fn backspace(&mut self) {
        self.prompt.pop();
        self.focus = HomeFocus::Prompt;
    }

    pub fn move_focus(&mut self, delta: isize) {
        let next = self.focus.index() as isize + delta;
        self.focus = HomeFocus::from_index(next.rem_euclid(4) as usize);
    }

    pub fn cycle_vendor(&mut self, delta: isize) {
        if self.vendors.is_empty() {
            return;
        }
        let next = self.vendor_index as isize + delta;
        self.vendor_index = next.rem_euclid(self.vendors.len() as isize) as usize;
    }

    pub fn cycle_target(&mut self, delta: isize) {
        if self.targets.is_empty() {
            return;
        }
        let next = self.target_index as isize + delta;
        self.target_index = next.rem_euclid(self.targets.len() as isize) as usize;
    }

    pub fn apply_targets(&mut self, targets: Vec<HomeTarget>) {
        let selected_id = self
            .selected_target()
            .map(|target| target.project_id.clone());
        self.targets = targets;
        self.target_index = selected_id
            .and_then(|id| {
                self.targets
                    .iter()
                    .position(|target| target.project_id == id)
            })
            .unwrap_or(0)
            .min(self.targets.len().saturating_sub(1));
    }

    pub fn apply_vendors(&mut self, vendors: Vec<String>, selected: Option<&str>) {
        if vendors.is_empty() {
            return;
        }
        let preferred = selected
            .map(str::to_owned)
            .unwrap_or_else(|| self.selected_vendor());
        self.vendors = vendors;
        self.vendor_index = self
            .vendors
            .iter()
            .position(|vendor| vendor.eq_ignore_ascii_case(&preferred))
            .unwrap_or(0);
    }

    pub fn activate(&mut self) -> HomeDecision {
        let project_id = self
            .selected_target()
            .map(|target| target.project_id.trim())
            .filter(|value| !value.is_empty())
            .map(str::to_owned);
        match self.focus {
            HomeFocus::Manage => {
                self.visible = false;
                HomeDecision::Manage
            }
            HomeFocus::NewAgent => HomeDecision::Launch {
                prompt: nonempty_prompt(&self.prompt),
                vendor: self.selected_vendor(),
                project_id,
                force_new: true,
            },
            HomeFocus::NewSession | HomeFocus::Prompt => HomeDecision::Launch {
                prompt: nonempty_prompt(&self.prompt),
                vendor: self.selected_vendor(),
                project_id,
                force_new: false,
            },
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum HomeDecision {
    Launch {
        prompt: Option<String>,
        vendor: String,
        project_id: Option<String>,
        force_new: bool,
    },
    Manage,
    None,
}

impl HomeDecision {
    pub fn into_event(self) -> Option<RendererEvent> {
        match self {
            Self::Launch {
                prompt,
                vendor,
                project_id,
                force_new,
            } => Some(RendererEvent::Launch {
                prompt,
                vendor,
                project_id,
                force_new,
            }),
            Self::Manage | Self::None => None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OccupancyHomeKey {
    Activate,
    CycleVendor(isize),
    CycleTarget(isize),
    Move(isize),
    Backspace,
    Insert(char),
    Unhandled,
}

pub fn occupancy_home_key(key: KeyEvent) -> OccupancyHomeKey {
    let ctrl = key.modifiers.contains(KeyModifiers::CONTROL);
    let shift = key.modifiers.contains(KeyModifiers::SHIFT);
    if matches!(key.code, KeyCode::Enter) {
        return OccupancyHomeKey::Activate;
    }
    if matches!(key.code, KeyCode::BackTab) || (shift && matches!(key.code, KeyCode::Tab)) {
        return OccupancyHomeKey::CycleVendor(1);
    }
    if ctrl && matches!(key.code, KeyCode::Char(character) if character.eq_ignore_ascii_case(&'t'))
    {
        return OccupancyHomeKey::CycleTarget(1);
    }
    if matches!(key.code, KeyCode::Up) {
        return OccupancyHomeKey::Move(-1);
    }
    if matches!(key.code, KeyCode::Down) || matches!(key.code, KeyCode::Tab) {
        return OccupancyHomeKey::Move(1);
    }
    if matches!(key.code, KeyCode::Backspace) {
        return OccupancyHomeKey::Backspace;
    }
    if let KeyCode::Char(character) = key.code
        && !ctrl
        && !key.modifiers.contains(KeyModifiers::ALT)
        && !key.modifiers.contains(KeyModifiers::SUPER)
    {
        return OccupancyHomeKey::Insert(character);
    }
    OccupancyHomeKey::Unhandled
}

pub fn render_occupancy_home(frame: &mut Frame<'_>, state: &HomeState, area: Rect) {
    frame.render_widget(Clear, area);
    let sections = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),
            Constraint::Length(1),
            Constraint::Length(1),
            Constraint::Length(2),
            Constraint::Length(7),
            Constraint::Length(5),
            Constraint::Length(2),
            Constraint::Min(1),
        ])
        .split(area);
    frame.render_widget(
        Paragraph::new(Line::from(Span::styled(
            OCCUPANCY_HOME_WORDMARK,
            Style::default()
                .fg(Color::Rgb(167, 139, 250))
                .add_modifier(Modifier::BOLD),
        )))
        .alignment(Alignment::Center),
        sections[1],
    );
    frame.render_widget(
        Paragraph::new(Line::from(Span::styled(
            OCCUPANCY_HOME_TITLE,
            Style::default().fg(Color::DarkGray),
        )))
        .alignment(Alignment::Center),
        sections[2],
    );
    frame.render_widget(
        Paragraph::new(Line::from(Span::styled(
            OCCUPANCY_HOME_QUESTION,
            Style::default().fg(Color::DarkGray),
        )))
        .alignment(Alignment::Center),
        sections[3],
    );

    let prompt_border = if state.focus == HomeFocus::Prompt {
        Style::default().fg(Color::Rgb(167, 139, 250))
    } else {
        Style::default().fg(Color::DarkGray)
    };
    let prompt_body = if state.prompt.is_empty() {
        vec![
            Line::from(""),
            Line::from(""),
            Line::from(vec![
                Span::styled(
                    format!(" {} ", state.selected_vendor()),
                    Style::default()
                        .fg(Color::Rgb(167, 139, 250))
                        .add_modifier(Modifier::BOLD),
                ),
                Span::styled("shift+tab", Style::default().fg(Color::DarkGray)),
            ]),
        ]
    } else {
        vec![
            Line::from(Span::raw(format!(" {}", state.prompt))),
            Line::from(""),
            Line::from(vec![
                Span::styled(
                    format!(" {} ", state.selected_vendor()),
                    Style::default()
                        .fg(Color::Rgb(167, 139, 250))
                        .add_modifier(Modifier::BOLD),
                ),
                Span::styled("shift+tab", Style::default().fg(Color::DarkGray)),
            ]),
        ]
    };
    frame.render_widget(
        Paragraph::new(prompt_body).block(
            Block::default()
                .title(" Prompt ")
                .borders(Borders::ALL)
                .border_style(prompt_border),
        ),
        inset(sections[4], 10),
    );

    let action_lines: Vec<Line> = ACTIONS
        .iter()
        .enumerate()
        .map(|(index, (label, hint))| {
            let focused = match index {
                0 => state.focus == HomeFocus::NewSession,
                1 => state.focus == HomeFocus::NewAgent,
                _ => state.focus == HomeFocus::Manage,
            };
            let label_style = if focused {
                Style::default()
                    .fg(Color::Rgb(167, 139, 250))
                    .add_modifier(Modifier::BOLD)
            } else {
                Style::default().fg(Color::DarkGray)
            };
            Line::from(vec![
                Span::styled(format!("{label:<22}"), label_style),
                Span::styled(*hint, Style::default().fg(Color::Gray)),
            ])
        })
        .collect();
    frame.render_widget(Paragraph::new(action_lines), inset(sections[5], 8));

    let mut meta = vec![Line::from(vec![
        Span::styled(
            " ^t ",
            Style::default().bg(Color::DarkGray).fg(Color::White),
        ),
        Span::raw(" Target Project  "),
        Span::styled(
            state.target_label(),
            Style::default()
                .fg(Color::Rgb(167, 139, 250))
                .add_modifier(Modifier::BOLD),
        ),
    ])];
    if let Some(error) = &state.error {
        meta.push(Line::from(Span::styled(
            error.clone(),
            Style::default().fg(Color::Red),
        )));
    }
    frame.render_widget(
        Paragraph::new(meta).alignment(Alignment::Center),
        sections[6],
    );
}

pub fn home_footer(state: &HomeState) -> String {
    format!(
        " enter launch   shift+tab {}   ^t Target Project   ? settings ",
        state.selected_vendor()
    )
}

fn nonempty_prompt(prompt: &str) -> Option<String> {
    let trimmed = prompt.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_owned())
    }
}

fn inset(area: Rect, pad: u16) -> Rect {
    let gutter = pad.min(area.width / 5);
    Rect {
        x: area.x.saturating_add(gutter),
        y: area.y,
        width: area.width.saturating_sub(gutter.saturating_mul(2)),
        height: area.height,
    }
}
