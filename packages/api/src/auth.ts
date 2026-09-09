import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { Resend } from "resend";
import {
  invitationEmailHtml,
  invitationEmailSubject,
  invitationEmailText,
} from "./emails/invitation";
import {
  account,
  db,
  ensureBilling,
  ensureDefaultProject,
  invitation,
  member,
  session,
  user,
  verification,
  workspace,
} from "@throughline/db";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Only register Google as a social provider when its OIDC credentials are
// present, so the app still boots in environments without them configured.
const googleConfigured =
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

// Lazily construct the Resend client so the app still boots without a key
// (invites then log the accept link instead of emailing it).
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// Until the production domain (through.online) is verified in Resend, fall back
// to Resend's shared test sender — which can only deliver to the Resend account
// owner's own email, perfect for local testing. Switch INVITE_FROM_EMAIL to a
// verified address (e.g. "Throughline <invites@through.online>") to send to
// anyone.
const inviteFrom =
  process.env.INVITE_FROM_EMAIL ?? "Throughline <onboarding@resend.dev>";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification, member, invitation, workspace },
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: googleConfigured
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID as string,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        },
      }
    : undefined,
  account: {
    // Auto-link a Google sign-in to an existing account with the same email.
    // Safe to trust Google here because it returns verified email addresses,
    // so this can't be used to hijack an account via an unverified address.
    accountLinking: {
      enabled: true,
      trustedProviders: ["google", "email-password"],
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          const baseSlug = slugify(createdUser.name || createdUser.email);
          await auth.api.createOrganization({
            body: {
              name: createdUser.name ? `${createdUser.name}'s Workspace` : "My Workspace",
              slug: `${baseSlug}-${createdUser.id.slice(0, 8)}`,
              userId: createdUser.id,
            },
          });
        },
      },
    },
    session: {
      create: {
        before: async (newSession) => {
          const [membership] = await db
            .select()
            .from(member)
            .where(eq(member.userId, newSession.userId))
            .limit(1);

          return {
            data: {
              ...newSession,
              activeOrganizationId: membership?.organizationId,
            },
          };
        },
      },
    },
  },
  plugins: [
    organization({
      creatorRole: "admin",
      schema: {
        organization: {
          modelName: "workspace",
        },
      },
      organizationHooks: {
        // Every new workspace starts on the Free plan and with a default
        // project so the product works out of the box. Pre-existing workspaces
        // are covered by the lazy ensure-on-read in `ensureBilling` /
        // `ensureDefaultProject`; this just seeds both the moment a workspace is
        // created.
        afterCreateOrganization: async ({ organization }) => {
          await ensureBilling(organization.id);
          await ensureDefaultProject(organization.id);
        },
      },
      // Email the invitee their accept link via Resend. The Members UI still
      // surfaces the same link to copy, so invites keep working even if a
      // send fails or no key is configured (we just log it then).
      sendInvitationEmail: async ({ id, email, organization, inviter }) => {
        const acceptUrl = `${process.env.BETTER_AUTH_URL ?? ""}/accept-invitation/${id}`;
        const payload = {
          inviterName: inviter.user.name || inviter.user.email,
          workspaceName: organization.name,
          acceptUrl,
        };

        if (!resend) {
          console.log(
            `[invitation] RESEND_API_KEY unset — ${email} can accept at ${acceptUrl}`,
          );
          return;
        }

        const { error } = await resend.emails.send({
          from: inviteFrom,
          to: email,
          subject: invitationEmailSubject(payload),
          html: invitationEmailHtml(payload),
          text: invitationEmailText(payload),
        });
        if (error) {
          // Don't throw: the invitation row is already created and the link is
          // available in the UI. Surface the failure for debugging.
          console.error(`[invitation] Resend failed for ${email}:`, error);
        }
      },
    }),
  ],
});
