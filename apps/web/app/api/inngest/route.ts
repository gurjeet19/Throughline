import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { processRequestFunction } from "@/inngest/functions/process-request";
import { generateTasksFunction } from "@/inngest/functions/generate-tasks";
import { fetchPrDiffFunction } from "@/inngest/functions/fetch-pr-diff";
import { generateCodeFunction } from "@/inngest/functions/generate-code";
import { reviewPullRequestFunction } from "@/inngest/functions/review-pull-request";
import { generateFixTasksFunction } from "@/inngest/functions/generate-fix-tasks";
import { releaseReadinessFunction } from "@/inngest/functions/release-readiness";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processRequestFunction,
    generateTasksFunction,
    fetchPrDiffFunction,
    generateCodeFunction,
    reviewPullRequestFunction,
    generateFixTasksFunction,
    releaseReadinessFunction,
  ],
});
