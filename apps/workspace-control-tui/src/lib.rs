use crossterm::event::{KeyCode, KeyEvent, KeyModifiers, MouseButton, MouseEvent, MouseEventKind};
use ratatui::Frame;
use ratatui::layout::{Alignment, Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, BorderType, Borders, Clear, List, ListItem, Paragraph, Wrap};
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
            let sha = occupancy
                .commit_sha
                .get(..7)
                .unwrap_or(&occupancy.commit_sha);
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

fn occupancy_commit_message(commit_sha: &str) -> Option<String> {
    let sha = commit_sha.trim();
    if sha.len() < 7 || !sha.bytes().take(7).all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    Some(format!("Deliver {}", &sha[..7]))
}

fn occupancy_github_compare_available(occupancy: &OccupancySummary) -> bool {
    let Some(branch) = occupancy.branch.as_deref().map(str::trim) else {
        return false;
    };
    if branch.is_empty() {
        return false;
    }
    if !branch
        .chars()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, '_' | '.' | '/' | '-'))
    {
        return false;
    }
    occupancy
        .repository_identity
        .trim()
        .starts_with("github.com/")
}

#[allow(dead_code)]
fn occupancy_available_door_keys(detail: Option<&DetailMessage>) -> Vec<&'static str> {
    let Some(detail) = detail else {
        return Vec::new();
    };
    let mut doors = Vec::new();
    let has_pr = detail
        .pull_request
        .as_ref()
        .and_then(|pull_request| pull_request.url.as_deref())
        .is_some_and(|url| !url.trim().is_empty());
    if has_pr {
        doors.push("o open PR");
    } else if detail
        .workspace
        .occupancy
        .as_ref()
        .is_some_and(occupancy_github_compare_available)
    {
        doors.push("c compare");
    }
    if detail
        .preview
        .as_ref()
        .is_some_and(|preview| !preview.url.trim().is_empty())
    {
        doors.push("p preview");
    }
    if detail
        .production
        .as_ref()
        .is_some_and(|production| !production.url.trim().is_empty())
    {
        doors.push("P production");
    }
    if detail
        .connections
        .as_ref()
        .is_some_and(|connections| !connections.url.trim().is_empty())
    {
        doors.push("g connections");
    }
    doors
}

fn occupancy_control_footer(status_line: &str, _detail: Option<&DetailMessage>) -> String {
    format!(" {status_line}  │  enter connect  n new  w wake  d delete  ? ")
}

const OCCUPANCY_HELP_ROWS: &[&str] = &[
    "?              key list",
    "↑ ↓ / j k      move",
    "→ ← / h l      open/close row unavailable",
    "enter          connect",
    "⌥enter         connect and type",
    "shift+esc / ^] stop typing",
    "n              new session unavailable",
    "⌥n             new session, choose agent unavailable",
    "⌥p             new session from a prompt unavailable",
    "x              end session, stay on list",
    "s              sleep (pause)",
    "w              wake (resume)",
    "d              delete (confirm y)",
    "c              copy SSH unavailable",
    "r / ⌥r         refresh (⌥r from anywhere)",
    "t / ^t         set target unavailable",
    "f / ⌥f         fullscreen / restore the tree",
    "shift+enter    leave fullscreen unavailable",
    "⌥[ ⌥]          cycle open sessions (wrap, no wake)",
    "⌥t             theme unavailable",
    "⌥s             setup not in this door",
    "^o             unavailable",
    "q              unbound (not quit)",
    "esc            return to menu",
    "^c             quit from list/menu",
    "               pass through in session",
    "mouse          wheel / agent clicks; OSC 52 local copy",
];

fn occupancy_help_lines() -> Vec<Line<'static>> {
    OCCUPANCY_HELP_ROWS
        .iter()
        .copied()
        .map(Line::from)
        .collect()
}

fn occupancy_chrome_error_phase(phase: &str) -> bool {
    matches!(
        phase,
        "occupancy-code-bootstrap" | "workspace-control-select" | "workspace-control-start"
    )
}

fn occupancy_hides_error_status(code: &str, phase: &str) -> bool {
    code == "conflict" && occupancy_chrome_error_phase(phase)
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
pub struct OccupancyPullRequestChrome {
    pub number: u32,
    #[serde(default)]
    pub url: Option<String>,
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
    pub production: Option<OccupancyPreviewChrome>,
    #[serde(default)]
    pub deployment: Option<OccupancyDeploymentChrome>,
    #[serde(default)]
    pub pull_request: Option<OccupancyPullRequestChrome>,
    #[serde(default)]
    pub connections: Option<OccupancyPreviewChrome>,
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
    Progress {
        message: String,
        #[serde(default)]
        step: Option<String>,
    },
    Loading {
        #[serde(default)]
        collapsed: Option<bool>,
        #[serde(default)]
        title: Option<String>,
        #[serde(default)]
        project: Option<String>,
    },
    Chrome {
        #[serde(default)]
        title: Option<String>,
        #[serde(default)]
        project: Option<String>,
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
    OpenPr {
        #[serde(rename = "workspaceId")]
        workspace_id: String,
    },
    OpenPreview {
        #[serde(rename = "workspaceId")]
        workspace_id: String,
    },
    OpenProduction {
        #[serde(rename = "workspaceId")]
        workspace_id: String,
    },
    OpenCompare {
        #[serde(rename = "workspaceId")]
        workspace_id: String,
    },
    OpenConnections {
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

#[derive(Clone, Debug, PartialEq)]
pub struct OccupancyPrepareStep {
    pub id: String,
    pub label: String,
    pub status: String,
}

fn default_prepare_steps() -> Vec<OccupancyPrepareStep> {
    [
        ("credential", "Checking login"),
        ("skills", "Preparing skills"),
        ("disk", "Preparing disk"),
    ]
    .into_iter()
    .map(|(id, label)| OccupancyPrepareStep {
        id: id.to_owned(),
        label: label.to_owned(),
        status: "pending".to_owned(),
    })
    .collect()
}

fn infer_prepare_step_id(message: &str) -> &'static str {
    let lower = message.to_ascii_lowercase();
    if lower.contains("skill") {
        "skills"
    } else if lower.contains("login") || lower.contains("server") || lower.contains("credential") {
        "credential"
    } else {
        "disk"
    }
}

fn apply_prepare_step(steps: &mut [OccupancyPrepareStep], step_id: &str) {
    let mut reached = false;
    for step in steps.iter_mut() {
        if step.id == step_id {
            step.status = "active".to_owned();
            reached = true;
        } else if !reached {
            step.status = "done".to_owned();
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct OccupancyLoading {
    pub active: bool,
    pub collapsed: bool,
    pub title: String,
    pub project: String,
    pub steps: Vec<OccupancyPrepareStep>,
    pub tick: usize,
}

impl Default for OccupancyLoading {
    fn default() -> Self {
        Self {
            active: true,
            collapsed: true,
            title: "Appaloft Cloud Agents".to_owned(),
            project: String::new(),
            steps: default_prepare_steps(),
            tick: 0,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OpenPane {
    pub workspace_id: String,
    pub runtime_id: String,
    pub session_id: String,
}

fn occupancy_workspace_is_sleeping(status: &str) -> bool {
    matches!(status, "paused" | "pausing" | "sleeping")
}

pub struct AppState {
    pub workspaces: Vec<WorkspaceSummary>,
    pub selected: usize,
    pub detail: Option<DetailMessage>,
    pub agent_focused: bool,
    pub focus_mode: bool,
    pub loading: OccupancyLoading,
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
    pub wrap: bool,
    pub help_open: bool,
    pub open_panes: Vec<OpenPane>,
    pub pending_osc52: Vec<String>,
    pub osc52_carry: String,
    pub osc52_passthrough_failed: bool,
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
            loading: OccupancyLoading::default(),
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
            wrap: false,
            help_open: false,
            open_panes: Vec::new(),
            pending_osc52: Vec::new(),
            osc52_carry: String::new(),
            osc52_passthrough_failed: false,
            status_line: "preparing the agent".to_owned(),
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

    pub fn should_emit_workspace_select(&self) -> bool {
        !self.loading.active
            && !self.focus_mode
            && !self.agent_focused
            && self.selected_workspace_id().is_some()
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
                if !self.workspaces.is_empty() {
                    self.status_line = "Connected".to_owned();
                }
            }
            ParentMessage::Progress { message, step } => {
                self.loading.active = true;
                let step_id = step.unwrap_or_else(|| infer_prepare_step_id(&message).to_owned());
                apply_prepare_step(&mut self.loading.steps, &step_id);
                self.status_line = message;
            }
            ParentMessage::Loading {
                collapsed,
                title,
                project,
            } => {
                self.loading.active = true;
                if let Some(collapsed) = collapsed {
                    self.loading.collapsed = collapsed;
                }
                if let Some(title) = title {
                    self.loading.title = title;
                }
                if let Some(project) = project {
                    self.loading.project = project;
                }
                self.status_line = "preparing the agent".to_owned();
            }
            ParentMessage::Chrome { title, project } => {
                if let Some(title) = title {
                    self.loading.title = title;
                }
                if let Some(project) = project {
                    self.loading.project = project;
                }
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
                if !self.workspaces.is_empty() {
                    if self.session_id.is_none() && !self.agent_focused {
                        self.status_line = format!("{} Workspace(s)", self.workspaces.len());
                    }
                    if !self.loading.collapsed {
                        self.loading.active = false;
                    }
                }
            }
            ParentMessage::Detail { detail } => {
                self.loading.active = false;
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
                workspace_id,
                runtime_id,
                session_id,
                ..
            } => {
                self.runtime_id = Some(runtime_id.clone());
                self.session_id = Some(session_id.clone());
                self.remember_open_pane(&workspace_id, &runtime_id, &session_id);
                self.agent_focused = true;
                self.loading.active = false;
                // Product lock: focus_mode is after attach, never at launch.
                self.focus_mode = true;
                self.status_line = format!("Agent Session {session_id}");
            }
            ParentMessage::TerminalOutput { data, .. } => {
                let split = split_osc52(&self.osc52_carry, &data);
                self.osc52_carry = split.carry;
                self.pending_osc52.extend(split.sequences);
                self.terminal.process(split.display.as_bytes());
            }
            ParentMessage::TerminalClosed {
                reason, exit_code, ..
            } => {
                if let Some(session_id) = self.session_id.as_deref() {
                    self.open_panes.retain(|pane| pane.session_id != session_id);
                }
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
                if occupancy_hides_error_status(&code, &phase) {
                    // Chrome/list/detail conflicts stay off the attached footer.
                } else {
                    self.status_line = format!(
                        "{code} at {phase}{}",
                        if retryable { " — retry with r" } else { "" }
                    );
                }
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
    }

    pub fn show_agents_list(&mut self) {
        self.agent_focused = false;
        self.focus_mode = false;
        self.loading.active = false;
        self.loading.collapsed = false;
        self.help_open = false;
        self.status_line = "Appaloft Cloud Agents".to_owned();
    }

    fn remember_open_pane(&mut self, workspace_id: &str, runtime_id: &str, session_id: &str) {
        if let Some(existing) = self
            .open_panes
            .iter_mut()
            .find(|pane| pane.workspace_id == workspace_id || pane.session_id == session_id)
        {
            existing.workspace_id = workspace_id.to_owned();
            existing.runtime_id = runtime_id.to_owned();
            existing.session_id = session_id.to_owned();
            return;
        }
        self.open_panes.push(OpenPane {
            workspace_id: workspace_id.to_owned(),
            runtime_id: runtime_id.to_owned(),
            session_id: session_id.to_owned(),
        });
    }

    pub fn cycle_open_session(&mut self, delta: isize) -> Option<(String, String)> {
        let awake: Vec<OpenPane> = self
            .open_panes
            .iter()
            .filter(|pane| {
                self.workspaces
                    .iter()
                    .find(|workspace| workspace.workspace_id == pane.workspace_id)
                    .is_some_and(|workspace| !occupancy_workspace_is_sleeping(&workspace.status))
            })
            .cloned()
            .collect();
        if awake.is_empty() {
            self.mark_unavailable("switch session");
            return None;
        }
        let current = awake.iter().position(|pane| {
            Some(pane.session_id.as_str()) == self.session_id.as_deref()
                || Some(pane.workspace_id.as_str()) == self.selected_workspace_id()
        });
        let idx = current.unwrap_or(0);
        let next = (idx as isize + delta).rem_euclid(awake.len() as isize) as usize;
        let pane = &awake[next];
        if let Some(selected) = self
            .workspaces
            .iter()
            .position(|workspace| workspace.workspace_id == pane.workspace_id)
        {
            self.selected = selected;
        }
        if awake.len() == 1 && Some(pane.session_id.as_str()) == self.session_id.as_deref() {
            return None;
        }
        Some((pane.workspace_id.clone(), pane.runtime_id.clone()))
    }

    pub fn take_osc52(&mut self) -> Vec<String> {
        std::mem::take(&mut self.pending_osc52)
    }

    pub fn mark_osc52_passthrough_failed(&mut self) {
        self.osc52_passthrough_failed = true;
        self.status_line = OSC52_PASSTHROUGH_DISABLED.to_owned();
    }

    pub fn toggle_help(&mut self) {
        self.help_open = !self.help_open;
    }

    /// Wait/list chrome (including collapsed preparing) must quit on `^c`.
    /// Only an attached harness session may swallow `^c` and forward it.
    pub fn ctrl_c_quits(&self) -> bool {
        self.loading.active || !self.agent_focused
    }

    pub fn toggle_focus_mode(&mut self) {
        if self.loading.active {
            self.loading.collapsed = !self.loading.collapsed;
            return;
        }
        if self.session_id.is_some() {
            self.focus_mode = !self.focus_mode;
            self.agent_focused = self.focus_mode;
        }
    }

    pub fn tick_loading(&mut self) {
        if self.loading.active {
            self.loading.tick = self.loading.tick.wrapping_add(1);
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

    pub fn mark_unavailable(&mut self, capability: &str) {
        self.status_line = format!("{capability} is unavailable");
    }

    pub fn request_sleep(&mut self) -> Option<LifecycleAction> {
        self.request_lifecycle(LifecycleAction::Pause, "sleep")
    }

    pub fn request_wake(&mut self) -> Option<LifecycleAction> {
        self.request_lifecycle(LifecycleAction::Resume, "wake")
    }

    pub fn request_delete(&mut self) -> bool {
        if self.action_busy
            || !self
                .available_lifecycle_actions()
                .contains(&LifecycleAction::Terminate)
        {
            self.mark_unavailable("delete");
            return false;
        }
        self.pending_confirmation = Some(LifecycleAction::Terminate);
        self.status_line = "delete agent? y confirm  n cancel".to_owned();
        true
    }

    fn request_lifecycle(
        &mut self,
        action: LifecycleAction,
        capability: &str,
    ) -> Option<LifecycleAction> {
        if self.action_busy || !self.available_lifecycle_actions().contains(&action) {
            self.mark_unavailable(capability);
            return None;
        }
        self.action_busy = true;
        Some(action)
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
                let occupancy = self
                    .detail
                    .as_ref()
                    .and_then(|detail| detail.workspace.occupancy.as_ref());
                let branch = occupancy
                    .and_then(|occupancy| occupancy.branch.clone())
                    .unwrap_or_default();
                let commit_message = occupancy
                    .and_then(|occupancy| occupancy_commit_message(&occupancy.commit_sha))
                    .unwrap_or_default();
                let pull_request_title = if self
                    .detail
                    .as_ref()
                    .and_then(|detail| detail.pull_request.as_ref())
                    .is_none()
                {
                    branch.clone()
                } else {
                    String::new()
                };
                self.delivery_form = Some(DeliveryForm::Task {
                    task_run_id,
                    values: [
                        branch,
                        commit_message,
                        "origin".to_owned(),
                        pull_request_title,
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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OccupancyKeyBinding {
    Quit,
    PassToAgent,
    StopTyping,
    ShowAgentsList,
    ToggleFullscreen,
    Connect,
    NewSession,
    SleepAgent,
    WakeAgent,
    DeleteAgent,
    CopySsh,
    Refresh,
    SetTarget,
    ReturnToMenu,
    MoveUp,
    MoveDown,
    ToggleHelp,
    CycleOpenSession(i8),
    Unavailable(&'static str),
    Unhandled,
}

fn occupancy_bare_char(key: KeyEvent, expected: char) -> bool {
    let ctrl = key.modifiers.contains(KeyModifiers::CONTROL);
    let alt = key.modifiers.contains(KeyModifiers::ALT);
    matches!(key.code, KeyCode::Char(character) if character.eq_ignore_ascii_case(&expected))
        && !ctrl
        && !alt
}

fn occupancy_alt_char(key: KeyEvent, expected: char) -> bool {
    let ctrl = key.modifiers.contains(KeyModifiers::CONTROL);
    let alt = key.modifiers.contains(KeyModifiers::ALT);
    alt && !ctrl
        && matches!(key.code, KeyCode::Char(character) if character.eq_ignore_ascii_case(&expected))
}

fn occupancy_option_chrome(key: KeyEvent) -> Option<OccupancyKeyBinding> {
    if occupancy_alt_char(key, 'f') {
        return Some(OccupancyKeyBinding::ToggleFullscreen);
    }
    if occupancy_alt_char(key, 'r') {
        return Some(OccupancyKeyBinding::Refresh);
    }
    if occupancy_alt_char(key, 'n') {
        return Some(OccupancyKeyBinding::Unavailable(
            "new session, choose agent",
        ));
    }
    if occupancy_alt_char(key, 'p') {
        return Some(OccupancyKeyBinding::Unavailable(
            "new session from a prompt",
        ));
    }
    if occupancy_alt_char(key, 't') {
        return Some(OccupancyKeyBinding::Unavailable("theme"));
    }
    if occupancy_alt_char(key, 's') {
        return Some(OccupancyKeyBinding::Unavailable("setup"));
    }
    if occupancy_alt_char(key, '[') {
        return Some(OccupancyKeyBinding::CycleOpenSession(-1));
    }
    if occupancy_alt_char(key, ']') {
        return Some(OccupancyKeyBinding::CycleOpenSession(1));
    }
    if key.modifiers.contains(KeyModifiers::ALT)
        && !key.modifiers.contains(KeyModifiers::CONTROL)
        && matches!(key.code, KeyCode::Enter)
    {
        return Some(OccupancyKeyBinding::Connect);
    }
    None
}

pub fn is_occupancy_ctrl_c(key: KeyEvent) -> bool {
    matches!(key.code, KeyCode::Char('\u{3}'))
        || (key.modifiers.contains(KeyModifiers::CONTROL)
            && matches!(key.code, KeyCode::Char(character) if character.eq_ignore_ascii_case(&'c')))
}

pub fn occupancy_key_binding(
    key: KeyEvent,
    agent_focused: bool,
    _has_session: bool,
) -> OccupancyKeyBinding {
    let ctrl = key.modifiers.contains(KeyModifiers::CONTROL);
    let shift = key.modifiers.contains(KeyModifiers::SHIFT);
    if is_occupancy_ctrl_c(key) {
        return if agent_focused {
            OccupancyKeyBinding::PassToAgent
        } else {
            OccupancyKeyBinding::Quit
        };
    }
    if let Some(binding) = occupancy_option_chrome(key) {
        return binding;
    }
    if agent_focused {
        if ctrl && matches!(key.code, KeyCode::Char(']')) {
            return OccupancyKeyBinding::StopTyping;
        }
        if matches!(key.code, KeyCode::Esc) && shift {
            return OccupancyKeyBinding::StopTyping;
        }
        if occupancy_bare_char(key, 'x') {
            return OccupancyKeyBinding::ShowAgentsList;
        }
        return OccupancyKeyBinding::PassToAgent;
    }
    if matches!(key.code, KeyCode::Char('?')) && !ctrl {
        return OccupancyKeyBinding::ToggleHelp;
    }
    if matches!(key.code, KeyCode::Enter) && shift {
        return OccupancyKeyBinding::Unavailable("leave fullscreen connect");
    }
    if matches!(key.code, KeyCode::Enter) {
        return OccupancyKeyBinding::Connect;
    }
    if occupancy_bare_char(key, 'x') {
        return OccupancyKeyBinding::ShowAgentsList;
    }
    if occupancy_bare_char(key, 'n') {
        return OccupancyKeyBinding::NewSession;
    }
    if occupancy_bare_char(key, 's') {
        return OccupancyKeyBinding::SleepAgent;
    }
    if occupancy_bare_char(key, 'w') {
        return OccupancyKeyBinding::WakeAgent;
    }
    if occupancy_bare_char(key, 'd') {
        return OccupancyKeyBinding::DeleteAgent;
    }
    if occupancy_bare_char(key, 'c') {
        return OccupancyKeyBinding::CopySsh;
    }
    if occupancy_bare_char(key, 'r') {
        return OccupancyKeyBinding::Refresh;
    }
    if occupancy_bare_char(key, 't')
        || (ctrl
            && matches!(key.code, KeyCode::Char(character) if character.eq_ignore_ascii_case(&'t')))
    {
        return OccupancyKeyBinding::SetTarget;
    }
    if occupancy_bare_char(key, 'f') {
        return OccupancyKeyBinding::ToggleFullscreen;
    }
    if ctrl && matches!(key.code, KeyCode::Char(character) if character.eq_ignore_ascii_case(&'o'))
    {
        return OccupancyKeyBinding::Unavailable("ctrl+o");
    }
    if matches!(key.code, KeyCode::Esc) {
        return OccupancyKeyBinding::ReturnToMenu;
    }
    if matches!(key.code, KeyCode::Up) || occupancy_bare_char(key, 'k') {
        return OccupancyKeyBinding::MoveUp;
    }
    if matches!(key.code, KeyCode::Down) || occupancy_bare_char(key, 'j') {
        return OccupancyKeyBinding::MoveDown;
    }
    if matches!(key.code, KeyCode::Left | KeyCode::Right)
        || occupancy_bare_char(key, 'h')
        || occupancy_bare_char(key, 'l')
    {
        return OccupancyKeyBinding::Unavailable("open/close row");
    }
    OccupancyKeyBinding::Unhandled
}

/// Signals that restore and stop the occupancy TUI.
///
/// SIGINT is absent from this list so an attached session does not die when
/// the host PTY still has ISIG. Wait/list `^c` is handled as a key or as a
/// dedicated interrupt flag, not as a process-stop signal.
pub fn occupancy_stop_signals() -> &'static [i32] {
    &[
        signal_hook::consts::SIGTERM,
        signal_hook::consts::SIGHUP,
        signal_hook::consts::SIGQUIT,
    ]
}

/// Signals that must not use the process-stop flag.
///
/// SIGINT on the wait/list screen is a quit interrupt, not an ignored no-op.
pub fn occupancy_ignored_signals() -> &'static [i32] {
    &[signal_hook::consts::SIGINT]
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

fn occupancy_loading_visible(state: &AppState) -> bool {
    state.loading.active && state.detail.is_none() && !state.agent_focused && !state.focus_mode
}

fn spinner_frame(tick: usize) -> char {
    const FRAMES: [char; 10] = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    FRAMES[tick % FRAMES.len()]
}

fn centered_rect(width: u16, height: u16, area: Rect) -> Rect {
    let width = width.min(area.width.max(1));
    let height = height.min(area.height.max(1));
    Rect {
        x: area.x + area.width.saturating_sub(width) / 2,
        y: area.y + area.height.saturating_sub(height) / 2,
        width,
        height,
    }
}

fn occupancy_chrome_header(state: &AppState) -> String {
    if state.loading.project.is_empty() {
        state.loading.title.clone()
    } else {
        format!("{} · {}", state.loading.title, state.loading.project)
    }
}

pub const OSC52_PASSTHROUGH_DISABLED: &str =
    "Local terminal has OSC 52 disabled. Copy stayed on the remote agent.";

const OSC52_INTRO: &[u8] = b"\x1b]52;";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Osc52Split {
    pub display: String,
    pub sequences: Vec<String>,
    pub carry: String,
}

pub fn extract_osc52_sequences(data: &str) -> Vec<String> {
    split_osc52("", data).sequences
}

pub fn split_osc52(carry: &str, incoming: &str) -> Osc52Split {
    let mut input = String::with_capacity(carry.len() + incoming.len());
    input.push_str(carry);
    input.push_str(incoming);
    let bytes = input.as_bytes();
    let mut display = String::new();
    let mut sequences = Vec::new();
    let mut index = 0;
    while index < bytes.len() {
        if osc52_intro_prefix(&bytes[index..]) {
            let start = index;
            index += OSC52_INTRO.len();
            let mut ended = None;
            while index < bytes.len() {
                if bytes[index] == 0x07 {
                    ended = Some(index + 1);
                    break;
                }
                if bytes[index] == 0x1b && bytes.get(index + 1) == Some(&b'\\') {
                    ended = Some(index + 2);
                    break;
                }
                index += 1;
            }
            if let Some(end) = ended {
                sequences.push(input[start..end].to_owned());
                index = end;
            } else {
                return Osc52Split {
                    display,
                    sequences,
                    carry: input[start..].to_owned(),
                };
            }
            continue;
        }
        if bytes[index] == 0x1b && is_possible_osc52_start(&bytes[index..]) {
            return Osc52Split {
                display,
                sequences,
                carry: input[index..].to_owned(),
            };
        }
        let next = input[index..]
            .chars()
            .next()
            .map_or(1, |character| character.len_utf8());
        display.push_str(&input[index..index + next]);
        index += next;
    }
    Osc52Split {
        display,
        sequences,
        carry: String::new(),
    }
}

fn osc52_intro_prefix(bytes: &[u8]) -> bool {
    bytes.len() >= OSC52_INTRO.len() && bytes.starts_with(OSC52_INTRO)
}

fn is_possible_osc52_start(bytes: &[u8]) -> bool {
    !bytes.is_empty() && OSC52_INTRO.starts_with(bytes)
}

pub fn write_osc52_passthrough<W: std::io::Write>(
    writer: &mut W,
    sequences: &[String],
) -> std::io::Result<()> {
    for sequence in sequences {
        writer.write_all(sequence.as_bytes())?;
    }
    writer.flush()
}

fn occupancy_loading_step_lines(state: &AppState) -> Vec<Line<'static>> {
    state
        .loading
        .steps
        .iter()
        .map(|step| {
            let (marker, style) = match step.status.as_str() {
                "active" => (
                    format!("{} ", spinner_frame(state.loading.tick)),
                    Style::default().fg(Color::Cyan),
                ),
                "done" => ("✓ ".to_string(), Style::default().fg(Color::DarkGray)),
                _ => ("○ ".to_string(), Style::default().fg(Color::DarkGray)),
            };
            Line::from(vec![
                Span::styled(marker, style),
                Span::styled(step.label.clone(), style),
            ])
        })
        .collect()
}

fn occupancy_loading_footer(collapsed: bool) -> String {
    if collapsed {
        " ⌥f restore the tree  shift+esc/^] stop typing  ? ".to_owned()
    } else {
        " ⌥f hide the tree  shift+esc/^] stop typing  ? ".to_owned()
    }
}

fn occupancy_session_footer(state: &AppState) -> String {
    if state.osc52_passthrough_failed {
        format!(
            " {}  │  ⌥f restore the tree  wrap  shift+esc/^] stop typing ",
            OSC52_PASSTHROUGH_DISABLED
        )
    } else {
        " ⌥f restore the tree  wrap  shift+esc/^] stop typing ".to_owned()
    }
}

fn occupancy_agents_tree_lines(state: &AppState) -> Vec<Line<'static>> {
    let project = if state.loading.project.is_empty() {
        "this folder".to_owned()
    } else {
        state.loading.project.clone()
    };
    vec![
        Line::from(Span::styled(
            "Appaloft Cloud Agents",
            Style::default().add_modifier(Modifier::BOLD),
        )),
        Line::from(format!("  {project}")),
        Line::from("    preparing the agent"),
    ]
}

fn render_occupancy_loading(frame: &mut Frame<'_>, state: &AppState, area: Rect) {
    if !state.loading.collapsed {
        let columns = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([Constraint::Percentage(28), Constraint::Percentage(72)])
            .split(area);
        frame.render_widget(
            Paragraph::new(occupancy_agents_tree_lines(state)).block(
                Block::default()
                    .title(" Appaloft Cloud Agents ")
                    .borders(Borders::ALL),
            ),
            columns[0],
        );
        let wait = columns[1];
        render_occupancy_prepare_panel(frame, state, wait);
        return;
    }
    render_occupancy_prepare_panel(frame, state, area);
}

fn render_occupancy_prepare_panel(frame: &mut Frame<'_>, state: &AppState, area: Rect) {
    const STEP_ROWS: u16 = 9;
    let block = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(Style::default().fg(Color::Cyan))
        .title(Span::styled(
            format!(" {} ", occupancy_chrome_header(state)),
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        ));
    let inner = block.inner(area);
    frame.render_widget(block, area);
    let content_w = state
        .loading
        .steps
        .iter()
        .map(|step| step.label.chars().count() + 2)
        .chain(std::iter::once(
            occupancy_chrome_header(state).chars().count(),
        ))
        .max()
        .unwrap_or(0)
        .clamp(20, inner.width.max(1) as usize) as u16;
    let panel = centered_rect(content_w, (STEP_ROWS + 4).min(inner.height), inner);
    let rows = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(1),
            Constraint::Length(1),
            Constraint::Length(1),
            Constraint::Length(STEP_ROWS),
            Constraint::Min(0),
        ])
        .split(panel);
    frame.render_widget(
        Paragraph::new(Line::from(vec![
            Span::styled(
                format!("{} ", spinner_frame(state.loading.tick)),
                Style::default().fg(Color::Cyan),
            ),
            Span::styled(
                occupancy_chrome_header(state),
                Style::default()
                    .fg(Color::White)
                    .add_modifier(Modifier::BOLD),
            ),
        ]))
        .alignment(Alignment::Center),
        rows[0],
    );
    frame.render_widget(
        Paragraph::new("preparing the agent")
            .alignment(Alignment::Center)
            .style(Style::default().fg(Color::DarkGray)),
        rows[1],
    );
    frame.render_widget(
        Paragraph::new(occupancy_loading_step_lines(state)).wrap(Wrap { trim: false }),
        rows[3],
    );
}

pub fn render(frame: &mut Frame<'_>, state: &AppState) {
    let area = frame.area();
    let sections = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(3), Constraint::Length(1)])
        .split(area);
    let body = sections[0];
    let footer = sections[1];
    if occupancy_loading_visible(state) {
        render_occupancy_loading(frame, state, body);
        frame.render_widget(
            Paragraph::new(occupancy_loading_footer(state.loading.collapsed))
                .style(Style::default().fg(Color::DarkGray)),
            footer,
        );
        return;
    }
    if state.focus_mode {
        render_terminal(
            frame,
            state,
            body,
            format!(" {} ", occupancy_chrome_header(state)),
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
            List::new(items).block(
                Block::default()
                    .title(format!(" {} ", occupancy_chrome_header(state)))
                    .borders(Borders::ALL),
            ),
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
            let production = detail
                .production
                .as_ref()
                .map(|production| format!("Prod     {}", production.url))
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
            let pull_request = detail
                .pull_request
                .as_ref()
                .map(|pull_request| match &pull_request.url {
                    Some(url) => format!("PR       #{}\n{url}", pull_request.number),
                    None => format!("PR       #{}", pull_request.number),
                })
                .unwrap_or_default();
            format!(
                "Workspace {}  {}\n{}\n{}\n{}\n{}\n{}\n{}\nRecovery\nIsolation  {}\nContinuity {}\nSnapshot(s)\n{}\nWorkspace-owned cleanup: {}\nactive runtimes:{}  previews:{}\nBounded readback; not host/provider proof\nAgent Runtime(s)\n{}\nPorts\n{}\nTasks\n{}\nPromotions\n{}",
                occupancy_list_label(&detail.workspace),
                detail.workspace.status,
                preview,
                production,
                deployment,
                pull_request,
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
        Paragraph::new(if state.focus_mode {
            occupancy_session_footer(state)
        } else {
            occupancy_control_footer(&state.status_line, state.detail.as_ref())
        })
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
    if state.help_open {
        let width = 72_u16.min(area.width.saturating_sub(2)).max(2);
        let height = (OCCUPANCY_HELP_ROWS.len() as u16 + 2)
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
            Paragraph::new(occupancy_help_lines())
                .block(
                    Block::default()
                        .title(" Appaloft Cloud Agents ")
                        .borders(Borders::ALL),
                )
                .wrap(Wrap { trim: false }),
            dialog,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_no_bare_q_quit(text: &str) {
        assert!(
            !text.replace("^q quit", "").contains("q quit"),
            "bare q quit leaked:\n{text}"
        );
    }

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

    fn buffer_plain(terminal: &ratatui::Terminal<ratatui::backend::TestBackend>) -> String {
        let buffer = terminal.backend().buffer();
        let mut out = String::new();
        for y in 0..buffer.area.height {
            for x in 0..buffer.area.width {
                out.push_str(buffer[(x, y)].symbol());
            }
            out.push('\n');
        }
        out
    }

    #[test]
    fn ws_remote_progress_193_tui_keeps_connecting_status_until_workspaces_arrive() {
        let mut state = AppState::default();
        assert_eq!(state.status_line, "preparing the agent");
        assert!(state.loading.active);
        assert!(state.loading.collapsed);
        state.apply(ParentMessage::HelloOk);
        state.apply(ParentMessage::Progress {
            message: "Preparing disk on hostinger…".to_owned(),
            step: None,
        });
        state.apply(ParentMessage::Workspaces {
            workspaces: Vec::new(),
        });
        assert_eq!(state.status_line, "Preparing disk on hostinger…");
        assert_eq!(
            state
                .loading
                .steps
                .iter()
                .map(|step| step.status.as_str())
                .collect::<Vec<_>>(),
            vec!["done", "done", "active"]
        );
        assert!(state.loading.active);
        state.apply(ParentMessage::Workspaces {
            workspaces: vec![WorkspaceSummary {
                workspace_id: "sbx_1".to_owned(),
                status: "ready".to_owned(),
                provider_key: None,
                source_kind: None,
                occupancy: None,
            }],
        });
        assert_eq!(state.status_line, "1 Workspace(s)");
        assert!(state.loading.active);
        assert!(state.loading.collapsed);
    }

    #[test]
    fn ws_remote_progress_202_default_state_is_the_first_useful_alt_screen() {
        let state = AppState::default();
        assert_eq!(state.status_line, "preparing the agent");
        assert!(state.loading.active);
        assert!(state.loading.collapsed);
        let backend = ratatui::backend::TestBackend::new(100, 24);
        let mut terminal = ratatui::Terminal::new(backend).expect("test terminal");
        terminal
            .draw(|frame| render(frame, &state))
            .expect("draw first useful occupancy frame");
        let out = buffer_plain(&terminal);
        assert!(out.contains("preparing the agent"), "{out}");
        assert!(
            !out.contains("sbx_"),
            "first useful frame must stay collapsed:\n{out}"
        );
        assert!(!out.to_ascii_lowercase().contains("occupancy"), "{out}");
        assert!(out.contains("restore the tree"), "{out}");
        assert!(out.contains("?"), "{out}");
        assert_no_bare_q_quit(&out);
        assert!(!out.contains("^q quit"), "{out}");
        assert!(!out.contains("^c leave"), "{out}");
        assert!(out.contains("Checking login"), "{out}");
        assert!(out.contains("Preparing skills"), "{out}");
        assert!(out.contains("Preparing disk"), "{out}");
    }

    #[test]
    fn code_tui_chrome_keeps_preview_url_in_deploy_info_only() {
        let mut state = occupancy_delivery_ready_state(None);
        if let Some(detail) = state.detail.as_mut() {
            detail.preview = Some(OccupancyPreviewChrome {
                url: "http://app-sc156jw98k.127.0.0.1.sslip.io/".to_owned(),
            });
        }
        state.loading.title = "Appaloft Cloud Agents".to_owned();
        state.loading.project = "whoami".to_owned();
        state.focus_mode = true;
        state.session_id = Some("term_1".to_owned());
        let backend = ratatui::backend::TestBackend::new(100, 24);
        let mut terminal = ratatui::Terminal::new(backend).expect("test terminal");
        terminal
            .draw(|frame| render(frame, &state))
            .expect("draw focused session");
        let header = occupancy_chrome_header(&state);
        assert_eq!(header, "Appaloft Cloud Agents · whoami");
        assert!(!header.contains("sslip"));
        assert!(!header.to_ascii_lowercase().contains("occupancy"));
        state.focus_mode = false;
        terminal
            .draw(|frame| render(frame, &state))
            .expect("draw tree detail");
        let out = buffer_plain(&terminal);
        assert!(out.contains("Preview"), "{out}");
        assert!(out.contains("app-sc156jw98k"), "{out}");
        assert!(out.contains("sslip.io"), "{out}");
        assert!(out.contains("Appaloft Cloud Agents"), "{out}");
        assert!(!occupancy_chrome_header(&state).contains("sslip"));
        let list_footer = occupancy_control_footer(&state.status_line, state.detail.as_ref());
        assert!(list_footer.contains("enter connect"), "{list_footer}");
        assert!(list_footer.contains("n new"), "{list_footer}");
        assert!(list_footer.contains("w wake"), "{list_footer}");
        assert!(list_footer.contains("d delete"), "{list_footer}");
        assert!(!list_footer.contains("^q quit"), "{list_footer}");
        assert_no_bare_q_quit(&out);
        assert!(!out.contains("^c leave"), "{out}");
        assert!(!out.contains("Y restore"), "{out}");
    }

    #[test]
    fn code_tui_x_returns_to_cloud_agents_list_without_quitting() {
        let x = KeyEvent::new(KeyCode::Char('x'), KeyModifiers::NONE);
        assert_eq!(
            occupancy_key_binding(x, true, true),
            OccupancyKeyBinding::ShowAgentsList
        );
        assert_eq!(
            occupancy_key_binding(x, false, true),
            OccupancyKeyBinding::ShowAgentsList
        );
        assert_ne!(
            occupancy_key_binding(x, true, true),
            OccupancyKeyBinding::Quit
        );
        let mut state = AppState::default();
        state.loading.project = "whoami".to_owned();
        state.apply(ParentMessage::Workspaces {
            workspaces: vec![WorkspaceSummary {
                workspace_id: "sbx_1".to_owned(),
                status: "ready".to_owned(),
                provider_key: None,
                source_kind: None,
                occupancy: None,
            }],
        });
        state.apply(ParentMessage::TerminalReady {
            workspace_id: "sbx_1".to_owned(),
            runtime_id: "sar_1".to_owned(),
            session_id: "term_1".to_owned(),
        });
        assert!(state.focus_mode);
        assert!(state.agent_focused);
        state.show_agents_list();
        assert!(!state.focus_mode);
        assert!(!state.agent_focused);
        assert_eq!(state.status_line, "Appaloft Cloud Agents");
        assert_eq!(
            occupancy_chrome_header(&state),
            "Appaloft Cloud Agents · whoami"
        );
        assert_eq!(state.session_id.as_deref(), Some("term_1"));
        let backend = ratatui::backend::TestBackend::new(160, 24);
        let mut terminal = ratatui::Terminal::new(backend).expect("test terminal");
        terminal
            .draw(|frame| render(frame, &state))
            .expect("draw cloud agents list");
        let out = buffer_plain(&terminal);
        assert!(out.contains("Appaloft Cloud Agents"), "{out}");
        assert!(out.contains("whoami"), "{out}");
        assert!(!out.to_ascii_lowercase().contains("occupancy"), "{out}");
        let list_footer = occupancy_control_footer(&state.status_line, state.detail.as_ref());
        assert!(list_footer.contains("enter connect"), "{list_footer}");
        assert!(list_footer.contains("n new"), "{list_footer}");
        assert!(list_footer.contains("w wake"), "{list_footer}");
        assert!(list_footer.contains("d delete"), "{list_footer}");
        assert!(!list_footer.contains("^q quit"), "{list_footer}");
        assert_no_bare_q_quit(&list_footer);
        assert_no_bare_q_quit(&out);
    }

    #[test]
    fn code_tui_forwards_osc52_clipboard_from_nested_agent() {
        let mut state = AppState::default();
        state.apply(ParentMessage::TerminalOutput {
            stream: "stdout".to_owned(),
            data: "hello\u{1b}]52;c;c2FsdA==\u{7}world".to_owned(),
        });
        let sequences = state.take_osc52();
        assert_eq!(sequences, vec!["\u{1b}]52;c;c2FsdA==\u{7}".to_owned()]);
        assert_eq!(
            extract_osc52_sequences("pre\u{1b}]52;c;YQ==\u{1b}\\post"),
            vec!["\u{1b}]52;c;YQ==\u{1b}\\".to_owned()]
        );
        assert!(extract_osc52_sequences("no clipboard").is_empty());
        let split = split_osc52("", "hello\u{1b}]52;c;c2FsdA==\u{7}world");
        assert_eq!(split.display, "helloworld");
        assert!(split.carry.is_empty());
        assert!(!split.display.contains("]52;"));
    }

    #[test]
    fn code_tui_reassembles_osc52_split_across_terminal_frames() {
        let mut state = AppState::default();
        state.apply(ParentMessage::TerminalOutput {
            stream: "stdout".to_owned(),
            data: "pre\u{1b}]52;c;".to_owned(),
        });
        assert!(state.take_osc52().is_empty());
        state.apply(ParentMessage::TerminalOutput {
            stream: "stdout".to_owned(),
            data: "YQ==\u{7}post".to_owned(),
        });
        assert_eq!(state.take_osc52(), vec!["\u{1b}]52;c;YQ==\u{7}".to_owned()]);
        assert_eq!(
            split_osc52("\u{1b}]", "52;c;YQ==\u{1b}\\").sequences,
            vec!["\u{1b}]52;c;YQ==\u{1b}\\".to_owned()]
        );
    }

    #[test]
    fn code_tui_osc52_write_failure_says_local_terminal_disabled() {
        struct FailWriter;
        impl std::io::Write for FailWriter {
            fn write(&mut self, _buf: &[u8]) -> std::io::Result<usize> {
                Err(std::io::Error::new(
                    std::io::ErrorKind::BrokenPipe,
                    "host tty closed",
                ))
            }
            fn flush(&mut self) -> std::io::Result<()> {
                Ok(())
            }
        }
        let sequences = vec!["\u{1b}]52;c;YQ==\u{7}".to_owned()];
        let mut ok = Vec::new();
        write_osc52_passthrough(&mut ok, &sequences).expect("host tty write");
        assert_eq!(ok, sequences[0].as_bytes());
        assert!(write_osc52_passthrough(&mut FailWriter, &sequences).is_err());
        let mut state = AppState::default();
        state.focus_mode = true;
        state.mark_osc52_passthrough_failed();
        assert_eq!(state.status_line, OSC52_PASSTHROUGH_DISABLED);
        assert!(!state.status_line.to_ascii_lowercase().contains("occupancy"));
        assert!(!state.status_line.contains("pbcopy"));
        let backend = ratatui::backend::TestBackend::new(120, 8);
        let mut terminal = ratatui::Terminal::new(backend).expect("test terminal");
        terminal
            .draw(|frame| render(frame, &state))
            .expect("draw osc52 failure");
        let out = buffer_plain(&terminal);
        assert!(out.contains("OSC 52 disabled"), "{out}");
        assert!(out.contains("remote agent"), "{out}");
        assert!(!out.to_ascii_lowercase().contains("copied"), "{out}");
    }

    #[test]
    fn code_tui_help_rows_and_footers_never_say_occupancy() {
        for row in OCCUPANCY_HELP_ROWS {
            assert!(!row.to_ascii_lowercase().contains("occupancy"), "{row}");
        }
        assert!(
            !occupancy_loading_footer(true)
                .to_ascii_lowercase()
                .contains("occupancy")
        );
        assert!(
            !occupancy_loading_footer(false)
                .to_ascii_lowercase()
                .contains("occupancy")
        );
        assert!(
            !OSC52_PASSTHROUGH_DISABLED
                .to_ascii_lowercase()
                .contains("occupancy")
        );
        for (_, label) in [
            ("credential", "Checking login"),
            ("skills", "Preparing skills"),
            ("disk", "Preparing disk"),
        ] {
            assert!(!label.to_ascii_lowercase().contains("occupancy"), "{label}");
        }
    }

    #[test]
    fn code_tui_help_lists_ca_keys_without_occupancy_or_y_restore() {
        let mut state = AppState::default();
        state.loading.active = false;
        state.toggle_help();
        let backend = ratatui::backend::TestBackend::new(80, 40);
        let mut terminal = ratatui::Terminal::new(backend).expect("test terminal");
        terminal
            .draw(|frame| render(frame, &state))
            .expect("draw help");
        let out = buffer_plain(&terminal);
        assert!(out.contains("?              key list"), "{out}");
        assert!(out.contains("enter          connect"), "{out}");
        assert!(out.contains("⌥enter         connect and type"), "{out}");
        assert!(out.contains("j k"), "{out}");
        assert!(out.contains("h l"), "{out}");
        assert!(out.contains("new session unavailable"), "{out}");
        assert!(
            out.contains("new session, choose agent unavailable"),
            "{out}"
        );
        assert!(
            out.contains("new session from a prompt unavailable"),
            "{out}"
        );
        assert!(out.contains("end session, stay on list"), "{out}");
        assert!(out.contains("sleep (pause)"), "{out}");
        assert!(out.contains("wake (resume)"), "{out}");
        assert!(out.contains("delete (confirm y)"), "{out}");
        assert!(out.contains("copy SSH unavailable"), "{out}");
        assert!(out.contains("⌥r"), "{out}");
        assert!(
            out.contains("f / ⌥f         fullscreen / restore the tree"),
            "{out}"
        );
        assert!(out.contains("cycle open sessions (wrap, no wake)"), "{out}");
        assert!(out.contains("^o             unavailable"), "{out}");
        assert!(out.contains("q              unbound (not quit)"), "{out}");
        assert!(out.contains("quit from list/menu"), "{out}");
        assert!(out.contains("pass through in session"), "{out}");
        assert!(out.contains("setup not in this door"), "{out}");
        assert!(out.contains("OSC 52"), "{out}");
        assert!(!out.contains("^q"), "{out}");
        assert!(!out.contains("quit CLI"), "{out}");
        assert!(!out.to_ascii_lowercase().contains("occupancy"), "{out}");
        assert!(!out.contains("Y restore"), "{out}");
        assert!(!out.contains("^c leave"), "{out}");
        assert_no_bare_q_quit(&out);
    }

    #[test]
    fn ws_remote_progress_194_collapsed_launch_gives_the_wait_the_whole_window() {
        let mut state = AppState::default();
        state.apply(ParentMessage::Loading {
            collapsed: Some(true),
            title: Some("Appaloft Cloud Agents".to_owned()),
            project: Some("hello-static".to_owned()),
        });
        state.apply(ParentMessage::Progress {
            message: "Checking login…".to_owned(),
            step: None,
        });
        state.apply(ParentMessage::Progress {
            message: "Preparing disk on hostinger…".to_owned(),
            step: None,
        });
        state.apply(ParentMessage::Workspaces {
            workspaces: vec![WorkspaceSummary {
                workspace_id: "sbx_1".to_owned(),
                status: "ready".to_owned(),
                provider_key: None,
                source_kind: None,
                occupancy: None,
            }],
        });
        assert!(state.loading.active);
        assert!(state.loading.collapsed);
        assert!(
            !state.focus_mode,
            "collapsed launch is the wait screen, not attach focus_mode"
        );
        assert_eq!(
            state
                .loading
                .steps
                .iter()
                .map(|step| (step.label.as_str(), step.status.as_str()))
                .collect::<Vec<_>>(),
            vec![
                ("Checking login", "done"),
                ("Preparing skills", "done"),
                ("Preparing disk", "active")
            ]
        );
        let backend = ratatui::backend::TestBackend::new(100, 24);
        let mut terminal = ratatui::Terminal::new(backend).expect("test terminal");
        terminal
            .draw(|frame| render(frame, &state))
            .expect("draw collapsed loading");
        let out = buffer_plain(&terminal);
        assert!(out.contains("preparing the agent"), "{out}");
        assert!(out.contains("Appaloft Cloud Agents"), "{out}");
        assert!(out.contains("hello-static"), "{out}");
        assert!(out.contains("Checking login"), "{out}");
        assert!(out.contains("Preparing skills"), "{out}");
        assert!(out.contains("Preparing disk"), "{out}");
        assert!(out.contains('✓'), "{out}");
        assert!(out.contains("restore the tree"), "{out}");
        assert!(!out.to_ascii_lowercase().contains("occupancy"), "{out}");
        assert!(
            !out.contains("Connecting to Appaloft"),
            "connecting panel must stay step-shaped:\n{out}"
        );
        assert!(
            !out.contains("sbx_1"),
            "collapsed wait must hide the tree:\n{out}"
        );
        assert!(
            !out.contains("Select a Workspace to load bounded detail."),
            "collapsed wait is not Occupancy split:\n{out}"
        );
        state.loading.collapsed = false;
        terminal
            .draw(|frame| render(frame, &state))
            .expect("draw revealed agents tree");
        let revealed = buffer_plain(&terminal);
        assert!(revealed.contains("Appaloft Cloud Agents"), "{revealed}");
        assert!(revealed.contains("hello-static"), "{revealed}");
        assert!(revealed.contains("preparing the agent"), "{revealed}");
        assert!(
            !revealed.to_ascii_lowercase().contains("occupancy"),
            "{revealed}"
        );
        assert!(
            !revealed.contains("Select a Workspace to load bounded detail."),
            "{revealed}"
        );
        assert!(!revealed.contains("src/"), "{revealed}");
        assert!(revealed.contains("hide the tree"), "{revealed}");
        assert!(
            !state.focus_mode,
            "revealing the tree during wait is not attach focus_mode"
        );
        assert!(!state.should_emit_workspace_select());
    }

    #[test]
    fn ws_remote_progress_199_attached_footer_hides_chrome_conflicts() {
        let mut state = AppState::default();
        state.apply(ParentMessage::Loading {
            collapsed: Some(true),
            title: Some("Appaloft Cloud Agents".to_owned()),
            project: None,
        });
        state.apply(ParentMessage::TerminalReady {
            workspace_id: "sbx_1".to_owned(),
            runtime_id: "sar_1".to_owned(),
            session_id: "term_1".to_owned(),
        });
        let attached = state.status_line.clone();
        assert!(attached.contains("Agent Session"), "{attached}");
        state.apply(ParentMessage::Error {
            code: "conflict".to_owned(),
            phase: "workspace-control-select".to_owned(),
            retryable: false,
        });
        state.apply(ParentMessage::Error {
            code: "conflict".to_owned(),
            phase: "occupancy-code-bootstrap".to_owned(),
            retryable: false,
        });
        state.apply(ParentMessage::Workspaces {
            workspaces: vec![WorkspaceSummary {
                workspace_id: "sbx_1".to_owned(),
                status: "ready".to_owned(),
                provider_key: None,
                source_kind: None,
                occupancy: None,
            }],
        });
        assert_eq!(state.status_line, attached);
        assert!(!state.should_emit_workspace_select());
        let footer = occupancy_control_footer(&state.status_line, state.detail.as_ref());
        assert!(!footer.contains("conflict at"), "{footer}");
        assert!(!footer.contains("workspace-control-select"), "{footer}");
        assert!(!footer.contains("occupancy-code-bootstrap"), "{footer}");
        let backend = ratatui::backend::TestBackend::new(120, 24);
        let mut terminal = ratatui::Terminal::new(backend).expect("test terminal");
        terminal
            .draw(|frame| render(frame, &state))
            .expect("draw attached session");
        let out = buffer_plain(&terminal);
        assert!(!out.contains("conflict at"), "{out}");
        assert!(!out.contains("workspace-control-select"), "{out}");
    }

    #[test]
    fn ws_remote_ca_125_126_127_tui_footer_lists_only_present_occupancy_doors() {
        let preview_and_pr = occupancy_delivery_ready_state(Some(OccupancyPullRequestChrome {
            number: 928,
            url: Some("https://github.com/traefik/whoami/pull/928".to_owned()),
        }));
        let mut preview_and_pr = preview_and_pr;
        if let Some(detail) = preview_and_pr.detail.as_mut() {
            detail.preview = Some(OccupancyPreviewChrome {
                url: "http://app-sc156jw98k.127.0.0.1.sslip.io/".to_owned(),
            });
        }
        let preview_and_pr_doors = occupancy_available_door_keys(preview_and_pr.detail.as_ref());
        assert!(preview_and_pr_doors.iter().any(|door| *door == "o open PR"));
        assert!(preview_and_pr_doors.iter().any(|door| *door == "p preview"));
        assert!(!preview_and_pr_doors.iter().any(|door| *door == "c compare"));
        let preview_and_pr_footer = occupancy_control_footer("", preview_and_pr.detail.as_ref());
        assert!(preview_and_pr_footer.contains("enter connect"));
        assert!(!preview_and_pr_footer.contains("o open PR"));
        assert!(!preview_and_pr_footer.contains("p preview"));

        let existing_pr = occupancy_delivery_ready_state(Some(OccupancyPullRequestChrome {
            number: 928,
            url: Some("https://github.com/traefik/whoami/pull/928".to_owned()),
        }));
        assert!(
            occupancy_available_door_keys(existing_pr.detail.as_ref())
                .iter()
                .any(|door| *door == "o open PR")
        );

        let mut with_connections = occupancy_delivery_ready_state(None);
        if let Some(detail) = with_connections.detail.as_mut() {
            detail.connections = Some(OccupancyPreviewChrome {
                url: "https://app.appaloft.com/account/connections".to_owned(),
            });
        }
        assert!(
            occupancy_available_door_keys(with_connections.detail.as_ref())
                .iter()
                .any(|door| *door == "g connections")
        );

        let lean = occupancy_control_footer("", None);
        assert!(lean.contains("enter connect"));
        assert!(lean.contains("n new"));
        assert!(lean.contains("w wake"));
        assert!(lean.contains("d delete"));
        assert!(!lean.contains("o open PR"));
        assert!(!lean.contains("c compare"));
        assert!(!lean.contains("p preview"));
        assert!(!lean.contains("^q quit"));
        assert!(!lean.contains("x list"));
        assert_no_bare_q_quit(&lean);
        assert!(!lean.contains("^c leave"));
        assert!(!lean.contains("Y restore"));
        assert!(!lean.contains("Focus Mode"));
        assert!(!lean.to_ascii_lowercase().contains("occupancy"));
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
        assert!(state.focus_mode);
        assert_eq!(state.session_id.as_deref(), Some("term_same"));
        state.toggle_focus_mode();
        assert!(!state.focus_mode);
        assert_eq!(state.session_id.as_deref(), Some("term_same"));
        state.toggle_focus_mode();
        assert!(state.focus_mode);
        state.release_agent_focus();
        assert_eq!(state.session_id.as_deref(), Some("term_same"));
        assert!(!state.agent_focused);
    }

    #[test]
    fn code_tui_ctrl_c_passes_to_agent_and_never_quits() {
        let ctrl_c = KeyEvent::new(KeyCode::Char('c'), KeyModifiers::CONTROL);
        let ctrl_r = KeyEvent::new(KeyCode::Char('r'), KeyModifiers::CONTROL);
        let quit = KeyEvent::new(KeyCode::Char('q'), KeyModifiers::NONE);
        let invented_quit = KeyEvent::new(KeyCode::Char('q'), KeyModifiers::CONTROL);
        let stop = KeyEvent::new(KeyCode::Char(']'), KeyModifiers::CONTROL);
        let shift_esc = KeyEvent::new(KeyCode::Esc, KeyModifiers::SHIFT);
        assert_eq!(
            occupancy_key_binding(ctrl_c, true, true),
            OccupancyKeyBinding::PassToAgent
        );
        assert_eq!(
            occupancy_key_binding(ctrl_c, false, true),
            OccupancyKeyBinding::Quit
        );
        assert_eq!(
            occupancy_key_binding(ctrl_c, false, false),
            OccupancyKeyBinding::Quit
        );
        let raw_etx = KeyEvent::new(KeyCode::Char('\u{3}'), KeyModifiers::NONE);
        assert!(is_occupancy_ctrl_c(raw_etx));
        assert_eq!(
            occupancy_key_binding(raw_etx, false, false),
            OccupancyKeyBinding::Quit
        );
        assert_eq!(
            occupancy_key_binding(raw_etx, true, true),
            OccupancyKeyBinding::PassToAgent
        );
        let mut waiting = AppState::default();
        assert!(waiting.loading.active);
        assert!(!waiting.agent_focused);
        assert!(waiting.ctrl_c_quits());
        assert_eq!(
            occupancy_key_binding(ctrl_c, waiting.agent_focused, waiting.session_id.is_some()),
            OccupancyKeyBinding::Quit
        );
        waiting.apply(ParentMessage::TerminalReady {
            workspace_id: "sbx_1".to_owned(),
            runtime_id: "sar_1".to_owned(),
            session_id: "term_1".to_owned(),
        });
        assert!(waiting.agent_focused);
        assert!(!waiting.loading.active);
        assert!(!waiting.ctrl_c_quits());
        assert_eq!(
            occupancy_key_binding(ctrl_c, waiting.agent_focused, waiting.session_id.is_some()),
            OccupancyKeyBinding::PassToAgent
        );
        waiting.loading.active = true;
        assert!(
            waiting.ctrl_c_quits(),
            "preparing must still list-quit before harness focus"
        );
        assert_eq!(
            occupancy_key_binding(ctrl_r, true, true),
            OccupancyKeyBinding::PassToAgent
        );
        assert_eq!(
            occupancy_key_binding(quit, true, true),
            OccupancyKeyBinding::PassToAgent
        );
        assert_eq!(
            occupancy_key_binding(quit, false, true),
            OccupancyKeyBinding::Unhandled
        );
        assert_ne!(
            occupancy_key_binding(quit, false, false),
            OccupancyKeyBinding::Quit
        );
        assert_ne!(
            occupancy_key_binding(invented_quit, false, true),
            OccupancyKeyBinding::Quit
        );
        assert_eq!(
            occupancy_key_binding(stop, true, true),
            OccupancyKeyBinding::StopTyping
        );
        assert_ne!(
            occupancy_key_binding(stop, false, true),
            OccupancyKeyBinding::Quit
        );
        assert_eq!(
            occupancy_key_binding(shift_esc, true, true),
            OccupancyKeyBinding::StopTyping
        );
        assert_eq!(terminal_key_bytes(ctrl_c), Some("\u{3}".to_owned()));
        assert_eq!(terminal_key_bytes(ctrl_r), Some("\u{12}".to_owned()));
        assert!(!occupancy_stop_signals().contains(&signal_hook::consts::SIGINT));
        assert!(occupancy_ignored_signals().contains(&signal_hook::consts::SIGINT));
    }

    #[test]
    fn code_tui_ca_keys_map_sleep_wake_delete_and_say_unavailable() {
        let n = KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE);
        let s = KeyEvent::new(KeyCode::Char('s'), KeyModifiers::NONE);
        let w = KeyEvent::new(KeyCode::Char('w'), KeyModifiers::NONE);
        let d = KeyEvent::new(KeyCode::Char('d'), KeyModifiers::NONE);
        let c = KeyEvent::new(KeyCode::Char('c'), KeyModifiers::NONE);
        let t = KeyEvent::new(KeyCode::Char('t'), KeyModifiers::NONE);
        assert_eq!(
            occupancy_key_binding(n, false, true),
            OccupancyKeyBinding::NewSession
        );
        assert_eq!(
            occupancy_key_binding(s, false, true),
            OccupancyKeyBinding::SleepAgent
        );
        assert_eq!(
            occupancy_key_binding(w, false, true),
            OccupancyKeyBinding::WakeAgent
        );
        assert_eq!(
            occupancy_key_binding(d, false, true),
            OccupancyKeyBinding::DeleteAgent
        );
        assert_eq!(
            occupancy_key_binding(c, false, true),
            OccupancyKeyBinding::CopySsh
        );
        assert_eq!(
            occupancy_key_binding(t, false, true),
            OccupancyKeyBinding::SetTarget
        );
        let mut ready = occupancy_delivery_ready_state(None);
        assert_eq!(ready.request_sleep(), Some(LifecycleAction::Pause));
        ready.action_busy = false;
        ready.request_delete();
        assert_eq!(ready.pending_confirmation, Some(LifecycleAction::Terminate));
        let mut paused = occupancy_delivery_ready_state(None);
        if let Some(detail) = paused.detail.as_mut() {
            detail.workspace.status = "paused".to_owned();
        }
        assert_eq!(paused.request_wake(), Some(LifecycleAction::Resume));
        paused.request_sleep();
        assert!(paused.status_line.contains("sleep is unavailable"));
        let mut empty = AppState::default();
        empty.mark_unavailable("new session");
        assert_eq!(empty.status_line, "new session is unavailable");
        empty.mark_unavailable("copy SSH");
        assert_eq!(empty.status_line, "copy SSH is unavailable");
        assert!(!empty.status_line.to_ascii_lowercase().contains("occupancy"));
    }

    fn workspace(id: &str, status: &str) -> WorkspaceSummary {
        WorkspaceSummary {
            workspace_id: id.to_owned(),
            status: status.to_owned(),
            provider_key: None,
            source_kind: None,
            occupancy: None,
        }
    }

    #[test]
    fn code_tui_source_extra_ca_keys_keep_railway_meanings() {
        let help = KeyEvent::new(KeyCode::Char('?'), KeyModifiers::NONE);
        let quit = KeyEvent::new(KeyCode::Char('q'), KeyModifiers::NONE);
        let j = KeyEvent::new(KeyCode::Char('j'), KeyModifiers::NONE);
        let k = KeyEvent::new(KeyCode::Char('k'), KeyModifiers::NONE);
        let h = KeyEvent::new(KeyCode::Char('h'), KeyModifiers::NONE);
        let l = KeyEvent::new(KeyCode::Char('l'), KeyModifiers::NONE);
        let f = KeyEvent::new(KeyCode::Char('f'), KeyModifiers::NONE);
        let y = KeyEvent::new(KeyCode::Char('y'), KeyModifiers::NONE);
        let shift_y = KeyEvent::new(KeyCode::Char('Y'), KeyModifiers::SHIFT);
        let alt_f = KeyEvent::new(KeyCode::Char('f'), KeyModifiers::ALT);
        let alt_r = KeyEvent::new(KeyCode::Char('r'), KeyModifiers::ALT);
        let alt_n = KeyEvent::new(KeyCode::Char('n'), KeyModifiers::ALT);
        let alt_p = KeyEvent::new(KeyCode::Char('p'), KeyModifiers::ALT);
        let alt_enter = KeyEvent::new(KeyCode::Enter, KeyModifiers::ALT);
        let alt_prev = KeyEvent::new(KeyCode::Char('['), KeyModifiers::ALT);
        let alt_next = KeyEvent::new(KeyCode::Char(']'), KeyModifiers::ALT);
        let ctrl_o = KeyEvent::new(KeyCode::Char('o'), KeyModifiers::CONTROL);
        assert_eq!(
            occupancy_key_binding(help, false, false),
            OccupancyKeyBinding::ToggleHelp
        );
        assert_eq!(
            occupancy_key_binding(help, true, true),
            OccupancyKeyBinding::PassToAgent
        );
        assert_eq!(
            occupancy_key_binding(quit, false, false),
            OccupancyKeyBinding::Unhandled
        );
        assert_ne!(
            occupancy_key_binding(quit, false, true),
            OccupancyKeyBinding::Quit
        );
        assert_eq!(
            occupancy_key_binding(quit, true, true),
            OccupancyKeyBinding::PassToAgent
        );
        assert_eq!(
            occupancy_key_binding(j, false, false),
            OccupancyKeyBinding::MoveDown
        );
        assert_eq!(
            occupancy_key_binding(k, false, false),
            OccupancyKeyBinding::MoveUp
        );
        assert_eq!(
            occupancy_key_binding(h, false, false),
            OccupancyKeyBinding::Unavailable("open/close row")
        );
        assert_eq!(
            occupancy_key_binding(l, false, false),
            OccupancyKeyBinding::Unavailable("open/close row")
        );
        assert_eq!(
            occupancy_key_binding(f, false, false),
            OccupancyKeyBinding::ToggleFullscreen
        );
        assert_eq!(
            occupancy_key_binding(f, true, true),
            OccupancyKeyBinding::PassToAgent
        );
        assert_eq!(
            occupancy_key_binding(alt_f, true, true),
            OccupancyKeyBinding::ToggleFullscreen
        );
        assert_eq!(
            occupancy_key_binding(y, false, true),
            OccupancyKeyBinding::Unhandled
        );
        assert_eq!(
            occupancy_key_binding(shift_y, false, true),
            OccupancyKeyBinding::Unhandled
        );
        assert_eq!(
            occupancy_key_binding(alt_r, false, true),
            OccupancyKeyBinding::Refresh
        );
        assert_eq!(
            occupancy_key_binding(alt_r, true, true),
            OccupancyKeyBinding::Refresh
        );
        assert_eq!(
            occupancy_key_binding(alt_n, false, true),
            OccupancyKeyBinding::Unavailable("new session, choose agent")
        );
        assert_eq!(
            occupancy_key_binding(alt_p, false, true),
            OccupancyKeyBinding::Unavailable("new session from a prompt")
        );
        assert_eq!(
            occupancy_key_binding(alt_enter, false, true),
            OccupancyKeyBinding::Connect
        );
        assert_eq!(
            occupancy_key_binding(alt_prev, true, true),
            OccupancyKeyBinding::CycleOpenSession(-1)
        );
        assert_eq!(
            occupancy_key_binding(alt_next, false, true),
            OccupancyKeyBinding::CycleOpenSession(1)
        );
        assert_eq!(
            occupancy_key_binding(ctrl_o, false, true),
            OccupancyKeyBinding::Unavailable("ctrl+o")
        );
        assert_eq!(
            occupancy_key_binding(ctrl_o, true, true),
            OccupancyKeyBinding::PassToAgent
        );
        let mut state = AppState::default();
        state.apply(ParentMessage::Workspaces {
            workspaces: vec![
                workspace("sbx_1", "ready"),
                workspace("sbx_2", "ready"),
                workspace("sbx_sleep", "paused"),
            ],
        });
        state.apply(ParentMessage::TerminalReady {
            workspace_id: "sbx_1".to_owned(),
            runtime_id: "sar_1".to_owned(),
            session_id: "term_1".to_owned(),
        });
        state.apply(ParentMessage::TerminalReady {
            workspace_id: "sbx_2".to_owned(),
            runtime_id: "sar_2".to_owned(),
            session_id: "term_2".to_owned(),
        });
        state.apply(ParentMessage::TerminalReady {
            workspace_id: "sbx_sleep".to_owned(),
            runtime_id: "sar_sleep".to_owned(),
            session_id: "term_sleep".to_owned(),
        });
        assert_eq!(
            state.cycle_open_session(1),
            Some(("sbx_2".to_owned(), "sar_2".to_owned()))
        );
        state.session_id = Some("term_2".to_owned());
        assert_eq!(
            state.cycle_open_session(1),
            Some(("sbx_1".to_owned(), "sar_1".to_owned()))
        );
        state.session_id = Some("term_1".to_owned());
        assert_eq!(
            state.cycle_open_session(-1),
            Some(("sbx_2".to_owned(), "sar_2".to_owned()))
        );
        assert!(!state.status_line.contains("wake"));
        assert!(!state.status_line.contains("resume"));
        let mut only_sleep = AppState::default();
        only_sleep.apply(ParentMessage::Workspaces {
            workspaces: vec![workspace("sbx_sleep", "paused")],
        });
        only_sleep.apply(ParentMessage::TerminalReady {
            workspace_id: "sbx_sleep".to_owned(),
            runtime_id: "sar_sleep".to_owned(),
            session_id: "term_sleep".to_owned(),
        });
        assert_eq!(only_sleep.cycle_open_session(1), None);
        assert!(
            only_sleep
                .status_line
                .contains("switch session is unavailable")
        );
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
                production: Some(OccupancyPreviewChrome {
                    url: "https://whoami.example".to_owned(),
                }),
                deployment: Some(OccupancyDeploymentChrome {
                    id: "dep_rfqfapqwpyjn".to_owned(),
                    status: Some("succeeded".to_owned()),
                }),
                pull_request: Some(OccupancyPullRequestChrome {
                    number: 928,
                    url: Some("https://github.com/traefik/whoami/pull/928".to_owned()),
                }),
                connections: None,
                recovery: RecoverySummary::default(),
            },
        });
        let backend = ratatui::backend::TestBackend::new(120, 36);
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
        assert!(rendered.contains("whoami.example"));
        assert!(rendered.contains("dep_rfqfapqwpyjn"));
        assert!(rendered.contains("PR       #928"));
        assert!(rendered.contains("pull/928"));
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
            production: None,
            deployment: None,
            pull_request: None,
            connections: None,
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
            production: None,
            deployment: None,
            pull_request: None,
            connections: None,
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
            production: None,
            deployment: None,
            pull_request: None,
            connections: None,
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
            production: None,
            deployment: None,
            pull_request: None,
            connections: None,
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
                production: None,
                deployment: None,
                pull_request: None,
                connections: None,
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
        assert_eq!(
            serde_json::to_string(&RendererEvent::OpenPr {
                workspace_id: "sbx_1".to_owned(),
            })
            .expect("serialize open pr"),
            r#"{"type":"open-pr","workspaceId":"sbx_1"}"#
        );
        assert_eq!(
            serde_json::to_string(&RendererEvent::OpenPreview {
                workspace_id: "sbx_1".to_owned(),
            })
            .expect("serialize open preview"),
            r#"{"type":"open-preview","workspaceId":"sbx_1"}"#
        );
        assert_eq!(
            serde_json::to_string(&RendererEvent::OpenProduction {
                workspace_id: "sbx_1".to_owned(),
            })
            .expect("serialize open production"),
            r#"{"type":"open-production","workspaceId":"sbx_1"}"#
        );
        assert_eq!(
            serde_json::to_string(&RendererEvent::OpenCompare {
                workspace_id: "sbx_1".to_owned(),
            })
            .expect("serialize open compare"),
            r#"{"type":"open-compare","workspaceId":"sbx_1"}"#
        );
        assert_eq!(
            serde_json::to_string(&RendererEvent::OpenConnections {
                workspace_id: "sbx_1".to_owned(),
            })
            .expect("serialize open connections"),
            r#"{"type":"open-connections","workspaceId":"sbx_1"}"#
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
            production: None,
            deployment: None,
            pull_request: None,
            connections: None,
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

    #[test]
    fn ws_tui_deliver_task_prefills_occupancy_branch_and_pr_title() {
        let mut state = occupancy_delivery_ready_state(None);
        assert!(state.open_delivery_menu());
        state.move_delivery_selection(1);
        assert_eq!(
            state.activate_selected_delivery_action(),
            DeliveryDecision::FormOpened
        );
        assert_eq!(
            state.delivery_form,
            Some(DeliveryForm::Task {
                task_run_id: "task_deliver".to_owned(),
                values: [
                    "feat/occupancy".to_owned(),
                    "Deliver 1ce75d0".to_owned(),
                    "origin".to_owned(),
                    "feat/occupancy".to_owned(),
                    String::new(),
                    String::new(),
                ],
                field: 0,
            })
        );
    }

    #[test]
    fn ws_tui_deliver_task_leaves_pr_fields_blank_when_occupancy_pr_exists() {
        let mut state = occupancy_delivery_ready_state(Some(OccupancyPullRequestChrome {
            number: 928,
            url: Some("https://github.com/traefik/whoami/pull/928".to_owned()),
        }));
        assert!(state.open_delivery_menu());
        state.move_delivery_selection(1);
        assert_eq!(
            state.activate_selected_delivery_action(),
            DeliveryDecision::FormOpened
        );
        assert_eq!(
            state.delivery_form,
            Some(DeliveryForm::Task {
                task_run_id: "task_deliver".to_owned(),
                values: [
                    "feat/occupancy".to_owned(),
                    "Deliver 1ce75d0".to_owned(),
                    "origin".to_owned(),
                    String::new(),
                    String::new(),
                    String::new(),
                ],
                field: 0,
            })
        );
    }

    #[test]
    fn ws_tui_deliver_task_leaves_commit_blank_when_occupancy_sha_is_invalid() {
        let mut state = occupancy_delivery_ready_state(None);
        if let Some(detail) = state.detail.as_mut() {
            if let Some(occupancy) = detail.workspace.occupancy.as_mut() {
                occupancy.commit_sha = "not-a-sha".to_owned();
            }
        }
        assert!(state.open_delivery_menu());
        state.move_delivery_selection(1);
        assert_eq!(
            state.activate_selected_delivery_action(),
            DeliveryDecision::FormOpened
        );
        assert_eq!(
            state.delivery_form,
            Some(DeliveryForm::Task {
                task_run_id: "task_deliver".to_owned(),
                values: [
                    "feat/occupancy".to_owned(),
                    String::new(),
                    "origin".to_owned(),
                    "feat/occupancy".to_owned(),
                    String::new(),
                    String::new(),
                ],
                field: 0,
            })
        );
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
                production: None,
                deployment: None,
                pull_request: None,
                connections: None,
                recovery: RecoverySummary::default(),
            },
        });
        state
    }

    fn occupancy_delivery_ready_state(
        pull_request: Option<OccupancyPullRequestChrome>,
    ) -> AppState {
        let mut state = delivery_ready_state();
        let occupancy = OccupancySummary {
            repository_identity: "github.com/traefik/whoami".to_owned(),
            commit_sha: "1ce75d01b6978863647da42557a707a479da3a51".to_owned(),
            branch: Some("feat/occupancy".to_owned()),
        };
        state.workspaces[0].occupancy = Some(occupancy.clone());
        if let Some(detail) = state.detail.as_mut() {
            detail.workspace.occupancy = Some(occupancy);
            detail.pull_request = pull_request;
        }
        state
    }
}
