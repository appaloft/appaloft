# @yundu/auth-better

First-party Better Auth runtime for deferred control-plane authentication.

Responsibilities:

- mount Better Auth as a built-in runtime capability
- support deferred sign-in flows for first-party integrations like GitHub
- expose auth/session status to interfaces without forcing global login

Forbidden:

- do not model first-party integration auth as a plugin requirement
- do not leak Better Auth types into `core`
- do not put deployment or domain logic here
