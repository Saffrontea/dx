# dx - Enhanced JavaScript Data Processing for the Command Line

[![Deno compatibility](https://shield.deno.dev/deno/^1.40)](https://deno.land)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

*[日本語版 README はこちら](README-JP.md)*

`dx` is a Deno-based command-line tool that combines the simplicity of Unix pipelines with the power of JavaScript, providing an intuitive alternative to complex data processing DSLs like `jq`.

## Key Features

- **Process piped data with JavaScript**: Access stdin data via `globalThis._input`
- **Seamless Unix pipeline integration**: Ideal for transforming and filtering data
- **Interactive REPL**: For data exploration and development
- **Module management**: Import from JSR, NPM, or URLs
- **TypeScript support**: Leverage type safety

## Installation

```bash
# Install globally via Deno
deno install --global -A -n dx https://raw.githubusercontent.com/Saffrontea/dx/main/main.ts
```

## Quick Start

### Process JSON Data

```bash
# Transform data with JavaScript
cat data.json | dx 
...
> console.log(JSON.stringify(globalThis._input.users.filter(u => u.active)));

# Use a script file for more complex operations
cat data.json | dx -i transform.js | jq '.'
```

### Interactive REPL

```bash
# Start REPL with data loaded from file
cat data.json | dx

# Now you can explore the data
> globalThis._input.users.length
42
```

## Usage

### Command-line Options

```
dx - Deno-based JavaScript/TypeScript REPL and script runner.

Usage:
  dx                       Start the REPL.
  dx module <command>      Manage module mappings.

Module Commands:
  dx module add <name> <specifier>    Add a module mapping.
                                <specifier> can be a full URL, or a JSR specifier
                                (e.g., jsr:@std/fs, @std/path), an NPM specifier
                                (e.g., npm:zod), or a bare specifier resolvable
                                through an active import map (via --import-map or
                                deno.json/deno.jsonc).
                                Example: dx module add fs @std/fs
                                Example: dx module add zod npm:zod
  dx module remove <name>       Remove a module mapping.
                                Example: dx module remove fs
  dx module list                List all module mappings.

REPL Mode:
  When started without specific commands, dx enters an interactive REPL.
  Pipe data via stdin to make it available in 'globalThis._input'.
  Example: cat data.json | dx

Options:
  -h, --help               Show this help message.
  -i, --input <filename>   Execute a JavaScript file, print its stdout, then exit.
                           Any data piped to dx via stdin will be available in the
                           script's globalThis._input variable.
  --import-map <filepath>  Load a custom import map from the specified JSON file.
                           This map is used to resolve module specifiers for
                           module add and REPL's .import commands. If not
                           provided, dx will look for a deno.json or
                           deno.jsonc in the current directory.
```

### Comparison with jq

```bash
# Using jq to extract specific data
cat data.json | jq '.items[] | select(.type=="article") | .title'

# Equivalent using dx
cat data.json | dx 
...
> console.log(JSON.stringify(globalThis._input.items.filter(i => i.type === 'article').map(i => i.title)))
```

While the `dx` version might be more verbose for simple operations, it offers several advantages:

1. No need to learn a special DSL - just use JavaScript
2. Access to the full JavaScript ecosystem (async/await, fetch, etc.)
3. Complex data manipulations that would be difficult in jq
4. Easy integration with other JS/TS code

## REPL Commands

When using the interactive REPL, several commands are available:

```
.exit                Exit the REPL.
.help                Show this help message.
.run                 Execute the current code buffer.
.do <filepath>       Execute a JavaScript file.
.import <name> <specifier>  Dynamically import a module.
.clear               Clear the terminal screen.
.context             Show current _input and _imports keys.
.bclear (or .bc)     Clear the current code buffer.
.bshow (or .bs)      Show the current code buffer content.
.bhprev (or .hp)     Load previous executed buffer.
.bhnext (or .hn)     Load next executed buffer.
.bhlist              List all executed buffers from history.
.bhload <index>      Load a specific executed buffer by index.
.bhclear             Clear all executed buffer history.
```

## Real-world Examples

### Weather Data Processing

```javascript
// Process weather data from an API
const apiKey = globalThis._input.apiKey;
const city = "Tokyo";

const response = await fetch(`https://api.example.com/weather?city=${city}&apiKey=${apiKey}`);
const data = await response.json();

// Extract and transform the forecast
const forecast = data.forecast.map(item => ({
  date: item.date,
  condition: item.condition,
  temperature: {
    high: item.tempHigh,
    low: item.tempLow
  }
}));

console.log(JSON.stringify(forecast));
```

### Batch File Processing

```javascript
// Assuming _input contains a list of files
const files = globalThis._input;
const results = [];

for (const file of files) {
  const content = await Deno.readTextFile(file);
  const stats = content.split('\n').reduce((acc, line) => {
    if (line.includes('ERROR')) acc.errors++;
    if (line.includes('WARNING')) acc.warnings++;
    return acc;
  }, { errors: 0, warnings: 0 });

  results.push({
    file,
    stats
  });
}

console.log(JSON.stringify(results));
```

## License

MIT
