use anyhow::Result;
#[cfg(not(target_env = "musl"))]
use appaloft_workspace_control_tui_ratatui_spike::run_smoke;
use appaloft_workspace_control_tui_ratatui_spike::run_viewport_smoke;

fn main() -> Result<()> {
    if std::env::args().any(|argument| argument == "--viewport-only") {
        let evidence = run_viewport_smoke()?;
        println!(
            r#"{{"pass":true,"sessionId":"{}","unicode":{},"inputRoundTrip":{},"resize":{},"sameSessionId":{},"renderedByRatatui":{}}}"#,
            evidence.session_id,
            evidence.unicode,
            evidence.input_round_trip,
            evidence.resize,
            evidence.same_session_id,
            evidence.rendered_by_ratatui,
        );
        return Ok(());
    }

    run_default_smoke()
}

#[cfg(target_env = "musl")]
fn run_default_smoke() -> Result<()> {
    anyhow::bail!("the musl spike supports only the transport-neutral --viewport-only path")
}

#[cfg(not(target_env = "musl"))]
fn run_default_smoke() -> Result<()> {
    let evidence = run_smoke()?;
    println!(
        "{{\"pass\":true,\"childPid\":{},\"alternateScreen\":{},\"unicode\":{},\"inputRoundTrip\":{},\"resize\":{},\"sameChildPid\":{},\"renderedByRatatui\":{}}}",
        evidence.child_pid,
        evidence.alternate_screen,
        evidence.unicode,
        evidence.input_round_trip,
        evidence.resize,
        evidence.same_child_pid,
        evidence.rendered_by_ratatui,
    );
    Ok(())
}
