import { defineConfig } from "astro/config"
import starlight from "@astrojs/starlight"
import starlightPageActions from "starlight-page-actions"
import { coreSidebar, candidSidebar, parserSidebar } from "./sidebar.mjs"

export default defineConfig({
  site: "https://b3pay.github.io",
  base: "/ic-reactor/v3",
  integrations: [
    starlight({
      title: "ic-reactor",
      logo: {
        src: "./src/assets/icon.svg",
      },
      plugins: [
        starlightPageActions({
          baseUrl: "https://b3pay.github.io/ic-reactor/v3",
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
        baseUrl: "https://github.com/b3pay/ic-reactor/edit/main/docs/",
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
        ...coreSidebar,
        {
          label: "Packages",
          items: [candidSidebar, parserSidebar],
        },
      ],
      customCss: ["./src/styles/custom.css"],
      components: {
        SiteTitle: "./src/components/SiteTitle.astro",
      },
    }),
  ],
})
