import { randomUUID } from "node:crypto";
import type { QueueTicket, QueueTicketStatus } from "@waiting/shared";

export interface QueueTicketView {
  ticket: QueueTicket;
  ahead: number;
  position: number | null;
  waitingCount: number;
}

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

  get(ticketId: string): QueueTicket | undefined {
    const ticket = this.tickets.get(ticketId);
    return ticket ? cloneTicket(ticket) : undefined;
  }

  status(ticketId: string): QueueTicketView {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) throw new Error("queue-ticket-not-found");

    const waiting = [...this.tickets.values()]
      .filter((item) => item.status === "waiting")
      .sort((a, b) => a.createdAt - b.createdAt);
    const waitingIndex = waiting.findIndex((item) => item.id === ticket.id);
    const ahead = ticket.status === "waiting"
      ? Math.max(0, waitingIndex)
      : 0;

    return {
      ticket: cloneTicket(ticket),
      ahead,
      position: ticket.status === "waiting" ? ahead + 1 : null,
      waitingCount: waiting.length,
    };
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

  recall(ticketId: string): QueueTicket {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) throw new Error("queue-ticket-not-found");
    if (ticket.status !== "called") {
      throw new Error(`invalid-queue-transition:${ticket.status}->called`);
    }
    ticket.calledAt = Math.max(Date.now(), (ticket.calledAt ?? 0) + 1);
    return cloneTicket(ticket);
  }

  latestCalled(): QueueTicket | undefined {
    // Treat calledAt as an event stream, not as "find any ticket still called".
    // Otherwise an older called ticket can resurface on the big screen after a
    // newer ticket is seated/passed. Only the most recent call event may own
    // the broadcast overlay; staff can explicitly recall an older ticket.
    const latestCall = [...this.tickets.values()]
      .filter((ticket) => ticket.calledAt)
      .sort((a, b) => (b.calledAt ?? 0) - (a.calledAt ?? 0))[0];

    return latestCall?.status === "called" ? cloneTicket(latestCall) : undefined;
  }
}
