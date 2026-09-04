---
description: Use the extension's read-only echo service without exposing its credential.
---

# Reference read-only service

Use `demo__echo__echo` to read from the reference service. The mounted MCP
connection supplies authorization in trusted runtime code; never request,
display, or place its credential in tool arguments.

This reference extension exposes no write tool.
