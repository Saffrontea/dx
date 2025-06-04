// input.ts
import { readAll } from "jsr:@std/io/read-all";

export async function loadInitialData(): Promise<unknown | null> {
  if (!Deno.isatty(Deno.stdin.rid)) {
    const stdinContent = await readAll(Deno.stdin);
    const inputText = new TextDecoder().decode(stdinContent);
    if (inputText.trim() === "") {
      return null;
    }
    try {
      // JSONとしてパース試行
      return JSON.parse(inputText);
    } catch {
      // JSONでなければプレーンテキストとして返す
      return inputText;
    }
  }
  return null; // stdinがtty（パイプ入力なし）の場合はnull
}