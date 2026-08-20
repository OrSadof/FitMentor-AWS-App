import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { errorResponse, getAuthenticatedIdentity, HttpError } from "./auth.mjs";

const TABLE_NAME = process.env.TABLE_NAME || "FitMentorData";
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export const handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
  };

  try {
    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

    const identity = getAuthenticatedIdentity(event);
    const body = event?.body ? (typeof event.body === "string" ? JSON.parse(event.body) : event.body) : {};
    const { action, payload = {} } = body || {};
    if (!action) throw new HttpError(400, "Missing action");

    const normalizedUserId = identity.userId;
    let result = {};

    switch (action) {
      case "saveWorkoutLog":
        validateWorkoutDate(payload.date);
        await saveToDb(normalizedUserId, `TrainingLog_${payload.date}`, validateWorkoutLog(payload.log));
        result = { message: "TrainingLog saved" };
        break;

      case "getWorkoutLog":
        validateWorkoutDate(payload.date, { allowFuture: true });
        const logData = await getFromDb(normalizedUserId, `TrainingLog_${payload.date}`);
        result = { log: stripDatabaseKeys(logData) };
        break;

      case "deleteWorkoutLog":
        validateWorkoutDate(payload.date, { allowFuture: true });
        await deleteFromDb(normalizedUserId, `TrainingLog_${payload.date}`);
        result = { message: "TrainingLog deleted" };
        break;

      default:
        return { statusCode: 400, headers, body: JSON.stringify({ message: `Invalid action: ${action}` }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (error) {
    return errorResponse(error, headers);
  }
};

function validateWorkoutDate(value, { allowFuture = false } = {}) {
  const date = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, "Invalid workout date");
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new HttpError(400, "Invalid workout date");
  }
  if (!allowFuture) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const today = `${values.year}-${values.month}-${values.day}`;
    if (date > today) throw new HttpError(400, "Future workout dates are not allowed");
  }
}

function validateWorkoutLog(log) {
  if (!log || typeof log !== "object" || Array.isArray(log)) throw new HttpError(400, "Invalid workout log");
  const bodyWeightKg = Number(log.bodyWeightKg);
  if (!Number.isFinite(bodyWeightKg) || bodyWeightKg < 20 || bodyWeightKg > 400) {
    throw new HttpError(400, "Body weight must be between 20 and 400 kg");
  }
  const notes = String(log.notes || "").trim();
  if (notes.length > 2000) throw new HttpError(400, "Workout notes are too long");
  if (!Array.isArray(log.exercises) || log.exercises.length === 0 || log.exercises.length > 50) {
    throw new HttpError(400, "A workout must contain between 1 and 50 exercises");
  }

  const exercises = log.exercises.map((exercise) => {
    const name = String(exercise?.name || "").trim();
    if (!name || name.length > 120) throw new HttpError(400, "Invalid exercise name");
    if (!Array.isArray(exercise.sets) || exercise.sets.length === 0 || exercise.sets.length > 20) {
      throw new HttpError(400, "Each exercise must contain between 1 and 20 sets");
    }
    const sets = exercise.sets.map((set) => {
      const weight = Number(set?.weight);
      const reps = Number(set?.reps);
      const setNotes = String(set?.notes || "").trim();
      if (!Number.isFinite(weight) || weight < 0 || weight > 1000) throw new HttpError(400, "Invalid set weight");
      if (!Number.isInteger(reps) || reps < 1 || reps > 1000) throw new HttpError(400, "Invalid repetition count");
      if (setNotes.length > 500) throw new HttpError(400, "Set notes are too long");
      return { weight, reps, notes: setNotes };
    });
    return { name, sets };
  });

  return { bodyWeightKg, notes, exercises, updatedAt: new Date().toISOString() };
}

function stripDatabaseKeys(item) {
  if (!item) return null;
  const { UserID: _userId, DataType: _dataType, ...log } = item;
  return log;
}

async function saveToDb(userId, dataType, data) {
  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: { UserID: userId, DataType: dataType, ...data } }));
}
async function getFromDb(userId, dataType) {
  return (await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { UserID: userId, DataType: dataType } }))).Item;
}
async function deleteFromDb(userId, dataType) {
  await docClient.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { UserID: userId, DataType: dataType } }));
}
