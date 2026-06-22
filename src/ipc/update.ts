import { commands, type DownloadResult } from "@/bindings";
import { unwrapResult } from "./client";

export type { DownloadResult };

export async function getPlatform(): Promise<string> {
  return commands.getPlatform();
}

export async function downloadUpdate(
  url: string,
  signature: string,
): Promise<DownloadResult> {
  return unwrapResult(await commands.downloadUpdate(url, signature));
}

export async function installUpdate(
  packagePath: string,
  packageType: string,
): Promise<void> {
  unwrapResult(await commands.installUpdate(packagePath, packageType));
}
