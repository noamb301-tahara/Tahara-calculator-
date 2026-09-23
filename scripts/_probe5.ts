import { DemoDataReplacer, detectSensitive } from "@studio/demo-data";
const r = new DemoDataReplacer(["Revenue"]);
console.log(detectSensitive("$17,428"), r.scrub("$17,428"), r.scrub("Welcome back, John"), r.scrub("John Smith"), r.scrub("john.smith@acme.com"));
