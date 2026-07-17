# @appaloft/integration-github

GitHub webhook and provider integration package.

Responsibilities:

- GitHub capability descriptor
- verified push webhook normalization
- bounded final change-set resolution for Resource path policies
- short-lived GitHub App installation-token access for private repository comparisons

Updated refs compare the provider's final `before...after` state, created refs list the final tree,
and deleted refs fail closed. The integration does not union intermediate commit arrays, persist raw
webhook payloads, or expose provider tokens.
