defmodule AppaloftPhoenix.Router do
  use Phoenix.Router

  get "/", AppaloftPhoenix.HealthPlug, []
end
