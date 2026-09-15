# Security

Report vulnerabilities through this repository's private security advisory form. Do not include credentials or private prompts in public issues.

## Boundaries

The public code is reusable. The Smithey Lab production tool is restricted to one pinned owner subject. The host must verify API Gateway JWT claims, the access token with Cognito GetUser, client ID, token type, token age, account status, and revocation state **before** calling `createStudio`. An owner role in a request body is never trusted. Cognito must require authenticator MFA and invitation-only accounts.

The browser receives no provider key. A retained Secrets Manager secret starts without a value. Lambda has read/describe access only to that secret. There is no browser key-writing endpoint, arbitrary provider URL, model override, code execution, remote browsing, or automatic retry.

One DynamoDB transaction checks the current user and enabled-policy revisions, reserves daily/monthly/lifetime allowance, rejects replayed request IDs, and acquires a one-minute global lease. Reservations are not refunded. Replay records and budget counters deliberately have no TTL; quotas must not reset through asynchronous deletion or account quota resets. Requests admitted before pausing may finish. Failures remain charged to the internal allowance even when the provider did not bill.

Input is limited to 16,000 UTF-8 bytes plus a fixed system prompt, output to 4,096 tokens, response body to 256 KB, and provider time to 20 seconds. A network abort does not guarantee provider cancellation. Responses render through textContent and never execute as HTML or code. The host must serve a restrictive CSP and HTTPS.

## Limits of the protection

The internal dollar allowance is a conservative reservation, not a guaranteed provider invoice cap. Provider prices and tokenization can change. Recheck pricing before enabling or raising limits; use a dedicated key and a small provider balance. The provider receives submitted prompts and applies its own retention policy. AWS hosting, authentication, Secrets Manager, and rejected traffic costs are separate from provider limits. Existing login tokens use the host's browser storage; a compromised owner device, same-origin XSS, AWS administrator, or stolen provider key can bypass some protections. Rotate/revoke credentials at the respective service if compromised.

The frontend has no persistent draft or response storage. Exported files contain the user's prompt/code or response and are intentionally plaintext on their device. There are no application logs of prompts, responses, or keys.

## Emergency stop

Use Pause API in the authenticated Coding Studio. To recover without the browser, set the `SETTINGS` / `studio` record's `enabled` to false and increment `revision` in the member table. Revoke the dedicated key at DeepSeek if compromise is suspected. Do not rely on deleting a CloudFormation stack: the secret and member table are retained.
