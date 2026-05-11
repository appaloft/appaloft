# @appaloft/auth-better

First-party Better Auth runtime for deferred control-plane authentication.

Responsibilities:

- mount Better Auth as a built-in runtime capability
- support deferred sign-in flows for first-party integrations like GitHub
- expose auth adapter implementations through application-defined ports so Shell can wire them with
  inversion of control
- use Better Auth session, bearer, and organization capabilities where they fit, while keeping
  deploy-token and user-session semantics behind Appaloft-owned interfaces
- expose auth/session status to interfaces without forcing global login

Forbidden:

- do not model first-party integration auth as a plugin requirement
- do not leak Better Auth types into `core`
- do not leak Better Auth types into `application`; application owns stable auth ports
- do not put deployment or domain logic here
