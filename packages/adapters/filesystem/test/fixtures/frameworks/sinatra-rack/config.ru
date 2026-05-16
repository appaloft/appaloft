require "sinatra/base"

class AppaloftFixture < Sinatra::Base
  get("/") { "ok" }
end

run AppaloftFixture
