import Root from "./app-shell.svelte";
import Header, { type AppShellHeaderDensity } from "./app-shell-header.svelte";
import Main from "./app-shell-main.svelte";
import Region, {
  type AppShellRegionAlign,
  type AppShellRegionName,
  type AppShellRegionOrientation,
} from "./app-shell-region.svelte";
import Sidebar from "./app-shell-sidebar.svelte";
import Toolbar from "./app-shell-toolbar.svelte";

export {
  type AppShellHeaderDensity,
  type AppShellRegionAlign,
  type AppShellRegionName,
  type AppShellRegionOrientation,
  Header,
  Header as AppShellHeader,
  Main,
  Main as AppShellMain,
  Region,
  Region as AppShellRegion,
  Root,
  Root as AppShell,
  Sidebar,
  Sidebar as AppShellSidebar,
  Toolbar,
  Toolbar as AppShellToolbar,
};
