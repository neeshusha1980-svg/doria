# Doria independent migration handoff

This package contains the complete source tree available in the uploaded Doria archive, excluding AppDeploy build provenance files (`build_manifest/build-manifest.json` and `build_manifest/sbom.cdx.json`). The source files are intentionally preserved as exported so Gemini can inspect the exact existing implementation before replacing provider dependencies.

**Important:** This is not yet a provider-free, runnable replacement. The source still contains AppDeploy SDK imports because those are the dependencies Gemini must migrate. No AppDeploy deployment or production data is included.

Archive source revision: `1795346515545`. It differs from the earlier requested revision `1795012215870`.

Read `GEMINI_MASTER_PROMPT.md` and give Gemini this entire ZIP plus that prompt. Ask Gemini to inspect every file and return a complete updated project, not snippets.
