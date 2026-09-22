import { randomUUID } from "node:crypto";
import type { QueueTicket, QueueTicketStatus } from "@waiting/shared";

function cloneTicket(ticket: QueueTicket): QueueTicket {
  return structuredClone(ticket);
}

export class QueueService {
  private readonly tickets = new Map<string, QueueTicket>();
  private sequence = 0;

  list(): QueueTicket[] {
    return [...this.tickets.values()]
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(cloneTicket);
  }

  add(partySize: number, label?: string): QueueTicket {
    const size = Math.max(1, Math.min(30, Math.floor(partySize)));
    this.sequence += 1;
    const ticket: QueueTicket = {
      id: randomUUID(),
      number: `A${String(this.sequence).padStart(3, "0")}`,
      partySize: size,
      ...(label?.trim() ? { label: label.trim().slice(0, 40) } : {}),
      status: "waiting",
      createdAt: Date.now(),
    };
    this.tickets.set(ticket.id, ticket);
    return cloneTicket(ticket);
  }

  transition(ticketId: string, next: QueueTicketStatus): QueueTicket {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) {
      throw new Error("queue-ticket-not-found");
    }

    const allowed: Record<QueueTicketStatus, readonly QueueTicketStatus[]> = {
      waiting: ["called", "cancelled"],
      called: ["waiting", "passed", "seated", "cancelled"],
      passed: ["called", "cancelled"],
      seated: [],
      cancelled: [],
    };

    if (!allowed[ticket.status].includes(next)) {
      throw new Error(`invalid-queue-transition:${ticket.status}->${next}`);
    }

    ticket.status = next;
    if (next === "called") {
      ticket.calledAt = Date.now();
    }
    if (next === "seated") {
      ticket.seatedAt = Date.now();
    }
    return cloneTicket(ticket);
  }

  latestCalled(): QueueTicket | undefined {
    const called = [...this.tickets.values()]
      .filter((ticket) => ticket.status === "called" && ticket.calledAt)
      .sort((a, b) => (b.calledAt ?? 0) - (a.calledAt ?? 0))[0];
    return called ? cloneTicket(called) : undefined;
  }
}
