use std::io::{self, BufRead};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, TryRecvError};
use std::time::Duration;

use crossterm::event::{DisableBracketedPaste, DisableMouseCapture};
use crossterm::execute;
use crossterm::terminal::{LeaveAlternateScreen, disable_raw_mode};

pub const MAX_PENDING_TERMINAL_EVENTS: usize = 64;
pub const STOP_WATCHDOG_TIMEOUT: Duration = Duration::from_millis(200);

#[derive(Debug, PartialEq, Eq)]
pub enum ParentBatch<T> {
    Messages(Vec<T>),
    Disconnected,
}

#[derive(Debug, PartialEq, Eq)]
pub enum TerminalDrain<E> {
    Empty,
    Events(Vec<E>),
    Ended,
}

pub fn recv_parent_batch<T>(rx: &Receiver<T>) -> ParentBatch<T> {
    let mut messages = Vec::new();
    loop {
        match rx.try_recv() {
            Ok(message) => messages.push(message),
            Err(TryRecvError::Empty) => return ParentBatch::Messages(messages),
            Err(TryRecvError::Disconnected) => {
                return if messages.is_empty() {
                    ParentBatch::Disconnected
                } else {
                    ParentBatch::Messages(messages)
                };
            }
        }
    }
}

pub fn spawn_line_parent_reader<T>(
    reader: impl BufRead + Send + 'static,
    parse: impl Fn(&str) -> Option<T> + Send + 'static,
    on_end: Option<T>,
) -> Receiver<T>
where
    T: Send + 'static,
{
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        for line in reader.lines() {
            let Ok(line) = line else { break };
            let Some(message) = parse(&line) else {
                continue;
            };
            if tx.send(message).is_err() {
                return;
            }
        }
        if let Some(end) = on_end {
            let _ = tx.send(end);
        }
    });
    rx
}

pub fn drain_terminal_events<E, P, R>(
    first_wait: Duration,
    mut poll_ready: P,
    mut read_event: R,
    stop: Option<&AtomicBool>,
) -> io::Result<TerminalDrain<E>>
where
    P: FnMut(Duration) -> io::Result<bool>,
    R: FnMut() -> io::Result<E>,
{
    if stop.is_some_and(|flag| flag.load(Ordering::Relaxed)) {
        return Ok(TerminalDrain::Empty);
    }
    if !poll_ready(first_wait)? {
        return Ok(TerminalDrain::Empty);
    }

    let mut events = Vec::new();
    loop {
        if stop.is_some_and(|flag| flag.load(Ordering::Relaxed)) {
            break;
        }
        match read_event() {
            Ok(event) => events.push(event),
            Err(error) if error.kind() == io::ErrorKind::Interrupted => {}
            Err(_) => return Ok(TerminalDrain::Ended),
        }
        if events.len() >= MAX_PENDING_TERMINAL_EVENTS {
            break;
        }
        if !poll_ready(Duration::ZERO)? {
            break;
        }
    }

    Ok(if events.is_empty() {
        TerminalDrain::Empty
    } else {
        TerminalDrain::Events(events)
    })
}

pub fn restore_hosted_terminal() {
    let _ = disable_raw_mode();
    let _ = execute!(
        io::stdout(),
        DisableBracketedPaste,
        DisableMouseCapture,
        LeaveAlternateScreen
    );
}

pub fn spawn_stop_watchdog(stop: Arc<AtomicBool>) {
    spawn_stop_watchdog_with(stop, STOP_WATCHDOG_TIMEOUT, || {
        restore_hosted_terminal();
        std::process::exit(1);
    });
}

pub fn spawn_stop_watchdog_with(
    stop: Arc<AtomicBool>,
    timeout: Duration,
    on_stuck: impl FnOnce() + Send + 'static,
) {
    std::thread::spawn(move || {
        while !stop.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_millis(10));
        }
        std::thread::sleep(timeout);
        if stop.load(Ordering::Relaxed) {
            on_stuck();
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::mpsc;
    use std::sync::Arc;
    use std::time::{Duration, Instant};

    #[test]
    fn parent_disconnect_without_shutdown_is_exit() {
        let (tx, rx) = mpsc::channel::<u8>();
        drop(tx);
        assert_eq!(recv_parent_batch(&rx), ParentBatch::Disconnected);
    }

    #[test]
    fn parent_empty_channel_is_not_exit() {
        let (_tx, rx) = mpsc::channel::<u8>();
        assert_eq!(recv_parent_batch(&rx), ParentBatch::Messages(Vec::new()));
    }

    #[test]
    fn parent_pending_messages_flush_before_disconnect() {
        let (tx, rx) = mpsc::channel();
        tx.send(1).expect("send");
        tx.send(2).expect("send");
        drop(tx);
        assert_eq!(recv_parent_batch(&rx), ParentBatch::Messages(vec![1, 2]));
        assert_eq!(recv_parent_batch(&rx), ParentBatch::Disconnected);
    }

    #[test]
    fn reader_eof_emits_end_message_then_disconnects() {
        let cursor = io::Cursor::new("{\"type\":\"hello-ok\"}\n");
        let rx = spawn_line_parent_reader(
            cursor,
            |line| Some(line.trim().to_owned()),
            Some("shutdown".to_owned()),
        );
        let started = Instant::now();
        let mut seen = Vec::new();
        while started.elapsed() < Duration::from_millis(200) {
            match recv_parent_batch(&rx) {
                ParentBatch::Messages(messages) => seen.extend(messages),
                ParentBatch::Disconnected => break,
            }
            std::thread::sleep(Duration::from_millis(5));
        }
        assert_eq!(
            seen,
            vec!["{\"type\":\"hello-ok\"}".to_owned(), "shutdown".to_owned()]
        );
        assert_eq!(recv_parent_batch(&rx), ParentBatch::Disconnected);
    }

    #[test]
    fn drain_eof_from_always_ready_fd_does_not_spin() {
        let polls = AtomicUsize::new(0);
        let reads = AtomicUsize::new(0);
        let outcome = drain_terminal_events(
            Duration::ZERO,
            |_| {
                polls.fetch_add(1, Ordering::Relaxed);
                Ok(true)
            },
            || {
                reads.fetch_add(1, Ordering::Relaxed);
                Err(io::Error::new(io::ErrorKind::UnexpectedEof, "eof"))
            },
            None,
        )
        .expect("drain");
        assert_eq!(outcome, TerminalDrain::<()>::Ended);
        assert_eq!(polls.load(Ordering::Relaxed), 1);
        assert_eq!(reads.load(Ordering::Relaxed), 1);
    }

    #[test]
    fn drain_non_interrupt_io_error_is_terminal_end() {
        let outcome = drain_terminal_events(
            Duration::ZERO,
            |_| Ok(true),
            || Err(io::Error::new(io::ErrorKind::BrokenPipe, "pty gone")),
            None,
        )
        .expect("drain");
        assert_eq!(outcome, TerminalDrain::<()>::Ended);
    }

    #[test]
    fn drain_is_bounded_when_poll_stays_ready() {
        let reads = AtomicUsize::new(0);
        let outcome = drain_terminal_events(
            Duration::ZERO,
            |_| Ok(true),
            || {
                reads.fetch_add(1, Ordering::Relaxed);
                Ok(reads.load(Ordering::Relaxed))
            },
            None,
        )
        .expect("drain");
        assert_eq!(
            outcome,
            TerminalDrain::Events((1..=MAX_PENDING_TERMINAL_EVENTS).collect())
        );
        assert_eq!(reads.load(Ordering::Relaxed), MAX_PENDING_TERMINAL_EVENTS);
    }

    #[test]
    fn drain_checks_stop_between_ready_reads() {
        let stop = AtomicBool::new(false);
        let reads = AtomicUsize::new(0);
        let outcome = drain_terminal_events(
            Duration::ZERO,
            |_| Ok(true),
            || {
                let count = reads.fetch_add(1, Ordering::Relaxed) + 1;
                if count == 2 {
                    stop.store(true, Ordering::Relaxed);
                }
                Ok(count)
            },
            Some(&stop),
        )
        .expect("drain");
        assert_eq!(outcome, TerminalDrain::Events(vec![1, 2]));
        assert!(reads.load(Ordering::Relaxed) <= 3);
    }

    #[test]
    fn stop_watchdog_fires_when_loop_stays_stuck() {
        let stop = Arc::new(AtomicBool::new(true));
        let (tx, rx) = mpsc::channel();
        spawn_stop_watchdog_with(stop, Duration::from_millis(20), move || {
            let _ = tx.send(());
        });
        rx.recv_timeout(Duration::from_secs(2)).expect("watchdog fired");
    }

    #[test]
    fn stop_watchdog_waits_for_stop_flag() {
        let stop = Arc::new(AtomicBool::new(false));
        let (tx, rx) = mpsc::channel();
        spawn_stop_watchdog_with(Arc::clone(&stop), Duration::from_millis(20), move || {
            let _ = tx.send(());
        });
        assert!(rx.recv_timeout(Duration::from_millis(50)).is_err());
        stop.store(true, Ordering::Relaxed);
        rx.recv_timeout(Duration::from_secs(2))
            .expect("watchdog fired after stop");
    }
}
