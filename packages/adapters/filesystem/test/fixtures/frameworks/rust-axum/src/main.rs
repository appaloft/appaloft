use axum::{routing::get, Router};

#[tokio::main]
async fn main() {
    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_owned());
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .expect("bind fixture listener");
    let app = Router::new().route("/", get(|| async { "Rust Axum fixture ready" }));

    axum::serve(listener, app)
        .await
        .expect("serve fixture app");
}
