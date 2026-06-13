import { error } from "@sveltejs/kit";

import { type PageLoad } from "./$types";

const retiredConsoleIntentRoutePatterns = [
  /^\/deploy\/?$/,
  /^\/deployments\/new\/?$/,
  /^\/servers\/new\/?$/,
  /^\/projects\/new\/?$/,
  /^\/resources\/new\/?$/,
  /^\/preview-environments\/new\/?$/,
  /^\/dependency-resources\/new\/?$/,
  /^\/domain-bindings\/new\/?$/,
  /^\/projects\/[^/]+\/resources\/new\/?$/,
  /^\/projects\/[^/]+\/resources\/[^/]+\/deployments\/new\/?$/,
  /^\/projects\/[^/]+\/environments\/[^/]+\/resources\/[^/]+\/deployments\/new\/?$/,
  /^\/resources\/[^/]+\/deployments\/new\/?$/,
] as const;

export const load: PageLoad = ({ url }) => {
  if (retiredConsoleIntentRoutePatterns.some((pattern) => pattern.test(url.pathname))) {
    error(404, "This console action now opens from its related page.");
  }
};
