export const handler = async (event) => {
	try {
		if (event?.triggerSource !== "CustomMessage_ForgotPassword") return event;

		const base = String(process.env.RESET_URL_BASE || "").trim();
		if (!base) return event;

		const username = String(event.userName || "");
		const code = String(event.request?.codeParameter || "");
		const sep = base.includes("?") ? "&" : "?";

		const resetLink = `${base}${sep}reset=1&login=1&username=${encodeURIComponent(username)}&code=${code}`;

		event.response.emailSubject = "FitMentor - איפוס סיסמה";
		event.response.emailMessage = `
<p>קיבלנו בקשה לאיפוס סיסמה.</p>
<p>לחץ כאן כדי לאפס:</p>
<p><a href="${resetLink}">איפוס סיסמה</a></p>
<p>אם לא ביקשת איפוס סיסמה, אפשר להתעלם מההודעה.</p>
`;
	} catch (e) {
		console.error("CustomMessage error:", e);
	}

	return event;
};