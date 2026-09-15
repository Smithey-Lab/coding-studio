import { spawnSync } from "node:child_process";
const args = process.argv.slice(2),
  stack = args[args.indexOf("--stack") + 1];
if (
  !args.includes("--stack") ||
  !stack ||
  !/^[a-zA-Z0-9-]+$/.test(stack) ||
  args.includes("--enable") === args.includes("--pause")
)
  throw new Error(
    "Usage: node scripts/set-enabled.mjs --stack STACK --enable|--pause",
  );
function aws(args) {
  const r = spawnSync(
    "aws",
    [
      ...args,
      "--region",
      process.env.AWS_REGION || "us-east-1",
      "--output",
      "json",
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout || "{}");
}
const info = aws(["cloudformation", "describe-stacks", "--stack-name", stack])
  .Stacks[0];
const table = info.Outputs.find(
  (x) => x.OutputKey === "TableName",
)?.OutputValue;
if (!table) throw new Error("Member table output not found");
const key = { pk: { S: "SETTINGS" }, sk: { S: "studio" } };
const item = aws([
  "dynamodb",
  "get-item",
  "--table-name",
  table,
  "--key",
  JSON.stringify(key),
  "--consistent-read",
]).Item;
if (!item)
  throw new Error("Initialize the studio setting through deployment first.");
const revision = Number(item.revision?.N);
if (!Number.isSafeInteger(revision)) throw new Error("Invalid policy revision");
aws([
  "dynamodb",
  "put-item",
  "--table-name",
  table,
  "--item",
  JSON.stringify({
    ...key,
    enabled: { BOOL: args.includes("--enable") },
    revision: { N: String(revision + 1) },
  }),
  "--condition-expression",
  "revision = :rev",
  "--expression-attribute-values",
  JSON.stringify({ ":rev": { N: String(revision) } }),
]);
console.log(
  args.includes("--enable")
    ? "Enabled policy. Requests still require a valid key and available allowance."
    : "Paused. Already admitted requests may finish.",
);
