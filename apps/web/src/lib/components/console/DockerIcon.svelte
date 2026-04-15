<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  type Props = SVGAttributes<SVGSVGElement>;

  let { class: className = "", ...restProps }: Props = $props();
</script>

<svg
  class={className}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  {...restProps}
>
  <path d="M4 13h14.5c.8 0 1.7-.3 2.3-.9.1 4.2-3 7.4-7.9 7.4H9c-3.3 0-6-2.7-6-6v-.5h1Z" />
  <path d="M19.1 10.7c.6-.8 1.7-1.2 2.9-.9-.2 1.2-1 2-2.3 2.4" />
  <path d="M6 9h3v3H6z" />
  <path d="M10 9h3v3h-3z" />
  <path d="M14 9h3v3h-3z" />
  <path d="M10 5h3v3h-3z" />
</svg>
