import { notFound } from "next/navigation";
import { getLLMText } from "@/lib/get-llm-text";
import { source } from "@/lib/source";

type RouteProps = {
  params: Promise<{
    slug?: string[];
  }>;
};

export const dynamicParams = false;
export const revalidate = false;

export async function GET(_request: Request, props: RouteProps) {
  const { slug = [] } = await props.params;
  const pageSlug = fromLLMRouteSlug(slug);
  const page = source.getPage(pageSlug);
  if (!page) notFound();

  return new Response(await getLLMText(page), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}

export function generateStaticParams() {
  return source.getPages().map((page) => ({
    slug: toLLMRouteSlug(page.slugs),
  }));
}

function toLLMRouteSlug(slug: string[]): string[] {
  return [...slug, "index"];
}

function fromLLMRouteSlug(slug: string[]): string[] {
  if (slug.at(-1) !== "index") return slug;

  return slug.slice(0, -1);
}
