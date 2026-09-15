# Operating cost, excluding DeepSeek

Planning estimate for the Smithey Lab deployment in us-east-1, checked September 15, 2026: **approximately $0.50–$1 per month in incremental AWS charges** under ordinary owner-only usage. This is not a measured invoice or a hard infrastructure spending cap. Existing website costs, domain registration, taxes, unusual traffic and DeepSeek usage are excluded.

The feature reuses the site's Cognito login, HTTP API, 256 MB Lambda, DynamoDB table, S3 bucket, and CloudFront distribution. It adds one Secrets Manager secret and a small amount of code/storage; there is no dedicated always-on server, load balancer, NAT gateway or database instance.

| Component                                                                   | Example monthly cost before credits |
| --------------------------------------------------------------------------- | ----------------------------------: |
| One Secrets Manager secret                                                  |                               $0.40 |
| 100 generations, each consuming the full 29-second Lambda timeout at 256 MB |                            $0.01208 |
| 1,000 Secrets Manager API calls                                             |                              $0.005 |
| 1,000 HTTP API calls                                                        |                              $0.001 |
| 1,000 Lambda request fees                                                   |                             $0.0002 |
| Example subtotal                                                            |                            $0.41828 |

The subtotal excludes extra compute for status/authentication calls and small usage-based amounts for DynamoDB reads/transactions/storage/backups, S3 storage/requests, CloudFront transfer/requests, and logs. The $0.50–$1 planning range allows headroom for ordinary personal use, but is not a calculated maximum. Assumes up to 100 model requests per month, roughly 1,000 associated backend/status requests, small quota records, and light page viewing. Free-tier allowances or account credits may lower charges; they are not assumed in the calculation. The existing owner already uses the shared Cognito pool, so this feature does not add a separate active user or identity subscription.

GitHub source hosting and the standard Linux Actions jobs in this public repository do not require an additional paid plan. Development or coding-assistant subscriptions are separate from hosting this tool.

## Sources and arithmetic

- [AWS Secrets Manager pricing](https://aws.amazon.com/secrets-manager/pricing/): $0.40/secret/month and $0.05/10,000 API calls.
- [AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/): x86 on-demand first-tier compute at $0.0000166667/GB-second and $0.20/million requests.
- [Amazon API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/): HTTP API first-tier requests at $1/million in the example US regions.
- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions): standard hosted runners for public repositories.

Lambda example: `100 × 29 × (256 / 1024) × 0.0000166667 = $0.0120833575`.

No precise Coding Studio-only invoice is available from the shared Lambda/API/table charges. A total for the entire member stack would include other tools and should not be presented as this feature's cost. Request allowances constrain admitted DeepSeek calls; they do not cap unauthenticated traffic, status requests, website traffic, deployments, or other AWS services.
