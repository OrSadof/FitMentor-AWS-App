const API_BASE_URL = "https://8wc1g61715.execute-api.il-central-1.amazonaws.com/prod/Dashboard";

async function test6DaysPlan() {
  console.log("Sending generatePlan request for 6 days to AWS API Gateway...");
  const startTime = Date.now();
  try {
    const res = await fetch(API_BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "generatePlan",
        userId: "test_user_6days_live",
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
    });

    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`API Response Status: ${res.status} (took ${elapsed}s)`);
    const data = await res.json();
    console.log("Full Data Keys:", Object.keys(data));
    const planHtml = data?.plan?.planHtml || data?.body?.plan?.planHtml;

    if (planHtml) {
      const h3Matches = planHtml.match(/<h3[^>]*>[\s\S]*?<\/h3>/gi) || [];
      console.log(`\nSUCCESS! Generated Plan HTML length: ${planHtml.length} chars`);
      console.log(`NUMBER OF DAYS GENERATED (<h3...>): ${h3Matches.length}`);
      console.log("Day titles:");
      h3Matches.forEach((h, i) => console.log(`  Day ${i + 1}: ${h.replace(/<[^>]*>/g, '').trim()}`));

      const setWeightMatches = (planHtml.match(/משקל מומלץ/gi) || []).length;
      console.log(`EXERCISES WITH PER-SET WEIGHTS ("משקל מומלץ"): ${setWeightMatches}`);
    } else {
      console.log("No planHtml returned. Response:", JSON.stringify(data).slice(0, 1000));
    }
  } catch (err) {
    console.error("Fetch Error:", err);
  }
}

test6DaysPlan();
