# Server-Sent Events (SSE) Protocol Specification

## Overview
This document defines the SSE protocol used by the AI API endpoints for real-time streaming responses.

## Event Types

### 1. Data Messages (Default)
Regular streaming messages without a named event type.
```
data: {JSON payload}\n\n
```
Used for:
- Assistant messages
- Intermediate results
- Status updates

### 2. Named Events
Specific event types that clients can listen for.

#### `event: script_generated`
Indicates a script has been generated and stored.
```
event: script_generated
data: {
  "scriptId": "string",
  "script": "string",
  "timestamp": "ISO-8601"
}
```

#### `event: complete`
Indicates successful stream completion.
```
event: complete
data: {
  "status": "completed",
  "timestamp": "ISO-8601"
}
```

#### `event: error`
Indicates an error occurred.
```
event: error
data: {
  "error": "string",
  "recoverable": boolean,
  "timestamp": "ISO-8601"
}
```

## Client Implementation

### JavaScript Example
```javascript
const eventSource = new EventSource('/api/v1/ai/diagnostics/analyze');

// Listen for regular data messages
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Data:', data);
};

// Listen for specific event types
eventSource.addEventListener('script_generated', (event) => {
  const data = JSON.parse(event.data);
  console.log('Script generated:', data.scriptId);
});

eventSource.addEventListener('complete', (event) => {
  const data = JSON.parse(event.data);
  console.log('Stream completed at:', data.timestamp);
  eventSource.close();
});

eventSource.addEventListener('error', (event) => {
  const data = JSON.parse(event.data);
  console.error('Error:', data.error);
  if (!data.recoverable) {
    eventSource.close();
  }
});
```

## Migration Notes

### Breaking Changes (v2.0)
- `data: {"type": "error", ...}` → `event: error\ndata: {...}`
- `data: {"type": "script_generated", ...}` → `event: script_generated\ndata: {...}`
- All named events now include `timestamp` field

### Backward Compatibility
During deprecation period, clients should handle both formats:
1. Check for named events first
2. Fall back to checking `type` field in data payload

## Best Practices

1. **Always use named events** for:
   - Completion signals
   - Errors
   - Specific action completions (script_generated, etc.)

2. **Include timestamps** in all event payloads for debugging

3. **Use consistent error format** with `error` and `recoverable` fields

4. **Close connections properly** on completion or non-recoverable errors