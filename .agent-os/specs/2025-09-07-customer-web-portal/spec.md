# Spec Requirements Document

> Spec: Customer Web Portal
> Created: 2025-09-07

## Overview

Implement a Next.js 14 web portal that provides a chat-based interface for customers to interact with the AI-powered network diagnostics system. This portal will enable natural language troubleshooting through Claude Code SDK (which is different than Claude SDK)integration while providing role-based access control and device management capabilities.

## User Stories

### Natural Language Network Troubleshooting

As a business user, I want to describe my network problems in plain English through a chat interface, so that I can get intelligent diagnostics and solutions without needing technical expertise.

The user will log into the web portal, navigate to the Chat interface, and type their network issue in natural language (e.g., "Our internet is really slow today" or "We can't connect to our cloud applications"). The AI brain (Claude Code SDK) will process this request, potentially trigger diagnostics on the device agent, and provide step-by-step guidance or automated remediation with user approval. Throughout the process, users can view device agent actions and outputs in an expandable modal without interrupting their chat session.

### Multi-User Organization Management

As an organization admin, I want to manage multiple users within my company account and control their access levels, so that different team members can use the system appropriately.

Organization admins will access the Settings menu to invite new users, assign them either "admin" or "viewer" roles, and manage existing user permissions. Admins can register and configure device agents for their organization, while viewers can only observe chat sessions and diagnostic results. The system will maintain proper isolation between different customer organizations.

### System-Wide Administration

As the system owner, I want god-view access across all organizations and the ability to configure AI prompts, so that I can maintain and optimize the entire platform.

The owner user will have unrestricted access to all organizations, ability to configure Claude Code SDK prompts through a dedicated settings interface, and visibility into all customer interactions for support and optimization purposes. This includes managing prompt templates that control how the AI responds to different types of network issues.

## Spec Scope

1. **Chat Interface** - Real-time chat UI for natural language network troubleshooting with AI responses
2. **Role-Based Access Control** - Three-tier permission system (owner, admin, viewer) with organization isolation
3. **Device Agent Management** - Interface for registering and configuring Raspberry Pi device agents
4. **AI Prompt Configuration** - Owner-only interface for managing Claude Code SDK prompt templates
5. **Device Action Modal** - Expandable/collapsible modal showing device agent actions and outputs during chat sessions

## Out of Scope

- Live real-time device status monitoring dashboards
- Historical network issue trends and charts
- Direct device-to-device communication features
- Billing and subscription management
- Mobile app version of the portal

## Expected Deliverable

1. Functional Next.js 14 web application with working chat interface that connects uses Claude Code SDK to connect to the cloud Claude LLM.
2. Complete authentication flow using Supabase with proper role-based access control
3. Device agent registration and management interface accessible through Settings menu
