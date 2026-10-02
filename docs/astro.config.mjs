import { defineConfig } from "astro/config"
import starlight from "@astrojs/starlight"
import starlightPageActions from "starlight-page-actions"

export default defineConfig({
  site: "https://ic-reactor.b3pay.net",
  base: "/v4/",
  output: "static",
  integrations: [
    starlight({
      title: "IC Reactor",
      logo: {
        src: "./src/assets/icon.svg",
      },
      plugins: [
        starlightPageActions({
          baseUrl: "https://ic-reactor.b3pay.net",
          actions: {
            chatgpt: true,
            claude: true,
            markdown: true,
          },
        }),
      ],
      description:
        "The modern, type-safe library for building Internet Computer applications",
      social: [
        {
          label: "GitHub",
          icon: "github",
          href: "https://github.com/b3pay/ic-reactor",
        },
      ],
      editLink: {
        baseUrl: "https://github.com/b3pay/ic-reactor/edit/v4/docs/",
      },
      head: [
        {
          tag: "meta",
          attrs: {
            name: "description",
            content:
              "The modern, type-safe library for building Internet Computer applications",
          },
        },
      ],
      sidebar: [
        { label: "Overview", link: "/" },
        { label: "Examples", link: "/examples" },
        {
          label: "API Reference",
          collapsed: true,
          items: [
            { label: "Overview", link: "/libs" },
            {
              label: "Classes",
              collapsed: true,
              items: [{ autogenerate: { directory: "libs/classes" } }],
            },
            {
              label: "Functions",
              collapsed: true,
              items: [{ autogenerate: { directory: "libs/functions" } }],
            },
            {
              label: "Interfaces",
              collapsed: true,
              items: [{ autogenerate: { directory: "libs/interfaces" } }],
            },
            {
              label: "Type Aliases",
              collapsed: true,
              items: [{ autogenerate: { directory: "libs/type-aliases" } }],
            },
            {
              label: "Variables",
              collapsed: true,
              items: [{ autogenerate: { directory: "libs/variables" } }],
            },
          ],
        },
      ],
      customCss: ["./src/styles/custom.css"],
      components: {
        SiteTitle: "./src/components/SiteTitle.astro",
      },
    }),
  ],
})
