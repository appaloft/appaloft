export const defaultStaticServerImage = "nginx:1.27-alpine";
export const staticServerRoot = "/usr/share/nginx/html/";
export const staticServerConfigPath = "/etc/nginx/conf.d/default.conf";
export const staticServerConfigAssetPath = ".appaloft/docker-build/static-server/default.conf";

export function renderStaticServerConfig(root: string = staticServerRoot): string {
  const normalizedRoot = root.replace(/\/+$/, "");

  return [
    "server {",
    "  listen 80;",
    "  server_name _;",
    `  root ${normalizedRoot};`,
    "  index index.html;",
    "",
    "  location ~* \\.[A-Za-z0-9][A-Za-z0-9._-]*$ {",
    "    try_files $uri =404;",
    "  }",
    "",
    "  location / {",
    "    try_files $uri $uri/ /index.html;",
    "  }",
    "}",
    "",
  ].join("\n");
}
