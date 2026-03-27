import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["cli/cli.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  outfile: "cortex-sync.js",
  external: [],
  sourcemap: false,
  alias: {
    "obsidian": "./src/http.ts",
  },
  banner: {
    js: "#!/usr/bin/env node\n",
  },
});

console.log("Built cortex-sync.js");
