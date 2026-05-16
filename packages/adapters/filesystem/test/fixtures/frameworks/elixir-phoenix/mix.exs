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
    [mod: {AppaloftPhoenix.Application, []}]
  end

  defp deps do
    [
      {:phoenix, "1.7.18"}
    ]
  end
end
