const fs = require("fs");

const source = fs.readFileSync("README.md", "utf8");
const omitted = /[ \t]*<!-- marketplace:omit -->[\s\S]*?<!-- \/marketplace:omit -->\n*/;
if (!omitted.test(source)) {
  console.error("README.md is missing marketplace:omit markers, so the marketplace page would include the local-run section.");
  process.exit(1);
}

const marketplace = source.replace(omitted, "").replace(/\n{3,}/g, "\n\n");
if (/Run the extension locally|marketplace:omit/.test(marketplace)) {
  console.error("Marketplace README still contains the local-run section.");
  process.exit(1);
}

fs.writeFileSync("README.marketplace.md", marketplace);
