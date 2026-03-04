import type { AnyAgentTool, OpenClawPluginApi } from "../../src/plugins/types.js";
import { createTrackerTool } from "./src/tracker-tool.js";

export default function register(api: OpenClawPluginApi) {
  api.registerTool(createTrackerTool(api) as unknown as AnyAgentTool);
}
