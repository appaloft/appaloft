/**
 * MDX globals registry — components available inside MDX without `import`.
 * Wired via `<Content components={components} />` in `[...slug].astro`.
 * Add new components here as you build (or install) them.
 */

import CloudBadge from "./components/CloudBadge.astro";
import OpenApiReference from "./components/OpenApiReference.astro";
import Render from "./components/Render.astro";
import { Aside } from "./components/ui/aside";
import { Badge } from "./components/ui/badge";
import { Card } from "./components/ui/card";
import { CardGrid } from "./components/ui/card-grid";
import { PackageManagers } from "./components/ui/package-managers";
import { Step, Steps } from "./components/ui/steps";
import { TabItem, Tabs } from "./components/ui/tabs";

export const components = {
  Aside,
  Badge,
  Card,
  CardGrid,
  CloudBadge,
  OpenApiReference,
  PackageManagers,
  Render,
  Step,
  Steps,
  TabItem,
  Tabs,
};
