import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";
/* Same reason as the water normal map: "/favicon.svg" resolved against the site
   root, not /modules/stormpeak_ocean/. */
import faviconUrl from "@/assets/favicon.svg?url";

const APP_NAME = "MASSFRONT";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: APP_NAME },
      { name: "theme-color", content: "#04182A" },
      {
        name: "description",
        content: "MASSFRONT — Stormpeak water-world command. Supreme Commander-style RTS on XYLOS-7 tempest seas.",
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: faviconUrl },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  component: () => (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
