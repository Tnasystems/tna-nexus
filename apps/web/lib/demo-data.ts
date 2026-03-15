export const overviewMetrics = [
  { label: "Open Jobs", value: "128", trend: "+8%" },
  { label: "Field Staff", value: "42", trend: "+3" },
  { label: "Forms Today", value: "311", trend: "+22%" },
  { label: "Compliance Due", value: "9", trend: "-4" }
];

export const jobs = [
  { title: "Boiler room service inspection", site: "Manchester Plant", status: "In progress", tech: "A. Reeves" },
  { title: "Emergency lighting audit", site: "Leeds Depot", status: "Scheduled", tech: "S. Patel" },
  { title: "Warehouse shutter repair", site: "Bristol Yard", status: "Awaiting parts", tech: "C. Moore" }
];

export const staff = [
  { name: "Amy Reeves", role: "Supervisor", state: "On site" },
  { name: "Sanjay Patel", role: "Field Tech", state: "Travelling" },
  { name: "Chris Moore", role: "Field Tech", state: "Clocked out" }
];

export const forms = [
  { name: "Daily Safety Inspection", version: "v1", usage: "86 submissions" },
  { name: "Vehicle Defect Report", version: "v3", usage: "14 submissions" },
  { name: "Completion Sign-off", version: "v2", usage: "29 submissions" }
];

export const documents = [
  { name: "Permit Pack - Manchester Plant", type: "Permit", status: "Ready for crew" },
  { name: "Emergency Lighting Audit", type: "Inspection", status: "Awaiting signature" },
  { name: "Service Completion Pack", type: "Handover", status: "Issued" }
];

export const compliance = [
  { title: "Fleet checks due this week", status: "3 due", priority: "High" },
  { title: "Missing RAMS sign-offs", status: "2 open", priority: "Medium" },
  { title: "Training renewals", status: "6 upcoming", priority: "Planned" }
];

export const notifications = [
  { title: "Stock delay for Leeds depot", channel: "Ops", time: "14 min ago" },
  { title: "Boiler room inspection completed", channel: "Field", time: "32 min ago" },
  { title: "New compliance reminder batch sent", channel: "Automation", time: "1 hr ago" }
];
