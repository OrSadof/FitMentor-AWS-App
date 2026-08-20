export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
  }
}
function normalizeGroups(rawGroups) {
  if (Array.isArray(rawGroups)) return rawGroups.map(String);
  if (typeof rawGroups !== "string") return [];
  const trimmed = rawGroups.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {}
  }
  return trimmed.split(",").map((group) => group.trim()).filter(Boolean);
}

export function getAuthenticatedIdentity(event) {
  const claims = event?.requestContext?.authorizer?.claims || event?.requestContext?.authorizer?.jwt?.claims;
  if (!claims || typeof claims !== "object") throw new HttpError(401, "Authentication required");
  const userId = String(claims.email || claims["cognito:username"] || claims.username || claims.sub || "").toLowerCase().trim();
  if (!userId) throw new HttpError(401, "Authenticated identity is missing a user identifier");
  const groups = normalizeGroups(claims["cognito:groups"]);
  return {
    userId,
    name: String(claims.name || claims.given_name || userId).trim().slice(0, 80),
    groups,
    isAdmin: groups.includes("Admins"),
  };
}

export function requireAdmin(identity) {
  if (!identity?.isAdmin) throw new HttpError(403, "Administrator permission required");
}

export function requireRegularUser(identity) {
  if (identity?.isAdmin) throw new HttpError(403, "Administrator accounts may only use administrator endpoints");
}

export function errorResponse(error, headers) {
  const statusCode = Number(error?.statusCode) || 500;
  const message = statusCode >= 500 ? "Internal Server Error" : String(error?.message || "Request failed");
  if (statusCode >= 500) console.error("[UNHANDLED_API_ERROR]", error);
  return { statusCode, headers, body: JSON.stringify({ message }) };
}
