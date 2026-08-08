const API_BASE_URL = "https://8wc1g61715.execute-api.il-central-1.amazonaws.com/prod/Dashboard";

async function inspectHtml() {
  const userId = "test_user_6days_full_1786211855326";
  const res = await fetch(API_BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "getPlan", userId })
  });
  const data = await res.json();
  const planHtml = data?.plan?.planHtml;
  if (planHtml) {
    console.log("=== RAW PLAN HTML PREVIEW (first 3000 chars) ===");
    console.log(planHtml.slice(0, 3000));
  }
}

inspectHtml();
