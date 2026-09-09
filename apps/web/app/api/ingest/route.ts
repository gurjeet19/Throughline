import { NextResponse } from "next/server";
import { getWorkspaceByIngestToken } from "@throughline/db";
import { ingestPayloadSchema, submitFeatureRequest } from "@throughline/api";

/**
 * Inbound intake endpoint (PRD user story 7): any external source — an email
 * forwarder, a support-ticket webhook, call-notes tooling — POSTs a request
 * here with its per-workspace bearer token. Authenticated requests flow into
 * the exact same triage → PRD pipeline as the manual form.
 *
 *   POST /api/ingest
 *   Authorization: Bearer <workspace ingest token>
 *   { "channel": "email", "content": "...", "title": "optional" }
 */
function bearer(header: string | null): string {
  return (header ?? "").replace(/^Bearer\s+/i, "").trim();
}

export async function POST(req: Request) {
  const token = bearer(req.headers.get("authorization"));
  if (!token) {
    return NextResponse.json(
      { error: "Missing bearer token" },
      { status: 401 },
    );
  }

  const workspace = await getWorkspaceByIngestToken(token);
  if (!workspace) {
    return NextResponse.json({ error: "Invalid ingest token" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = ingestPayloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { channel, content, title } = parsed.data;
  const rawContent = title ? `${title}\n\n${content.trim()}` : content.trim();

  const request = await submitFeatureRequest(workspace.id, {
    rawContent,
    channel,
  });

  return NextResponse.json(
    { id: request.id, status: request.status, channel },
    { status: 201 },
  );
}
