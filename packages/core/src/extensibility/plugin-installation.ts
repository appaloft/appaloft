import { AggregateRoot } from "../shared/entity";
import { type PluginInstallationId } from "../shared/identifiers";
import { ok, type Result } from "../shared/result";
import { type OwnerScopeValue, type PluginInstallationStatusValue } from "../shared/state-machine";
import { type InstalledAt, type OccurredAt } from "../shared/temporal";
import {
  type ApiVersionText,
  type OwnerId,
  type PluginName,
  type VersionText,
} from "../shared/text-values";

export interface PluginInstallationState {
  id: PluginInstallationId;
  ownerScope: OwnerScopeValue;
  ownerId: OwnerId;
  pluginName: PluginName;
  version: VersionText;
  apiVersion: ApiVersionText;
  status: PluginInstallationStatusValue;
  installedAt: InstalledAt;
}

export class PluginInstallation extends AggregateRoot<PluginInstallationState> {
  private constructor(state: PluginInstallationState) {
    super(state);
  }

  static install(input: PluginInstallationState): Result<PluginInstallation> {
    const installation = new PluginInstallation(input);
    installation.recordDomainEvent("plugin_installation.installed", input.installedAt, {
      pluginName: installation.toState().pluginName.value,
      version: installation.toState().version.value,
    });
    return ok(installation);
  }

  static rehydrate(state: PluginInstallationState): PluginInstallation {
    return new PluginInstallation(state);
  }

  disable(at: OccurredAt): void {
    this.state.status = this.state.status.disable();
    this.recordDomainEvent("plugin_installation.disabled", at, {
      pluginName: this.state.pluginName.value,
    });
  }

  markIncompatible(at: OccurredAt): void {
    this.state.status = this.state.status.markIncompatible();
    this.recordDomainEvent("plugin_installation.incompatible", at, {
      pluginName: this.state.pluginName.value,
      apiVersion: this.state.apiVersion.value,
    });
  }

  toState(): PluginInstallationState {
    return { ...this.state };
  }
}
