# Server Enrollment Task Flow Test Matrix

| ID | Layer | Scenario | Expected evidence | Status |
| --- | --- | --- | --- | --- |
| SERVER-ENROLL-001 | CLI/unit | Parse local or SSH target | Exactly one form passes; unsafe scheme/password/path/query/fragment fails before commands. | planned |
| SERVER-ENROLL-002 | CLI/unit | Register valid target | One existing register command dispatches and safe Server-id checkpoint prints before later effects. | planned |
| SERVER-ENROLL-003 | CLI/unit | Attach SSH credential | Stored id, local file or local agent maps to one existing credential command without secret output. | planned |
| SERVER-ENROLL-004 | CLI/unit | Enroll local machine | `local-shell`/`localhost` registers; SSH credential dispatch is skipped. | planned |
| SERVER-ENROLL-005 | CLI/unit | Diagnose registered target | One existing connectivity command dispatches after registration/credential. | planned |
| SERVER-ENROLL-006 | CLI/unit | Prepare runtime | Existing prepare command runs once; `failed` status produces non-zero completion. | planned |
| SERVER-ENROLL-007 | CLI/unit | Complete enrollment | Existing show query supplies credential/proxy/runtime readback and completed stages. | planned |
| SERVER-ENROLL-008 | CLI/unit | Later step fails | Original stable error survives, registered Server is not deleted, and checkpoint exposes recovery id. | planned |
| SERVER-ENROLL-009 | architecture/contract | Inspect implementation dispatch | No repository, new message, event, API, persistence or Cloud dependency exists. | planned |
| SERVER-ENROLL-010 | CLI/regression | Run granular Server commands | Existing parsing, messages and output remain unchanged. | planned |
| SERVER-ENROLL-011 | docs/contract | Resolve Server enrollment help | Both locales document syntax, readiness and granular recovery. | planned |
