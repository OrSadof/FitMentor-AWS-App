import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const client = new LambdaClient({ region: "il-central-1" });

async function run() {
  const payload = {
    action: "generatePlan",
    userId: "test_user_6days",
    payload: {
      age: 25,
      gender: "male",
      weight: 75,
      height: 175,
      fitnessLevel: "beginner",
      goal: "חיטוב וירידה במשקל",
      days: 6,
      equipment: "gym"
    }
  };

  console.log("Invoking FitMentorDashboard with 6 days payload...");
  const startTime = Date.now();
  const command = new InvokeCommand({
    FunctionName: "FitMentorDashboard",
    Payload: Buffer.from(JSON.stringify(payload))
  });

  try {
    const res = await client.send(command);
    const resultStr = Buffer.from(res.Payload).toString("utf-8");
    console.log(`Execution completed in ${(Date.now() - startTime) / 1000}s`);
    const json = JSON.parse(resultStr);
    const body = typeof json.body === 'string' ? JSON.parse(json.body) : json;
    console.log("Response status:", json.statusCode);
    if (body?.plan?.planHtml) {
      console.log("Plan HTML preview (first 500 chars):");
      console.log(body.plan.planHtml.slice(0, 500));
      const h3Count = (body.plan.planHtml.match(/<h3[^>]*>[\s\S]*?<\/h3>/gi) || []).length;
      console.log(`TOTAL DAYS (h3 count): ${h3Count}`);
      const weightMatches = (body.plan.planHtml.match(/משקל מומלץ/gi) || []).length;
      console.log(`TOTAL EXERCISES WITH RECOMMENDED WEIGHTS: ${weightMatches}`);
      const techMatches = (body.plan.planHtml.match(/איך מבצעים|טכניקה/gi) || []).length;
      console.log(`TOTAL EXERCISES WITH TECHNIQUE: ${techMatches}`);
      const progMatches = (body.plan.planHtml.match(/התקדמות|עומס/gi) || []).length;
      console.log(`TOTAL EXERCISES WITH PROGRESSION: ${progMatches}`);
    } else {
      console.log("Full Response Body:", body);
    }
  } catch (err) {
    console.error("Invoke error:", err);
  }
}

run();
