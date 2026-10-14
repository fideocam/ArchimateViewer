const fs = require("fs");

const source = fs.readFileSync("README.md", "utf8");
const omitted = /[ \t]*<!-- marketplace:omit -->[\s\S]*?<!-- \/marketplace:omit -->\n*/g;
if (!source.match(omitted)) {
  console.error("README.md is missing marketplace:omit markers, so the marketplace page would include the local-run section.");
  process.exit(1);
}

omitted.lastIndex = 0;
const marketplace = source.replace(omitted, "").replace(/\n{3,}/g, "\n\n");
if (/Run the extension locally|marketplace:omit|Embed the JavaScript viewer|npm run |F5|## Scripts/.test(marketplace)) {
  console.error("Marketplace README still contains a section that should stay on the GitHub README.");
  process.exit(1);
}

fs.writeFileSync("README.marketplace.md", marketplace);
