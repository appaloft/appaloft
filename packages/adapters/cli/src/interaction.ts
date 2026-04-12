import * as Prompt from "@effect/cli/Prompt";
import { Effect } from "effect";

export interface CliSelectChoice<T> {
  title: string;
  value: T;
  description?: string;
  disabled?: boolean;
}

export interface CliInteraction {
  text(input: {
    message: string;
    defaultValue?: string;
    validate?: (value: string) => string | null;
  }): Effect.Effect<string, unknown, Prompt.Prompt.Environment>;
  select<T>(input: {
    message: string;
    choices: ReadonlyArray<CliSelectChoice<T>>;
  }): Effect.Effect<T, unknown, Prompt.Prompt.Environment>;
  confirm(input: {
    message: string;
    defaultValue?: boolean;
  }): Effect.Effect<boolean, unknown, Prompt.Prompt.Environment>;
}

export const effectCliInteraction: CliInteraction = {
  text: (input) =>
    input.validate
      ? Prompt.run(
          Prompt.text({
            message: input.message,
            ...(input.defaultValue !== undefined ? { default: input.defaultValue } : {}),
            validate: (value) => {
              const message = input.validate?.(value);
              return message ? Effect.fail(message) : Effect.succeed(value);
            },
          }),
        )
      : Prompt.run(
          Prompt.text({
            message: input.message,
            ...(input.defaultValue !== undefined ? { default: input.defaultValue } : {}),
          }),
        ),
  select: (input) =>
    Prompt.run(
      Prompt.select({
        message: input.message,
        choices: input.choices,
      }),
    ),
  confirm: (input) =>
    Prompt.run(
      Prompt.confirm({
        message: input.message,
        ...(input.defaultValue !== undefined ? { initial: input.defaultValue } : {}),
      }),
    ),
};
