# JSON操作の例

この例では、`dx` を使用してJSONデータを操作する方法を示します。

## 動作

`input.json` ファイルにはユーザーのリストが含まれています。`source.js` スクリプトは次の処理を行います：

1.  アクティブなユーザー（`isActive` が `true`）のみをフィルタリングします。
2.  各アクティブユーザーについて、名前（`name`）とEメール（`email`）のみを含む新しいオブジェクトを作成します。
3.  結果の配列をJSON文字列として標準出力に出力します。

## 実行方法

プロジェクトのルートディレクトリから次のコマンドを実行します：

```bash
cat examples/json-manipulation/input.json | deno run -A main.ts -i examples/json-manipulation/source.js
```

または `dx` がグローバルにインストールされている場合：

```bash
cat examples/json-manipulation/input.json | dx -i examples/json-manipulation/source.js
```

## 期待される出力

```json
[
  {
    "name": "Alice Johnson",
    "email": "alice.johnson@example.com"
  },
  {
    "name": "David Brown",
    "email": "david.brown@example.com"
  }
]
```
