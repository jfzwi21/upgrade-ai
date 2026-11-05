import { NativeModules, Platform } from "react-native";

export type TermuxCommandResult = {
  stdout: string;
  stderr: string;
  /** Exit status returned by the shell command (not the Android broadcast status). */
  resultCode: number;
  /** Termux service error, when it could not start or complete the request. */
  error?: string;
};

type TermuxBridgeNativeModule = {
  runCommand(
    command: string,
    workingDirectory?: string | null,
  ): Promise<TermuxCommandResult>;
};

const termuxBridge = NativeModules.TermuxBridge as
  | TermuxBridgeNativeModule
  | undefined;

/** Runs a command through Termux's documented RUN_COMMAND service. */
export function runTermuxCommand(
  command: string,
  workingDirectory?: string,
): Promise<TermuxCommandResult> {
  if (Platform.OS !== "android") {
    return Promise.reject(
      new Error("Termux commands are only available on Android."),
    );
  }
  if (!termuxBridge) {
    return Promise.reject(
      new Error("The TermuxBridge native module is unavailable."),
    );
  }
  return termuxBridge.runCommand(command, workingDirectory ?? null);
}
