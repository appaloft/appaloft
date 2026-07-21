defmodule AppaloftPhoenix.Endpoint do
  use Phoenix.Endpoint, otp_app: :appaloft_phoenix

  plug AppaloftPhoenix.Router
end
