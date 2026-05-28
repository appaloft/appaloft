import { browser } from "$app/environment";
import { goto } from "$app/navigation";

type PageLike = {
  url: URL;
  state: App.PageState;
};

export function modalIsOpen(page: PageLike, modalName: string): boolean {
  if (!browser) {
    return false;
  }
  return new URL(page.url.href).searchParams.get("modal") === modalName;
}

export function modalUrl(page: PageLike, modalName: string, open: boolean): string {
  if (!browser) {
    return "";
  }
  const url = new URL(page.url.href);
  const params = new URLSearchParams(url.searchParams);
  if (open) {
    params.set("modal", modalName);
  } else if (params.get("modal") === modalName) {
    params.delete("modal");
  }
  const search = params.toString();
  return `${url.pathname}${search ? `?${search}` : ""}`;
}

export function setModalOpen(page: PageLike, modalName: string, open: boolean): Promise<void> {
  if (!browser) {
    return Promise.resolve();
  }
  return goto(modalUrl(page, modalName, open), {
    keepFocus: true,
    noScroll: true,
    replaceState: !open,
  });
}
