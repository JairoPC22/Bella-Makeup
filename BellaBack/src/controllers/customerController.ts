import { Request, Response, NextFunction } from "express";
import * as customerService from "../services/customerService";
import { listCustomersQuerySchema, createCustomerSchema } from "../validators/customer.validators";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { search } = listCustomersQuerySchema.parse(req.query);
    res.json(await customerService.searchCustomers(search));
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createCustomerSchema.parse(req.body);
    const customer = await customerService.createCustomer(data, req.user!.id);
    res.status(201).json(customer);
  } catch (err) { next(err); }
}
