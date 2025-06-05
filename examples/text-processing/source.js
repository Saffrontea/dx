// examples/text-processing/source.js
const inputText = globalThis._input;

if (typeof inputText !== 'string') {
  console.error("Error: Input data must be a string.");
  // Deno.exit(1); // Standard Deno way, but dx scripts might just output error to stdout
  // For dx, it might be better to output a JSON error or let it fail gracefully
  // For this example, we'll output a JSON error.
  console.log(JSON.stringify({ error: "Input data must be a string." }));
  Deno.exit(1); // Exit to prevent further processing
}

const lines = inputText.split('\n');
let errorCount = 0;

for (const line of lines) {
  if (line.includes("ERROR")) {
    errorCount++;
  }
}

console.log(JSON.stringify({ errorCount: errorCount }, null, 2));
