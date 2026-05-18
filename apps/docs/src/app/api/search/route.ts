import { createFromSource } from "fumadocs-core/search/server";
import { contentSource } from "@/lib/content-source";

export const revalidate = false;

export const { staticGET: GET } = createFromSource(contentSource);
