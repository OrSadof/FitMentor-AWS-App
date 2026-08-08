const API_BASE_URL = "https://8wc1g61715.execute-api.il-central-1.amazonaws.com/prod/Dashboard";

async function test6DaysFull() {
  const userId = "test_user_6days_full_" + Date.now();
  console.log(`1. Sending generatePlan for 6 days for userId: ${userId}...`);
  const start = Date.now();

  fetch(API_BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "generatePlan",
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
    })
  }).catch(() => {});

  console.log("2. Polling getPlan from DynamoDB every 5s for up to 90s...");
  let planHtml = null;
  const pollStart = Date.now();

  while (Date.now() - pollStart < 100000) {
    await new Promise(r => setTimeout(r, 5000));
    const elapsedSec = Math.round((Date.now() - start) / 1000);
    try {
      const res = await fetch(API_BASE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getPlan", userId })
      });
      const data = await res.json();
      if (data?.plan?.planHtml) {
        planHtml = data.plan.planHtml;
        console.log(`POLL SUCCESS after ${elapsedSec}s!`);
        break;
      }
      console.log(`Still waiting at ${elapsedSec}s...`);
    } catch (e) {}
  }

  if (planHtml) {
    const h3Count = (planHtml.match(/<h3[^>]*>[\s\S]*?<\/h3>/gi) || []).length;
    console.log(`\nTOTAL DAYS GENERATED (<h3...>): ${h3Count}`);
    const setWeightMatches = (planHtml.match(/משקל מומלץ/gi) || []).length;
    console.log(`EXERCISES WITH PER-SET WEIGHTS ("משקל מומלץ"): ${setWeightMatches}`);
    const techMatches = (planHtml.match(/איך מבצעים|טכניקה/gi) || []).length;
    console.log(`EXERCISES WITH TECHNIQUE CUES: ${techMatches}`);
    const progMatches = (planHtml.match(/התקדמות|עומס/gi) || []).length;
    console.log(`EXERCISES WITH PROGRESSION GUIDANCE: ${progMatches}`);
    console.log(`Total HTML Length: ${planHtml.length} chars`);
  } else {
    console.log("FAILED to obtain 6-day plan within 90s.");
  }
}

test6DaysFull();
