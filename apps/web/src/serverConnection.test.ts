import { describe, expect, it } from "vitest";
import { resolveServerWsUrlFromInput, resolveServerHttpOriginFromInput } from "./serverConnection";

const loc = (
  port: string,
  hostname = "localhost",
  protocol = "http:",
): {
  protocol: string;
  hostname: string;
  port: string;
  origin: string;
} => ({
  protocol,
  hostname,
  port,
  origin: `${protocol}//${hostname}:${port}`,
});

describe("resolveServerWsUrlFromInput", () => {
  it("prefers bridgeWsUrl when provided", () => {
    expect(
      resolveServerWsUrlFromInput({
        bridgeWsUrl: "ws://127.0.0.1:4000/?token=abc",
        envWsUrl: "ws://localhost:3773",
        isDev: true,
        location: loc("5733"),
      }),
    ).toBe("ws://127.0.0.1:4000/?token=abc");
  });

  it("uses envWsUrl when bridgeWsUrl is absent", () => {
    expect(
      resolveServerWsUrlFromInput({
        envWsUrl: "ws://localhost:3773",
        isDev: true,
        location: loc("5733"),
      }),
    ).toBe("ws://localhost:3773");
  });

  it("ignores empty/whitespace envWsUrl", () => {
    expect(
      resolveServerWsUrlFromInput({
        envWsUrl: "  ",
        isDev: true,
        location: loc("5733"),
      }),
    ).toBe("ws://localhost:3773");
  });

  it("infers server port from web port in dev mode on loopback", () => {
    expect(
      resolveServerWsUrlFromInput({
        isDev: true,
        location: loc("5733"),
      }),
    ).toBe("ws://localhost:3773");
  });

  it("infers server port with offset (web=5740 → server=3780)", () => {
    expect(
      resolveServerWsUrlFromInput({
        isDev: true,
        location: loc("5740"),
      }),
    ).toBe("ws://localhost:3780");
  });

  it("falls back to page origin in production", () => {
    expect(
      resolveServerWsUrlFromInput({
        isDev: false,
        location: loc("3773"),
      }),
    ).toBe("ws://localhost:3773");
  });

  it("does not infer for non-loopback hosts", () => {
    expect(
      resolveServerWsUrlFromInput({
        isDev: true,
        location: loc("5733", "myserver.com"),
      }),
    ).toBe("ws://myserver.com:5733");
  });

  it("handles HTTPS → WSS", () => {
    expect(
      resolveServerWsUrlFromInput({
        isDev: false,
        location: loc("443", "example.com", "https:"),
      }),
    ).toBe("wss://example.com:443");
  });
});

describe("resolveServerHttpOriginFromInput", () => {
  it("returns HTTP origin for WS url", () => {
    expect(
      resolveServerHttpOriginFromInput({
        envWsUrl: "ws://localhost:3773",
        isDev: true,
        location: loc("5733"),
      }),
    ).toBe("http://localhost:3773");
  });

  it("infers HTTP origin in dev mode when envWsUrl is empty", () => {
    expect(
      resolveServerHttpOriginFromInput({
        isDev: true,
        location: loc("5733"),
      }),
    ).toBe("http://localhost:3773");
  });

  it("strips path/query from bridge URL", () => {
    expect(
      resolveServerHttpOriginFromInput({
        bridgeWsUrl: "ws://127.0.0.1:4000/?token=secret",
        isDev: false,
        location: loc("5733"),
      }),
    ).toBe("http://127.0.0.1:4000");
  });
});
