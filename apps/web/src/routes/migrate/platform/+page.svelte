<script lang="ts">
  import { createMutation } from "@tanstack/svelte-query";
  import { CheckCircle2, FileJson2, RefreshCw, ShieldAlert, Trash2, Upload } from "@lucide/svelte";

  import { readErrorMessage } from "$lib/api/client";
  import ConsoleResourceCanvas from "$lib/components/console/ConsoleResourceCanvas.svelte";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import { orpcClient } from "$lib/orpc";

  type MigrationPlan = Awaited<ReturnType<typeof orpcClient.migrations.plan>>;
  type MigrationApplyResult = Awaited<ReturnType<typeof orpcClient.migrations.apply>>;
  type MigrationStatus = Awaited<ReturnType<typeof orpcClient.migrations.status>>;
  type MigrationVerification = Awaited<ReturnType<typeof orpcClient.migrations.verify>>;
  type MigrationCleanup = Awaited<ReturnType<typeof orpcClient.migrations.cleanup>>;

  const exampleBundle = {
    apiVersion: "appaloft.io/migration/v1",
    kind: "MigrationBundle",
    metadata: { name: "My platform migration" },
    spec: {
      project: { name: "My application" },
      environment: { name: "production", kind: "production" },
      target: { deploymentTargetId: "srv_replace_me" },
      resources: [
        {
          ref: "web",
          name: "Web",
          source: { kind: "remote-git", locator: "https://github.com/acme/web.git" },
          runtime: { strategy: "auto" },
          network: { internalPort: 3000, upstreamProtocol: "http" },
        },
      ],
    },
  };

  let bundleText = $state(JSON.stringify(exampleBundle, null, 2));
  let plan = $state<MigrationPlan | null>(null);
  let receipts = $state<MigrationApplyResult["receipts"]>([]);
  let status = $state<MigrationStatus | null>(null);
  let verification = $state<MigrationVerification | null>(null);
  let cleanup = $state<MigrationCleanup | null>(null);
  let planDigestConfirmation = $state("");
  let cleanupDigestConfirmation = $state("");
  let cleanupDialogOpen = $state(false);
  let feedback = $state<{ kind: "error" | "success"; detail: string } | null>(null);

  function parseBundle(): unknown {
    return JSON.parse(bundleText) as unknown;
  }

  const planMutation = createMutation(() => ({
    mutationFn: () => orpcClient.migrations.plan({ bundle: parseBundle() as never }),
    onSuccess: (result) => {
      plan = result;
      receipts = [];
      status = null;
      verification = null;
      cleanup = null;
      planDigestConfirmation = "";
      cleanupDigestConfirmation = "";
      feedback = {
        kind: result.state === "ready" ? "success" : "error",
        detail:
          result.state === "ready"
            ? "计划已生成；确认 digest 后才会执行。"
            : `计划包含 ${result.blockers.length} 个阻断项。`,
      };
    },
    onError: (error) => {
      feedback = { kind: "error", detail: readErrorMessage(error) };
    },
  }));

  const applyMutation = createMutation(() => ({
    mutationFn: () => {
      if (!plan) throw new Error("请先生成计划");
      return orpcClient.migrations.apply({
        plan,
        confirmedPlanDigest: planDigestConfirmation,
        priorReceipts: receipts,
      });
    },
    onSuccess: (result) => {
      receipts = result.receipts;
      feedback = {
        kind: result.state === "completed" ? "success" : "error",
        detail:
          result.state === "completed"
            ? "迁移操作已完成；请继续读取状态并验证结果。"
            : `迁移停在 ${result.failure?.stepId ?? "未知步骤"}，可使用当前回执恢复。`,
      };
    },
    onError: (error) => {
      feedback = { kind: "error", detail: readErrorMessage(error) };
    },
  }));

  const statusMutation = createMutation(() => ({
    mutationFn: () => {
      if (!plan) throw new Error("请先生成计划");
      return orpcClient.migrations.status({ plan, receipts });
    },
    onSuccess: (result) => {
      status = result;
      feedback = { kind: "success", detail: `已读取 ${result.evidence.length} 条状态证据。` };
    },
    onError: (error) => {
      feedback = { kind: "error", detail: readErrorMessage(error) };
    },
  }));

  const verifyMutation = createMutation(() => ({
    mutationFn: () => {
      if (!plan) throw new Error("请先生成计划");
      return orpcClient.migrations.verify({ plan, receipts });
    },
    onSuccess: (result) => {
      verification = result;
      feedback = {
        kind: result.state === "passed" ? "success" : "error",
        detail: `验证状态：${result.state}；证据 ${result.evidence.length} 条。`,
      };
    },
    onError: (error) => {
      feedback = { kind: "error", detail: readErrorMessage(error) };
    },
  }));

  const cleanupMutation = createMutation(() => ({
    mutationFn: () => {
      if (!plan) throw new Error("请先生成计划");
      return orpcClient.migrations.cleanup({
        plan,
        receipts,
        confirmedPlanDigest: cleanupDigestConfirmation,
      });
    },
    onSuccess: (result) => {
      cleanup = result;
      cleanupDialogOpen = false;
      feedback = {
        kind: result.state === "completed" ? "success" : "error",
        detail: `清理状态：${result.state}；已执行 ${result.actions.length} 个既有生命周期操作。`,
      };
    },
    onError: (error) => {
      feedback = { kind: "error", detail: readErrorMessage(error) };
    },
  }));

  async function loadBundleFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    bundleText = await file.text();
    plan = null;
    receipts = [];
    status = null;
    verification = null;
    cleanup = null;
    feedback = { kind: "success", detail: `已载入 ${file.name}，尚未执行任何操作。` };
  }
</script>

<svelte:head>
  <title>平台迁移 · Appaloft</title>
</svelte:head>

<ConsoleShell
  title="平台迁移"
  description="导入版本化 Migration Bundle，先审阅无副作用计划，再执行、验证或精确清理。"
>
  <ConsoleResourceCanvas class="max-w-7xl space-y-6" data-platform-migration-surface>
    <div class="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(24rem,0.85fr)]">
      <Card.Root>
        <Card.Header>
          <div class="flex items-start justify-between gap-4">
            <div>
              <Card.Title>1. 导入迁移包</Card.Title>
              <Card.Description>只接受 secretRef；Railway export 可先用 CLI 的 --from railway 转换。</Card.Description>
            </div>
            <FileJson2 class="size-5 text-muted-foreground" />
          </div>
        </Card.Header>
        <Card.Content class="space-y-4">
          <label class="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed p-3 text-sm hover:bg-muted/40">
            <Upload class="size-4" />
            载入 JSON 文件
            <input class="sr-only" type="file" accept="application/json,.json" onchange={loadBundleFile} />
          </label>
          <Textarea bind:value={bundleText} class="min-h-96 font-mono text-xs" spellcheck="false" />
          <Button onclick={() => planMutation.mutate()} disabled={planMutation.isPending}>
            {planMutation.isPending ? "生成中…" : "生成无副作用计划"}
          </Button>
        </Card.Content>
      </Card.Root>

      <div class="space-y-6">
        <Card.Root>
          <Card.Header>
            <Card.Title>2. 审阅计划</Card.Title>
            <Card.Description>所有步骤都映射到现有 operation；digest 绑定当前完整计划。</Card.Description>
          </Card.Header>
          <Card.Content class="space-y-4">
            {#if plan}
              <div class="flex flex-wrap items-center gap-2">
                <Badge variant={plan.state === "ready" ? "secondary" : "destructive"}>{plan.state}</Badge>
                <span class="text-sm text-muted-foreground">{plan.steps.length} 个步骤</span>
              </div>
              <code class="block break-all rounded-md bg-muted p-3 text-xs">{plan.planDigest}</code>
              {#if plan.blockers.length > 0}
                <div class="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                  <div class="flex items-center gap-2 font-medium text-destructive">
                    <ShieldAlert class="size-4" /> 阻断项
                  </div>
                  {#each plan.blockers as blocker}
                    <div class="text-sm">
                      <div class="font-medium">{blocker.code}</div>
                      <div class="text-muted-foreground">{blocker.path} · {blocker.message}</div>
                    </div>
                  {/each}
                </div>
              {/if}
              <ol class="max-h-72 space-y-2 overflow-auto pr-1">
                {#each plan.steps as step, index}
                  <li class="rounded-md border p-3 text-sm">
                    <div class="flex gap-2"><span class="text-muted-foreground">{index + 1}.</span><code>{step.operationKey}</code></div>
                    <div class="mt-1 text-xs text-muted-foreground">{step.id}</div>
                  </li>
                {/each}
              </ol>
            {:else}
              <p class="text-sm text-muted-foreground">导入并生成计划后，这里会显示 blockers、步骤和 digest。</p>
            {/if}
          </Card.Content>
        </Card.Root>

        <Card.Root>
          <Card.Header>
            <Card.Title>3. 确认并执行</Card.Title>
            <Card.Description>复制完整 digest 才能执行；部分失败会保留安全 receipts 供恢复。</Card.Description>
          </Card.Header>
          <Card.Content class="space-y-3">
            <Input bind:value={planDigestConfirmation} placeholder="sha256:…" autocomplete="off" />
            <Button
              onclick={() => applyMutation.mutate()}
              disabled={!plan || plan.state !== "ready" || planDigestConfirmation !== plan.planDigest || applyMutation.isPending}
            >
              {applyMutation.isPending ? "执行中…" : receipts.length > 0 ? "从回执恢复执行" : "执行已确认计划"}
            </Button>
            {#if receipts.length > 0}
              <div class="rounded-md border p-3 text-sm">
                <div class="mb-2 flex items-center gap-2 font-medium"><CheckCircle2 class="size-4 text-emerald-600" /> receipts</div>
                <div class="space-y-1 text-xs text-muted-foreground">
                  {#each receipts as receipt}
                    <div>{receipt.stepId} · {receipt.ownership}</div>
                  {/each}
                </div>
              </div>
            {/if}
          </Card.Content>
        </Card.Root>
      </div>
    </div>

    <Card.Root>
      <Card.Header>
        <Card.Title>4. 状态与验证</Card.Title>
        <Card.Description>读取现有 show/health/proof/config/domain/backup 查询，不以命令接受代替结果证据。</Card.Description>
      </Card.Header>
      <Card.Content class="space-y-4">
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" onclick={() => statusMutation.mutate()} disabled={!plan || receipts.length === 0 || statusMutation.isPending}>
            <RefreshCw class="size-4" /> 读取状态
          </Button>
          <Button variant="outline" onclick={() => verifyMutation.mutate()} disabled={!plan || receipts.length === 0 || verifyMutation.isPending}>
            <CheckCircle2 class="size-4" /> 验证结果
          </Button>
        </div>
        {#if status || verification}
          <div class="grid gap-4 lg:grid-cols-2">
            <div class="rounded-md border p-4">
              <div class="font-medium">Status · {status?.state ?? "尚未读取"}</div>
              <div class="mt-2 space-y-1 text-xs text-muted-foreground">
                {#each status?.evidence ?? [] as evidence}
                  <div>{evidence.queryName} · {evidence.state}</div>
                {/each}
              </div>
            </div>
            <div class="rounded-md border p-4">
              <div class="font-medium">Verify · {verification?.state ?? "尚未验证"}</div>
              <div class="mt-2 space-y-1 text-xs text-muted-foreground">
                {#each verification?.evidence ?? [] as evidence}
                  <div>{evidence.queryName} · {evidence.evaluation}</div>
                {/each}
              </div>
            </div>
          </div>
        {/if}
      </Card.Content>
    </Card.Root>

    <Card.Root class="border-destructive/30">
      <Card.Header>
        <div class="flex items-start justify-between gap-4">
          <div>
            <Card.Title>5. 精确清理</Card.Title>
            <Card.Description>仅 owner 可执行；只处理 created receipts，并按逆依赖顺序调用既有生命周期命令。</Card.Description>
          </div>
          <Trash2 class="size-5 text-destructive" />
        </div>
      </Card.Header>
      <Card.Content class="space-y-3">
        <Button
          variant="outline"
          onclick={() => {
            cleanupDigestConfirmation = "";
            cleanupDialogOpen = true;
          }}
          disabled={!plan || receipts.length === 0 || cleanupMutation.isPending}
        >
          打开精确清理确认
        </Button>
        {#if cleanup}
          <p class="text-sm text-muted-foreground">{cleanup.state} · {cleanup.actions.length} actions · {cleanup.skippedStepIds.length} reused skipped</p>
        {/if}
      </Card.Content>
    </Card.Root>

    {#if feedback}
      <div class={`rounded-md border p-4 text-sm ${feedback.kind === "error" ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-emerald-500/40 bg-emerald-500/5"}`}>
        {feedback.detail}
      </div>
    {/if}
  </ConsoleResourceCanvas>
</ConsoleShell>

<Dialog.Root bind:open={cleanupDialogOpen}>
  <Dialog.Content closeLabel="关闭">
    <Dialog.Header>
      <Dialog.Title>确认精确清理</Dialog.Title>
      <Dialog.Description>
        仅清理当前 migration receipts 明确拥有的状态。请输入完整 plan digest；生命周期 guard 仍会阻止不安全删除。
      </Dialog.Description>
    </Dialog.Header>
    <div class="space-y-3 px-5 py-4">
      <Input
        bind:value={cleanupDigestConfirmation}
        placeholder="再次输入完整 plan digest"
        autocomplete="off"
      />
      {#if plan}
        <p class="break-all text-xs text-muted-foreground">期望值：{plan.planDigest}</p>
      {/if}
    </div>
    <Dialog.Footer class="border-t p-5">
      <Button type="button" variant="outline" onclick={() => (cleanupDialogOpen = false)}>
        取消
      </Button>
      <Button
        type="button"
        variant="destructive"
        onclick={() => cleanupMutation.mutate()}
        disabled={!plan || receipts.length === 0 || cleanupDigestConfirmation !== plan.planDigest || cleanupMutation.isPending}
      >
        {cleanupMutation.isPending ? "清理中…" : "清理回执拥有的状态"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
