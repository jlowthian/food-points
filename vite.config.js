// import { defineConfig } from "vite";
// import { VitePWA } from "vite-plugin-pwa";

// export default defineConfig({
//   // The GitHub repository will be named "food-points".
//   base: "/food-points/",

//   plugins: [
//     VitePWA({
//       registerType: "autoUpdate",
//       includeAssets: ["favicon.svg"],

//       manifest: {
//         name: "Food Points",
//         short_name: "Food Points",
//         description: "Track food points and weekly goals.",
//         theme_color: "#f5f5f0",
//         background_color: "#f5f5f0",
//         display: "standalone",
//         orientation: "portrait",
//         start_url: "/food-points/",
//         scope: "/food-points/",
//         icons: [
//           {
//             src: "/food-points/icon.svg",
//             sizes: "any",
//             type: "image/svg+xml",
//             purpose: "any",
//           },
//         ],
//       },

//       workbox: {
//         globPatterns: ["**/*.{js,css,html,svg,ico,png}"],
//       },
//     }),
//   ],
// });

import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/food-points/",
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Food Points",
        short_name: "Food Points",
        description: "Track your weekly food points.",
        theme_color: "#172b24",
        background_color: "#f7f8f5",
        display: "standalone",
        start_url: "./",
        scope: "./",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
    }),
  ],
});
