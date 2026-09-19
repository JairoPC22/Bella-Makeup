import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

const SEARCH_LIMIT = 20;

export function searchCustomers(search?: string) {
  const where: Prisma.CustomerWhereInput = search
    ? {
        OR: [
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      }
    : {};
  return prisma.customer.findMany({ where, orderBy: { createdAt: "desc" }, take: SEARCH_LIMIT });
}

export function createCustomer(data: Prisma.CustomerCreateInput) {
  return prisma.customer.create({ data });
}

export function findCustomerById(id: string) {
  return prisma.customer.findUnique({ where: { id } });
}
