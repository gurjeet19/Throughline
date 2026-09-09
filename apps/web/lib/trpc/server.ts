import { headers } from "next/headers";
import { appRouter, createTRPCContext } from "@throughline/api";

export const caller = appRouter.createCaller(async () =>
  createTRPCContext({ headers: await headers() }),
);
