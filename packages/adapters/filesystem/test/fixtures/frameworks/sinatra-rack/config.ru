require "sinatra/base"

class AppaloftFixture < Sinatra::Base
  get("/") { "Ruby Sinatra fixture ready" }
end

run AppaloftFixture
