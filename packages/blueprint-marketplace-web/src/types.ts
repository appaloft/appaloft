export type BlueprintMarketplaceChrome = "standalone" | "embedded";
export type BlueprintMarketplaceCardDensity = "default" | "compact" | "mini";
export type BlueprintMarketplacePrimaryAction = "deploy" | "detail" | "select";
export type BlueprintMarketplaceSurface = "page" | "dialog" | "quick-deploy";

export interface BlueprintMarketplaceCategory {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly count: number;
}

export interface BlueprintMarketplaceListing {
  readonly slug: string;
  readonly title: string;
  readonly subtitle: string;
  readonly categoryKey: string;
  readonly category: string;
  readonly featured?: boolean;
  readonly websiteUrl?: string;
  readonly documentationUrl?: string;
  readonly icon?: {
    readonly label?: string;
    readonly tone?: string;
    readonly url?: string;
    readonly alt?: string;
  };
  readonly publisher?: {
    readonly name: string;
    readonly verified: boolean;
  };
  readonly blueprint: {
    readonly id: string;
    readonly version: string;
    readonly summary: string;
    readonly tags: readonly string[];
  };
  readonly overview?: {
    readonly highlights?: readonly string[];
    readonly useCases?: readonly string[];
  };
  readonly defaultVariant?: string;
  readonly variants?: readonly {
    readonly id: string;
    readonly label?: string;
    readonly summary?: string;
  }[];
  readonly upgrade?: {
    readonly strategy: string;
    readonly destructive: boolean;
    readonly requiresManualReview?: boolean;
  };
  readonly requirementsSummary?: {
    readonly components: number;
    readonly dependencies: readonly string[];
    readonly ports: readonly string[];
  };
}

export interface BlueprintMarketplaceListResponse {
  readonly categories: readonly BlueprintMarketplaceCategory[];
  readonly items: readonly BlueprintMarketplaceListing[];
}

export interface BlueprintMarketplaceDeployHandoffInput {
  readonly deployBaseUrl: string;
  readonly slug: string;
  readonly title: string;
  readonly sourceExtension?: string;
  readonly projectName?: string;
}

export interface BlueprintMarketplaceCardLabels {
  readonly dependencies: string;
  readonly components: string;
  readonly variants: string;
  readonly ports: string;
  readonly noDependencies: string;
  readonly noPorts: string;
  readonly componentCount: string;
  readonly defaultVariant: string;
  readonly variantCount: string;
  readonly variantCountWithLabel: string;
  readonly official: string;
  readonly featured: string;
  readonly selected: string;
  readonly website: string;
}
