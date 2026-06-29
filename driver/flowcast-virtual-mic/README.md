# FlowCast Virtual Mic Driver Package

This folder is the first-party driver package boundary for the Windows capture endpoint:

```text
FlowCast Microphone
```

The intended production implementation is based on Microsoft SYSVAD-style virtual audio driver architecture:

- kernel-mode virtual audio capture endpoint;
- INF package that exposes `FlowCast Microphone`;
- user-mode bridge service that receives PCM frames from the Electron app;
- named pipe or shared ring buffer transport between the app bridge and driver;
- Microsoft-signed driver package for Windows 10/11 x64 release.

This scaffold is intentionally not an installable driver. Loading unsigned kernel audio drivers on normal user machines is blocked by Windows driver signing policy.

See the production checklist in `../../docs/DRIVER_RELEASE_GUIDE.md`.
