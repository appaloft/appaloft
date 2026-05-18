import { getLLMFullText } from "@/lib/get-llm-text";

export const revalidate = false;

export async function GET() {
  return new Response(await getLLMFullText(), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}
