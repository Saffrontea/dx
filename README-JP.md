# dx - コマンドライン向け拡張JavaScript データ処理ツール

[![Deno compatibility](https://shield.deno.dev/deno/^1.40)](https://deno.land)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

*[English README here](README.md)*

`dx`はDenoベースのコマンドラインツールで、UnixパイプラインのシンプルさとJavaScriptのパワーを組み合わせ、`jq`のような複雑なデータ処理DSLに代わる直感的な選択肢を提供します。

## 主な機能

- **JavaScriptでパイプデータを処理**: 標準入力のデータに`globalThis._input`経由でアクセス
- **Unixパイプラインとのシームレスな統合**: データの変換とフィルタリングに最適
- **インタラクティブREPL**: データ探索と開発に便利
- **モジュール管理**: JSR、NPM、URLからのインポートをサポート
- **TypeScriptサポート**: 型安全性の活用

## インストール

```bash
# Denoからグローバルにインストール
deno install --global -f -A -n dx https://raw.githubusercontent.com/Saffrontea/dx/refs/heads/main/main.ts
```

## クイックスタート

### JSONデータの処理

```bash
# JavaScriptでデータを変換
cat data.json | dx 
...
> console.log(JSON.stringify(globalThis._input.users.filter(u => u.active)));

# より複雑な操作にはスクリプトファイルを使用
cat data.json | dx -i transform.js | jq '.'
```

### インタラクティブREPL

```bash
# ファイルからデータを読み込んでREPLを起動
cat data.json | dx

# データを探索できるようになります
> globalThis._input.users.length
42
```

## 使用方法

### コマンドラインオプション

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

### jqとの比較

```bash
# jqを使用して特定のデータを抽出
cat data.json | jq '.items[] | select(.type=="article") | .title'

# dxでの同等の操作
cat data.json | dx 
...
> console.log(JSON.stringify(globalThis._input.items.filter(i => i.type === 'article').map(i => i.title)))
```

`dx`バージョンは単純な操作では冗長に見えるかもしれませんが、いくつかの利点があります：

1. 特別なDSLを学ぶ必要がない - JavaScriptをそのまま使用
2. JavaScriptエコシステム全体へのアクセス（async/await、fetchなど）
3. jqでは難しい複雑なデータ操作が可能
4. 他のJS/TSコードとの簡単な統合

## REPLコマンド

インタラクティブREPLを使用する際、いくつかのコマンドが利用可能です：

```
.exit                REPLを終了
.help                このヘルプメッセージを表示
.run                 現在のコードバッファを実行
.do <filepath>       JavaScriptファイルを実行
.import <name> <specifier>  モジュールを動的にインポート
.clear               ターミナル画面をクリア
.context             現在の_inputと_importsキーを表示
.bclear (or .bc)     現在のコードバッファをクリア
.bshow (or .bs)      現在のコードバッファの内容を表示
.bhprev (or .hp)     前の実行バッファをロード
.bhnext (or .hn)     次の実行バッファをロード
.bhlist              履歴から全ての実行バッファをリスト
.bhload <index>      特定の実行バッファをインデックスで読み込み
.bhclear             全ての実行バッファ履歴をクリア
```

## 実用例

このリポジトリには、`dx` の実用的な使用例を示す専用の `examples/` ディレクトリが含まれています。各例には、それぞれの入力データ、ソーススクリプト、および実行方法と動作を説明するREADMEが付属しています。

現在利用可能な例：

*   **`examples/json-manipulation/`**: フィルタリングやマッピングなど、一般的なJSON変換のデモンストレーション。
*   **`examples/text-processing/`**: ログ内の単語の出現回数を数えるなど、テキストデータの行ごとの処理方法の表示。

これらの例を調べて、さまざまなデータ処理タスクを解決するために `dx` をどのように使用できるかについての理解を深めることをお勧めします。

## ライセンス

MIT
