import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.TABLE_NAME || "FitMentorData";
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const METRICS_USER_ID = "__METRICS__";
const METRICS_TOTAL_KEY = "TOTAL";

async function incrementMetric(field, by = 1) {
  const safeBy = Number(by) || 0;
  if (!field || safeBy === 0) return;
  try {
    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { UserID: METRICS_USER_ID, DataType: METRICS_TOTAL_KEY },
      UpdateExpression: "SET #f = if_not_exists(#f, :zero) + :inc, updatedAt = :now",
      ExpressionAttributeNames: { "#f": String(field) },
      ExpressionAttributeValues: { ":zero": 0, ":inc": safeBy, ":now": new Date().toISOString() }
    }));
  } catch (e) {
    console.error("Increment metric error:", e);
  }
}

export const handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
  };

  try {
    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

    let body = event.body ? (typeof event.body === 'string' ? JSON.parse(event.body) : event.body) : event;
    if (!body || (!body.action && !body.userId)) {
      throw new Error("Invalid request body structure");
    }
    const { action, userId, payload } = body;

    if (!action || !userId) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: "Missing fields" }) };
    }

    const normalizedUserId = userId.toLowerCase().trim();
    let result = {};

    switch (action) {
      case "saveWorkoutLog":
        if (!payload.date || !payload.log) throw new Error("Missing date or log data");
        await saveToDb(normalizedUserId, `TrainingLog_${payload.date}`, payload.log);
        try { await incrementMetric("workoutsSavedTotal", 1); } catch {}
        result = { message: "TrainingLog saved" };
        break;

      case "getWorkoutLog":
        if (!payload.date) throw new Error("Missing date");
        const logData = await getFromDb(normalizedUserId, `TrainingLog_${payload.date}`);
        result = { log: logData };
        break;

      case "deleteWorkoutLog":
        if (!payload.date) throw new Error("Missing date");
        await deleteFromDb(normalizedUserId, `TrainingLog_${payload.date}`);
        result = { message: "TrainingLog deleted" };
        break;

      default:
        return { statusCode: 400, headers, body: JSON.stringify({ message: `Invalid action: ${action}` }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (error) {
    console.error("Handler Error:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ message: error.message || "Internal Server Error" }) };
  }
};

async function saveToDb(userId, dataType, data) {
  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: { UserID: userId, DataType: dataType, ...data } }));
}
async function getFromDb(userId, dataType) {
  return (await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { UserID: userId, DataType: dataType } }))).Item;
}
async function deleteFromDb(userId, dataType) {
  await docClient.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { UserID: userId, DataType: dataType } }));
}
