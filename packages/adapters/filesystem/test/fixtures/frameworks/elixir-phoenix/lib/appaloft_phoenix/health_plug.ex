defmodule AppaloftPhoenix.HealthPlug do
  @behaviour Plug

  @impl true
  def init(options), do: options

  @impl true
  def call(conn, _options) do
    Plug.Conn.send_resp(conn, 200, "Elixir Phoenix fixture ready")
  end
end
