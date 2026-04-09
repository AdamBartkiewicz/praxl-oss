import { router } from "../trpc";
import { skillsRouter } from "./skills";
import { projectsRouter } from "./projects";
import { syncRouter } from "./sync";
import { aiRouter } from "./ai";
import { settingsRouter } from "./settings";
import { chatRouter } from "./chat";
import { filesRouter } from "./files";
import { orgRouter } from "./org";
import { dataRequestsRouter } from "./dataRequests";
import { analyticsRouter } from "./analytics";
export const appRouter = router({
  skills: skillsRouter,
  projects: projectsRouter,
  sync: syncRouter,
  ai: aiRouter,
  settings: settingsRouter,
  chat: chatRouter,
  files: filesRouter,
  org: orgRouter,
  dataRequests: dataRequestsRouter,
  analytics: analyticsRouter,
});

export type AppRouter = typeof appRouter;
