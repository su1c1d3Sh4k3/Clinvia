import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import { execSync } from "child_process";

// Identidade do bundle. Serve para duas coisas que hoje custam caro:
//
//   1. Dizer, olhando um erro do front no painel, QUAL build o usuário estava
//      rodando. Com PWA + cache da Cloudflare, "corrigido" e "chegou no
//      navegador dele" são eventos separados por horas — já houve caso de
//      reinvestigar código que estava certo porque o cliente rodava bundle
//      velho.
//   2. Separar erro que ainda acontece de erro que já foi corrigido, sem
//      depender da memória de ninguém.
//
// O commit vem do git quando ele existe. No build da EasyPanel o `.git` pode
// não estar no contexto do Docker, e por isso o horário do build é o
// identificador que SEMPRE existe — nunca cai para "desconhecido".
const versaoDoBundle = (() => {
  const quando = new Date().toISOString().slice(0, 16).replace("T", " ");
  try {
    const sha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    return sha ? `${sha} (${quando})` : quando;
  } catch {
    return quando;
  }
})();

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(versaoDoBundle),
  },
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      strategies: "injectManifest",
      srcDir: "public",
      filename: "custom-sw.js",
      includeAssets: ["favicon.png", "pwa-icon.png"],
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
      },
      manifest: {
        name: "Clinbia",
        short_name: "Clinbia",
        description: "Plataforma completa de gestão e atendimento para clínicas",
        start_url: "/",
        display: "standalone",
        background_color: "#0a0a0b",
        theme_color: "#00bfff",
        orientation: "portrait-primary",
        icons: [
          {
            src: "/pwa-icon.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/pwa-icon.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/pwa-icon.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ],
        categories: ["business", "productivity", "medical"],
        lang: "pt-BR",
        dir: "ltr"
      },
      devOptions: {
        enabled: true,
        type: "module"
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
