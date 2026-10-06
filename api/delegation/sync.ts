import type { Request, Response } from 'express';
import handler from '../delegation';

export default async function syncHandler(req: Request, res: Response) {
  return handler(req, res);
}
