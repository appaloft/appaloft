import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { type Metadata } from "next";
import { notFound } from "next/navigation";
import { APIPage } from "@/components/api-page";
import { docsSite, withDocsBase } from "@/lib/config";
import { openApiSchemaPath, openapi } from "@/lib/openapi";
import { source } from "@/lib/source";
import { getMDXComponents } from "@/mdx-components";

type PageProps = {
  params: Promise<{
    slug?: string[];
  }>;
};

export default async function Page(props: PageProps) {
  const { slug = [] } = await props.params;
  const page = source.getPage(slug);
  if (!page || page.slugs[0] === "en") notFound();

  if (page.slugs.join("/") === "reference/openapi") {
    const { bundled } = await openapi.getSchema(openApiSchemaPath);

    return (
      <DocsPage full>
        <DocsTitle>{page.data.title}</DocsTitle>
        <DocsDescription>{page.data.description}</DocsDescription>
        <DocsBody>
          <APIPage
            document={openApiSchemaPath}
            operations={getOpenAPIOperations()}
            payload={{ bundled }}
            showDescription
            showTitle
          />
        </DocsBody>
      </DocsPage>
    );
  }

  if (page.data.type === "openapi") {
    return (
      <DocsPage full>
        <DocsBody>
          <APIPage {...page.data.getOpenAPIPageProps()} />
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
    .filter((page) => page.slugs[0] !== "en")
    .map((page) => ({
      slug: page.slugs,
    }));
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { slug = [] } = await props.params;
  const page = source.getPage(slug);
  if (!page || page.slugs[0] === "en") notFound();

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

    return page.data.getOpenAPIPageProps().operations ?? [];
  });
}
