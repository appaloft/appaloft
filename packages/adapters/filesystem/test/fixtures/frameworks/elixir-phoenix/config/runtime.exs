import Config

config :appaloft_phoenix, AppaloftPhoenix.Endpoint,
  http: [ip: {0, 0, 0, 0}, port: String.to_integer(System.get_env("PORT") || "4000")]
