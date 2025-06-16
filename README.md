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
deno install --global -f -A -n dx https://raw.githubusercontent.com/Saffrontea/dx/refs/heads/main/main.ts
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
  -c, --code <string>      Execute the provided JavaScript string.
                           Command messages (like loading confirmations) are suppressed.
                           Respects import maps (via --import-map or deno.json/deno.jsonc).
                           If data is piped via stdin, it's available in globalThis._input.
  --import-map <filepath>  Load a custom import map from the specified JSON file.
                           This map is used to resolve module specifiers for `module add`
                           and REPL's `.import` commands. `dx` also automatically
                           looks for `deno.json` or `deno.jsonc` in the current
                           directory if this option is not provided.
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

This repository includes a dedicated `examples/` directory showcasing practical use cases for `dx`. Each example comes with its own input data, source script, and a README explaining how to run it and what it does.

Currently available examples:

*   **`examples/json-manipulation/`**: Demonstrates common JSON transformations like filtering and mapping.
*   **`examples/text-processing/`**: Shows how to perform line-by-line processing of text data, such as counting word occurrences in logs.

We encourage you to explore these examples to get a better understanding of how `dx` can be used to solve various data processing tasks.

## License

MIT
