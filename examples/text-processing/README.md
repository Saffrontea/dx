# テキスト処理の例

この例では、`dx` を使用して複数行のテキストデータを処理する方法を示します。具体的には、入力テキスト内の特定の単語（この場合は "ERROR"）の出現回数をカウントします。

## 動作

`input.txt` ファイルには、ログのような複数行のテキストデータが含まれています。`source.js` スクリプトは次の処理を行います：

1.  標準入力から受け取ったテキストを行に分割します。
2.  各行を調べて、"ERROR" という単語が含まれているかどうかを確認します。
3.  "ERROR" の総出現回数をカウントします。
4.  結果を `{ "errorCount": N }` の形式のJSON文字列として標準出力に出力します。

## 実行方法

プロジェクトのルートディレクトリから次のコマンドを実行します：

```bash
cat examples/text-processing/input.txt | deno run -A main.ts -i examples/text-processing/source.js
```

または `dx` がグローバルにインストールされている場合：

```bash
cat examples/text-processing/input.txt | dx -i examples/text-processing/source.js
```

## 期待される出力

```json
{
  "errorCount": 3
}
```
