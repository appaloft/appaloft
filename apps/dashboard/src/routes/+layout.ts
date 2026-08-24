// Dashboard is shipped as one static client application. Dynamic owner routes
// must hydrate from the adapter fallback instead of reusing prerendered SSR data.
export const ssr = false;
