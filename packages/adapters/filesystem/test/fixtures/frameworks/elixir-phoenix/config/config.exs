import Config

config :appaloft_phoenix, AppaloftPhoenix.Endpoint,
  adapter: Phoenix.Endpoint.Cowboy2Adapter,
  server: true,
  secret_key_base: String.duplicate("appaloft-fixture-secret-", 4)
