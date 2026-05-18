import { File, Files, Folder } from "fumadocs-ui/components/files";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { type MDXComponents } from "mdx/types";
import { APIPage } from "@/components/api-page";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    APIPage,
    File,
    Files,
    Folder,
    ...components,
  } as MDXComponents;
}
