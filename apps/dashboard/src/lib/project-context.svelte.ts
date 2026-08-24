let projectId = $state<string | undefined>();
let projectName = $state<string | undefined>();
let environmentId = $state<string | undefined>();
let environmentName = $state<string | undefined>();

export const dashboardProjectContext = {
  get projectId(): string | undefined {
    return projectId;
  },
  get projectName(): string | undefined {
    return projectName;
  },
  get environmentId(): string | undefined {
    return environmentId;
  },
  get environmentName(): string | undefined {
    return environmentName;
  },
  set(input: {
    projectId: string;
    projectName: string;
    environmentId: string;
    environmentName: string;
  }): void {
    projectId = input.projectId;
    projectName = input.projectName;
    environmentId = input.environmentId;
    environmentName = input.environmentName;
  },
};
