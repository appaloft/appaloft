import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { type Metadata } from "next";
import { notFound } from "next/navigation";
import { APIPage } from "@/components/api-page";
import { docsSite, withDocsBase } from "@/lib/config";
import { openApiSchemaPath } from "@/lib/openapi";
import { source } from "@/lib/source";
import { getMDXComponents } from "@/mdx-components";

type PageProps = {
  params: Promise<{
    slug?: string[];
  }>;
};

export default async function Page(props: PageProps) {
  const { slug = [] } = await props.params;
  const page = source.getPage(["en", ...slug]);
  if (!page || page.data.type === "openapi") notFound();

  if (page.slugs.join("/") === "en/reference/openapi") {
    return (
      <DocsPage full>
        <DocsTitle>{page.data.title}</DocsTitle>
        <DocsDescription>{page.data.description}</DocsDescription>
        <DocsBody>
          <APIPage
            document={openApiSchemaPath}
            operations={getOpenAPIOperations()}
            showDescription
            showTitle
          />
        </DocsBody>
      </DocsPage>
    );
  }

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source
    .getPages()
    .filter((page) => page.slugs[0] === "en")
    .map((page) => ({
      slug: page.slugs.slice(1),
    }));
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { slug = [] } = await props.params;
  const page = source.getPage(["en", ...slug]);
  if (!page || page.data.type === "openapi") notFound();

  const path = withDocsBase(page.slugs.join("/"));

  return {
    title: page.data.title,
    description: page.data.description,
    alternates: {
      canonical: new URL(path, docsSite).toString(),
    },
  };
}

function getOpenAPIOperations() {
  return source.getPages().flatMap((page) => {
    if (page.data.type !== "openapi") return [];

    return page.data.getAPIPageProps().operations ?? [];
  });
}
