// importer.ts
import * as colors from "jsr:@std/fmt/colors";

interface ModuleInfo {
  name: string;
  url: string;
  description?: string;
  source: "deno.land" | "jsr";
}

// Deno Land APIから検索
async function searchDenoLand(query: string): Promise<ModuleInfo[]> {
  try {
    const response = await fetch(
      `https://api.deno.land/modules?limit=50&query=${encodeURIComponent(query)}`,
    );
    if (!response.ok) {
      console.error(colors.red(`Error fetching from Deno Land: ${response.statusText}`));
      return [];
    }
    const data = await response.json();
    return (data.data?.results || []).map((item: any) => ({
      name: item.name,
      url: `https://deno.land/x/${item.name}${item.latest_version ? `@${item.latest_version}` : ""}/${item.default_version_file || 'mod.ts'}`, // Ensure a default file if possible
      description: item.description,
      source: "deno.land",
    }));
  } catch (e) {
    console.error(colors.red(`Failed to search Deno Land: ${e.message}`));
    return [];
  }
}

// JSR (deno search コマンド経由)
async function searchJsr(query: string): Promise<ModuleInfo[]> {
  try {
    const command = new Deno.Command("deno", {
      args: ["search", query],
      stdout: "piped",
      stderr: "piped",
    });
    const { code, stdout, stderr } = await command.output();

    if (code !== 0) {
      const errorMsg = new TextDecoder().decode(stderr);
      console.error(colors.red(`Error using 'deno search': ${errorMsg}`));
      return [];
    }

    const output = new TextDecoder().decode(stdout);
    const modules: ModuleInfo[] = [];
    // JSRの出力形式の例: @scope/package - Description (https://jsr.io/@scope/package)
    // Deno Land/xの出力形式の例: name - Description (https://deno.land/x/name)
    const lines = output.split("\n").filter(line => line.trim() !== "");
    
    for (const line of lines) {
        const jsrMatch = line.match(/^(@[^\s]+\/[^\s]+)\s*-\s*(.*?)\s*\(?(https?:\/\/jsr\.io\/[^)]+)\)?/);
        const denoLandMatch = line.match(/^([a-zA-Z0-9_]+)\s*-\s*(.*?)\s*\(?(https?:\/\/deno\.land\/x\/[^)]+)\)?/);

        if (jsrMatch) {
            modules.push({
                name: jsrMatch[1],
                url: `jsr:${jsrMatch[1]}`, // JSR specifier
                description: jsrMatch[2].trim(),
                source: "jsr",
            });
        } else if (denoLandMatch) {
            // `deno search` は Deno Land/x も返すことがあるので、重複を避けるか、こちらを優先するか。
            // 今回は Deno Land API を別途叩くので、ここでは JSR のみを主眼とするか、
            // `deno search` の結果をそのまま使う方針でもよい。
            // APIが使えない場合のフォールバックとして `deno search` は有用。
            // ここでは `deno search` の結果から jsr のみを抽出する例
        }
    }
    // 簡単のため、ここでは`deno search`でJSRモジュールが見つかることを期待する。
    // 厳密なパースは出力形式の変更に弱いので注意。
    // 例: `jsr:@scope/name` の形式を期待。
    return lines.filter(l => l.startsWith("@")).map(line => {
        const parts = line.split(/\s+-\s+/);
        const name = parts[0];
        // JSRモジュールの場合、URLは `jsr:${name}` となる
        return { name, url: `jsr:${name}`, description: parts[1] || "", source: "jsr"};
    });
  } catch (e) {
    console.error(colors.red(`Failed to search JSR via 'deno search': ${e.message}`));
    return [];
  }
}


async function selectWithFzf(modules: ModuleInfo[]): Promise<ModuleInfo | null> {
  if (modules.length === 0) {
    console.log(colors.yellow("No modules found to select."));
    return null;
  }

  const fzfInput = modules
    .map(m => `${m.source === 'jsr' ? colors.magenta('[JSR]') : colors.blue('[Land]')} ${colors.bold(m.name)} - ${m.description || '(no description)'} -> ${m.url}`)
    .join("\n");

  try {
    const command = new Deno.Command("fzf", {
      stdin: "piped",
      stdout: "piped",
      stderr: "inherit", // fzfのエラーはそのまま表示
    });
    const process = command.spawn();
    
    const writer = process.stdin.getWriter();
    await writer.write(new TextEncoder().encode(fzfInput));
    await writer.close();

    const { stdout, success } = await process.status;
    const output = new TextDecoder().decode(await Deno.readAll(process.stdout));
    process.stdout.close(); // 明示的に閉じる

    if (!success) {
      console.error(colors.red("fzf selection cancelled or failed."));
      return null;
    }

    const selectedLine = output.trim();
    if (!selectedLine) return null;

    // 選択された行からURLを抽出 (簡易的な方法)
    const urlMatch = selectedLine.match(/->\s*(.*)$/);
    const selectedUrl = urlMatch ? urlMatch[1] : null;

    return modules.find(m => m.url === selectedUrl) || null;

  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      console.error(colors.red("fzf command not found. Please install fzf."));
    } else {
      console.error(colors.red(`Error during fzf selection: ${e.message}`));
    }
    return null;
  }
}

export async function searchAndImportModule(query: string): Promise<{ name: string; module: any; url: string } | null> {
  console.log(colors.cyan(`Searching for "${query}"...`));
  const denoLandModules = await searchDenoLand(query);
  const jsrModules = await searchJsr(query); // `deno search` を使う

  const allModules = [...denoLandModules, ...jsrModules];
  
  if (allModules.length === 0) {
    console.log(colors.yellow("No modules found."));
    return null;
  }

  const selectedModuleInfo = await selectWithFzf(allModules);

  if (selectedModuleInfo) {
    try {
      console.log(colors.cyan(`Importing ${selectedModuleInfo.url}...`));
      const mod = await import(selectedModuleInfo.url);
      // モジュール名から特殊文字を除去して変数名として使えるようにする
      const moduleKey = selectedModuleInfo.name.replace(/[@\/:-]/g, "_");
      return { name: moduleKey, module: mod, url: selectedModuleInfo.url };
    } catch (e) {
      console.error(colors.red(`Error importing ${selectedModuleInfo.url}:`), e);
      return null;
    }
  }
  return null;
}