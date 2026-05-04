import { renderResourceAccessFailureStaticRendererAsset } from "@appaloft/application/resource-access-failure-diagnostics";

export const defaultStaticServerImage = "nginx:1.27-alpine";
export const staticServerRoot = "/usr/share/nginx/html/";
export const staticServerConfigPath = "/etc/nginx/conf.d/default.conf";
export const staticServerConfigAssetPath = ".appaloft/docker-build/static-server/default.conf";
export const staticAccessFailureRendererAssetPath =
  ".appaloft/docker-build/static-server/resource-access-failure/index.html";
export const staticAccessFailureRendererRootPath = `${staticServerRoot}.appaloft/resource-access-failure/index.html`;

export function renderStaticAccessFailureRendererAsset(): string {
  return renderResourceAccessFailureStaticRendererAsset();
}

export function renderStaticServerConfig(root: string = staticServerRoot): string {
  const normalizedRoot = root.replace(/\/+$/, "");

  return [
    "server {",
    "  listen 80;",
    "  server_name _;",
    `  root ${normalizedRoot};`,
    "  index index.html;",
    "",
    "  location = /.appaloft/resource-access-failure {",
    "    try_files /.appaloft/resource-access-failure/index.html =404;",
    "  }",
    "",
    "  location = /.appaloft/resource-access-failure/ {",
    "    try_files /.appaloft/resource-access-failure/index.html =404;",
    "  }",
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
