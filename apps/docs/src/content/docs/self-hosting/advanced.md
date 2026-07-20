---
title: "Advanced reference"
description: "控制面模式、打包、自托管、provider、plugin 和高级运行时说明。"
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "advanced"
  - "control plane"
  - "provider"
  - "plugin"
  - "binary"
  - "高级"
  - "打包"
relatedOperations:
  - control-plane-portability.export-plan
  - control-plane-portability.export
  - control-plane-portability.import-plan
  - control-plane-portability.import
  - control-plane-portability.artifacts.list
  - control-plane-portability.artifacts.show
  - control-plane-portability.artifacts.delete
  - tunnels.start
  - tunnels.list
  - tunnels.show
  - tunnels.revoke
sidebar:
  label: "Advanced reference"
  order: 12
---

<h2 id="advanced-control-plane-modes">控制面模式</h2>

Appaloft 支持本地优先、自托管和未来云辅助的控制面路径。用户需要理解状态归属和执行归属，而不是内部协调实现。
`appaloft doctor`、`GET /api/system/doctor` 和 Web Instance 页面会暴露本地 readiness、
provider/plugin 诊断和 scheduled worker 配置激活状态，但不会启动 worker 或派发维护工作。

<h2 id="whole-instance-portability">整实例迁移</h2>

Owner 可以把控制面数据库导出成 passphrase 加密 artifact，并在导入前完成兼容性校验。Artifact 使用
AES-256-GCM、独立 salt 和认证 checksum；passphrase 只从 stdin 接收，不会进入 operation readback。

```bash title="导出并校验 instance artifact"
appaloft instance portability export-plan
printf '%s\n' "$APPALOFT_EXPORT_PASSPHRASE" | \
  appaloft instance portability export --output ./appaloft.instance --passphrase-stdin
printf '%s\n' "$APPALOFT_EXPORT_PASSPHRASE" | \
  appaloft instance portability import-plan ./appaloft.instance --mode merge --passphrase-stdin
```

`merge` 保留目标数据，并拒绝不兼容冲突。`replace` 必须显式传 `--acknowledge-replace`；Appaloft 会先
创建 rollback evidence，再进入数据库 transaction，校验或导入失败时目标保持不变。源和目标必须使用
相同的受支持 schema revision。使用 `appaloft instance portability artifact list|show|delete` 查看和
显式清理 artifact metadata。

<h2 id="temporary-tunnels">临时 Tunnel</h2>

自托管 Appaloft 可以为本机或私网 HTTP origin 启动有时限的 Cloudflare Quick Tunnel 或 ngrok session。
公共 origin、带 credential 的 URL、非 HTTP scheme 和不安全的 provider 输出都会被拒绝。Provider token
只从 provider 环境读取（ngrok 使用 `NGROK_AUTHTOKEN`），不会持久化或进入 readback。

```bash title="启动、查看和撤销临时 tunnel"
appaloft tunnel start --provider cloudflare-quick --origin http://127.0.0.1:3000 --duration-minutes 60
appaloft tunnel list
appaloft tunnel show tun_123
appaloft tunnel revoke tun_123
```

用 `APPALOFT_TUNNEL_RECONCILER_ENABLED=true` 启用 orphan/expiry 清理。轮询间隔和 claim batch 由
`APPALOFT_TUNNEL_RECONCILE_INTERVAL_SECONDS`、`APPALOFT_TUNNEL_RECONCILE_BATCH_SIZE` 控制。Distribution
可以完全禁止 tunnel start；应读取 capability/authz 结果，而不是因为镜像里存在 provider binary 就假设可用。

<h2 id="maintenance-worker-activation">维护 worker 激活</h2>

维护 worker 是后台轮询器。`appaloft doctor`、`GET /api/system/doctor` 和 Web Instance 页面只展示
worker 的配置状态，不会启动 worker、tick scheduler 或执行维护任务。

在配置库默认值下，certificate retry scheduler 会随后端服务启动，用来重试已接受的证书工作。preview
cleanup retry、preview expiry cleanup、storage-volume backup、scheduled task runner、scheduled runtime
prune、scheduled history retention、tunnel reconciliation 和 runtime monitoring collector 默认禁用，
需要显式配置。官方 self-host 镜像会显式覆盖其中两项默认值，启用 storage-volume backup 和 tunnel
reconciliation；其他 distribution 自行选择安全默认值。

即使 worker 已启用，它也仍然受自己的安全模式约束：scheduled runtime prune 需要已配置的 prune
policy，history retention 受 retention policy 约束，runtime monitoring collector 只采集有界样本，
scheduled task runner 只执行到期的 scheduled task run。
doctor 输出和 Web Instance 面板也会展示每个 worker 对应的安全 `APPALOFT_*` 配置键；disabled
worker 只有在 operator 修改对应配置后才会变成 active。

<h2 id="advanced-binary-packaging">Binary 打包</h2>

binary 会嵌入 Web console 静态资源和 public docs 静态资源。两者分开嵌入、分开覆盖，docs 默认服务在 `/docs/*`。如果设置 `APPALOFT_DOCS_STATIC_DIR`，Appaloft 会从该目录提供 docs，而 Web console 继续使用自己的静态资源来源。

<h2 id="advanced-provider-boundary">Provider 边界</h2>

Provider 负责外部系统或基础设施能力。public docs 应解释用户能配置和观察什么，不暴露 provider SDK 类型。

<h2 id="advanced-plugin-boundary">Plugin 边界</h2>

Plugin 扩展能力必须显式声明。用户文档应说明兼容性、权限和沙箱假设。
