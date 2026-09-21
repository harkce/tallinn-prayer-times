import { copyFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const docs = "docs";
copyFileSync(join(docs, "index.html"), join(docs, "404.html"));
writeFileSync(join(docs, ".nojekyll"), "");
console.log("postbuild: 404.html + .nojekyll ready");
