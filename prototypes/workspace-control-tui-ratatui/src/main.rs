use anyhow::Result;
use appaloft_workspace_control_tui_ratatui_spike::run_smoke;

fn main() -> Result<()> {
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
