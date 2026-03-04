import type { AnyAgentTool, OpenClawPluginApi } from "../../src/plugins/types.js";
import { createApplyTool } from "./src/apply-tool.js";

export default function register(api: OpenClawPluginApi) {
  api.registerTool(createApplyTool(api) as unknown as AnyAgentTool);
}
