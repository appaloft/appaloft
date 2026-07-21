defmodule AppaloftPhoenix.MixProject do
  use Mix.Project

  def project do
    [
      app: :appaloft_phoenix,
      version: "0.1.0",
      elixir: "~> 1.17",
      deps: deps()
    ]
  end

  def application do
    [extra_applications: [:logger, :runtime_tools], mod: {AppaloftPhoenix.Application, []}]
  end

  defp deps do
    [
      {:phoenix, "1.7.18"},
      {:plug_cowboy, "2.7.2"}
    ]
  end
end
