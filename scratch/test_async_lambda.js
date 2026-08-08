import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const lambda = new LambdaClient({ region: "il-central-1" });

async function testAsyncSelfInvocation() {
  const userId = "test_async_user_" + Date.now();
  console.log(`Sending async self invocation test for userId: ${userId}...`);

  const asyncPayload = {
    action: "bgGeneratePlan",
    userId,
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

  const command = new InvokeCommand({
    FunctionName: "FitMentorDashboard",
    InvocationType: "Event", // Asynchronous execution!
    Payload: Buffer.from(JSON.stringify({ body: JSON.stringify(asyncPayload) }))
  });

  const res = await lambda.send(command);
  console.log(`Async invoke status code: ${res.StatusCode}`); // 202 = Accepted!

  console.log("Polling getPlan via API Gateway for up to 90s...");
  const pollStart = Date.now();
  let planHtml = null;

  while (Date.now() - pollStart < 90000) {
    await new Promise(r => setTimeout(r, 5000));
    const elapsed = Math.round((Date.now() - pollStart) / 1000);
    try {
      const getRes = await fetch("https://8wc1g61715.execute-api.il-central-1.amazonaws.com/prod/Dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getPlan", userId })
      });
      const data = await getRes.json();
      if (data?.plan?.planHtml) {
        planHtml = data.plan.planHtml;
        console.log(`SUCCESS! Plan retrieved from DynamoDB in ${elapsed}s!`);
        break;
      }
      console.log(`Waiting... (${elapsed}s)`);
    } catch (e) {}
  }

  if (planHtml) {
    const h3Count = (planHtml.match(/<h3[^>]*>[\s\S]*?<\/h3>/gi) || []).length;
    console.log(`TOTAL DAYS (<h3...>): ${h3Count}`);
    const weightsCount = (planHtml.match(/משקל מומלץ/gi) || []).length;
    console.log(`EXERCISES WITH WEIGHTS: ${weightsCount}`);
    const techCount = (planHtml.match(/איך מבצעים|טכניקה/gi) || []).length;
    console.log(`EXERCISES WITH TECHNIQUE: ${techCount}`);
    const progCount = (planHtml.match(/התקדמות|עומס/gi) || []).length;
    console.log(`EXERCISES WITH PROGRESSION: ${progCount}`);
    console.log(`HTML Length: ${planHtml.length} chars`);
  } else {
    console.log("FAILED to fetch plan from DynamoDB.");
  }
}

testAsyncSelfInvocation();
