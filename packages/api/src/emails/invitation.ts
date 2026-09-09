/**
 * Invitation email — built to the Throughline design system (docs/DESIGN.md):
 * warm off-white canvas, a single white card with a 1px hairline border (no
 * shadow), the DM type family with Georgia/Helvetica fallbacks for clients
 * that strip web fonts, a peach typographic accent, and one oxblood action
 * button (no gradient, no shadow). Table-based layout for email-client support.
 */

const TOKENS = {
  bg: "#F9F6F3",
  surface: "#FFFFFF",
  borderHair: "#EAE3DC",
  peach: "#E89A63",
  peachBright: "#F0A875",
  oxblood: "#8B2839",
  text1: "#1C1411",
  text2: "#5B524C",
  text3: "#9C938C",
  muted: "#F1ECE6",
};

/** Escape values that originate from user input before interpolating into HTML. */
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type InvitationEmailInput = {
  inviterName: string;
  workspaceName: string;
  acceptUrl: string;
};

export function invitationEmailSubject({ inviterName, workspaceName }: InvitationEmailInput) {
  return `${inviterName} invited you to ${workspaceName} on Throughline`;
}

/** Plain-text fallback (improves deliverability and serves text-only clients). */
export function invitationEmailText({
  inviterName,
  workspaceName,
  acceptUrl,
}: InvitationEmailInput) {
  return [
    `${inviterName} has invited you to join "${workspaceName}" on Throughline.`,
    "",
    "Throughline carries a feature from request to shipped — requests, PRDs, and plans, all in one place.",
    "",
    `Accept your invitation: ${acceptUrl}`,
    "",
    "This invitation expires in 48 hours. If you weren't expecting it, you can ignore this email.",
  ].join("\n");
}

export function invitationEmailHtml(input: InvitationEmailInput) {
  const inviterName = escapeHtml(input.inviterName);
  const workspaceName = escapeHtml(input.workspaceName);
  // acceptUrl is app-generated (BETTER_AUTH_URL + invitation id), not user
  // input, but escape its quotes defensively for the attribute context.
  const acceptUrl = input.acceptUrl.replace(/"/g, "&quot;");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>You're invited to ${workspaceName}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Serif+Display:ital@1&family=DM+Mono&display=swap');
      body { margin: 0; padding: 0; background: ${TOKENS.bg}; }
      a { text-decoration: none; }
      .accent { font-family: 'DM Serif Display', Georgia, serif; font-style: italic; color: ${TOKENS.peachBright}; }
    </style>
  </head>
  <body style="margin:0;padding:0;background:${TOKENS.bg};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${TOKENS.bg};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
            <!-- Logo -->
            <tr>
              <td style="padding:0 0 24px 0;font-family:'DM Sans',-apple-system,Helvetica,Arial,sans-serif;">
                <span style="font-size:16px;font-weight:600;letter-spacing:-0.01em;color:${TOKENS.text1};">Through</span><span class="accent" style="font-size:16px;">line</span>
              </td>
            </tr>
            <!-- Card -->
            <tr>
              <td style="background:${TOKENS.surface};border:1px solid ${TOKENS.borderHair};border-radius:14px;padding:40px;">
                <p style="margin:0 0 14px 0;font-family:'DM Sans',-apple-system,Helvetica,Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${TOKENS.peach};">
                  You're invited
                </p>
                <h1 style="margin:0 0 18px 0;font-family:'DM Serif Display',Georgia,serif;font-weight:400;font-size:30px;line-height:1.18;letter-spacing:-0.01em;color:${TOKENS.text1};">
                  An invitation to <span class="accent">collaborate</span>
                </h1>
                <p style="margin:0 0 28px 0;font-family:'DM Sans',-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${TOKENS.text2};">
                  <strong style="color:${TOKENS.text1};font-weight:600;">${inviterName}</strong> has invited you to join
                  <strong style="color:${TOKENS.text1};font-weight:600;">${workspaceName}</strong> on Throughline — where a
                  feature travels all the way from request to shipped.
                </p>
                <!-- CTA -->
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:6px;background:${TOKENS.oxblood};">
                      <a href="${acceptUrl}" style="display:inline-block;padding:12px 28px;font-family:'DM Sans',-apple-system,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:#F6E9DD;border-radius:6px;">
                        Accept invitation
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:28px 0 8px 0;font-family:'DM Sans',-apple-system,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:${TOKENS.text3};">
                  Or paste this link into your browser:
                </p>
                <p style="margin:0;font-family:'DM Mono',ui-monospace,monospace;font-size:12px;line-height:1.5;color:${TOKENS.text2};word-break:break-all;">
                  ${acceptUrl}
                </p>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="padding:20px 4px 0 4px;font-family:'DM Sans',-apple-system,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${TOKENS.text3};">
                This invitation expires in 48 hours. If you weren't expecting it, you can safely ignore this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
