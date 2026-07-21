defmodule AppaloftPhoenix.Application do
  use Application

  @impl true
  def start(_type, _args) do
    Supervisor.start_link([AppaloftPhoenix.Endpoint],
      strategy: :one_for_one,
      name: AppaloftPhoenix.Supervisor
    )
  end
end
