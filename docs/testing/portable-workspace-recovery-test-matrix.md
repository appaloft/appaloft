# Portable Workspace Recovery Test Matrix

| ID | Layer | Scenario | Expected evidence |
| --- | --- | --- | --- |
| PORT-REC-001 | Runtime adapter | Pause with shared recovery configured | Exact package exists, live allocation and local one-shot image do not. |
| PORT-REC-002 | Application/runtime | Resume through a second compatible provider | Same SandboxId and workspace bytes are ready on the target. |
| PORT-REC-003 | Application | Target recovery family differs | Typed portability conflict precedes target effects. |
| PORT-REC-004 | Runtime adapter | Package digest or ownership is invalid | Restore fails closed and source package remains. |
| PORT-REC-005 | Runtime adapter | Restore or terminate portable recovery | Exact package is removed; unrelated packages and root remain. |
| PORT-MOVE-001 | Provider | Placement observation runs | Only a boolean relocation requirement crosses the provider boundary. |
| PORT-MOVE-002 | Application | Ready portable Sandbox requires relocation | Maintenance reports migration after pause/resume under the same identity. |
| PORT-MOVE-003 | Application | Target restore fails | Sandbox remains paused and recovery can be retried. |
| PORT-MOVE-004 | Integration | Runtime capabilities predate relocation | Old capabilities fail and newly issued capabilities work. |
