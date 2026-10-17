// Compile formulas with the site's own KaTeX and print the ones it cannot render.
//   input on stdin:  [{"id": "...", "tex": "...", "display": false}, ...]
//   output:          [{"id": "...", "error": "..."}, ...]
// Used by pipeline/transcribe_questions.py; the options match how app.js renders formulas, except errors are thrown.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const katex = require("../dgy/static/vendor/katex/katex.min.js");

let input = "";
for await (const chunk of process.stdin) input += chunk;

const errors = [];
for (const { id, tex, display } of JSON.parse(input)) {
  try {
    katex.renderToString(tex, { displayMode: Boolean(display), throwOnError: true, strict: "ignore" });
  } catch (error) {
    errors.push({ id, error: String(error.message).replace(/^KaTeX parse error: /, "") });
  }
}
process.stdout.write(JSON.stringify(errors));
