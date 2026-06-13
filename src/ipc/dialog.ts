import { open } from "@tauri-apps/plugin-dialog";

/**
 * Opens the OS-native file picker and returns the selected file's absolute
 * path, or `null` if the user cancels (FR-002).
 */
export async function pickLogFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    title: "Select log file",
  });
  return selected ?? null;
}
