import { type AuthSessionResponse } from "@appaloft/contracts";

export function canRunProductQueries(authSession: AuthSessionResponse | undefined): boolean {
  if (!authSession) {
    return false;
  }

  return !authSession.loginRequired || Boolean(authSession.session);
}
