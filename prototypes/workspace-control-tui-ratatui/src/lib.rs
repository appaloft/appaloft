#[cfg(not(target_env = "musl"))]
use std::io::{Read, Write};
#[cfg(not(target_env = "musl"))]
use std::sync::{Arc, Mutex};
#[cfg(not(target_env = "musl"))]
use std::time::{Duration, Instant};

#[cfg(not(target_env = "musl"))]
use anyhow::bail;
use anyhow::{Context, Result};
#[cfg(not(target_env = "musl"))]
use portable_pty::{CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use ratatui::Terminal;
use ratatui::backend::TestBackend;
use ratatui::layout::{Constraint, Layout};
use ratatui::widgets::{Block, Borders, Paragraph};

#[cfg(not(target_env = "musl"))]
pub struct SmokeEvidence {
    pub alternate_screen: bool,
    pub unicode: bool,
    pub input_round_trip: bool,
    pub resize: bool,
    pub same_child_pid: bool,
    pub rendered_by_ratatui: bool,
    pub child_pid: u32,
}

pub struct ViewportSmokeEvidence {
    pub session_id: &'static str,
    pub unicode: bool,
    pub input_round_trip: bool,
    pub resize: bool,
    pub same_session_id: bool,
    pub rendered_by_ratatui: bool,
}

#[cfg(not(target_env = "musl"))]
struct EmbeddedPty {
    parser: Arc<Mutex<vt100::Parser>>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
    master: Box<dyn MasterPty + Send>,
    size: (u16, u16),
}

#[cfg(not(target_env = "musl"))]
impl EmbeddedPty {
    fn spawn(rows: u16, cols: u16) -> Result<Self> {
        let pty = NativePtySystem::default()
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .context("allocate fixture PTY")?;
        let mut command = CommandBuilder::new("/bin/sh");
        command.arg("-c");
        command.arg(
            r#"printf '\033[?1049h\033[2J\033[Hagent: READY\r\n中文: 宽字符 🚀 é\r\n';
               printf 'PID:%s\r\n' $$;
               IFS= read -r line;
               printf '\r\nECHO:%s\r\n' "$line";
               sleep 5"#,
        );
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");
        let child = pty
            .slave
            .spawn_command(command)
            .context("spawn native Agent fixture")?;
        drop(pty.slave);

        let parser = Arc::new(Mutex::new(vt100::Parser::new(rows, cols, 4_000)));
        let mut reader = pty.master.try_clone_reader().context("clone PTY reader")?;
        let writer = pty.master.take_writer().context("take PTY writer")?;
        {
            let parser = Arc::clone(&parser);
            std::thread::spawn(move || {
                let mut buffer = [0_u8; 8_192];
                loop {
                    match reader.read(&mut buffer) {
                        Ok(0) | Err(_) => break,
                        Ok(read) => {
                            if let Ok(mut parser) = parser.lock() {
                                parser.process(&buffer[..read]);
                            }
                        }
                    }
                }
            });
        }

        Ok(Self {
            parser,
            writer,
            child,
            master: pty.master,
            size: (rows, cols),
        })
    }

    fn child_pid(&self) -> u32 {
        self.child.process_id().unwrap_or_default()
    }

    fn send(&mut self, data: &[u8]) -> Result<()> {
        self.writer.write_all(data).context("write PTY input")?;
        self.writer.flush().context("flush PTY input")?;
        Ok(())
    }

    fn resize(&mut self, rows: u16, cols: u16) -> Result<()> {
        self.parser
            .lock()
            .map_err(|_| anyhow::anyhow!("terminal parser lock poisoned"))?
            .set_size(rows, cols);
        self.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .context("resize fixture PTY")?;
        self.size = (rows, cols);
        Ok(())
    }

    fn wait_for(&self, needle: &str) -> Result<String> {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            let contents = self
                .parser
                .lock()
                .map_err(|_| anyhow::anyhow!("terminal parser lock poisoned"))?
                .screen()
                .contents();
            if contents.contains(needle) {
                return Ok(contents);
            }
            if Instant::now() >= deadline {
                bail!("timed out waiting for {needle}; screen={contents:?}");
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    }

    fn alternate_screen(&self) -> Result<bool> {
        Ok(self
            .parser
            .lock()
            .map_err(|_| anyhow::anyhow!("terminal parser lock poisoned"))?
            .screen()
            .alternate_screen())
    }

    fn stop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn render_workspace(screen: &str, width: u16, height: u16) -> Result<String> {
    let backend = TestBackend::new(width, height);
    let mut terminal = Terminal::new(backend).context("create Ratatui test backend")?;
    terminal
        .draw(|frame| {
            let [navigation, agent] =
                Layout::horizontal([Constraint::Length(24), Constraint::Min(1)])
                    .areas(frame.area());
            frame.render_widget(
                Paragraph::new("Workspace\nterm_managed\nAgent: native")
                    .block(Block::default().title("Appaloft").borders(Borders::ALL)),
                navigation,
            );
            frame.render_widget(
                Paragraph::new(screen.to_owned())
                    .block(Block::default().title("Agent").borders(Borders::ALL)),
                agent,
            );
        })
        .context("draw Ratatui Workspace frame")?;

    let buffer = terminal.backend().buffer();
    Ok(buffer
        .content
        .iter()
        .map(|cell| cell.symbol())
        .collect::<String>())
}

pub fn run_viewport_smoke() -> Result<ViewportSmokeEvidence> {
    let session_id = "term_managed";
    let mut parser = vt100::Parser::new(20, 80, 4_000);
    parser.process(
        b"\x1b[?1049h\x1b[2J\x1b[Hagent: READY\r\n\xe4\xb8\xad\xe6\x96\x87: \xe5\xae\xbd\xe5\xad\x97\xe7\xac\xa6 \xf0\x9f\x9a\x80 e\xcc\x81\r\n",
    );
    let first_screen = parser.screen().contents();
    let unicode =
        first_screen.contains("中文") && first_screen.contains("🚀") && first_screen.contains("é");
    let rendered = render_workspace(&first_screen, 100, 24)?;
    let rendered_by_ratatui = rendered.contains("Appaloft")
        && rendered.contains("term_managed")
        && rendered.contains("agent: READY");

    let forwarded_input = b"hello-from-appaloft\r".to_vec();
    let input_round_trip =
        String::from_utf8(forwarded_input).as_deref() == Ok("hello-from-appaloft\r");
    parser.set_size(30, 100);
    let resize = parser.screen().size() == (30, 100);

    Ok(ViewportSmokeEvidence {
        session_id,
        unicode,
        input_round_trip,
        resize,
        same_session_id: session_id == "term_managed",
        rendered_by_ratatui,
    })
}

#[cfg(not(target_env = "musl"))]
pub fn run_smoke() -> Result<SmokeEvidence> {
    let mut pty = EmbeddedPty::spawn(20, 80)?;
    let child_pid = pty.child_pid();
    let first_screen = pty.wait_for("agent: READY")?;
    let alternate_screen = pty.alternate_screen()?;
    let unicode =
        first_screen.contains("中文") && first_screen.contains("🚀") && first_screen.contains("é");
    let rendered = render_workspace(&first_screen, 100, 24)?;
    let rendered_by_ratatui = rendered.contains("Appaloft")
        && rendered.contains("term_managed")
        && rendered.contains("agent: READY");

    pty.resize(30, 100)?;
    let resize = pty.size == (30, 100);
    let same_child_pid = child_pid != 0 && child_pid == pty.child_pid();
    pty.send(b"hello-from-appaloft\r")?;
    let final_screen = pty.wait_for("ECHO:hello-from-appaloft")?;
    let input_round_trip = final_screen.contains("ECHO:hello-from-appaloft");
    pty.stop();

    Ok(SmokeEvidence {
        alternate_screen,
        unicode,
        input_round_trip,
        resize,
        same_child_pid,
        rendered_by_ratatui,
        child_pid,
    })
}

#[cfg(test)]
mod tests {
    #[cfg(not(target_env = "musl"))]
    use super::run_smoke;
    use super::run_viewport_smoke;

    #[test]
    fn ws_tui_spike_001_004_005_008_renders_transport_neutral_session() {
        let evidence = run_viewport_smoke().expect("transport-neutral viewport smoke should pass");
        assert_eq!(evidence.session_id, "term_managed");
        assert!(evidence.unicode);
        assert!(evidence.input_round_trip);
        assert!(evidence.resize);
        assert!(evidence.same_session_id);
        assert!(evidence.rendered_by_ratatui);
    }

    #[cfg(not(target_env = "musl"))]
    #[test]
    fn ws_tui_spike_002_003_004_008_embeds_one_native_pty() {
        let evidence = run_smoke().expect("Ratatui PTY smoke should pass");
        assert!(evidence.alternate_screen);
        assert!(evidence.unicode);
        assert!(evidence.input_round_trip);
        assert!(evidence.resize);
        assert!(evidence.same_child_pid);
        assert!(evidence.rendered_by_ratatui);
    }
}
