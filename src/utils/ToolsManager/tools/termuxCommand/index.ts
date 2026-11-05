import { type ToolExecutionContext } from "@/utils/ToolsManager";
import ToolApproval from "@/utils/ToolsManager/toolApproval";
import { runTermuxCommand } from "@/utils/termux";
import i18n from "@/i18n";

type Args = {
  command?: string;
  working_directory?: string;
};

const tool = {
  id: "termuxCommand",
  get name() {
    return i18n.t("tools.termux_command.name");
  },
  get description() {
    return i18n.t("tools.termux_command.description");
  },
  defaultEnabled: false,
  category: "default" as const,
  // A person must be present for every command; scheduled jobs cannot provide that approval.
  hiddenFromScheduledJobs: true,
  definition: {
    type: "function" as const,
    function: {
      name: "termux_command",
      description:
        "Run one shell command in the user's Termux app. The command is shown in a chat approval card and MUST NOT run unless the user approves that exact request. Explain what it does before requesting approval. Do not combine unrelated commands, and do not use destructive or security-sensitive commands unless the user explicitly requested that exact action. Termux commands can read, change, or delete anything Termux can access. Return stdout, stderr, and the shell exit code; never claim success when the exit code is non-zero.",
      parameters: {
        type: "object" as const,
        properties: {
          command: {
            type: "string",
            description:
              "The exact shell command to run in Termux. It will be displayed to the user for approval before execution.",
          },
          working_directory: {
            type: "string",
            description:
              "Optional Termux working directory. Defaults to Termux's home directory.",
          },
        },
        required: ["command"] as const,
      },
    },
  },
  config: {},
  execute: async function (
    args: unknown,
    streamEmitter: (event: any, data: any) => void,
    context: ToolExecutionContext = {},
  ): Promise<string> {
    if (context.autoApproveTools) {
      return "Termux commands require a person to approve each command in the active chat and cannot run in unattended jobs. No command was run.";
    }

    let parsed: Args;
    try {
      parsed =
        typeof args === "string" ? (JSON.parse(args) as Args) : (args as Args);
    } catch {
      return "The command arguments were invalid JSON. No command was run.";
    }
    const command =
      typeof parsed?.command === "string" ? parsed.command.trim() : "";
    const workingDirectory =
      typeof parsed?.working_directory === "string"
        ? parsed.working_directory.trim()
        : "";
    if (!command)
      return "A non-empty shell command is required. No command was run.";
    if (command.length > 16_000)
      return "The shell command is too long to send safely to Termux. No command was run.";

    streamEmitter(
      "report_status",
      i18n.t("tools.termux_command.status_asking"),
    );
    const approval = await ToolApproval.request({
      skillName: this.definition.function.name,
      description: i18n.t("tools.termux_command.approval_description"),
      payload: { command, workingDirectory: workingDirectory || "Termux home" },
      streamEmitter,
      signal: context.signal,
      // Unlike ordinary tools, this must always show a fresh approval card, even if the user
      // has enabled auto-approval for other tools.
      requireHumanApproval: true,
    });
    if (!approval.approved) {
      streamEmitter(
        "report_status",
        i18n.t("tools.termux_command.status_not_approved"),
      );
      return `${approval.message} No command was run.`;
    }
    if (context.signal?.aborted)
      return "The chat was stopped after approval. No command was run.";

    streamEmitter(
      "report_status",
      i18n.t("tools.termux_command.status_running"),
    );
    try {
      const result = await runTermuxCommand(
        command,
        workingDirectory || undefined,
      );
      streamEmitter(
        "report_status",
        i18n.t("tools.termux_command.status_complete", {
          code: result.resultCode,
        }),
      );
      return JSON.stringify(
        {
          resultCode: result.resultCode,
          stdout: result.stdout,
          stderr: result.stderr,
          ...(result.error ? { error: result.error } : {}),
        },
        null,
        2,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `${i18n.t("tools.termux_command.run_failed", {
        error: message,
      })} No command result was received.`;
    }
  },
};

export default tool;
