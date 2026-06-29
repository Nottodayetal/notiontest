# FlowCast Bridge Service

The bridge service is the native process that will connect the Electron audio graph to the `FlowCast Microphone` driver.

Planned transport:

```text
Electron renderer Web Audio
  -> PCM frames
  -> native bridge service
  -> named pipe or shared ring buffer
  -> FlowCast Microphone capture endpoint
```

The current app has the IPC surface and diagnostics hooks. The native service and signed driver artifacts still need to be implemented with the Windows Driver Kit.
