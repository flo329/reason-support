import { describe, expect, it } from "vitest";
import { extractTicketId } from "@/lib/gorgias/sync";

describe("extractTicketId", () => {
  it("reads ticket_id as number or string", () => {
    expect(extractTicketId({ ticket_id: 123 })).toBe(123);
    expect(extractTicketId({ ticket_id: "456" })).toBe(456);
  });
  it("reads nested ticket.id", () => {
    expect(extractTicketId({ ticket: { id: 789 } })).toBe(789);
  });
  it("rejects junk", () => {
    expect(extractTicketId({ ticket_id: "{{ticket.id}}" })).toBeNull();
    expect(extractTicketId(null)).toBeNull();
  });
});
