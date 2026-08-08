const API_BASE_URL = "https://8wc1g61715.execute-api.il-central-1.amazonaws.com/prod/Dashboard";

async function verifySavedPlan() {
  const userId = "test_user_6days_full_1786211855326";
  console.log(`Fetching saved plan for userId: ${userId}...`);
  const res = await fetch(API_BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "getPlan", userId })
  });
  const data = await res.json();
  const planHtml = data?.plan?.planHtml;

  if (planHtml) {
    console.log(`✅ FOUND PLAN IN DYNAMODB! Total length: ${planHtml.length} chars`);
    const dayHeadings = planHtml.match(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi) || [];
    console.log("\nALL HEADINGS FOUND IN HTML:");
    dayHeadings.forEach((h, i) => console.log(` Heading ${i + 1}: ${h.replace(/<[^>]*>/g, '').trim()}`));

    console.log('\nWEIGHTS BY EXERCISE ("משקל מומלץ"):');
    const weightLines = planHtml.match(/<p>[^<]*משקל מומלץ[\s\S]*?<\/p>/gi) || [];
    weightLines.forEach((wl, idx) => console.log(` ${idx + 1}: ${wl.replace(/<[^>]*>/g, '').trim()}`));
  } else {
    console.log("No plan found in DB.");
  }
}

verifySavedPlan();
