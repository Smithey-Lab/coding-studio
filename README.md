# Coding Studio · Smithey Lab

An owner-only DeepSeek chat workspace: multi-turn conversations, a message composer, coding starters, copyable code blocks, Markdown export, response controls, allowance display, and emergency pause. This is a lightweight custom chat interface, not an installation of OpenCode.

**Production:** [Smithey Lab Coding Studio](https://smitheylab.com/app/coding-studio/) requires the site owner's login and authenticator MFA. Public source does not grant access to the production API. This repository contains the reusable feature module; the existing Smithey Lab host supplies authentication, navigation, and AWS deployment.

## Develop

Use Node.js 24 or newer.

```sh
npm ci
npm run check
npx playwright-core install chromium
npm run test:ui
```

`npm run build` creates `dist/` browser assets. The UI tests use a local test harness and mocked provider transport; they never spend DeepSeek credits. Set `BROWSER_PATH` to use an existing Chromium browser. No API key is required for development or CI.

## Integrate with a host

1. Serve `web/` at `/coding-studio/`, load `studio.css`, and call `mountStudio({root, api, notify})` after authentication. `api(action, payload)` must use the host's authenticated POST transport. Keep the route outside public navigation.
2. Route the `studio` action to `createStudio({db, env})(input, verifiedUser)` only after verifying the access token, client, active account, token revocation, and origin. See [SECURITY.md](SECURITY.md) for the required contract. An API Gateway JWT authorizer alone does not check a revoked Cognito session.
3. Call `extendStudio(template)` on a member-stack template with `Function`, `Role`, member DynamoDB table, and Cognito-authenticated route resources. Set `StudioOwnerSub` to the verified owner's immutable Cognito subject. The extension adds a retained empty secret and narrowly scoped secret-read permissions. It never creates a key value.
4. Bundle `backend/studio.mjs` with the host Lambda, using Node.js 24 and AWS SDK v3. Supply `MEMBER_TABLE`, `STUDIO_OWNER_SUB`, and `STUDIO_SECRET_ARN`. Use a 29-second Lambda timeout and 30-second API integration; provider calls abort at 20 seconds and are never retried.
5. Initialize member-table item `{pk: "SETTINGS", sk: "studio", enabled: true, revision: 1}` conditionally only if absent. Requests still fail closed until a valid secret exists. Existing pause state must survive redeployment.
6. Deploy and verify anonymous, non-owner, suspended, and revoked sessions cannot invoke the feature. Do not test a paid provider request until the owner supplies their dedicated key.

The module expects a DynamoDB table with string keys `pk` and `sk`. Lambda requires GetItem, PutItem, UpdateItem and ConditionCheckItem on that table and DescribeSecret/GetSecretValue on its single secret. The host owns HTTPS, CSP, CORS, API throttling, MFA, logs retention, billing alerts, and its deployment rollback procedure.

## Final step: enter your key

The initial production policy is enabled but the secret has **no value**, so all provider calls are blocked. Find the `StudioSecretArn` output in the `smithey-lab-members` CloudFormation stack. Open that secret in AWS Secrets Manager, choose to store/edit the secret value, and add one key/value pair: `apiKey` = your dedicated DeepSeek API key. Never paste it into GitHub, a frontend file, or an issue. Refresh Coding Studio status after saving. No redeploy is needed.

For a previously paused workspace, use `node scripts/set-enabled.mjs --stack STACK --enable` from a trusted AWS-authenticated terminal after reviewing current provider pricing. `--pause` disables it. Neither command reads the provider key or resets budgets.

## Cost policy

| Control                    | Initial limit                                    |
| -------------------------- | ------------------------------------------------ |
| Model                      | `deepseek-flash`, thinking disabled              |
| Prompt                     | 16,000 UTF-8 bytes plus fixed system instruction |
| Output                     | 512, 1,024, 2,048, or 4,096 tokens               |
| Cooldown                   | One admitted request per 60 seconds globally     |
| Reservation                | $0.05 per attempt, never refunded                |
| Daily / monthly / lifetime | $1 / $5 / $20 reserved allowance                 |
| Attempts                   | 20/day, 100/month, 400 lifetime                  |

These are conservative **internal reservations**, not actual invoices. At the [DeepSeek prices checked September 15, 2026](https://api-docs.deepseek.com/quick_start/pricing/), Flash peak rates are $0.30 per million input tokens and $1.20 per million output tokens. The reservation provides margin over bounded requests; provider rates can change. AWS charges and direct use of the key elsewhere are outside this allowance. Daily/monthly periods are UTC. Raising limits requires reviewed backend code changes; pausing or account quota resets never clears these counters.

## GitHub workflow

- `dev` is the integration branch; release to `main` through a pull request.
- Both branches require up-to-date `quality` and `CodeQL` checks, resolved conversations, linear history, and no force pushes or deletions; admins are included.
- This is a solo-owner project: PRs are required but a second-person approval is not. Add a trusted reviewer before increasing the required approval count.
- CI runs ESLint, security tests, build, dependency audit, UI tests and CodeQL. Actions are pinned to commit hashes; workflow tokens default to read-only.
- Dependabot targets `dev`. Secret scanning, push protection, dependency alerts, and private vulnerability reports are enabled on GitHub.
- CI uploads reviewed browser assets. Production host deployment is separate and manual; GitHub receives no AWS or DeepSeek credentials.

## Privacy and limitations

Prompts and results are kept only in page memory until navigation/reload/new chat, except files explicitly exported by the user. Each submission sends the conversation so far plus the new message to DeepSeek. The complete input is limited to 16,000 UTF-8 bytes and 21 alternating messages; the UI asks you to start a new chat when that limit is reached. Context is never silently dropped. Generated code is never executed. This is a request/response assistant, not an autonomous agent with repository or terminal access. A 20-second timeout can interrupt a long-running provider request; failed or ambiguous attempts remain reserved. Live provider behavior must be verified after key setup.
