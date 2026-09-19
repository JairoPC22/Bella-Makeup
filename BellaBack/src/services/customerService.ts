import * as repo from "../repositories/customerRepository";
import { logAudit } from "./auditService";

export const searchCustomers = (search?: string) => repo.searchCustomers(search);

export async function createCustomer(
  input: { firstName?: string; lastName?: string; phone?: string; email?: string },
  actorId: string
) {
  const customer = await repo.createCustomer(input);
  await logAudit({
    userId: actorId,
    action: "customers.create",
    module: "sales",
    entityType: "customer",
    entityId: customer.id,
    details: { firstName: customer.firstName, lastName: customer.lastName, phone: customer.phone },
  });
  return customer;
}
