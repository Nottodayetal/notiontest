import { describe, expect, it } from "vitest";
import { readXmlTag } from "./streamUrl";

describe("stream URL helpers", () => {
  it("reads expected download-info XML tags", () => {
    const xml = "<download-info><host>host.test</host><path>/audio/file</path><s>salt</s><ts>123</ts></download-info>";

    expect(readXmlTag(xml, "host")).toBe("host.test");
    expect(readXmlTag(xml, "path")).toBe("/audio/file");
    expect(readXmlTag(xml, "missing")).toBeUndefined();
  });
});
