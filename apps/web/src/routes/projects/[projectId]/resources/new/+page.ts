import { redirect } from "@sveltejs/kit";

export const prerender = false;

export const load = ({ params, url }: { params: { projectId: string }; url: URL }) => {
  const projectId = params.projectId;
  const searchParams = new URLSearchParams(url.searchParams);
  searchParams.set("modal", "quick-deploy");
  searchParams.set("projectMode", "existing");
  searchParams.set("projectId", projectId);

  throw redirect(307, `/projects/${encodeURIComponent(projectId)}?${searchParams.toString()}`);
};
