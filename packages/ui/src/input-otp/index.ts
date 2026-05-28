const REGEXP_ONLY_CHARS = "^[a-zA-Z]+$";
const REGEXP_ONLY_DIGITS = "^\\d+$";
const REGEXP_ONLY_DIGITS_AND_CHARS = "^[a-zA-Z0-9]+$";

import Root from "./input-otp.svelte";
import Group from "./input-otp-group.svelte";
import Separator from "./input-otp-separator.svelte";
import Slot from "./input-otp-slot.svelte";

export {
  Group,
  Group as InputOTPGroup,
  REGEXP_ONLY_CHARS,
  REGEXP_ONLY_DIGITS,
  REGEXP_ONLY_DIGITS_AND_CHARS,
  Root,
  Root as InputOTP,
  Separator,
  Separator as InputOTPSeparator,
  Slot,
  Slot as InputOTPSlot,
};
