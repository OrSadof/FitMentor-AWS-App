export const handler = async (event) => {
  try {
    if (event?.triggerSource !== "CustomMessage_ForgotPassword") return event;

    const base = String(process.env.RESET_URL_BASE || "").trim();
    if (!base) return event;

    const username = String(event.userName || "");
    const code = String(event.request?.codeParameter || "");
    const sep = base.includes("?") ? "&" : "?";

    const resetLink = `${base}${sep}reset=1&login=1&username=${encodeURIComponent(username)}&code=${code}`;

    event.response.emailSubject = "FitMentor - Password Reset / איפוס סיסמה";
    event.response.emailMessage = `
<div style="font-family: sans-serif; padding: 20px; line-height: 1.6;">
  <h2>FitMentor Password Reset</h2>
  <p>We received a request to reset your password.</p>
  <p>Click the link below to set a new password:</p>
  <p><a href="${resetLink}" style="background-color: #6366f1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">Reset Password</a></p>
  <p>If you did not request a password reset, you can safely ignore this email.</p>
</div>
`;
  } catch (e) {
    console.error("CustomMessage error:", e);
  }

  return event;
};
