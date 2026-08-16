use crossterm::event::{KeyCode, KeyEvent, KeyModifiers, MouseButton, MouseEvent, MouseEventKind};
use ratatui::Frame;
use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, List, ListItem, Paragraph, Wrap};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OccupancySummary {
    pub repository_identity: String,
    pub commit_sha: String,
    #[serde(default)]
    pub branch: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSummary {
    pub workspace_id: String,
    pub status: String,
    #[serde(default)]
    pub provider_key: Option<String>,
    #[serde(default)]
    pub source_kind: Option<String>,
    #[serde(default)]
    pub occupancy: Option<OccupancySummary>,
}

fn occupancy_list_label(workspace: &WorkspaceSummary) -> String {
    match &workspace.occupancy {
        Some(occupancy) => {
            let sha = occupancy.commit_sha.get(..7).unwrap_or(&occupancy.commit_sha);
            let repo = occupancy
                .repository_identity
                .strip_prefix("github.com/")
                .or_else(|| occupancy.repository_identity.strip_prefix("gitlab.com/"))
                .unwrap_or(&occupancy.repository_identity);
            format!("{repo}@{sha}")
        }
        None => workspace.workspace_id.clone(),
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AttachCapability {
    pub transport: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSummary {
    pub runtime_id: String,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub harness_template_id: Option<String>,
    #[serde(default)]
    pub attach: Option<AttachCapability>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PortSummary {
    pub exposure_id: String,
    pub port: u16,
    #[serde(default)]
    pub visibility: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub expires_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TaskSummary {
    pub task_run_id: String,
    #[serde(default)]
    pub runtime_id: Option<String>,
    pub status: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PromotionSummary {
    pub promotion_id: String,
    pub status: String,
    #[serde(default)]
    pub resource_id: Option<String>,
    #[serde(default)]
    pub deployment_id: Option<String>,
    #[serde(default)]
    pub proof: Option<DeploymentProofSummary>,
    #[serde(default)]
    pub expires_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentProofSummary {
    pub verdict: String,
    pub mismatch_count: usize,
    pub unavailable_evidence_count: usize,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SuspensionSummary {
    pub mode: String,
    pub portability: String,
    #[serde(default)]
    pub recovery_family: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotSummary {
    pub snapshot_id: String,
    pub capability: String,
    pub reason: String,
    pub portability: String,
    #[serde(default)]
    pub recovery_family: Option<String>,
    pub status: String,
    pub created_at: String,
    #[serde(default)]
    pub expires_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct CleanupSummary {
    pub state: String,
    pub active_runtime_count: usize,
    pub active_preview_count: usize,
    pub scope: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct RecoverySummary {
    #[serde(default)]
    pub requested_isolation: Option<String>,
    #[serde(default)]
    pub realized_isolation: Option<String>,
    #[serde(default)]
    pub provision_attempts: Option<usize>,
    #[serde(default)]
    pub suspension: Option<SuspensionSummary>,
    #[serde(default)]
    pub snapshots: Vec<SnapshotSummary>,
    #[serde(default)]
    pub cleanup: CleanupSummary,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActivationProjectSummary {
    pub project_id: String,
    pub disposition: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActivationRepositoryBindingSummary {
    pub binding_id: String,
    pub disposition: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActivationProfileSummary {
    pub profile_installation_id: String,
    pub disposition: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActivationSummary {
    pub project: ActivationProjectSummary,
    pub repository_binding: ActivationRepositoryBindingSummary,
    pub profile: ActivationProfileSummary,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TargetSelectionSummary {
    pub target_class: String,
    pub source: String,
    pub reason: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OccupancyPreviewChrome {
    pub url: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OccupancyDeploymentChrome {
    pub id: String,
    #[serde(default)]
    pub status: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DetailMessage {
    pub workspace: WorkspaceSummary,
    #[serde(default)]
    pub runtimes: Vec<RuntimeSummary>,
    #[serde(default)]
    pub ports: Vec<PortSummary>,
    #[serde(default)]
    pub tasks: Vec<TaskSummary>,
    #[serde(default)]
    pub promotions: Vec<PromotionSummary>,
    #[serde(default)]
    pub activation: Option<ActivationSummary>,
    #[serde(default)]
    pub target_selection: Option<TargetSelectionSummary>,
    #[serde(default)]
    pub preview: Option<OccupancyPreviewChrome>,
    #[serde(default)]
    pub deployment: Option<OccupancyDeploymentChrome>,
    #[serde(default)]
    pub recovery: RecoverySummary,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum LifecycleAction {
    Pause,
    Resume,
    Terminate,
}

impl LifecycleAction {
    pub fn label(self) -> &'static str {
        match self {
            Self::Pause => "Pause Workspace",
            Self::Resume => "Resume Workspace",
            Self::Terminate => "Terminate Workspace",
        }
    }
}

pub fn lifecycle_actions_for_status(status: &str) -> Vec<LifecycleAction> {
    match status {
        "ready" => vec![LifecycleAction::Pause, LifecycleAction::Terminate],
        "paused" => vec![LifecycleAction::Resume, LifecycleAction::Terminate],
        "requested" | "provisioning" | "pausing" | "resuming" | "failed" => {
            vec![LifecycleAction::Terminate]
        }
        _ => Vec::new(),
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ActionDecision {
    None,
    Dispatch(LifecycleAction),
    AwaitConfirmation,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RecoveryAction {
    CreateSnapshot,
    DeleteSnapshot { snapshot_id: String },
}

impl RecoveryAction {
    pub fn label(&self) -> String {
        match self {
            Self::CreateSnapshot => "Create Recovery Snapshot".to_owned(),
            Self::DeleteSnapshot { snapshot_id } => {
                format!("Delete Snapshot {snapshot_id}")
            }
        }
    }
}

pub fn recovery_actions_for_detail(detail: &DetailMessage) -> Vec<RecoveryAction> {
    let mut actions =
        if detail.workspace.status == "terminated" || detail.workspace.status == "expired" {
            Vec::new()
        } else {
            vec![RecoveryAction::CreateSnapshot]
        };
    actions.extend(
        detail
            .recovery
            .snapshots
            .iter()
            .filter(|snapshot| snapshot.status != "deleting" && snapshot.status != "deleted")
            .map(|snapshot| RecoveryAction::DeleteSnapshot {
                snapshot_id: snapshot.snapshot_id.clone(),
            }),
    );
    actions
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DeliveryAction {
    ExposePreview,
    RevokePreview { exposure_id: String, port: u16 },
    ApproveTask { task_run_id: String },
    DeliverTask { task_run_id: String },
    AcceptPromotion { promotion_id: String },
    RetryPromotion { promotion_id: String },
}

impl DeliveryAction {
    pub fn label(&self) -> String {
        match self {
            Self::ExposePreview => "Expose Preview".to_owned(),
            Self::RevokePreview { exposure_id, port } => {
                format!("Revoke Preview :{port} ({exposure_id})")
            }
            Self::ApproveTask { task_run_id } => format!("Approve Task {task_run_id}"),
            Self::DeliverTask { task_run_id } => format!("Deliver Task {task_run_id}"),
            Self::AcceptPromotion { promotion_id } => {
                format!("Accept Promotion {promotion_id}")
            }
            Self::RetryPromotion { promotion_id } => format!("Retry Promotion {promotion_id}"),
        }
    }
}

pub fn delivery_actions_for_detail(detail: &DetailMessage) -> Vec<DeliveryAction> {
    let mut actions = if detail.workspace.status == "ready" {
        vec![DeliveryAction::ExposePreview]
    } else {
        Vec::new()
    };
    actions.extend(
        detail
            .ports
            .iter()
            .map(|port| DeliveryAction::RevokePreview {
                exposure_id: port.exposure_id.clone(),
                port: port.port,
            }),
    );
    for task in &detail.tasks {
        if task.status == "awaiting-approval" {
            actions.push(DeliveryAction::ApproveTask {
                task_run_id: task.task_run_id.clone(),
            });
        } else if task.status == "approved" || task.status == "delivering" {
            actions.push(DeliveryAction::DeliverTask {
                task_run_id: task.task_run_id.clone(),
            });
        }
    }
    for promotion in &detail.promotions {
        if promotion.status == "planned" {
            actions.push(DeliveryAction::AcceptPromotion {
                promotion_id: promotion.promotion_id.clone(),
            });
        } else if promotion.status == "failed" || promotion.status == "needs-attention" {
            actions.push(DeliveryAction::RetryPromotion {
                promotion_id: promotion.promotion_id.clone(),
            });
        }
    }
    actions
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PreviewVisibility {
    Private,
    Organization,
    Public,
}

impl PreviewVisibility {
    fn label(self) -> &'static str {
        match self {
            Self::Private => "private",
            Self::Organization => "organization",
            Self::Public => "public",
        }
    }

    fn next(self, delta: isize) -> Self {
        let values = [Self::Private, Self::Organization, Self::Public];
        let index = values.iter().position(|value| *value == self).unwrap_or(0) as isize;
        values[(index + delta).rem_euclid(values.len() as isize) as usize]
    }
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestSubmission {
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DeliverySubmission {
    ExposePreview {
        port: u16,
        visibility: PreviewVisibility,
        ttl_minutes: u16,
    },
    RevokePreview {
        exposure_id: String,
    },
    ApproveTask {
        task_run_id: String,
    },
    DeliverTask {
        task_run_id: String,
        branch: String,
        commit_message: String,
        remote: String,
        pull_request: Option<PullRequestSubmission>,
    },
    AcceptPromotion {
        promotion_id: String,
    },
    RetryPromotion {
        promotion_id: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DeliveryDecision {
    None,
    FormOpened,
    AwaitConfirmation,
    Dispatch(DeliverySubmission),
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SnapshotCapability {
    Filesystem,
    FilesystemMemory,
}

impl SnapshotCapability {
    fn label(self) -> &'static str {
        match self {
            Self::Filesystem => "filesystem",
            Self::FilesystemMemory => "filesystem + memory",
        }
    }

    fn next(self, delta: isize) -> Self {
        let values = [Self::Filesystem, Self::FilesystemMemory];
        let index = values.iter().position(|value| *value == self).unwrap_or(0) as isize;
        values[(index + delta).rem_euclid(values.len() as isize) as usize]
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RecoveryForm {
    pub capability: SnapshotCapability,
    pub ttl_days: u8,
    pub field: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RecoverySubmission {
    CreateSnapshot {
        capability: SnapshotCapability,
        ttl_days: u8,
    },
    DeleteSnapshot {
        snapshot_id: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RecoveryDecision {
    None,
    FormOpened,
    AwaitConfirmation,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DeliveryForm {
    Preview {
        port: String,
        visibility: PreviewVisibility,
        ttl_minutes: u16,
        field: usize,
    },
    Task {
        task_run_id: String,
        values: [String; 6],
        field: usize,
    },
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum ParentMessage {
    HelloOk,
    Workspaces {
        workspaces: Vec<WorkspaceSummary>,
    },
    Detail {
        #[serde(flatten)]
        detail: DetailMessage,
    },
    TerminalReady {
        #[serde(rename = "workspaceId")]
        workspace_id: String,
        #[serde(rename = "runtimeId")]
        runtime_id: String,
        #[serde(rename = "sessionId")]
        session_id: String,
    },
    TerminalOutput {
        stream: String,
        data: String,
    },
    TerminalClosed {
        reason: String,
        #[serde(rename = "exitCode")]
        exit_code: Option<i32>,
    },
    DeliveryComplete {
        #[serde(rename = "workspaceId")]
        workspace_id: String,
    },
    RecoveryComplete {
        #[serde(rename = "workspaceId")]
        workspace_id: String,
    },
    Error {
        code: String,
        phase: String,
        retryable: bool,
    },
    Shutdown,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum RendererEvent {
    Hello {
        token: String,
    },
    Select {
        #[serde(rename = "workspaceId")]
        workspace_id: String,
    },
    Refresh {
        #[serde(rename = "workspaceId", skip_serializing_if = "Option::is_none")]
        workspace_id: Option<String>,
    },
    Attach {
        #[serde(rename = "workspaceId")]
        workspace_id: String,
        #[serde(rename = "runtimeId")]
        runtime_id: String,
    },
    LifecycleAction {
        #[serde(rename = "workspaceId")]
        workspace_id: String,
        action: LifecycleAction,
    },
    PreviewExpose {
        #[serde(rename = "workspaceId")]
        workspace_id: String,
        port: u16,
        visibility: PreviewVisibility,
        #[serde(rename = "ttlMinutes")]
        ttl_minutes: u16,
    },
    PreviewRevoke {
        #[serde(rename = "workspaceId")]
        workspace_id: String,
        #[serde(rename = "exposureId")]
        exposure_id: String,
    },
    TaskApprove {
        #[serde(rename = "workspaceId")]
        workspace_id: String,
        #[serde(rename = "taskRunId")]
        task_run_id: String,
    },
    TaskDeliver {
        #[serde(rename = "workspaceId")]
        workspace_id: String,
        #[serde(rename = "taskRunId")]
        task_run_id: String,
        branch: String,
        #[serde(rename = "commitMessage")]
        commit_message: String,
        remote: String,
        #[serde(rename = "pullRequest", skip_serializing_if = "Option::is_none")]
        pull_request: Option<PullRequestSubmission>,
    },
    PromotionAccept {
        #[serde(rename = "workspaceId")]
        workspace_id: String,
        #[serde(rename = "promotionId")]
        promotion_id: String,
    },
    PromotionRetry {
        #[serde(rename = "workspaceId")]
        workspace_id: String,
        #[serde(rename = "promotionId")]
        promotion_id: String,
    },
    SnapshotCreate {
        #[serde(rename = "workspaceId")]
        workspace_id: String,
        capability: SnapshotCapability,
        #[serde(rename = "ttlDays")]
        ttl_days: u8,
    },
    SnapshotDelete {
        #[serde(rename = "workspaceId")]
        workspace_id: String,
        #[serde(rename = "snapshotId")]
        snapshot_id: String,
    },
    TerminalInput {
        data: String,
    },
    TerminalResize {
        cols: u16,
        rows: u16,
    },
    TerminalReconnect,
    Detach,
    Quit,
}

impl RendererEvent {
    pub fn delivery(workspace_id: String, submission: DeliverySubmission) -> Self {
        match submission {
            DeliverySubmission::ExposePreview {
                port,
                visibility,
                ttl_minutes,
            } => Self::PreviewExpose {
                workspace_id,
                port,
                visibility,
                ttl_minutes,
            },
            DeliverySubmission::RevokePreview { exposure_id } => Self::PreviewRevoke {
                workspace_id,
                exposure_id,
            },
            DeliverySubmission::ApproveTask { task_run_id } => Self::TaskApprove {
                workspace_id,
                task_run_id,
            },
            DeliverySubmission::DeliverTask {
                task_run_id,
                branch,
                commit_message,
                remote,
                pull_request,
            } => Self::TaskDeliver {
                workspace_id,
                task_run_id,
                branch,
                commit_message,
                remote,
                pull_request,
            },
            DeliverySubmission::AcceptPromotion { promotion_id } => Self::PromotionAccept {
                workspace_id,
                promotion_id,
            },
            DeliverySubmission::RetryPromotion { promotion_id } => Self::PromotionRetry {
                workspace_id,
                promotion_id,
            },
        }
    }

    pub fn recovery(workspace_id: String, submission: RecoverySubmission) -> Self {
        match submission {
            RecoverySubmission::CreateSnapshot {
                capability,
                ttl_days,
            } => Self::SnapshotCreate {
                workspace_id,
                capability,
                ttl_days,
            },
            RecoverySubmission::DeleteSnapshot { snapshot_id } => Self::SnapshotDelete {
                workspace_id,
                snapshot_id,
            },
        }
    }
}

pub struct AppState {
    pub workspaces: Vec<WorkspaceSummary>,
    pub selected: usize,
    pub detail: Option<DetailMessage>,
    pub agent_focused: bool,
    pub focus_mode: bool,
    pub session_id: Option<String>,
    pub runtime_id: Option<String>,
    pub action_menu_open: bool,
    pub action_selected: usize,
    pub pending_confirmation: Option<LifecycleAction>,
    pub action_busy: bool,
    pub delivery_menu_open: bool,
    pub delivery_selected: usize,
    pub delivery_form: Option<DeliveryForm>,
    pub pending_delivery_confirmation: Option<DeliverySubmission>,
    pub delivery_busy: bool,
    pub recovery_menu_open: bool,
    pub recovery_selected: usize,
    pub recovery_form: Option<RecoveryForm>,
    pub pending_recovery_confirmation: Option<RecoverySubmission>,
    pub recovery_busy: bool,
    pub status_line: String,
    pub terminal: vt100::Parser,
    pub terminal_size: (u16, u16),
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            workspaces: Vec::new(),
            selected: 0,
            detail: None,
            agent_focused: false,
            focus_mode: false,
            session_id: None,
            runtime_id: None,
            action_menu_open: false,
            action_selected: 0,
            pending_confirmation: None,
            action_busy: false,
            delivery_menu_open: false,
            delivery_selected: 0,
            delivery_form: None,
            pending_delivery_confirmation: None,
            delivery_busy: false,
            recovery_menu_open: false,
            recovery_selected: 0,
            recovery_form: None,
            pending_recovery_confirmation: None,
            recovery_busy: false,
            status_line: "Connecting to Appaloft…".to_owned(),
            terminal: vt100::Parser::new(24, 80, 10_000),
            terminal_size: (80, 24),
        }
    }
}

impl AppState {
    pub fn selected_workspace_id(&self) -> Option<&str> {
        self.workspaces
            .get(self.selected)
            .map(|workspace| workspace.workspace_id.as_str())
    }

    pub fn selected_runtime_id(&self) -> Option<&str> {
        self.detail.as_ref().and_then(|detail| {
            detail
                .runtimes
                .iter()
                .find(|runtime| runtime.attach.is_some())
                .map(|runtime| runtime.runtime_id.as_str())
        })
    }

    pub fn apply(&mut self, message: ParentMessage) {
        match message {
            ParentMessage::HelloOk => {
                self.status_line = "Connected".to_owned();
            }
            ParentMessage::Workspaces { workspaces } => {
                let selected_id = self.selected_workspace_id().map(str::to_owned);
                self.workspaces = workspaces;
                self.selected = selected_id
                    .and_then(|id| {
                        self.workspaces
                            .iter()
                            .position(|workspace| workspace.workspace_id == id)
                    })
                    .unwrap_or(0)
                    .min(self.workspaces.len().saturating_sub(1));
                self.status_line = format!("{} Workspace(s)", self.workspaces.len());
            }
            ParentMessage::Detail { detail } => {
                self.status_line = format!("Workspace {}", detail.workspace.workspace_id);
                self.detail = Some(detail);
                self.action_busy = false;
                self.delivery_busy = false;
                self.delivery_form = None;
                self.pending_delivery_confirmation = None;
                self.recovery_busy = false;
                self.recovery_form = None;
                self.pending_recovery_confirmation = None;
            }
            ParentMessage::TerminalReady {
                runtime_id,
                session_id,
                ..
            } => {
                self.runtime_id = Some(runtime_id);
                self.session_id = Some(session_id.clone());
                self.agent_focused = true;
                self.status_line = format!("Agent Session {session_id}");
            }
            ParentMessage::TerminalOutput { data, .. } => self.terminal.process(data.as_bytes()),
            ParentMessage::TerminalClosed {
                reason, exit_code, ..
            } => {
                self.agent_focused = false;
                self.focus_mode = false;
                self.session_id = None;
                self.runtime_id = None;
                self.status_line = match exit_code {
                    Some(code) => format!("Agent terminal closed: {reason} ({code})"),
                    None => format!("Agent terminal closed: {reason}"),
                };
            }
            ParentMessage::DeliveryComplete { workspace_id } => {
                self.delivery_busy = false;
                self.delivery_form = None;
                self.pending_delivery_confirmation = None;
                self.status_line = format!("Workspace {workspace_id} delivery action completed");
            }
            ParentMessage::RecoveryComplete { workspace_id } => {
                self.recovery_busy = false;
                self.recovery_form = None;
                self.pending_recovery_confirmation = None;
                self.status_line = format!("Workspace {workspace_id} recovery action completed");
            }
            ParentMessage::Error {
                code,
                phase,
                retryable,
            } => {
                self.action_busy = false;
                self.delivery_busy = false;
                self.recovery_busy = false;
                self.status_line = format!(
                    "{code} at {phase}{}",
                    if retryable { " — retry with r" } else { "" }
                );
            }
            ParentMessage::Shutdown => {}
        }
    }

    pub fn move_selection(&mut self, delta: isize) -> Option<String> {
        if self.workspaces.is_empty() {
            return None;
        }
        let last = self.workspaces.len().saturating_sub(1) as isize;
        self.selected = (self.selected as isize + delta).clamp(0, last) as usize;
        self.detail = None;
        self.action_menu_open = false;
        self.pending_confirmation = None;
        self.delivery_menu_open = false;
        self.delivery_form = None;
        self.pending_delivery_confirmation = None;
        self.recovery_menu_open = false;
        self.recovery_form = None;
        self.pending_recovery_confirmation = None;
        self.selected_workspace_id().map(str::to_owned)
    }

    pub fn release_agent_focus(&mut self) {
        self.agent_focused = false;
        self.focus_mode = false;
    }

    pub fn toggle_focus_mode(&mut self) {
        if self.session_id.is_some() {
            self.focus_mode = !self.focus_mode;
            self.agent_focused = true;
        }
    }

    pub fn resize_terminal(&mut self, cols: u16, rows: u16) -> bool {
        let cols = cols.max(2);
        let rows = rows.max(2);
        if self.terminal_size == (cols, rows) {
            return false;
        }
        self.terminal.set_size(rows, cols);
        self.terminal_size = (cols, rows);
        true
    }

    pub fn available_lifecycle_actions(&self) -> Vec<LifecycleAction> {
        self.detail
            .as_ref()
            .map(|detail| lifecycle_actions_for_status(&detail.workspace.status))
            .unwrap_or_default()
    }

    pub fn open_action_menu(&mut self) -> bool {
        if self.action_busy || self.available_lifecycle_actions().is_empty() {
            return false;
        }
        self.action_selected = 0;
        self.pending_confirmation = None;
        self.action_menu_open = true;
        true
    }

    pub fn close_action_menu(&mut self) {
        self.action_menu_open = false;
        self.pending_confirmation = None;
    }

    pub fn move_action_selection(&mut self, delta: isize) {
        let actions = self.available_lifecycle_actions();
        if actions.is_empty() {
            self.action_selected = 0;
            return;
        }
        let last = actions.len().saturating_sub(1) as isize;
        self.action_selected = (self.action_selected as isize + delta).clamp(0, last) as usize;
    }

    pub fn activate_selected_action(&mut self) -> ActionDecision {
        if !self.action_menu_open || self.action_busy {
            return ActionDecision::None;
        }
        let Some(action) = self
            .available_lifecycle_actions()
            .get(self.action_selected)
            .copied()
        else {
            return ActionDecision::None;
        };
        self.action_menu_open = false;
        if action == LifecycleAction::Terminate {
            self.pending_confirmation = Some(action);
            return ActionDecision::AwaitConfirmation;
        }
        self.action_busy = true;
        ActionDecision::Dispatch(action)
    }

    pub fn confirm_lifecycle_action(&mut self, confirmed: bool) -> Option<LifecycleAction> {
        let pending = self.pending_confirmation.take();
        if confirmed && pending.is_some() {
            self.action_busy = true;
            return pending;
        }
        None
    }

    pub fn available_delivery_actions(&self) -> Vec<DeliveryAction> {
        self.detail
            .as_ref()
            .map(delivery_actions_for_detail)
            .unwrap_or_default()
    }

    pub fn open_delivery_menu(&mut self) -> bool {
        if self.delivery_busy || self.available_delivery_actions().is_empty() {
            return false;
        }
        self.delivery_selected = 0;
        self.delivery_menu_open = true;
        self.delivery_form = None;
        self.pending_delivery_confirmation = None;
        true
    }

    pub fn close_delivery_surface(&mut self) {
        if self.delivery_busy {
            return;
        }
        self.delivery_menu_open = false;
        self.delivery_form = None;
        self.pending_delivery_confirmation = None;
    }

    pub fn move_delivery_selection(&mut self, delta: isize) {
        let actions = self.available_delivery_actions();
        if actions.is_empty() {
            self.delivery_selected = 0;
            return;
        }
        let last = actions.len().saturating_sub(1) as isize;
        self.delivery_selected = (self.delivery_selected as isize + delta).clamp(0, last) as usize;
    }

    pub fn activate_selected_delivery_action(&mut self) -> DeliveryDecision {
        if !self.delivery_menu_open || self.delivery_busy {
            return DeliveryDecision::None;
        }
        let Some(action) = self
            .available_delivery_actions()
            .get(self.delivery_selected)
            .cloned()
        else {
            return DeliveryDecision::None;
        };
        self.delivery_menu_open = false;
        match action {
            DeliveryAction::ExposePreview => {
                self.delivery_form = Some(DeliveryForm::Preview {
                    port: String::new(),
                    visibility: PreviewVisibility::Private,
                    ttl_minutes: 60,
                    field: 0,
                });
                DeliveryDecision::FormOpened
            }
            DeliveryAction::DeliverTask { task_run_id } => {
                self.delivery_form = Some(DeliveryForm::Task {
                    task_run_id,
                    values: [
                        String::new(),
                        String::new(),
                        "origin".to_owned(),
                        String::new(),
                        String::new(),
                        String::new(),
                    ],
                    field: 0,
                });
                DeliveryDecision::FormOpened
            }
            DeliveryAction::RevokePreview { exposure_id, .. } => {
                self.pending_delivery_confirmation =
                    Some(DeliverySubmission::RevokePreview { exposure_id });
                DeliveryDecision::AwaitConfirmation
            }
            DeliveryAction::ApproveTask { task_run_id } => {
                self.pending_delivery_confirmation =
                    Some(DeliverySubmission::ApproveTask { task_run_id });
                DeliveryDecision::AwaitConfirmation
            }
            DeliveryAction::AcceptPromotion { promotion_id } => {
                self.pending_delivery_confirmation =
                    Some(DeliverySubmission::AcceptPromotion { promotion_id });
                DeliveryDecision::AwaitConfirmation
            }
            DeliveryAction::RetryPromotion { promotion_id } => {
                self.pending_delivery_confirmation =
                    Some(DeliverySubmission::RetryPromotion { promotion_id });
                DeliveryDecision::AwaitConfirmation
            }
        }
    }

    pub fn delivery_form_insert(&mut self, character: char) {
        if self.delivery_busy || character == '\0' {
            return;
        }
        match self.delivery_form.as_mut() {
            Some(DeliveryForm::Preview { port, field: 0, .. })
                if character.is_ascii_digit() && port.len() < 5 =>
            {
                port.push(character);
            }
            Some(DeliveryForm::Task { values, field, .. }) => {
                let limits = [512, 512, 120, 256, 16_384, 512];
                if values[*field].len() < limits[*field] {
                    values[*field].push(character);
                }
            }
            _ => {}
        }
    }

    pub fn delivery_form_backspace(&mut self) {
        if self.delivery_busy {
            return;
        }
        match self.delivery_form.as_mut() {
            Some(DeliveryForm::Preview { port, field: 0, .. }) => {
                port.pop();
            }
            Some(DeliveryForm::Task { values, field, .. }) => {
                values[*field].pop();
            }
            _ => {}
        }
    }

    pub fn delivery_form_next_field(&mut self) {
        if self.delivery_busy {
            return;
        }
        match self.delivery_form.as_mut() {
            Some(DeliveryForm::Preview { field, .. }) => *field = (*field + 1) % 3,
            Some(DeliveryForm::Task { field, .. }) => *field = (*field + 1) % 6,
            None => {}
        }
    }

    pub fn delivery_form_previous_field(&mut self) {
        if self.delivery_busy {
            return;
        }
        match self.delivery_form.as_mut() {
            Some(DeliveryForm::Preview { field, .. }) => *field = (*field + 2) % 3,
            Some(DeliveryForm::Task { field, .. }) => *field = (*field + 5) % 6,
            None => {}
        }
    }

    pub fn delivery_form_cycle_choice(&mut self, delta: isize) {
        if self.delivery_busy {
            return;
        }
        if let Some(DeliveryForm::Preview {
            visibility,
            ttl_minutes,
            field,
            ..
        }) = self.delivery_form.as_mut()
        {
            if *field == 1 {
                *visibility = visibility.next(delta);
            } else if *field == 2 {
                let values = [60_u16, 480, 1440];
                let index = values
                    .iter()
                    .position(|value| value == ttl_minutes)
                    .unwrap_or(0) as isize;
                *ttl_minutes = values[(index + delta).rem_euclid(values.len() as isize) as usize];
            }
        }
    }

    pub fn submit_delivery_form(&mut self) -> DeliveryDecision {
        if self.delivery_busy {
            return DeliveryDecision::None;
        }
        match self.delivery_form.as_ref() {
            Some(DeliveryForm::Preview {
                port,
                visibility,
                ttl_minutes,
                ..
            }) => {
                let Ok(port) = port.parse::<u16>() else {
                    self.status_line = "Preview port must be between 1 and 65535".to_owned();
                    return DeliveryDecision::None;
                };
                if port == 0 {
                    self.status_line = "Preview port must be between 1 and 65535".to_owned();
                    return DeliveryDecision::None;
                }
                self.delivery_busy = true;
                DeliveryDecision::Dispatch(DeliverySubmission::ExposePreview {
                    port,
                    visibility: *visibility,
                    ttl_minutes: *ttl_minutes,
                })
            }
            Some(DeliveryForm::Task {
                task_run_id,
                values,
                ..
            }) => {
                if values[0].trim().is_empty()
                    || values[1].trim().is_empty()
                    || values[2].trim().is_empty()
                {
                    self.status_line =
                        "Task delivery requires branch, commit message and remote".to_owned();
                    return DeliveryDecision::None;
                }
                let pull_request = if values[3].trim().is_empty() {
                    None
                } else {
                    Some(PullRequestSubmission {
                        title: values[3].trim().to_owned(),
                        body: (!values[4].is_empty()).then(|| values[4].clone()),
                        base: (!values[5].trim().is_empty()).then(|| values[5].trim().to_owned()),
                    })
                };
                self.pending_delivery_confirmation = Some(DeliverySubmission::DeliverTask {
                    task_run_id: task_run_id.clone(),
                    branch: values[0].trim().to_owned(),
                    commit_message: values[1].trim().to_owned(),
                    remote: values[2].trim().to_owned(),
                    pull_request,
                });
                DeliveryDecision::AwaitConfirmation
            }
            None => DeliveryDecision::None,
        }
    }

    pub fn confirm_delivery_action(&mut self, confirmed: bool) -> Option<DeliverySubmission> {
        if !confirmed {
            self.pending_delivery_confirmation = None;
            self.delivery_form = None;
            return None;
        }
        if self.delivery_busy {
            return None;
        }
        let submission = self.pending_delivery_confirmation.clone()?;
        self.delivery_busy = true;
        Some(submission)
    }

    pub fn available_recovery_actions(&self) -> Vec<RecoveryAction> {
        self.detail
            .as_ref()
            .map(recovery_actions_for_detail)
            .unwrap_or_default()
    }

    pub fn open_recovery_menu(&mut self) -> bool {
        if self.recovery_busy || self.available_recovery_actions().is_empty() {
            return false;
        }
        self.recovery_selected = 0;
        self.recovery_menu_open = true;
        self.recovery_form = None;
        self.pending_recovery_confirmation = None;
        true
    }

    pub fn close_recovery_surface(&mut self) {
        if self.recovery_busy {
            return;
        }
        self.recovery_menu_open = false;
        self.recovery_form = None;
        self.pending_recovery_confirmation = None;
    }

    pub fn move_recovery_selection(&mut self, delta: isize) {
        let actions = self.available_recovery_actions();
        if actions.is_empty() {
            self.recovery_selected = 0;
            return;
        }
        let last = actions.len().saturating_sub(1) as isize;
        self.recovery_selected = (self.recovery_selected as isize + delta).clamp(0, last) as usize;
    }

    pub fn activate_selected_recovery_action(&mut self) -> RecoveryDecision {
        if !self.recovery_menu_open || self.recovery_busy {
            return RecoveryDecision::None;
        }
        let Some(action) = self
            .available_recovery_actions()
            .get(self.recovery_selected)
            .cloned()
        else {
            return RecoveryDecision::None;
        };
        self.recovery_menu_open = false;
        match action {
            RecoveryAction::CreateSnapshot => {
                self.recovery_form = Some(RecoveryForm {
                    capability: SnapshotCapability::Filesystem,
                    ttl_days: 1,
                    field: 0,
                });
                RecoveryDecision::FormOpened
            }
            RecoveryAction::DeleteSnapshot { snapshot_id } => {
                self.pending_recovery_confirmation =
                    Some(RecoverySubmission::DeleteSnapshot { snapshot_id });
                RecoveryDecision::AwaitConfirmation
            }
        }
    }

    pub fn recovery_form_next_field(&mut self) {
        if let Some(form) = self.recovery_form.as_mut()
            && !self.recovery_busy
        {
            form.field = (form.field + 1) % 2;
        }
    }

    pub fn recovery_form_previous_field(&mut self) {
        if let Some(form) = self.recovery_form.as_mut()
            && !self.recovery_busy
        {
            form.field = (form.field + 1) % 2;
        }
    }

    pub fn recovery_form_cycle_choice(&mut self, delta: isize) {
        let Some(form) = self.recovery_form.as_mut() else {
            return;
        };
        if self.recovery_busy {
            return;
        }
        if form.field == 0 {
            form.capability = form.capability.next(delta);
        } else {
            let values = [1_u8, 7, 30];
            let index = values
                .iter()
                .position(|value| *value == form.ttl_days)
                .unwrap_or(0) as isize;
            form.ttl_days = values[(index + delta).rem_euclid(values.len() as isize) as usize];
        }
    }

    pub fn submit_recovery_form(&mut self) -> RecoveryDecision {
        if self.recovery_busy {
            return RecoveryDecision::None;
        }
        let Some(form) = self.recovery_form.as_ref() else {
            return RecoveryDecision::None;
        };
        self.pending_recovery_confirmation = Some(RecoverySubmission::CreateSnapshot {
            capability: form.capability,
            ttl_days: form.ttl_days,
        });
        RecoveryDecision::AwaitConfirmation
    }

    pub fn confirm_recovery_action(&mut self, confirmed: bool) -> Option<RecoverySubmission> {
        if !confirmed {
            self.pending_recovery_confirmation = None;
            self.recovery_form = None;
            return None;
        }
        if self.recovery_busy {
            return None;
        }
        let submission = self.pending_recovery_confirmation.clone()?;
        self.recovery_busy = true;
        Some(submission)
    }
}

pub fn terminal_key_bytes(key: KeyEvent) -> Option<String> {
    if key.modifiers.contains(KeyModifiers::CONTROL)
        && let KeyCode::Char(character) = key.code
    {
        let lower = character.to_ascii_lowercase();
        if lower.is_ascii_lowercase() {
            return Some(char::from((lower as u8 - b'a') + 1).to_string());
        }
    }
    match key.code {
        KeyCode::Char(character) => Some(character.to_string()),
        KeyCode::Enter => Some("\r".to_owned()),
        KeyCode::Tab => Some("\t".to_owned()),
        KeyCode::BackTab => Some("\x1b[Z".to_owned()),
        KeyCode::Backspace => Some("\x7f".to_owned()),
        KeyCode::Esc => Some("\x1b".to_owned()),
        KeyCode::Up => Some("\x1b[A".to_owned()),
        KeyCode::Down => Some("\x1b[B".to_owned()),
        KeyCode::Right => Some("\x1b[C".to_owned()),
        KeyCode::Left => Some("\x1b[D".to_owned()),
        KeyCode::Home => Some("\x1b[H".to_owned()),
        KeyCode::End => Some("\x1b[F".to_owned()),
        KeyCode::PageUp => Some("\x1b[5~".to_owned()),
        KeyCode::PageDown => Some("\x1b[6~".to_owned()),
        KeyCode::Delete => Some("\x1b[3~".to_owned()),
        KeyCode::Insert => Some("\x1b[2~".to_owned()),
        KeyCode::F(number) => Some(format!("\x1b[{}~", 10 + number)),
        _ => None,
    }
}

pub fn terminal_mouse_bytes(event: MouseEvent) -> Option<String> {
    let (button, release) = match event.kind {
        MouseEventKind::Down(MouseButton::Left) => (0, false),
        MouseEventKind::Down(MouseButton::Middle) => (1, false),
        MouseEventKind::Down(MouseButton::Right) => (2, false),
        MouseEventKind::Up(_) => (3, true),
        MouseEventKind::Drag(MouseButton::Left) => (32, false),
        MouseEventKind::Drag(MouseButton::Middle) => (33, false),
        MouseEventKind::Drag(MouseButton::Right) => (34, false),
        MouseEventKind::ScrollUp => (64, false),
        MouseEventKind::ScrollDown => (65, false),
        _ => return None,
    };
    let modifier = if event.modifiers.contains(KeyModifiers::SHIFT) {
        4
    } else if event.modifiers.contains(KeyModifiers::ALT) {
        8
    } else if event.modifiers.contains(KeyModifiers::CONTROL) {
        16
    } else {
        0
    };
    Some(format!(
        "\x1b[<{};{};{}{}",
        button + modifier,
        event.column + 1,
        event.row + 1,
        if release { 'm' } else { 'M' }
    ))
}

pub fn agent_area(area: Rect, focus_mode: bool) -> Rect {
    let body = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(3), Constraint::Length(1)])
        .split(area)[0];
    if focus_mode {
        return body.inner(ratatui::layout::Margin {
            horizontal: 1,
            vertical: 1,
        });
    }
    let columns = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage(28),
            Constraint::Percentage(30),
            Constraint::Percentage(42),
        ])
        .split(body);
    columns[2].inner(ratatui::layout::Margin {
        horizontal: 1,
        vertical: 1,
    })
}

fn terminal_color(color: vt100::Color) -> Color {
    match color {
        vt100::Color::Default => Color::Reset,
        vt100::Color::Idx(index) => Color::Indexed(index),
        vt100::Color::Rgb(red, green, blue) => Color::Rgb(red, green, blue),
    }
}

fn terminal_cell_style(cell: &vt100::Cell) -> Style {
    let mut style = Style::default()
        .fg(terminal_color(cell.fgcolor()))
        .bg(terminal_color(cell.bgcolor()));
    if cell.bold() {
        style = style.add_modifier(Modifier::BOLD);
    }
    if cell.italic() {
        style = style.add_modifier(Modifier::ITALIC);
    }
    if cell.underline() {
        style = style.add_modifier(Modifier::UNDERLINED);
    }
    if cell.inverse() {
        style = style.add_modifier(Modifier::REVERSED);
    }
    style
}

fn render_terminal(frame: &mut Frame<'_>, state: &AppState, area: Rect, title: String) {
    let block = Block::default()
        .title(title)
        .borders(Borders::ALL)
        .border_style(if state.agent_focused {
            Style::default().fg(Color::Cyan)
        } else {
            Style::default()
        });
    let inner = block.inner(area);
    frame.render_widget(block, area);
    let screen = state.terminal.screen();
    let (screen_rows, screen_cols) = screen.size();
    {
        let buffer = frame.buffer_mut();
        for row in 0..inner.height.min(screen_rows) {
            for col in 0..inner.width.min(screen_cols) {
                let Some(cell) = screen.cell(row, col) else {
                    continue;
                };
                if cell.is_wide_continuation() {
                    continue;
                }
                let symbol = if cell.has_contents() {
                    cell.contents()
                } else {
                    " ".to_owned()
                };
                buffer[(inner.x + col, inner.y + row)]
                    .set_symbol(&symbol)
                    .set_style(terminal_cell_style(cell));
            }
        }
    }
    if state.agent_focused && !screen.hide_cursor() {
        let (row, col) = screen.cursor_position();
        if row < inner.height && col < inner.width {
            frame.set_cursor_position((inner.x + col, inner.y + row));
        }
    }
}

pub fn render(frame: &mut Frame<'_>, state: &AppState) {
    let area = frame.area();
    let sections = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(3), Constraint::Length(1)])
        .split(area);
    let body = sections[0];
    let footer = sections[1];
    if state.focus_mode {
        render_terminal(
            frame,
            state,
            body,
            format!(
                " Agent — Focus Mode — {} ",
                state.session_id.as_deref().unwrap_or("not attached")
            ),
        );
    } else {
        let columns = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([
                Constraint::Percentage(28),
                Constraint::Percentage(30),
                Constraint::Percentage(42),
            ])
            .split(body);
        let items = state
            .workspaces
            .iter()
            .enumerate()
            .map(|(index, workspace)| {
                let marker = if index == state.selected { "›" } else { " " };
                ListItem::new(Line::from(vec![
                    Span::styled(
                        format!("{marker} {}", occupancy_list_label(workspace)),
                        if index == state.selected {
                            Style::default()
                                .fg(Color::Cyan)
                                .add_modifier(Modifier::BOLD)
                        } else {
                            Style::default()
                        },
                    ),
                    Span::raw(format!("  {}", workspace.status)),
                ]))
            });
        frame.render_widget(
            List::new(items).block(Block::default().title(" Workspaces ").borders(Borders::ALL)),
            columns[0],
        );
        let detail_text = if let Some(detail) = &state.detail {
            let runtimes = detail
                .runtimes
                .iter()
                .map(|runtime| {
                    format!(
                        "{}  {}  {}",
                        runtime.runtime_id,
                        runtime.status.as_deref().unwrap_or("unknown"),
                        runtime
                            .attach
                            .as_ref()
                            .map(|attach| attach.transport.as_str())
                            .unwrap_or("no attach")
                    )
                })
                .collect::<Vec<_>>()
                .join("\n");
            let ports = detail
                .ports
                .iter()
                .map(|port| {
                    format!(
                        ":{}  {}  {}",
                        port.port,
                        port.visibility.as_deref().unwrap_or("unknown"),
                        port.url.as_deref().unwrap_or(&port.exposure_id)
                    )
                })
                .collect::<Vec<_>>()
                .join("\n");
            let tasks = detail
                .tasks
                .iter()
                .map(|task| format!("{}  {}", task.task_run_id, task.status))
                .collect::<Vec<_>>()
                .join("\n");
            let promotions = detail
                .promotions
                .iter()
                .map(|promotion| {
                    let proof = promotion
                        .proof
                        .as_ref()
                        .map(|proof| {
                            format!(
                                "{}  mismatch:{}  unavailable:{}",
                                proof.verdict,
                                proof.mismatch_count,
                                proof.unavailable_evidence_count
                            )
                        })
                        .unwrap_or_else(|| "no proof".to_owned());
                    format!(
                        "{}  {}  {}",
                        promotion.promotion_id, promotion.status, proof
                    )
                })
                .collect::<Vec<_>>()
                .join("\n");
            let isolation = format!(
                "{} -> {}  attempts:{}",
                detail
                    .recovery
                    .requested_isolation
                    .as_deref()
                    .unwrap_or("unknown"),
                detail
                    .recovery
                    .realized_isolation
                    .as_deref()
                    .unwrap_or("unknown"),
                detail
                    .recovery
                    .provision_attempts
                    .map(|attempts| attempts.to_string())
                    .unwrap_or_else(|| "unknown".to_owned())
            );
            let suspension = detail
                .recovery
                .suspension
                .as_ref()
                .map(|suspension| {
                    format!(
                        "{}  {}  {}",
                        suspension.mode,
                        suspension.portability,
                        suspension.recovery_family.as_deref().unwrap_or("no family")
                    )
                })
                .unwrap_or_else(|| "not suspended".to_owned());
            let snapshots = detail
                .recovery
                .snapshots
                .iter()
                .map(|snapshot| {
                    format!(
                        "{}  {}  {}  {}",
                        snapshot.snapshot_id,
                        snapshot.status,
                        snapshot.capability,
                        snapshot.portability
                    )
                })
                .collect::<Vec<_>>()
                .join("\n");
            let cleanup = &detail.recovery.cleanup;
            let activation = detail
                .activation
                .as_ref()
                .map(|activation| {
                    format!(
                        "Init project:{}\n     binding:{} profile:{}",
                        activation.project.disposition,
                        activation.repository_binding.disposition,
                        activation.profile.disposition
                    )
                })
                .unwrap_or_else(|| "Init unavailable".to_owned());
            let target_selection = detail
                .target_selection
                .as_ref()
                .map(|selection| {
                    format!(
                        "Target {}/{}\nReason {}",
                        selection.target_class, selection.source, selection.reason
                    )
                })
                .unwrap_or_else(|| {
                    format!(
                        "Provider {}",
                        detail
                            .workspace
                            .provider_key
                            .as_deref()
                            .unwrap_or("unknown")
                    )
                });
            let preview = detail
                .preview
                .as_ref()
                .map(|preview| format!("Preview  {}", preview.url))
                .unwrap_or_default();
            let deployment = detail
                .deployment
                .as_ref()
                .map(|deployment| {
                    format!(
                        "Deploy   {}{}",
                        deployment.id,
                        deployment
                            .status
                            .as_deref()
                            .map(|status| format!("  {status}"))
                            .unwrap_or_default()
                    )
                })
                .unwrap_or_default();
            format!(
                "Workspace {}  {}\n{}\n{}\n{}\n{}\nRecovery\nIsolation  {}\nContinuity {}\nSnapshot(s)\n{}\nWorkspace-owned cleanup: {}\nactive runtimes:{}  previews:{}\nBounded readback; not host/provider proof\nAgent Runtime(s)\n{}\nPorts\n{}\nTasks\n{}\nPromotions\n{}",
                occupancy_list_label(&detail.workspace),
                detail.workspace.status,
                preview,
                deployment,
                target_selection,
                activation,
                isolation,
                suspension,
                if snapshots.is_empty() {
                    "none"
                } else {
                    &snapshots
                },
                cleanup.state,
                cleanup.active_runtime_count,
                cleanup.active_preview_count,
                runtimes,
                if ports.is_empty() { "none" } else { &ports },
                if tasks.is_empty() { "none" } else { &tasks },
                if promotions.is_empty() {
                    "none"
                } else {
                    &promotions
                }
            )
        } else {
            "Select a Workspace to load bounded detail.".to_owned()
        };
        frame.render_widget(
            Paragraph::new(detail_text)
                .block(Block::default().title(" Appaloft ").borders(Borders::ALL))
                .wrap(Wrap { trim: false }),
            columns[1],
        );
        render_terminal(
            frame,
            state,
            columns[2],
            format!(
                " Agent {} ",
                if state.agent_focused { "[focused]" } else { "" }
            ),
        );
    }
    frame.render_widget(
        Paragraph::new(format!(
            " Ctrl+] release  │  {}  │  q quit  ↑↓ select  Enter attach/focus  a lifecycle  d delivery  s recovery  f Focus Mode  r refresh  R reconnect ",
            state.status_line
        ))
        .style(Style::default().fg(Color::DarkGray)),
        footer,
    );
    if state.action_menu_open {
        let actions = state.available_lifecycle_actions();
        let width = 38_u16.min(area.width.saturating_sub(2)).max(2);
        let height = (actions.len() as u16 + 2)
            .min(area.height.saturating_sub(2))
            .max(3);
        let menu = Rect::new(
            area.x + area.width.saturating_sub(width) / 2,
            area.y + area.height.saturating_sub(height) / 2,
            width,
            height,
        );
        frame.render_widget(Clear, menu);
        frame.render_widget(
            List::new(actions.iter().enumerate().map(|(index, action)| {
                let marker = if index == state.action_selected {
                    "›"
                } else {
                    " "
                };
                ListItem::new(format!("{marker} {}", action.label())).style(
                    if index == state.action_selected {
                        Style::default()
                            .fg(Color::Cyan)
                            .add_modifier(Modifier::BOLD)
                    } else {
                        Style::default()
                    },
                )
            }))
            .block(
                Block::default()
                    .title(" Workspace Actions ")
                    .borders(Borders::ALL),
            ),
            menu,
        );
    } else if state.pending_confirmation == Some(LifecycleAction::Terminate) {
        let width = 52_u16.min(area.width.saturating_sub(2)).max(2);
        let height = 5_u16.min(area.height.saturating_sub(2)).max(3);
        let dialog = Rect::new(
            area.x + area.width.saturating_sub(width) / 2,
            area.y + area.height.saturating_sub(height) / 2,
            width,
            height,
        );
        frame.render_widget(Clear, dialog);
        frame.render_widget(
            Paragraph::new("Terminate this Workspace and its Agent runtimes?\nPress y to confirm, n or Esc to cancel.")
                .block(Block::default().title(" Confirm destructive action ").borders(Borders::ALL))
                .wrap(Wrap { trim: false }),
            dialog,
        );
    } else if state.recovery_menu_open {
        let actions = state.available_recovery_actions();
        let width = 68_u16.min(area.width.saturating_sub(2)).max(2);
        let height = (actions.len() as u16 + 2)
            .min(area.height.saturating_sub(2))
            .max(3);
        let menu = Rect::new(
            area.x + area.width.saturating_sub(width) / 2,
            area.y + area.height.saturating_sub(height) / 2,
            width,
            height,
        );
        frame.render_widget(Clear, menu);
        frame.render_widget(
            List::new(actions.iter().enumerate().map(|(index, action)| {
                let marker = if index == state.recovery_selected {
                    "›"
                } else {
                    " "
                };
                ListItem::new(format!("{marker} {}", action.label())).style(
                    if index == state.recovery_selected {
                        Style::default()
                            .fg(Color::Cyan)
                            .add_modifier(Modifier::BOLD)
                    } else {
                        Style::default()
                    },
                )
            }))
            .block(
                Block::default()
                    .title(" Recovery Actions ")
                    .borders(Borders::ALL),
            ),
            menu,
        );
    } else if let Some(submission) = &state.pending_recovery_confirmation {
        let description = match submission {
            RecoverySubmission::CreateSnapshot {
                capability,
                ttl_days,
            } => format!(
                "Create a {} recovery Snapshot retained for {} day(s)?",
                capability.label(),
                ttl_days
            ),
            RecoverySubmission::DeleteSnapshot { snapshot_id } => {
                format!("Delete recovery Snapshot {snapshot_id}?")
            }
        };
        let width = 72_u16.min(area.width.saturating_sub(2)).max(2);
        let height = 6_u16.min(area.height.saturating_sub(2)).max(3);
        let dialog = Rect::new(
            area.x + area.width.saturating_sub(width) / 2,
            area.y + area.height.saturating_sub(height) / 2,
            width,
            height,
        );
        frame.render_widget(Clear, dialog);
        frame.render_widget(
            Paragraph::new(format!(
                "{description}\nPress y to confirm, n or Esc to cancel.{}",
                if state.recovery_busy {
                    "\nWorking…"
                } else {
                    ""
                }
            ))
            .block(
                Block::default()
                    .title(" Confirm recovery action ")
                    .borders(Borders::ALL),
            )
            .wrap(Wrap { trim: false }),
            dialog,
        );
    } else if let Some(form) = &state.recovery_form {
        let lines = [
            format!(
                "{} Capability: {}",
                if form.field == 0 { "›" } else { " " },
                form.capability.label()
            ),
            format!(
                "{} Retention: {} day(s)",
                if form.field == 1 { "›" } else { " " },
                form.ttl_days
            ),
            "Tab/Shift+Tab fields · ←→ choices · Enter review · Esc cancel".to_owned(),
        ];
        let width = 72_u16.min(area.width.saturating_sub(2)).max(2);
        let height = (lines.len() as u16 + 2)
            .min(area.height.saturating_sub(2))
            .max(3);
        let dialog = Rect::new(
            area.x + area.width.saturating_sub(width) / 2,
            area.y + area.height.saturating_sub(height) / 2,
            width,
            height,
        );
        frame.render_widget(Clear, dialog);
        frame.render_widget(
            Paragraph::new(lines.join("\n"))
                .block(
                    Block::default()
                        .title(" Create Recovery Snapshot ")
                        .borders(Borders::ALL),
                )
                .wrap(Wrap { trim: false }),
            dialog,
        );
    } else if state.delivery_menu_open {
        let actions = state.available_delivery_actions();
        let width = 68_u16.min(area.width.saturating_sub(2)).max(2);
        let height = (actions.len() as u16 + 2)
            .min(area.height.saturating_sub(2))
            .max(3);
        let menu = Rect::new(
            area.x + area.width.saturating_sub(width) / 2,
            area.y + area.height.saturating_sub(height) / 2,
            width,
            height,
        );
        frame.render_widget(Clear, menu);
        frame.render_widget(
            List::new(actions.iter().enumerate().map(|(index, action)| {
                let marker = if index == state.delivery_selected {
                    "›"
                } else {
                    " "
                };
                ListItem::new(format!("{marker} {}", action.label())).style(
                    if index == state.delivery_selected {
                        Style::default()
                            .fg(Color::Cyan)
                            .add_modifier(Modifier::BOLD)
                    } else {
                        Style::default()
                    },
                )
            }))
            .block(
                Block::default()
                    .title(" Delivery Actions ")
                    .borders(Borders::ALL),
            ),
            menu,
        );
    } else if let Some(submission) = &state.pending_delivery_confirmation {
        let description = match submission {
            DeliverySubmission::RevokePreview { exposure_id } => {
                format!("Revoke Preview {exposure_id}?")
            }
            DeliverySubmission::ApproveTask { task_run_id } => {
                format!("Approve Task {task_run_id}?")
            }
            DeliverySubmission::DeliverTask {
                task_run_id,
                branch,
                remote,
                ..
            } => format!("Deliver Task {task_run_id} to {remote}/{branch}?"),
            DeliverySubmission::AcceptPromotion { promotion_id } => {
                format!("Accept Promotion {promotion_id} using its current artifact digest?")
            }
            DeliverySubmission::RetryPromotion { promotion_id } => {
                format!("Retry Promotion {promotion_id}?")
            }
            DeliverySubmission::ExposePreview { .. } => "Expose Preview?".to_owned(),
        };
        let width = 72_u16.min(area.width.saturating_sub(2)).max(2);
        let height = 6_u16.min(area.height.saturating_sub(2)).max(3);
        let dialog = Rect::new(
            area.x + area.width.saturating_sub(width) / 2,
            area.y + area.height.saturating_sub(height) / 2,
            width,
            height,
        );
        frame.render_widget(Clear, dialog);
        frame.render_widget(
            Paragraph::new(format!(
                "{description}\nPress y to confirm, n or Esc to cancel.{}",
                if state.delivery_busy {
                    "\nWorking…"
                } else {
                    ""
                }
            ))
            .block(
                Block::default()
                    .title(" Confirm delivery action ")
                    .borders(Borders::ALL),
            )
            .wrap(Wrap { trim: false }),
            dialog,
        );
    } else if let Some(form) = &state.delivery_form {
        let (title, lines) = match form {
            DeliveryForm::Preview {
                port,
                visibility,
                ttl_minutes,
                field,
            } => (
                " Expose Preview ",
                vec![
                    format!("{} Port: {}", if *field == 0 { "›" } else { " " }, port),
                    format!(
                        "{} Visibility: {}",
                        if *field == 1 { "›" } else { " " },
                        visibility.label()
                    ),
                    format!(
                        "{} TTL: {} minutes",
                        if *field == 2 { "›" } else { " " },
                        ttl_minutes
                    ),
                    "Tab/Shift+Tab fields · ←→ choices · Enter submit · Esc cancel".to_owned(),
                ],
            ),
            DeliveryForm::Task { values, field, .. } => {
                let labels = [
                    "Branch", "Commit", "Remote", "PR title", "PR body", "PR base",
                ];
                (
                    " Deliver Task ",
                    labels
                        .iter()
                        .enumerate()
                        .map(|(index, label)| {
                            format!(
                                "{} {label}: {}",
                                if *field == index { "›" } else { " " },
                                values[index]
                            )
                        })
                        .chain(std::iter::once(
                            "Tab/Shift+Tab fields · Enter review · Esc cancel".to_owned(),
                        ))
                        .collect(),
                )
            }
        };
        let width = 78_u16.min(area.width.saturating_sub(2)).max(2);
        let height = (lines.len() as u16 + 2)
            .min(area.height.saturating_sub(2))
            .max(3);
        let dialog = Rect::new(
            area.x + area.width.saturating_sub(width) / 2,
            area.y + area.height.saturating_sub(height) / 2,
            width,
            height,
        );
        frame.render_widget(Clear, dialog);
        frame.render_widget(
            Paragraph::new(lines.join("\n"))
                .block(Block::default().title(title).borders(Borders::ALL))
                .wrap(Wrap { trim: false }),
            dialog,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ws_remote_ca_069_occupancy_list_label_prefers_repo_sha() {
        let occupied = WorkspaceSummary {
            workspace_id: "sbx_1".to_owned(),
            status: "ready".to_owned(),
            provider_key: None,
            source_kind: None,
            occupancy: Some(OccupancySummary {
                repository_identity: "github.com/traefik/whoami".to_owned(),
                commit_sha: "1ce75d01b6978863647da42557a707a479da3a51".to_owned(),
                branch: Some("master".to_owned()),
            }),
        };
        let lean = WorkspaceSummary {
            workspace_id: "sbx_lean".to_owned(),
            status: "ready".to_owned(),
            provider_key: None,
            source_kind: None,
            occupancy: None,
        };
        assert_eq!(occupancy_list_label(&occupied), "traefik/whoami@1ce75d0");
        assert_eq!(occupancy_list_label(&lean), "sbx_lean");
    }

    #[test]
    fn ws_tui_embed_focus_and_unicode_keep_one_session() {
        let mut state = AppState::default();
        state.apply(ParentMessage::TerminalReady {
            workspace_id: "sbx_1".to_owned(),
            runtime_id: "sar_1".to_owned(),
            session_id: "term_same".to_owned(),
        });
        state.apply(ParentMessage::TerminalOutput {
            stream: "stdout".to_owned(),
            data: "\x1b[?1049h\x1b[2J\x1b[H中文 🚀 e\u{301}".to_owned(),
        });
        assert!(state.terminal.screen().alternate_screen());
        assert!(state.terminal.screen().contents().contains("中文 🚀 é"));
        state.toggle_focus_mode();
        assert_eq!(state.session_id.as_deref(), Some("term_same"));
        assert!(state.focus_mode);
        state.release_agent_focus();
        assert_eq!(state.session_id.as_deref(), Some("term_same"));
        assert!(!state.agent_focused);
    }

    #[test]
    fn ws_tui_terminal_key_and_mouse_encoding_preserve_agent_input() {
        assert_eq!(
            terminal_key_bytes(KeyEvent::new(KeyCode::Char('c'), KeyModifiers::CONTROL)),
            Some("\u{3}".to_owned())
        );
        assert_eq!(
            terminal_key_bytes(KeyEvent::new(KeyCode::Up, KeyModifiers::NONE)),
            Some("\x1b[A".to_owned())
        );
        assert_eq!(
            terminal_mouse_bytes(MouseEvent {
                kind: MouseEventKind::Down(MouseButton::Left),
                column: 4,
                row: 2,
                modifiers: KeyModifiers::NONE,
            }),
            Some("\x1b[<0;5;3M".to_owned())
        );
    }

    #[test]
    fn ws_tui_renders_vt_cells_with_style_and_cursor() {
        let mut state = AppState::default();
        state.apply(ParentMessage::TerminalReady {
            workspace_id: "sbx_1".to_owned(),
            runtime_id: "sar_1".to_owned(),
            session_id: "term_1".to_owned(),
        });
        state.apply(ParentMessage::TerminalOutput {
            stream: "stdout".to_owned(),
            data: "\x1b[?1049h\x1b[2J\x1b[H\x1b[31;1mX".to_owned(),
        });
        state.focus_mode = true;
        let backend = ratatui::backend::TestBackend::new(40, 12);
        let mut terminal = ratatui::Terminal::new(backend).expect("test terminal");
        terminal
            .draw(|frame| render(frame, &state))
            .expect("draw VT cells");
        let cell = &terminal.backend().buffer()[(1, 1)];
        assert_eq!(cell.symbol(), "X");
        assert_eq!(cell.fg, Color::Indexed(1));
        assert!(cell.modifier.contains(Modifier::BOLD));
        let cursor = terminal.get_cursor_position().expect("read cursor");
        assert_eq!((cursor.x, cursor.y), (2, 1));
    }

    #[test]
    fn ws_tui_renders_bounded_workspace_detail_without_extra_state() {
        let mut state = AppState::default();
        state.apply(ParentMessage::Workspaces {
            workspaces: vec![WorkspaceSummary {
                workspace_id: "sbx_1".to_owned(),
                status: "running".to_owned(),
                provider_key: Some("registered-server".to_owned()),
                source_kind: Some("template".to_owned()),
                occupancy: Some(OccupancySummary {
                    repository_identity: "github.com/traefik/whoami".to_owned(),
                    commit_sha: "1ce75d01b6978863647da42557a707a479da3a51".to_owned(),
                    branch: Some("master".to_owned()),
                }),
            }],
        });
        state.apply(ParentMessage::Detail {
            detail: DetailMessage {
                workspace: state.workspaces[0].clone(),
                runtimes: vec![RuntimeSummary {
                    runtime_id: "sar_1".to_owned(),
                    status: Some("running".to_owned()),
                    harness_template_id: Some("pi-default".to_owned()),
                    attach: Some(AttachCapability {
                        transport: "managed-terminal".to_owned(),
                    }),
                }],
                ports: vec![PortSummary {
                    exposure_id: "exp_1".to_owned(),
                    port: 3000,
                    visibility: Some("private".to_owned()),
                    url: Some("https://preview.example.test/".to_owned()),
                    expires_at: None,
                }],
                tasks: vec![TaskSummary {
                    task_run_id: "task_1".to_owned(),
                    runtime_id: Some("sar_1".to_owned()),
                    status: "running".to_owned(),
                }],
                promotions: vec![PromotionSummary {
                    promotion_id: "prm_1".to_owned(),
                    status: "verified".to_owned(),
                    resource_id: None,
                    deployment_id: None,
                    proof: Some(DeploymentProofSummary {
                        verdict: "verified".to_owned(),
                        mismatch_count: 0,
                        unavailable_evidence_count: 0,
                    }),
                    expires_at: None,
                }],
                activation: Some(ActivationSummary {
                    project: ActivationProjectSummary {
                        project_id: "prj_web".to_owned(),
                        disposition: "created".to_owned(),
                    },
                    repository_binding: ActivationRepositoryBindingSummary {
                        binding_id: "rbd_web".to_owned(),
                        disposition: "created".to_owned(),
                    },
                    profile: ActivationProfileSummary {
                        profile_installation_id: "awpi_default".to_owned(),
                        disposition: "reused".to_owned(),
                    },
                }),
                target_selection: Some(TargetSelectionSummary {
                    target_class: "managed".to_owned(),
                    source: "platform-default".to_owned(),
                    reason: "managed_entitlement_default".to_owned(),
                }),
                preview: Some(OccupancyPreviewChrome {
                    url: "http://whoami.test".to_owned(),
                }),
                deployment: Some(OccupancyDeploymentChrome {
                    id: "dep_rfqfapqwpyjn".to_owned(),
                    status: Some("succeeded".to_owned()),
                }),
                recovery: RecoverySummary::default(),
            },
        });
        let backend = ratatui::backend::TestBackend::new(120, 32);
        let mut terminal = ratatui::Terminal::new(backend).expect("test terminal");
        terminal
            .draw(|frame| render(frame, &state))
            .expect("draw bounded detail");
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
        assert!(rendered.contains("traefik/whoami@1ce75d0"));
        assert!(rendered.contains("Preview"));
        assert!(rendered.contains("whoami.test"));
        assert!(rendered.contains("dep_rfqfapqwpyjn"));
        assert!(rendered.contains("task_1"));
        assert!(rendered.contains("prm_1"));
        assert!(rendered.contains("verified"));
        assert!(rendered.contains("project:created"));
        assert!(rendered.contains("managed/platform-default"));
        assert!(rendered.contains("managed_entitlement_default"));
    }

    #[test]
    fn ws_tui_action_palette_derives_only_valid_lifecycle_actions() {
        assert_eq!(
            lifecycle_actions_for_status("ready"),
            vec![LifecycleAction::Pause, LifecycleAction::Terminate]
        );
        assert_eq!(
            lifecycle_actions_for_status("paused"),
            vec![LifecycleAction::Resume, LifecycleAction::Terminate]
        );
        assert_eq!(
            lifecycle_actions_for_status("provisioning"),
            vec![LifecycleAction::Terminate]
        );
        assert!(lifecycle_actions_for_status("terminated").is_empty());
        assert!(lifecycle_actions_for_status("expired").is_empty());
    }

    #[test]
    fn ws_tui_recovery_palette_uses_only_current_snapshot_targets() {
        let detail = DetailMessage {
            workspace: WorkspaceSummary {
                workspace_id: "sbx_1".to_owned(),
                status: "ready".to_owned(),
                provider_key: None,
                source_kind: None,
                occupancy: None,
            },
            runtimes: Vec::new(),
            ports: Vec::new(),
            tasks: Vec::new(),
            promotions: Vec::new(),
            activation: None,
            target_selection: None,
            preview: None,
            deployment: None,
            recovery: RecoverySummary {
                requested_isolation: Some("gvisor".to_owned()),
                realized_isolation: Some("gvisor".to_owned()),
                provision_attempts: Some(2),
                suspension: None,
                snapshots: vec![
                    SnapshotSummary {
                        snapshot_id: "ssn_ready".to_owned(),
                        capability: "filesystem".to_owned(),
                        reason: "manual".to_owned(),
                        portability: "provider-local".to_owned(),
                        recovery_family: None,
                        status: "ready".to_owned(),
                        created_at: "2026-08-11T00:00:00.000Z".to_owned(),
                        expires_at: None,
                    },
                    SnapshotSummary {
                        snapshot_id: "ssn_deleting".to_owned(),
                        capability: "filesystem".to_owned(),
                        reason: "manual".to_owned(),
                        portability: "provider-local".to_owned(),
                        recovery_family: None,
                        status: "deleting".to_owned(),
                        created_at: "2026-08-10T00:00:00.000Z".to_owned(),
                        expires_at: None,
                    },
                ],
                cleanup: CleanupSummary {
                    state: "not-applicable".to_owned(),
                    active_runtime_count: 0,
                    active_preview_count: 0,
                    scope: "workspace-owned-readback".to_owned(),
                },
            },
        };

        assert_eq!(
            recovery_actions_for_detail(&detail),
            vec![
                RecoveryAction::CreateSnapshot,
                RecoveryAction::DeleteSnapshot {
                    snapshot_id: "ssn_ready".to_owned(),
                },
            ]
        );
    }

    #[test]
    fn ws_tui_recovery_form_confirmation_and_events_are_bounded() {
        let mut state = AppState::default();
        state.session_id = Some("term_same".to_owned());
        state.runtime_id = Some("sar_same".to_owned());
        state.detail = Some(DetailMessage {
            workspace: WorkspaceSummary {
                workspace_id: "sbx_1".to_owned(),
                status: "ready".to_owned(),
                provider_key: None,
                source_kind: None,
                occupancy: None,
            },
            runtimes: Vec::new(),
            ports: Vec::new(),
            tasks: Vec::new(),
            promotions: Vec::new(),
            activation: None,
            target_selection: None,
            preview: None,
            deployment: None,
            recovery: RecoverySummary {
                snapshots: vec![SnapshotSummary {
                    snapshot_id: "ssn_1".to_owned(),
                    capability: "filesystem".to_owned(),
                    reason: "manual".to_owned(),
                    portability: "provider-local".to_owned(),
                    recovery_family: None,
                    status: "ready".to_owned(),
                    created_at: "2026-08-11T00:00:00.000Z".to_owned(),
                    expires_at: None,
                }],
                ..RecoverySummary::default()
            },
        });

        assert!(state.open_recovery_menu());
        assert_eq!(
            state.activate_selected_recovery_action(),
            RecoveryDecision::FormOpened
        );
        state.recovery_form_cycle_choice(1);
        state.recovery_form_next_field();
        state.recovery_form_cycle_choice(1);
        assert_eq!(
            state.submit_recovery_form(),
            RecoveryDecision::AwaitConfirmation
        );
        let create = state
            .confirm_recovery_action(true)
            .expect("confirm Snapshot create");
        assert_eq!(
            create,
            RecoverySubmission::CreateSnapshot {
                capability: SnapshotCapability::FilesystemMemory,
                ttl_days: 7,
            }
        );
        assert_eq!(state.session_id.as_deref(), Some("term_same"));
        assert_eq!(state.runtime_id.as_deref(), Some("sar_same"));
        assert_eq!(
            serde_json::to_string(&RendererEvent::recovery("sbx_1".to_owned(), create))
                .expect("serialize Snapshot create"),
            r#"{"type":"snapshot-create","workspaceId":"sbx_1","capability":"filesystem-memory","ttlDays":7}"#
        );

        state.recovery_busy = false;
        assert!(state.open_recovery_menu());
        state.move_recovery_selection(1);
        assert_eq!(
            state.activate_selected_recovery_action(),
            RecoveryDecision::AwaitConfirmation
        );
        let delete = state
            .confirm_recovery_action(true)
            .expect("confirm Snapshot delete");
        assert_eq!(
            serde_json::to_string(&RendererEvent::recovery("sbx_1".to_owned(), delete))
                .expect("serialize Snapshot delete"),
            r#"{"type":"snapshot-delete","workspaceId":"sbx_1","snapshotId":"ssn_1"}"#
        );
    }

    #[test]
    fn ws_tui_renders_recovery_capability_snapshot_and_bounded_cleanup_copy() {
        let mut state = AppState::default();
        state.detail = Some(DetailMessage {
            workspace: WorkspaceSummary {
                workspace_id: "sbx_1".to_owned(),
                status: "terminated".to_owned(),
                provider_key: Some("registered-server".to_owned()),
                source_kind: Some("template".to_owned()),
                occupancy: None,
            },
            runtimes: Vec::new(),
            ports: Vec::new(),
            tasks: Vec::new(),
            promotions: Vec::new(),
            activation: None,
            target_selection: None,
            preview: None,
            deployment: None,
            recovery: RecoverySummary {
                requested_isolation: Some("gvisor".to_owned()),
                realized_isolation: Some("gvisor".to_owned()),
                provision_attempts: Some(2),
                suspension: Some(SuspensionSummary {
                    mode: "compute-released".to_owned(),
                    portability: "provider-family".to_owned(),
                    recovery_family: Some("docker-linux-amd64".to_owned()),
                }),
                snapshots: vec![SnapshotSummary {
                    snapshot_id: "ssn_1".to_owned(),
                    capability: "filesystem".to_owned(),
                    reason: "pre-termination".to_owned(),
                    portability: "provider-family".to_owned(),
                    recovery_family: Some("docker-linux-amd64".to_owned()),
                    status: "ready".to_owned(),
                    created_at: "2026-08-11T00:00:00.000Z".to_owned(),
                    expires_at: Some("2026-08-18T00:00:00.000Z".to_owned()),
                }],
                cleanup: CleanupSummary {
                    state: "clear".to_owned(),
                    active_runtime_count: 0,
                    active_preview_count: 0,
                    scope: "workspace-owned-readback".to_owned(),
                },
            },
        });
        let backend = ratatui::backend::TestBackend::new(140, 38);
        let mut terminal = ratatui::Terminal::new(backend).expect("test terminal");
        terminal
            .draw(|frame| render(frame, &state))
            .expect("draw recovery evidence");
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
        assert!(rendered.contains("gvisor"));
        assert!(rendered.contains("compute-released"));
        assert!(rendered.contains("ssn_1"));
        assert!(rendered.contains("Workspace-owned cleanup: clear"));
        assert!(rendered.contains("not host/provider"));
    }

    #[test]
    fn ws_tui_renders_recovery_palette_and_bounded_create_form() {
        let mut state = AppState::default();
        state.detail = Some(DetailMessage {
            workspace: WorkspaceSummary {
                workspace_id: "sbx_1".to_owned(),
                status: "ready".to_owned(),
                provider_key: None,
                source_kind: None,
                occupancy: None,
            },
            runtimes: Vec::new(),
            ports: Vec::new(),
            tasks: Vec::new(),
            promotions: Vec::new(),
            activation: None,
            target_selection: None,
            preview: None,
            deployment: None,
            recovery: RecoverySummary::default(),
        });
        assert!(state.open_recovery_menu());
        let backend = ratatui::backend::TestBackend::new(100, 28);
        let mut terminal = ratatui::Terminal::new(backend).expect("test terminal");
        terminal
            .draw(|frame| render(frame, &state))
            .expect("draw recovery palette");
        let palette =
            terminal
                .backend()
                .buffer()
                .content()
                .iter()
                .fold(String::new(), |mut output, cell| {
                    output.push_str(cell.symbol());
                    output
                });
        assert!(palette.contains("Recovery Actions"));
        assert!(palette.contains("Create Recovery Snapshot"));

        assert_eq!(
            state.activate_selected_recovery_action(),
            RecoveryDecision::FormOpened
        );
        terminal
            .draw(|frame| render(frame, &state))
            .expect("draw recovery form");
        let form =
            terminal
                .backend()
                .buffer()
                .content()
                .iter()
                .fold(String::new(), |mut output, cell| {
                    output.push_str(cell.symbol());
                    output
                });
        assert!(form.contains("Create Recovery Snapshot"));
        assert!(form.contains("filesystem"));
        assert!(form.contains("1 day"));
    }

    #[test]
    fn ws_tui_terminate_requires_explicit_confirmation_and_cancel_is_safe() {
        let mut state = AppState::default();
        state.apply(ParentMessage::Workspaces {
            workspaces: vec![WorkspaceSummary {
                workspace_id: "sbx_1".to_owned(),
                status: "ready".to_owned(),
                provider_key: None,
                source_kind: None,
                occupancy: None,
            }],
        });
        state.apply(ParentMessage::Detail {
            detail: DetailMessage {
                workspace: state.workspaces[0].clone(),
                runtimes: Vec::new(),
                ports: Vec::new(),
                tasks: Vec::new(),
                promotions: Vec::new(),
                activation: None,
                target_selection: None,
                preview: None,
                deployment: None,
                recovery: RecoverySummary::default(),
            },
        });

        assert!(state.open_action_menu());
        state.move_action_selection(1);
        assert_eq!(
            state.activate_selected_action(),
            ActionDecision::AwaitConfirmation
        );
        assert_eq!(state.confirm_lifecycle_action(false), None);

        assert!(state.open_action_menu());
        state.move_action_selection(1);
        assert_eq!(
            state.activate_selected_action(),
            ActionDecision::AwaitConfirmation
        );
        assert_eq!(
            state.confirm_lifecycle_action(true),
            Some(LifecycleAction::Terminate)
        );
    }

    #[test]
    fn ws_tui_lifecycle_event_is_explicit_and_terminal_close_clears_focus_identity() {
        assert_eq!(
            serde_json::to_string(&RendererEvent::LifecycleAction {
                workspace_id: "sbx_1".to_owned(),
                action: LifecycleAction::Pause,
            })
            .expect("serialize lifecycle action"),
            r#"{"type":"lifecycle-action","workspaceId":"sbx_1","action":"pause"}"#
        );
        let mut state = AppState::default();
        state.apply(ParentMessage::TerminalReady {
            workspace_id: "sbx_1".to_owned(),
            runtime_id: "sar_1".to_owned(),
            session_id: "term_1".to_owned(),
        });
        state.focus_mode = true;
        state.apply(ParentMessage::TerminalClosed {
            reason: "workspace-pause".to_owned(),
            exit_code: None,
        });
        assert_eq!(state.session_id, None);
        assert_eq!(state.runtime_id, None);
        assert!(!state.agent_focused);
        assert!(!state.focus_mode);
    }

    #[test]
    fn ws_tui_delivery_palette_uses_only_visible_descriptor_targets() {
        let detail = DetailMessage {
            workspace: WorkspaceSummary {
                workspace_id: "sbx_1".to_owned(),
                status: "ready".to_owned(),
                provider_key: None,
                source_kind: None,
                occupancy: None,
            },
            runtimes: Vec::new(),
            ports: vec![PortSummary {
                exposure_id: "exp_1".to_owned(),
                port: 3000,
                visibility: Some("private".to_owned()),
                url: None,
                expires_at: None,
            }],
            tasks: vec![
                TaskSummary {
                    task_run_id: "task_approve".to_owned(),
                    runtime_id: None,
                    status: "awaiting-approval".to_owned(),
                },
                TaskSummary {
                    task_run_id: "task_deliver".to_owned(),
                    runtime_id: None,
                    status: "approved".to_owned(),
                },
                TaskSummary {
                    task_run_id: "task_running".to_owned(),
                    runtime_id: None,
                    status: "running".to_owned(),
                },
            ],
            promotions: vec![
                PromotionSummary {
                    promotion_id: "prm_planned".to_owned(),
                    status: "planned".to_owned(),
                    resource_id: None,
                    deployment_id: None,
                    proof: None,
                    expires_at: None,
                },
                PromotionSummary {
                    promotion_id: "prm_failed".to_owned(),
                    status: "failed".to_owned(),
                    resource_id: None,
                    deployment_id: None,
                    proof: None,
                    expires_at: None,
                },
            ],
            activation: None,
            target_selection: None,
            preview: None,
            deployment: None,
            recovery: RecoverySummary::default(),
        };

        assert_eq!(
            delivery_actions_for_detail(&detail),
            vec![
                DeliveryAction::ExposePreview,
                DeliveryAction::RevokePreview {
                    exposure_id: "exp_1".to_owned(),
                    port: 3000,
                },
                DeliveryAction::ApproveTask {
                    task_run_id: "task_approve".to_owned(),
                },
                DeliveryAction::DeliverTask {
                    task_run_id: "task_deliver".to_owned(),
                },
                DeliveryAction::AcceptPromotion {
                    promotion_id: "prm_planned".to_owned(),
                },
                DeliveryAction::RetryPromotion {
                    promotion_id: "prm_failed".to_owned(),
                },
            ]
        );
    }

    #[test]
    fn ws_tui_preview_form_defaults_private_and_uses_bounded_ttl() {
        let mut state = delivery_ready_state();
        assert!(state.open_delivery_menu());
        assert_eq!(
            state.activate_selected_delivery_action(),
            DeliveryDecision::FormOpened
        );
        state.delivery_form_insert('3');
        state.delivery_form_insert('0');
        state.delivery_form_insert('0');
        state.delivery_form_insert('0');
        assert_eq!(
            state.submit_delivery_form(),
            DeliveryDecision::Dispatch(DeliverySubmission::ExposePreview {
                port: 3000,
                visibility: PreviewVisibility::Private,
                ttl_minutes: 60,
            })
        );
    }

    #[test]
    fn ws_tui_delivery_events_are_bounded_and_explicit() {
        assert_eq!(
            serde_json::to_string(&RendererEvent::delivery(
                "sbx_1".to_owned(),
                DeliverySubmission::ExposePreview {
                    port: 3000,
                    visibility: PreviewVisibility::Private,
                    ttl_minutes: 60,
                },
            ))
            .expect("serialize Preview event"),
            r#"{"type":"preview-expose","workspaceId":"sbx_1","port":3000,"visibility":"private","ttlMinutes":60}"#
        );
        assert_eq!(
            serde_json::to_string(&RendererEvent::delivery(
                "sbx_1".to_owned(),
                DeliverySubmission::AcceptPromotion {
                    promotion_id: "prm_1".to_owned(),
                },
            ))
            .expect("serialize Promotion event"),
            r#"{"type":"promotion-accept","workspaceId":"sbx_1","promotionId":"prm_1"}"#
        );
    }

    #[test]
    fn ws_tui_task_delivery_confirmation_preserves_form_on_safe_error() {
        let mut state = delivery_ready_state();
        assert!(state.open_delivery_menu());
        state.move_delivery_selection(1);
        assert_eq!(
            state.activate_selected_delivery_action(),
            DeliveryDecision::FormOpened
        );
        state.delivery_form_insert('f');
        state.delivery_form_next_field();
        state.delivery_form_insert('c');
        state.delivery_form_next_field();
        assert_eq!(
            state.submit_delivery_form(),
            DeliveryDecision::AwaitConfirmation
        );
        let submission = state
            .confirm_delivery_action(true)
            .expect("confirmed task delivery");
        assert!(matches!(submission, DeliverySubmission::DeliverTask { .. }));
        state.apply(ParentMessage::Error {
            code: "delivery_failed".to_owned(),
            phase: "workspace-control-task-deliver".to_owned(),
            retryable: true,
        });
        assert!(state.delivery_form.is_some());
        assert!(state.pending_delivery_confirmation.is_some());
        assert!(!state.delivery_busy);
        state.apply(ParentMessage::DeliveryComplete {
            workspace_id: "sbx_1".to_owned(),
        });
        assert!(state.delivery_form.is_none());
        assert!(state.pending_delivery_confirmation.is_none());
    }

    fn delivery_ready_state() -> AppState {
        let mut state = AppState::default();
        state.apply(ParentMessage::Workspaces {
            workspaces: vec![WorkspaceSummary {
                workspace_id: "sbx_1".to_owned(),
                status: "ready".to_owned(),
                provider_key: None,
                source_kind: None,
                occupancy: None,
            }],
        });
        state.apply(ParentMessage::Detail {
            detail: DetailMessage {
                workspace: state.workspaces[0].clone(),
                runtimes: Vec::new(),
                ports: Vec::new(),
                tasks: vec![TaskSummary {
                    task_run_id: "task_deliver".to_owned(),
                    runtime_id: None,
                    status: "approved".to_owned(),
                }],
                promotions: Vec::new(),
                activation: None,
                target_selection: None,
                preview: None,
                deployment: None,
                recovery: RecoverySummary::default(),
            },
        });
        state
    }
}
