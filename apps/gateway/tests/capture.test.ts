import { describe, expect, it } from "vitest";
import { assertDedicatedGatewayProfile, renderMapAppend, sanitizeCapture } from "../src/capture.js";

describe("capture sanitizer", () => {
  it("strips cookies and keeps method/path/keys", () => {
    const captured = sanitizeCapture({
      method: "PUT",
      url: "https://buildertrend.net/api/ChangeOrders/12/Update?useSession=true",
      requestHeaders: {
        cookie: ".AspNet.Auth0=SECRET",
        "content-type": "application/json",
      },
      requestBody: { title: "Draft", approvalStatus: 0 },
      status: 200,
    });
    expect(captured).toMatchObject({
      method: "PUT",
      path: "/api/ChangeOrders/12/Update?useSession=true",
      contentType: "application/json",
      jsonKeys: ["title", "approvalStatus"],
    });
    expect(JSON.stringify(captured)).not.toMatch(/SECRET|AspNet/);
  });

  it("ignores non-api traffic", () => {
    expect(
      sanitizeCapture({
        method: "GET",
        url: "https://buildertrend.net/app/Landing",
        requestHeaders: {},
      }),
    ).toBeNull();
  });

  it("renders a cookie-free map append", () => {
    const md = renderMapAppend([
      {
        method: "POST",
        path: "/apix/v2/LineItems/add-change-order-line-items",
        contentType: "application/json",
        jsonKeys: ["changeOrderId", "lineItems"],
        recordedAt: "2026-09-02T00:00:00.000Z",
      },
    ]);
    expect(md).toContain("POST /apix/v2/LineItems/add-change-order-line-items");
    expect(md).not.toMatch(/cookie/i);
  });

  it("refuses a human Chrome profile and unmarked paths", () => {
    expect(() => assertDedicatedGatewayProfile("/home/me/.config/google-chrome")).toThrow(/human/i);
    expect(() =>
      assertDedicatedGatewayProfile("/tmp/chrome-daily", "/tmp/chrome-daily"),
    ).toThrow(/Wattle Court/i);
    expect(() => assertDedicatedGatewayProfile("/tmp/random-profile")).toThrow(/prove/i);
    expect(() => assertDedicatedGatewayProfile("/var/lib/bt-gateway/chrome-profile")).not.toThrow();
  });
});
