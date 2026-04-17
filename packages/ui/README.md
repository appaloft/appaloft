# @appaloft/ui

Responsibility:

- hold shared product-facing tokens and display metadata that can be reused by web and future interfaces
- remain presentation-oriented; never absorb business rules from `core` or `application`

Allowed dependencies:

- none by default

Forbidden:

- API calls
- deployment logic
- persistence concerns
