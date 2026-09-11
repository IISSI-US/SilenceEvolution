// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

use crate::*;

use databases::*;
use socket_executor::{handshake_cx::*, *};

use tokio::sync::*;

static CONSOLE_TRACING_TX: OnceCell<broadcast::Receiver<Bytes>> = OnceCell::const_new();

#[derive(Clone, Serialize, Deserialize, BoxedAny, Getters, Display, Debug)]
#[display("Console stream.")]
pub struct ConsoleStream;

#[derive(Clone)]
pub struct ConsoleTracingWriter(broadcast::Sender<Bytes>);

impl ConsoleTracingWriter {
    pub async fn new() -> Self {
        let (tx, rx) = broadcast::channel::<Bytes>(1);

        let _ = CONSOLE_TRACING_TX.get_or_init(async || rx).await;

        ConsoleTracingWriter(tx)
    }
}

impl Write for ConsoleTracingWriter {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let ConsoleTracingWriter(tx) = self;

        let _ = tx.send(buf.into());

        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

impl<'a> fmt::MakeWriter<'a> for ConsoleTracingWriter {
    type Writer = ConsoleTracingWriter;

    fn make_writer(&'a self) -> Self::Writer {
        self.to_owned()
    }
}

impl AnyExt for ConsoleStream {
    fn name(&self) -> &str {
        "silence_console"
    }
}

/// TODO: add docs here.
#[typetag::serde(name = "ConsoleStream")]
#[async_trait]
impl AnySocketExecutor for ConsoleStream {
    async fn execute(
        &self,
        _handshake_cx: HandshakeCx,
        websocket: HyperWebsocket,
        _db_conns: DbConns,
    ) -> Result<(), Infallible> {
        let Ok(mut websocket) = websocket.await else {
            panic!("Couldn't get socket stream.")
        };

        let mut rx = CONSOLE_TRACING_TX
            .get()
            .expect("Console tracing channel is not initialized.")
            .resubscribe();

        loop {
            let rx_message = websocket.next();
            let rx_log = rx.recv();

            tokio::select! {
                Some(rx_message) = rx_message => {
                    match rx_message {
                        Ok(_) => (),
                        _ => panic!("Couldn't get next message from stream."),
                    };
                },
                rx_log = rx_log => {
                    match rx_log {
                        Ok(entry) => {
                            let Ok(_) = websocket
                                .send(Message::binary(ConnBytes::from_iter(entry)))
                                .await else {
                                    break
                                };
                        }
                        Err(broadcast::error::RecvError::Lagged(skipped)) => {
                            let Ok(_) = websocket
                                .send(Message::Text(
                                    format!("Internal logging channel lagged, {} entries were skipped.", skipped).into(),
                                ))
                                .await else {
                                    break
                                };
                        }
                        _ => break,
                    }
                }
                else => break
            };
        }

        Ok(())
    }
}
