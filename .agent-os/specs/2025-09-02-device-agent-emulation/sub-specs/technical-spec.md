# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-09-02-device-agent-emulation/spec.md

## Technical Requirements

### Container Architecture

- **Base Image**: Node.js 20-alpine for minimal footprint
- **Working Directory**: `/app` with proper permissions for command execution
- **Network Mode**: Bridge network with simulated cellular interface
- **Volume Mounts**: 
  - Configuration directory for device credentials
  - Logs directory for diagnostic output persistence
  - Shared directory for inter-container communication in multi-agent setups

### Device Agent Core Implementation

- **Language**: TypeScript with strict mode enabled
- **Framework**: Node.js with async/await patterns
- **Main Components**:
  - `DeviceAgent` class extending the existing scaffold in `packages/device-agent/`
  - `DiagnosticExecutor` for safe command execution with sandboxing
  - `HeartbeatManager` for maintaining connection status
  - `CommandQueue` for managing diagnostic requests
  - `ResultFormatter` for structuring raw diagnostic output for transmission

### Network Diagnostic Tools Integration

- **Ping Implementation**: 
  - Use Node.js `child_process` to execute system ping
  - Parse output for packet loss, RTT statistics
  - Support both IPv4 and IPv6 targets
  - Configurable count and timeout parameters

- **Traceroute Implementation**:
  - Execute system traceroute/tracert commands
  - Parse hop-by-hop latency and path information
  - Handle incomplete routes and timeouts gracefully
  - Support max hop configuration

- **DNS Resolution**:
  - Use Node.js `dns.promises` API for lookups
  - Support A, AAAA, MX, TXT record queries
  - Implement custom resolver configuration
  - Cache results with TTL respect

- **Connectivity Tests**:
  - HTTP/HTTPS endpoint reachability
  - Port connectivity checks using net.Socket
  - SSL certificate validation
  - Response time measurements

### Communication Protocol

- **Transport**: HTTPS with TLS 1.3
- **Direction**: Outbound-only connections from agent to API
- **Authentication**: 
  - Device ID and secret key from environment variables
  - JWT tokens for session management
  - Automatic token refresh before expiration

- **Message Format**:
  ```typescript
  interface AgentMessage {
    deviceId: string;
    timestamp: string;
    type: 'heartbeat' | 'diagnostic_result' | 'status_update' | 'error';
    payload: unknown;
    sequenceNumber: number;
  }
  ```

### Command Execution Safety

- **Timeout Handling**: 
  - Default 30-second timeout for diagnostic commands
  - Configurable per-command timeout overrides
  - Graceful process termination on timeout

- **Resource Limits**:
  - CPU usage throttling via Docker constraints
  - Memory limit of 512MB per container
  - Output buffer limit of 1MB per command

- **Sandboxing**:
  - No access to host network namespace
  - Read-only root filesystem with specific write mounts
  - Dropped Linux capabilities except NET_RAW for ping

### Docker Configuration

- **Dockerfile Structure**:
  - Multi-stage build for optimized image size
  - Non-root user for running agent process
  - Health check endpoint on internal port 3000
  - Graceful shutdown handling for SIGTERM

- **Environment Variables**:
  - `DEVICE_ID`: Unique identifier for the agent
  - `DEVICE_SECRET`: Authentication secret
  - `API_URL`: Cloud API endpoint
  - `CUSTOMER_ID`: Associated customer identifier
  - `LOG_LEVEL`: Logging verbosity (debug, info, warn, error)
  - `HEARTBEAT_INTERVAL`: Seconds between heartbeats (default: 60)

### Development & Testing Features

- **Mock Network Conditions**:
  - Simulated latency injection
  - Packet loss simulation
  - Bandwidth throttling
  - DNS failure scenarios

- **Debug Capabilities**:
  - Verbose logging mode
  - Command execution replay
  - Network traffic inspection
  - Performance profiling endpoints

### Integration with Existing Codebase

- **Shared Package Usage**:
  - Utilize `@aizen/shared` for Supabase client initialization
  - Leverage existing TypeScript types and interfaces
  - Reuse error handling and logging utilities

- **Testing Integration**:
  - Unit tests using Vitest framework
  - Integration tests with Docker Compose
  - Mock API server for isolated testing
  - Test fixtures using existing Faker.js setup

## External Dependencies

**net-ping** - ICMP ping implementation for Node.js
- **Version**: ^1.2.3
- **Justification**: Native Node.js ping support for cross-platform compatibility without system command dependencies

**node-traceroute** - Traceroute implementation for Node.js  
- **Version**: ^2.0.0
- **Justification**: Pure JavaScript traceroute implementation avoiding platform-specific command parsing

**p-queue** - Promise queue with concurrency control
- **Version**: ^8.0.1
- **Justification**: Managing concurrent diagnostic command execution with resource limits

**systeminformation** - System and network information library
- **Version**: ^5.21.0
- **Justification**: Gathering network interface details and system metrics for comprehensive diagnostics