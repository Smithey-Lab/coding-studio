// Extend an existing Cognito-authenticated Smithey Lab member stack.
export function extendStudio(t) {
  t.Parameters.StudioOwnerSub = {
    Type: "String",
    AllowedPattern: "[0-9a-f-]{36}",
    Description: "Immutable Cognito subject of the only Coding Studio user.",
  };
  t.Resources.StudioSecret = {
    Type: "AWS::SecretsManager::Secret",
    DeletionPolicy: "Retain",
    UpdateReplacePolicy: "Retain",
    Properties: {
      Description:
        "Coding Studio DeepSeek key. Add JSON apiKey manually after deployment; no initial value.",
    },
  };
  const variables = t.Resources.Function.Properties.Environment.Variables;
  variables.STUDIO_OWNER_SUB = { Ref: "StudioOwnerSub" };
  variables.STUDIO_SECRET_ARN = { Ref: "StudioSecret" };
  t.Resources.Role.Properties.Policies[0].PolicyDocument.Statement.push({
    Effect: "Allow",
    Action: ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
    Resource: { Ref: "StudioSecret" },
  });
  t.Outputs.StudioSecretArn = { Value: { Ref: "StudioSecret" } };
  return t;
}
