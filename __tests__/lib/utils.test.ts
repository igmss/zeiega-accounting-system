import { formatCurrency, formatNumber } from "../../lib/utils";

describe("Formatting Utils", () => {
  describe("formatCurrency", () => {
    it("should format valid numbers correctly", () => {
      expect(formatCurrency(1234.56).replace(/\u00A0/g, " ")).toBe("EGP 1,234.56");
      expect(formatCurrency(0).replace(/\u00A0/g, " ")).toBe("EGP 0.00");
    });

    it("should handle string numbers", () => {
      expect(formatCurrency("1234.56").replace(/\u00A0/g, " ")).toBe("EGP 1,234.56");
    });

    it("should gracefully handle NaN", () => {
      expect(formatCurrency(NaN).replace(/\u00A0/g, " ")).toBe("EGP 0.00");
    });

    it("should gracefully handle Infinity", () => {
      expect(formatCurrency(Infinity).replace(/\u00A0/g, " ")).toBe("EGP 0.00");
      expect(formatCurrency(-Infinity).replace(/\u00A0/g, " ")).toBe("EGP 0.00");
    });

    it("should handle null and undefined", () => {
      expect(formatCurrency(null).replace(/\u00A0/g, " ")).toBe("EGP 0.00");
      expect(formatCurrency(undefined).replace(/\u00A0/g, " ")).toBe("EGP 0.00");
    });
  });

  describe("formatNumber", () => {
    it("should format valid numbers correctly", () => {
      expect(formatNumber(1234.56)).toBe("1,234.56");
      expect(formatNumber(0)).toBe("0");
    });

    it("should handle string numbers", () => {
      expect(formatNumber("1234.56")).toBe("1,234.56");
    });

    it("should gracefully handle NaN", () => {
      expect(formatNumber(NaN)).toBe("0");
    });

    it("should gracefully handle Infinity", () => {
      expect(formatNumber(Infinity)).toBe("0");
      expect(formatNumber(-Infinity)).toBe("0");
    });

    it("should handle null and undefined", () => {
      expect(formatNumber(null)).toBe("0");
      expect(formatNumber(undefined)).toBe("0");
    });
  });
});
