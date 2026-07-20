# Sandbox Agent Runtime And Application Promotion Workflow

## End-To-End Flow

```text
ready Sandbox
  -> create Sandbox Agent Runtime
  -> submit Sandbox Agent Run
  -> execute admitted harness work
     -> optional waiting-approval -> external resolve -> resume/reject
  -> terminal Run + development preview
  -> freeze Source Artifact
  -> materialize exact Promotion Candidate Preview
  -> plan Sandbox Promotion
  -> external accept
  -> create new Resource + zip-artifact source binding
  -> create first Deployment attempt
  -> read Deployment proof
     -> verified: completed
     -> weak/missing: needs-attention
     -> deployment/provider failure: failed
```

## Lifecycle Rules

- Runtime: `requested -> starting -> ready -> terminating -> terminated | failed`.
- Run: `accepted -> running -> waiting-approval -> running -> completed | failed | cancelled`.
- Source Artifact: immutable `available`, then reference-protected or retention-eligible `deleted`.
- Candidate Preview: `materializing -> ready | failed -> expired | revoked`.
- Promotion: `planned -> accepted -> creating-resource -> deploying -> verifying -> completed |
  needs-attention | failed | superseded | expired`.

Only the documented transitions are valid. Sandbox pause prevents new Runs; Sandbox termination
terminates Runtime/Run access but retains sanitized lifecycle and independent artifact/Promotion facts.

## Approval And Supersede

An approval binds approval id, Run id, tool-call digest, capability, destination, requested scope and
expiry. Replayed or modified requests require a new approval. Promotion acceptance is a separate
publish authority and never follows from a Run capability approval.

A Promotion plan is superseded when its source workspace revision changes or the target
precondition no longer holds. The frozen Source Artifact remains immutable; a new plan may reuse it
only when the user intends to approve that same digest.

## Failure Recovery

- Harness/process failure terminates only the Run; a retry is a new Run referencing the previous Run.
- Artifact store/candidate failure leaves the Sandbox and Run unchanged.
- Resource creation failure leaves accepted Promotion intent retryable.
- Deployment failure retains Resource/artifact/attempt. Retry creates a new Deployment attempt.
- `needs-attention` returns the proof gaps and next action; it is not rewritten to success.

## Cleanup

- Sandbox TTL remains authoritative and is not changed by Promotion.
- Runtime/active Run terminate with Sandbox.
- Expired plan removes its candidate preview by exact id.
- Unaccepted, unreferenced artifacts may be pruned after retention.
- Accepted artifacts remain protected while referenced by Resource/deployment history.
- Resource deletion is always an explicit Resource lifecycle operation.
