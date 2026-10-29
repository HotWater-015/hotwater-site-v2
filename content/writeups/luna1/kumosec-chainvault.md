---
title: "KumoSec ChainVault"
description: "Luna CTF hosted an EVM playground (\"KumoSec ChainVault\") behind a team-token API at http://103.49.131.90 with a JSON-RPC node at /chain/rpc. Two contracts exist: an AuditorRegistry…"
event: "luna1"
category: "web"
categoryLabel: "Web"
tags: ["Luna CTF 2026","web"]
date: "2026-10-22"
teammate: false
source: "luna1/web/1/writeup.md"
---

## Summary

Luna CTF hosted an EVM playground ("KumoSec ChainVault") behind a team-token API at `http://103.49.131.90` with a JSON-RPC node at `/chain/rpc`. Two contracts exist: an `AuditorRegistry` access-gate and a `ChainVault` holding bounty ETH. The intended-looking chain — become an auditor, then drain the vault — is broken both by careless ownership (a well-known ganache-cli dev key) and by a checks-effects-interactions bug in `settleClaim()` that lets unregistered payouts repeat.

## Files

- `.chain.py` — the complete standalone solver (pure stdlib: pure-python Keccak, RLP, secp256k1, EIP-155 signing).
- `drain.py`, `check.py`, `reg_author.py` — recon helpers: vault info, wallet, `owner()`, chain ID probes.
- `solve.py`, `solve1.py` — hand-rolled JSON-RPC transactions built with `eth_sendTransaction`.

## Analysis

### API surface

`drain.py` shows the team-token endpoints, all authenticated by an `X-CTF-Team-Token` header (`LNR-D0903CBFD6` in the scripts):

- `/api/v1/vault/info` — returns the deployed `chain_vault` and `auditor_registry` addresses.
- `/api/v1/vault/wallet` — a funded EOA with its private key.
- `/api/v1/vault/flag` — 400 until the vault's `isSolved()` flag flips.

### Escalating to auditor

The registry's payout-altering calls (`registerAuditor(address)`, selector `0xa22cb465`) are owner-only, and the registry owner turns out to be the deployer EOA `0x90F8bf6...c9C1`. `.chain.py` matches that address against the standard ganache-cli deterministic key list; on a hit it just signs `registerAuditor` from the owner account and adds our wallet. A fallback path brute-forces the unauthenticated `migrateLegacyAuditor(address,bytes32)` against a dictionary of guessable `legacyMigrationTokens` seeds (`keccak` of "MIGRATION", "LEGACY_TOKEN", small integers, and similar phrases), verified first with an `eth_call` to `legacyMigrationTokens(bytes32)`.

### Draining the vault

Per `.chain.py`'s vulnerability notes and `solve1.py`:

1. `ChainVault` has no owner withdrawal; the only payout is `settleClaim()` (selector `0x6e8e8181`), which pays `pendingClaims[msg.sender]` and zeroes the mapping **after** the ETH transfer — a CEI violation and classic reentrancy sink.
2. `pendingClaims` is capped at 1 ETH per finding, but nothing stops submitting a finding and settling once per bounty: enumerate `getBountyCount()` and `getBountyIdAt(uint256)`, decode the `bounties(bytes32)` struct (client at word 1, amount at word 2, settled flag at word 3), then call `submitAuditFinding(bytes32,string)` followed by `settleClaim()` for every unset bounty.
3. The script repeats sweep passes because a bounty larger than 1 ETH can only be fully drained via reentrancy.
4. Draining drops `address(this).balance` to `emergencyThreshold` (0), which makes `_checkEmergencyCondition()` set `isSolved = true`, the condition `/api/v1/vault/flag` checks.

`check.py` and `reg_author.py` are the recon stubs that established the owner's identity and chain ID (`eth_chainId`) before the full chain was scripted.

## Exploit

The transaction primitives (`solve.py`/`solve1.py`) abuse the node's unlocked `eth_sendTransaction` with explicit gas 300,000 (`0x493E0`), whereas the final solver `.chain.py` signs raw EIP-155 transactions itself — worth noting because the playground later may refuse `eth_sendTransaction`. It waits on `eth_getTransactionReceipt` and aborts on reverted status before continuing the chain.

## Flag

Flag: not recovered in the writeup. The scripts stop at the flag endpoint query (`drain.py`); no returned flag string appears in any file.
