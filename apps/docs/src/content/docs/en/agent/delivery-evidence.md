---
title: "Delivery Evidence Chain"
description: "Understand the evidence chain from immutable candidate to Deployment Proof and its claim boundary."
docType: concept
localeState: { zh-CN: complete, en-US: complete }
searchAliases: ["delivery proof", "deployment proof", "verified production"]
relatedOperations: [sandboxes.promotions.show, deployments.proof, deployments.show]
sidebar: { label: "Delivery Evidence Chain", order: 3 }
---

# Delivery Evidence Chain

Appaloft preserves and reads the relationship from Source Artifact digest to verified Candidate
Preview, accepted Promotion, created Resource, first Deployment, and Deployment Proof. A Promotion
becomes `completed` only after the public proof verdict is `verified`. While proof is pending, durable
work continues polling. A terminal failure retains Resource, Deployment, and failure checkpoints for
retry or diagnosis.

This chain proves delivery observations available to Appaloft, such as deployment execution,
runtime identity, route, health, and content-correlation evidence. It does not prove that agent-
generated software is formally correct, secure, vulnerability-free, or compliant. Tests, review,
scanning, policy, and human approval remain separate gates when those assurances are required.
